package dsvp;

import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.type.ArrayType;
import com.github.javaparser.ast.type.PrimitiveType;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * Traces a hand-rolled, array-backed Queue class WITHOUT renaming it or
 * touching its public API — the Queue counterpart of StackFieldInstrumentVisitor.
 *
 * A stack only needs ONE pointer field (top) because it writes and reads the
 * same end. A queue writes at one end (rear) and reads from the other
 * (front), so it needs TWO companion int fields, and — unlike top, which is
 * always known to be the logical index — we have to work out from usage
 * which of the two is the write end and which is the read end, since
 * students name them anything (front/rear, head/tail, first/last, ...).
 *
 * Detects the common student pattern:
 *   private <prim>[] arr;   // one 1-D primitive array field
 *   private int front, rear; // two companion int fields used as indices
 *
 * and instruments exactly two statement shapes:
 *   arr[idx] = value;                (write — rear-side)
 *   TYPE v = arr[idx];  /  return arr[idx];   (read — front-side)
 *
 * where idx is (or wraps, via a bare ++/--) one of the two companion fields.
 * Snapshots are always taken relative to the current front (so idx in the
 * emitted trace indexes directly into the emitted snap array, matching how
 * every other DSVP trace works) as arr[front..rear] inclusive — the queue's
 * current logical contents — not the raw backing array.
 *
 * Conservative by design: if a class doesn't have exactly one supported
 * primitive-array field, or the two companion int fields' usage as array
 * indices doesn't cleanly split into "one read end, one write end", it's
 * left completely alone (no partial/incorrect instrumentation).
 */
