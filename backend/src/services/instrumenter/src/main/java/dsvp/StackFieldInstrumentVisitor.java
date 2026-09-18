package dsvp;

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

import java.util.Set;

/**
 * Traces a hand-rolled, array-backed Stack class WITHOUT renaming it or
 * touching its public API — unlike StackInstrumentVisitor (which only
 * handles java.util.Stack), this never introduces DSVPStack.
 *
 * Detects the extremely common student pattern:
 *   private <prim>[] stack;  // one 1-D primitive array field
 *                            // (int, char, long, double, or float — covers
 *                            // number stacks, char stacks for bracket
 *                            // matching / expression evaluation, etc.)
 *   private int   top;       // one companion int field (a size/top pointer)
 *
 * and rewrites the two statement shapes that make it a stack:
 *   stack[idx] = value;     (write, e.g. stack[++top] = value)
 *   return stack[idx];      (read,  e.g. return stack[top--] / return stack[top])
 *
 * into an equivalent block that evaluates idx/value exactly once (avoiding
 * the double-evaluation bug side-effecting indices like ++top would
 * otherwise cause) and additionally emits a DSVP_TRACE event carrying a
 * snapshot of the array's logical contents (0..top), so push/pop/peek
 * animate in the visualizer — all while leaving the array field, the top
 * field, and every method signature exactly as the user wrote them.
 *
 * Conservative by design: if a class doesn't have exactly one supported
 * primitive-array field and exactly one usable companion int field, it's
 * left completely alone.
 */
public class StackFieldInstrumentVisitor extends VoidVisitorAdapter<Void> {

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

        String topName = findPointerFieldName(cls, arrName);
        if (topName == null) return;

        for (MethodDeclaration m : cls.getMethods()) {
            m.getBody().ifPresent(body -> instrumentMethodBody(body, arrName, topName, componentType));
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

    private String findPointerFieldName(ClassOrInterfaceDeclaration cls, String arrName) {
        String top = null;
        String onlyCandidate = null;
        int intFieldCount = 0;
        // NOTE: a single FieldDeclaration can carry multiple variables
        // (`int front, rear;` is ONE FieldDeclaration with two
        // VariableDeclarators) — iterate every declarator, not just
        // f.getVariable(0), or a class with two companion int fields
        // (e.g. a hand-rolled Queue's front/rear) looks like it has only
        // ONE candidate (whatever other single-var int field happens to
        // exist, like `capacity`), gets misidentified as a Stack, and has
        // its array wrongly instrumented before QueueFieldInstrumentVisitor
        // ever gets a look at it.
        for (FieldDeclaration f : cls.getFields()) {
            for (VariableDeclarator vd : f.getVariables()) {
                if (vd.getNameAsString().equals(arrName)) continue;
                if (!(vd.getType() instanceof PrimitiveType)) continue;
                if (((PrimitiveType) vd.getType()).getType() != PrimitiveType.Primitive.INT) continue;
                intFieldCount++;
                onlyCandidate = vd.getNameAsString();
                if (vd.getNameAsString().equalsIgnoreCase("top")) top = vd.getNameAsString();
            }
        }
        if (top != null) return top;
        return intFieldCount == 1 ? onlyCandidate : null;
    }

    private void instrumentMethodBody(BlockStmt body, String arrName, String topName, PrimitiveType.Primitive componentType) {
        for (ExpressionStmt stmt : body.findAll(ExpressionStmt.class)) {
            if (!(stmt.getExpression() instanceof AssignExpr)) continue;
            AssignExpr assign = (AssignExpr) stmt.getExpression();
            if (assign.getOperator() != AssignExpr.Operator.ASSIGN) continue;
            if (!(assign.getTarget() instanceof ArrayAccessExpr)) continue;
            ArrayAccessExpr target = (ArrayAccessExpr) assign.getTarget();
            if (!(target.getName() instanceof NameExpr)) continue;
            if (!((NameExpr) target.getName()).getNameAsString().equals(arrName)) continue;

            replaceWriteStmt(stmt, target, assign.getValue(), arrName, topName, componentType);
        }

        for (ReturnStmt rs : body.findAll(ReturnStmt.class)) {
            if (!rs.getExpression().isPresent()) continue;
            Expression e = rs.getExpression().get();
            if (!(e instanceof ArrayAccessExpr)) continue;
            ArrayAccessExpr aae = (ArrayAccessExpr) e;
            if (!(aae.getName() instanceof NameExpr)) continue;
            if (!((NameExpr) aae.getName()).getNameAsString().equals(arrName)) continue;

            replaceReadReturn(rs, aae, arrName, topName, componentType);
        }
    }

    private void replaceWriteStmt(ExpressionStmt stmt, ArrayAccessExpr target, Expression valueExpr,
                                   String arrName, String topName, PrimitiveType.Primitive componentType) {
        String idxVar = "_dsvp_idx_" + (counter++);
        String valVar = "_dsvp_val_" + (counter++);
        String op = isIncrement(target.getIndex()) ? "append" : "write";

        BlockStmt block = new BlockStmt();
        block.addStatement(declareVar(idxVar, PrimitiveType.Primitive.INT, target.getIndex().clone()));
        block.addStatement(declareVar(valVar, componentType, valueExpr.clone()));
        block.addStatement(new ExpressionStmt(new AssignExpr(
            new ArrayAccessExpr(new NameExpr(arrName), new NameExpr(idxVar)),
            new NameExpr(valVar), AssignExpr.Operator.ASSIGN)));
        block.addStatement(buildEmitCall(op, idxVar, valVar, arrName, topName));

        stmt.replace(block);
    }

    private void replaceReadReturn(ReturnStmt rs, ArrayAccessExpr aae, String arrName, String topName, PrimitiveType.Primitive componentType) {
        String idxVar = "_dsvp_idx_" + (counter++);
        String valVar = "_dsvp_val_" + (counter++);
        String op = isDecrement(aae.getIndex()) ? "delete" : "read";

        BlockStmt block = new BlockStmt();
        block.addStatement(declareVar(idxVar, PrimitiveType.Primitive.INT, aae.getIndex().clone()));
        block.addStatement(declareVar(valVar, componentType, new ArrayAccessExpr(new NameExpr(arrName), new NameExpr(idxVar))));
        block.addStatement(buildEmitCall(op, idxVar, valVar, arrName, topName));
        block.addStatement(new ReturnStmt(new NameExpr(valVar)));

        rs.replace(block);
    }

    private boolean isIncrement(Expression idxExpr) {
        if (!(idxExpr instanceof UnaryExpr)) return false;
        UnaryExpr.Operator op = ((UnaryExpr) idxExpr).getOperator();
        return op == UnaryExpr.Operator.PREFIX_INCREMENT || op == UnaryExpr.Operator.POSTFIX_INCREMENT;
    }

    private boolean isDecrement(Expression idxExpr) {
        if (!(idxExpr instanceof UnaryExpr)) return false;
        UnaryExpr.Operator op = ((UnaryExpr) idxExpr).getOperator();
        return op == UnaryExpr.Operator.PREFIX_DECREMENT || op == UnaryExpr.Operator.POSTFIX_DECREMENT;
    }

    private Statement declareVar(String name, PrimitiveType.Primitive type, Expression init) {
        return new ExpressionStmt(new VariableDeclarationExpr(
            new VariableDeclarator(new PrimitiveType(type), name, init)));
    }

    /** DSVPArray.emitFieldSnap(op, idxVar, String.valueOf(valVar), java.util.Arrays.copyOfRange(arr, 0, Math.max(0, top + 1))); */
    private Statement buildEmitCall(String op, String idxVar, String valVar, String arrName, String topName) {
        Expression sizeExpr = new MethodCallExpr(new NameExpr("Math"), "max",
            new NodeList<>(new IntegerLiteralExpr("0"),
                new BinaryExpr(new NameExpr(topName), new IntegerLiteralExpr("1"), BinaryExpr.Operator.PLUS)));

        Expression snapExpr = new MethodCallExpr(
            new FieldAccessExpr(new FieldAccessExpr(new NameExpr("java"), "util"), "Arrays"),
            "copyOfRange",
            new NodeList<>(new NameExpr(arrName), new IntegerLiteralExpr("0"), sizeExpr));

        MethodCallExpr call = new MethodCallExpr(new NameExpr("DSVPArray"), "emitFieldSnap",
            new NodeList<>(
                new StringLiteralExpr(op),
                new NameExpr(idxVar),
                new MethodCallExpr(new NameExpr("String"), "valueOf", new NodeList<>(new NameExpr(valVar))),
                snapExpr));

        return new ExpressionStmt(call);
    }
}