public class QueueFieldInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private static final Set<PrimitiveType.Primitive> SUPPORTED = Set.of(
        PrimitiveType.Primitive.INT, PrimitiveType.Primitive.CHAR,
        PrimitiveType.Primitive.LONG, PrimitiveType.Primitive.DOUBLE,
        PrimitiveType.Primitive.FLOAT
    );

    private int counter = 0;

    @Override
    public void visit(ClassOrInterfaceDeclaration cls, Void arg) {
        super.visit(cls, arg);

        FieldDeclaration arrField = findSingleArrayField(cls);
        if (arrField == null) return;
        String arrName = arrField.getVariable(0).getNameAsString();
        PrimitiveType.Primitive componentType =
            ((PrimitiveType) ((ArrayType) arrField.getVariable(0).getType()).getComponentType()).getType();

        Set<String> intFieldNames = intFieldNames(cls, arrName);
        if (intFieldNames.size() < 2) return;

        String[] roles = inferReadWritePointers(cls, arrName, intFieldNames);
        if (roles == null) return;
        String readPtr = roles[0], writePtr = roles[1];

        for (MethodDeclaration m : cls.getMethods()) {
            m.getBody().ifPresent(body -> instrumentMethodBody(body, arrName, readPtr, writePtr, componentType));
        }
    }

    private FieldDeclaration findSingleArrayField(ClassOrInterfaceDeclaration cls) {
        FieldDeclaration found = null;
        for (FieldDeclaration f : cls.getFields()) {
            if (f.getVariables().size() != 1) continue;
            VariableDeclarator vd = f.getVariable(0);
            if (!(vd.getType() instanceof ArrayType)) continue;
            ArrayType at = (ArrayType) vd.getType();
            if (!(at.getComponentType() instanceof PrimitiveType)) continue;
            if (!SUPPORTED.contains(((PrimitiveType) at.getComponentType()).getType())) continue;
            if (found != null) return null; // ambiguous — more than one array field
            found = f;
        }
        return found;
    }

    private Set<String> intFieldNames(ClassOrInterfaceDeclaration cls, String arrName) {
        Set<String> names = new java.util.LinkedHashSet<>();
        // A single FieldDeclaration can carry multiple variables
        // (`int front, rear;` is ONE declaration with two declarators) —
        // iterate every declarator, not just the first, or the two
        // companion pointer fields a queue almost always needs never get
        // recognized as candidates at all.
        for (FieldDeclaration f : cls.getFields()) {
            for (VariableDeclarator vd : f.getVariables()) {
                if (vd.getNameAsString().equals(arrName)) continue;
                if (!(vd.getType() instanceof PrimitiveType)) continue;
                if (((PrimitiveType) vd.getType()).getType() != PrimitiveType.Primitive.INT) continue;
                names.add(vd.getNameAsString());
            }
        }
        return names;
    }

    /**
     * Walks every arr[...] access in the class and tallies, per candidate
     * int field, how often it's the index of a WRITE vs a READ. Returns
     * {readPtr, writePtr} if exactly two fields are used as indices and
     * their usage cleanly splits (one is write-dominant, the other
     * read-dominant); null if ambiguous.
     */
    private String[] inferReadWritePointers(ClassOrInterfaceDeclaration cls, String arrName, Set<String> candidates) {
        Map<String, Integer> writeCount = new HashMap<>();
        Map<String, Integer> readCount = new HashMap<>();

        for (MethodDeclaration m : cls.getMethods()) {
            if (!m.getBody().isPresent()) continue;
            BlockStmt body = m.getBody().get();

            for (ExpressionStmt stmt : body.findAll(ExpressionStmt.class)) {
                if (!(stmt.getExpression() instanceof AssignExpr)) continue;
                AssignExpr assign = (AssignExpr) stmt.getExpression();
                if (assign.getOperator() != AssignExpr.Operator.ASSIGN) continue;
                if (!(assign.getTarget() instanceof ArrayAccessExpr)) continue;
                ArrayAccessExpr target = (ArrayAccessExpr) assign.getTarget();
                if (!(target.getName() instanceof NameExpr)) continue;
                if (!((NameExpr) target.getName()).getNameAsString().equals(arrName)) continue;
                String ptr = indexFieldName(target.getIndex(), candidates);
                if (ptr != null) writeCount.merge(ptr, 1, Integer::sum);
            }

            for (ArrayAccessExpr aae : body.findAll(ArrayAccessExpr.class)) {
                if (!(aae.getName() instanceof NameExpr)) continue;
                if (!((NameExpr) aae.getName()).getNameAsString().equals(arrName)) continue;
                // Skip ones we already counted as a write target
                if (aae.getParentNode().isPresent() && aae.getParentNode().get() instanceof AssignExpr
                        && ((AssignExpr) aae.getParentNode().get()).getTarget() == aae) continue;
                String ptr = indexFieldName(aae.getIndex(), candidates);
                if (ptr != null) readCount.merge(ptr, 1, Integer::sum);
            }
        }

        String writePtr = topKey(writeCount);
        String readPtr = topKey(readCount);
        if (writePtr == null || readPtr == null || writePtr.equals(readPtr)) return null;
        return new String[]{readPtr, writePtr};
    }

    private String topKey(Map<String, Integer> counts) {
        String best = null;
        int bestN = 0;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() > bestN) { bestN = e.getValue(); best = e.getKey(); }
        }
        return best;
    }

    /** If idxExpr is `field` or `++field`/`field++`/`--field`/`field--`, return "field" (if it's a candidate). */
    private String indexFieldName(Expression idxExpr, Set<String> candidates) {
        if (idxExpr instanceof NameExpr) {
            String n = ((NameExpr) idxExpr).getNameAsString();
            return candidates.contains(n) ? n : null;
        }
        if (idxExpr instanceof UnaryExpr) {
            Expression inner = ((UnaryExpr) idxExpr).getExpression();
            if (inner instanceof NameExpr) {
                String n = ((NameExpr) inner).getNameAsString();
                return candidates.contains(n) ? n : null;
            }
        }
        return null;
    }

    private void instrumentMethodBody(BlockStmt body, String arrName, String readPtr, String writePtr,
                                       PrimitiveType.Primitive componentType) {
        for (ExpressionStmt stmt : body.findAll(ExpressionStmt.class)) {
            if (!(stmt.getExpression() instanceof AssignExpr)) continue;
            AssignExpr assign = (AssignExpr) stmt.getExpression();
            if (assign.getOperator() != AssignExpr.Operator.ASSIGN) continue;
            if (!(assign.getTarget() instanceof ArrayAccessExpr)) continue;
            ArrayAccessExpr target = (ArrayAccessExpr) assign.getTarget();
            if (!(target.getName() instanceof NameExpr)) continue;
            if (!((NameExpr) target.getName()).getNameAsString().equals(arrName)) continue;
            if (indexFieldName(target.getIndex(), Set.of(writePtr)) == null) continue;

            replaceWriteStmt(stmt, target, assign.getValue(), arrName, readPtr, writePtr, componentType);
        }

        for (ReturnStmt rs : body.findAll(ReturnStmt.class)) {
            if (!rs.getExpression().isPresent()) continue;
            Expression e = rs.getExpression().get();
            if (!(e instanceof ArrayAccessExpr)) continue;
            ArrayAccessExpr aae = (ArrayAccessExpr) e;
            if (!(aae.getName() instanceof NameExpr)) continue;
            if (!((NameExpr) aae.getName()).getNameAsString().equals(arrName)) continue;
            if (indexFieldName(aae.getIndex(), Set.of(readPtr)) == null) continue;

            replaceReadReturn(rs, aae, arrName, readPtr, writePtr, componentType);
        }

        // `TYPE v = arr[front];` — the far more common dequeue() shape
        // (read the value out to a local, advance the pointer on the next
        // line, then `return v;`) than a bare `return arr[front];`.
        for (ExpressionStmt stmt : body.findAll(ExpressionStmt.class)) {
            if (!(stmt.getExpression() instanceof VariableDeclarationExpr)) continue;
            VariableDeclarationExpr vde = (VariableDeclarationExpr) stmt.getExpression();
            if (vde.getVariables().size() != 1) continue;
            VariableDeclarator vd = vde.getVariable(0);
            if (!vd.getInitializer().isPresent()) continue;
            Expression init = vd.getInitializer().get();
            if (!(init instanceof ArrayAccessExpr)) continue;
            ArrayAccessExpr aae = (ArrayAccessExpr) init;
            if (!(aae.getName() instanceof NameExpr)) continue;
            if (!((NameExpr) aae.getName()).getNameAsString().equals(arrName)) continue;
            if (indexFieldName(aae.getIndex(), Set.of(readPtr)) == null) continue;

            replaceReadDeclaration(stmt, vd, aae, arrName, readPtr, writePtr, componentType);
        }
    }

    private void replaceWriteStmt(ExpressionStmt stmt, ArrayAccessExpr target, Expression valueExpr,
                                   String arrName, String readPtr, String writePtr, PrimitiveType.Primitive componentType) {
        String idxVar = "_dsvp_idx_" + (counter++);
        String valVar = "_dsvp_val_" + (counter++);

        BlockStmt block = new BlockStmt();
        block.addStatement(declareVar(idxVar, PrimitiveType.Primitive.INT, target.getIndex().clone()));
        block.addStatement(declareVar(valVar, componentType, valueExpr.clone()));
        block.addStatement(new ExpressionStmt(new AssignExpr(
            new ArrayAccessExpr(new NameExpr(arrName), new NameExpr(idxVar)),
            new NameExpr(valVar), AssignExpr.Operator.ASSIGN)));
        block.addStatement(buildEmitCall("append", idxVar, valVar, arrName, readPtr, writePtr));

        stmt.replace(block);
    }

    private void replaceReadReturn(ReturnStmt rs, ArrayAccessExpr aae, String arrName,
                                    String readPtr, String writePtr, PrimitiveType.Primitive componentType) {
        String idxVar = "_dsvp_idx_" + (counter++);
        String valVar = "_dsvp_val_" + (counter++);

        BlockStmt block = new BlockStmt();
        block.addStatement(declareVar(idxVar, PrimitiveType.Primitive.INT, aae.getIndex().clone()));
        block.addStatement(declareVar(valVar, componentType, new ArrayAccessExpr(new NameExpr(arrName), new NameExpr(idxVar))));
        block.addStatement(buildEmitCall("delete", idxVar, valVar, arrName, readPtr, writePtr));
        block.addStatement(new ReturnStmt(new NameExpr(valVar)));

        rs.replace(block);
    }

    private void replaceReadDeclaration(ExpressionStmt stmt, VariableDeclarator vd, ArrayAccessExpr aae,
                                         String arrName, String readPtr, String writePtr, PrimitiveType.Primitive componentType) {
        // Unlike the write/return-read cases, this declared variable (e.g.
        // `val` in `int val = arr[front];`) is read by SIBLING statements
        // later in the same block (`front++; return val;`). Wrapping it in
        // a fresh BlockStmt — the way replaceWriteStmt/replaceReadReturn do
        // — would introduce a new Java scope and make `val` invisible past
        // the end of that block, breaking compilation. Splice the extra
        // statements into the SAME enclosing block instead, leaving the
        // original declaration statement's scope untouched.
        Node parent = stmt.getParentNode().orElse(null);
        if (!(parent instanceof BlockStmt)) return; // not a direct block statement — leave alone
        NodeList<Statement> stmts = ((BlockStmt) parent).getStatements();
        int idx = stmts.indexOf(stmt);
        if (idx < 0) return;

        String idxVar = "_dsvp_idx_" + (counter++);
        stmts.add(idx, declareVar(idxVar, PrimitiveType.Primitive.INT, aae.getIndex().clone()));
        vd.setInitializer(new ArrayAccessExpr(new NameExpr(arrName), new NameExpr(idxVar)));
        stmts.add(idx + 2, buildEmitCall("delete", idxVar, vd.getNameAsString(), arrName, readPtr, writePtr));
    }

    private Statement declareVar(String name, PrimitiveType.Primitive type, Expression init) {
        return new ExpressionStmt(new VariableDeclarationExpr(
            new VariableDeclarator(new PrimitiveType(type), name, init)));
    }

    /**
     * DSVPArray.emitFieldSnap(op, idxVar - front, String.valueOf(valVar),
     *     front <= rear ? Arrays.copyOfRange(arr, front, rear + 1) : Arrays.copyOfRange(arr, 0, 0));
     *
     * idx is emitted RELATIVE to front so it indexes directly into the
     * emitted snap array — the same convention every other DSVP trace event
     * uses — rather than as a raw offset into the backing array (which
     * would be meaningless to the frontend once front has advanced past 0).
     */
    private Statement buildEmitCall(String op, String idxVar, String valExprSource,
                                     String arrName, String readPtr, String writePtr) {
        Expression relIdx = new BinaryExpr(new NameExpr(idxVar), new NameExpr(readPtr), BinaryExpr.Operator.MINUS);

        MethodCallExpr call = new MethodCallExpr(new NameExpr("DSVPArray"), "emitFieldSnap",
            new NodeList<>(
                new StringLiteralExpr(op),
                relIdx,
                new MethodCallExpr(new NameExpr("String"), "valueOf", new NodeList<>(new NameExpr(valExprSource))),
                emptyAwareSnap(arrName, readPtr, writePtr)));
        return new ExpressionStmt(call);
    }

    private Expression emptyAwareSnap(String arrName, String readPtr, String writePtr) {
        // front <= rear ? Arrays.copyOfRange(arr, front, rear + 1) : Arrays.copyOfRange(arr, 0, 0)
        // (an empty copyOfRange(arr,0,0) avoids needing to know the exact
        // primitive element type just to build a `new T[0]` literal).
        Expression thenExpr = new MethodCallExpr(
            new FieldAccessExpr(new FieldAccessExpr(new NameExpr("java"), "util"), "Arrays"),
            "copyOfRange",
            new NodeList<>(new NameExpr(arrName), new NameExpr(readPtr),
                new BinaryExpr(new NameExpr(writePtr), new IntegerLiteralExpr("1"), BinaryExpr.Operator.PLUS)));
        Expression elseExpr = new MethodCallExpr(
            new FieldAccessExpr(new FieldAccessExpr(new NameExpr("java"), "util"), "Arrays"),
            "copyOfRange",
            new NodeList<>(new NameExpr(arrName), new IntegerLiteralExpr("0"), new IntegerLiteralExpr("0")));
        return new ConditionalExpr(
            new BinaryExpr(new NameExpr(readPtr), new NameExpr(writePtr), BinaryExpr.Operator.LESS_EQUALS),
            thenExpr, elseExpr);
    }
}
