package dsvp;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.ArrayCreationLevel;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.CallableDeclaration;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.type.Type;

import java.util.*;

/**
 * Heap-mode instrumentation. Leaves the user's arrays and lists as real
 * arrays and lists and only reports what happens to them:
 *
 *   a[i] = v / a[i] += v / a[i]++   ->  DSVPHeap.set(a, i, ...)       (writes)
 *   x = a[i] / int x = a[i]         ->  DSVPHeap.rd(a, i)             (read provenance)
 *   a[i] < a[j]  (and <= > >=)      ->  DSVPHeap.cmp(vr(a,i), vr(a,j), "<")
 *   x.compareTo(y), Integer.compare ->  DSVPHeap.ct / ic
 *   new ArrayList<..>(..)           ->  new DSVPList<..>(..)          (reports add/set/remove)
 *   statements assigning an int field -> followed by DSVPHeap.sc("name", field)
 *   every statement                 ->  preceded by DSVPHeap.ln(sourceLine)
 *   user methods                    ->  enter/exit + return-value capture
 *
 * Nothing depends on a variable, class or method name. Arrays are only
 * rewritten when their declared type is known to be a 1-D array; anything
 * the visitor cannot prove is left untouched (the runtime then notices the
 * difference from the array snapshot that every event carries).
 */
public final class HeapInstrumenter {

    private final CompilationUnit cu;
    private final Set<String> heapNames = new HashSet<>();   // names assigned from an array/list read
    private final Set<String> intFields = new HashSet<>();
    private final Set<String> userTypes = new HashSet<>();
    // statements WE injected (line markers, size reports, enter/exit): never given a marker themselves.
    // A user statement that was merely rewritten (a[i] = v  ->  DSVPHeap.set(...)) is NOT in this set.
    private final Set<Statement> injected = Collections.newSetFromMap(new IdentityHashMap<>());

    private HeapInstrumenter(CompilationUnit cu) { this.cu = cu; }

    public static void apply(CompilationUnit cu) {
        new HeapInstrumenter(cu).run();
    }

    private void run() {
        for (TypeDeclaration<?> t : cu.findAll(TypeDeclaration.class)) userTypes.add(t.getNameAsString());

        wrapBodies();

        collectHeapNames();
        collectIntFields();

        rewriteArrayWrites();
        rewriteUnaryOnElements();
        rewriteComparisons();
        rewriteReads();
        rewriteCompareTo();
        rewriteArrayList();
        rewriteReturns();
        tagConditions();
        insertScalarReports();
        wrapMethods();
        insertLineMarkers();
    }

    /* ── helpers ───────────────────────────────────────────────────────── */

    private static MethodCallExpr call(String name, Expression... args) {
        MethodCallExpr m = new MethodCallExpr(new NameExpr("DSVPHeap"), name);
        for (Expression a : args) m.addArgument(a);
        return m;
    }

    private Statement stmt(Expression e) {
        Statement s = new ExpressionStmt(e);
        injected.add(s);
        return s;
    }

    private static boolean isIncDec(UnaryExpr.Operator o) {
        return o == UnaryExpr.Operator.PREFIX_INCREMENT || o == UnaryExpr.Operator.PREFIX_DECREMENT
            || o == UnaryExpr.Operator.POSTFIX_INCREMENT || o == UnaryExpr.Operator.POSTFIX_DECREMENT;
    }

    /** Evaluating the expression twice must be harmless. */
    private static boolean isSimple(Expression e) {
        return e.findAll(MethodCallExpr.class).isEmpty()
            && e.findAll(AssignExpr.class).isEmpty()
            && e.findAll(ObjectCreationExpr.class).isEmpty()
            && e.findAll(UnaryExpr.class).stream().noneMatch(u -> isIncDec(u.getOperator()));
    }

    /** Declared type of a variable visible at `at`, or null when unknown / ambiguous. */
    private Type lookupVarType(String name, Node at) {
        Optional<CallableDeclaration> callable = at.findAncestor(CallableDeclaration.class);
        Set<String> seen = new HashSet<>();
        Type found = null;
        if (callable.isPresent()) {
            for (Object po : callable.get().getParameters()) {
                Parameter p = (Parameter) po;
                if (p.getNameAsString().equals(name)) { found = p.getType(); seen.add(p.getType().asString()); }
            }
            for (VariableDeclarator vd : callable.get().findAll(VariableDeclarator.class)) {
                if (vd.getNameAsString().equals(name)) { found = vd.getType(); seen.add(vd.getType().asString()); }
            }
            if (!seen.isEmpty()) return seen.size() == 1 ? found : null;
        }
        return lookupFieldType(name, at, true);
    }

    private Type lookupFieldType(String name, Node at, boolean preferEnclosing) {
        if (preferEnclosing) {
            Node cur = at;
            while (cur != null) {
                Optional<ClassOrInterfaceDeclaration> cls = cur.findAncestor(ClassOrInterfaceDeclaration.class);
                if (cls.isEmpty()) break;
                Optional<FieldDeclaration> fd = cls.get().getFieldByName(name);
                if (fd.isPresent()) {
                    for (VariableDeclarator v : fd.get().getVariables()) {
                        if (v.getNameAsString().equals(name)) return v.getType();
                    }
                }
                cur = cls.get();
            }
        }
        Set<String> seen = new HashSet<>();
        Type found = null;
        for (FieldDeclaration fd : cu.findAll(FieldDeclaration.class)) {
            for (VariableDeclarator vd : fd.getVariables()) {
                if (vd.getNameAsString().equals(name)) { found = vd.getType(); seen.add(vd.getType().asString()); }
            }
        }
        return seen.size() == 1 ? found : null;
    }

    /** Component type name of a known 1-D array expression, else null. */
    private String arrayElemType(Expression arr) {
        Type t = null;
        if (arr instanceof NameExpr) {
            t = lookupVarType(((NameExpr) arr).getNameAsString(), arr);
        } else if (arr instanceof FieldAccessExpr) {
            FieldAccessExpr fa = (FieldAccessExpr) arr;
            t = lookupFieldType(fa.getNameAsString(), arr, fa.getScope() instanceof ThisExpr);
        }
        if (t == null || !t.isArrayType()) return null;
        Type c = t.asArrayType().getComponentType();
        if (c.isArrayType()) return null;
        return c.asString();
    }

    private static boolean isPrimitiveName(String n) {
        return n.equals("int") || n.equals("long") || n.equals("double") || n.equals("float")
            || n.equals("char") || n.equals("short") || n.equals("byte") || n.equals("boolean");
    }

    private String knownArrayElem(Expression e) {
        if (!(e instanceof ArrayAccessExpr)) return null;
        return arrayElemType(((ArrayAccessExpr) e).getName());
    }

    /* ── passes ────────────────────────────────────────────────────────── */

    private static void wrapIfNeeded(Statement body) {
        if (body == null || body instanceof BlockStmt) return;
        BlockStmt b = new BlockStmt();
        body.replace(b);
        b.addStatement(body);
    }

    private void wrapBodies() {
        for (IfStmt s : cu.findAll(IfStmt.class)) {
            wrapIfNeeded(s.getThenStmt());
            if (s.getElseStmt().isPresent() && !(s.getElseStmt().get() instanceof IfStmt)) wrapIfNeeded(s.getElseStmt().get());
        }
        for (ForStmt s : cu.findAll(ForStmt.class)) wrapIfNeeded(s.getBody());
        for (ForEachStmt s : cu.findAll(ForEachStmt.class)) wrapIfNeeded(s.getBody());
        for (WhileStmt s : cu.findAll(WhileStmt.class)) wrapIfNeeded(s.getBody());
        for (DoStmt s : cu.findAll(DoStmt.class)) wrapIfNeeded(s.getBody());
    }

    private void collectHeapNames() {
        for (VariableDeclarator vd : cu.findAll(VariableDeclarator.class)) {
            if (vd.getInitializer().isPresent() && isHeapRead(vd.getInitializer().get())) heapNames.add(vd.getNameAsString());
        }
        for (AssignExpr a : cu.findAll(AssignExpr.class)) {
            if (a.getOperator() != AssignExpr.Operator.ASSIGN || !isHeapRead(a.getValue())) continue;
            Expression t = a.getTarget();
            if (t instanceof NameExpr) heapNames.add(((NameExpr) t).getNameAsString());
            else if (t instanceof FieldAccessExpr) heapNames.add(((FieldAccessExpr) t).getNameAsString());
        }
    }

    private boolean isHeapRead(Expression e) {
        while (e instanceof EnclosedExpr) e = ((EnclosedExpr) e).getInner();
        if (e instanceof ArrayAccessExpr) return knownArrayElem(e) != null;
        return e instanceof MethodCallExpr && ((MethodCallExpr) e).getNameAsString().equals("get")
            && ((MethodCallExpr) e).getArguments().size() == 1;
    }

    private void collectIntFields() {
        for (FieldDeclaration fd : cu.findAll(FieldDeclaration.class)) {
            if (fd.isFinal()) continue;
            for (VariableDeclarator vd : fd.getVariables()) {
                if (vd.getType().isPrimitiveType() && vd.getType().asString().equals("int")) intFields.add(vd.getNameAsString());
            }
        }
    }

    private void rewriteArrayWrites() {
        List<AssignExpr> all = cu.findAll(AssignExpr.class);
        Collections.reverse(all);
        for (AssignExpr a : all) {
            if (!(a.getTarget() instanceof ArrayAccessExpr)) continue;
            ArrayAccessExpr aa = (ArrayAccessExpr) a.getTarget();
            String elem = arrayElemType(aa.getName());
            if (elem == null) continue;
            Expression value;
            if (a.getOperator() != AssignExpr.Operator.ASSIGN) {
                BinaryExpr.Operator op = compoundToBinary(a.getOperator());
                if (op == null || !isPrimitiveName(elem) || elem.equals("boolean") || !isSimple(aa.getName()) || !isSimple(aa.getIndex())) continue;
                value = new CastExpr(StaticJavaParser.parseType(elem),
                    new EnclosedExpr(new BinaryExpr(aa.clone(), new EnclosedExpr(a.getValue().clone()), op)));
            } else if (elem.equals("char") || elem.equals("byte") || elem.equals("short")) {
                value = new CastExpr(StaticJavaParser.parseType(elem), new EnclosedExpr(a.getValue().clone()));
            } else {
                value = a.getValue().clone();
            }
            a.replace(call("set", aa.getName().clone(), aa.getIndex().clone(), value));
        }
    }

    private static BinaryExpr.Operator compoundToBinary(AssignExpr.Operator op) {
        switch (op) {
            case PLUS: return BinaryExpr.Operator.PLUS;
            case MINUS: return BinaryExpr.Operator.MINUS;
            case MULTIPLY: return BinaryExpr.Operator.MULTIPLY;
            case DIVIDE: return BinaryExpr.Operator.DIVIDE;
            case REMAINDER: return BinaryExpr.Operator.REMAINDER;
            case BINARY_AND: return BinaryExpr.Operator.BINARY_AND;
            case BINARY_OR: return BinaryExpr.Operator.BINARY_OR;
            case XOR: return BinaryExpr.Operator.XOR;
            case LEFT_SHIFT: return BinaryExpr.Operator.LEFT_SHIFT;
            case SIGNED_RIGHT_SHIFT: return BinaryExpr.Operator.SIGNED_RIGHT_SHIFT;
            case UNSIGNED_RIGHT_SHIFT: return BinaryExpr.Operator.UNSIGNED_RIGHT_SHIFT;
            default: return null;
        }
    }

    /** `a[i]++;` / `--a[i];` as a statement. */
    private void rewriteUnaryOnElements() {
        for (UnaryExpr u : cu.findAll(UnaryExpr.class)) {
            UnaryExpr.Operator o = u.getOperator();
            boolean inc = o == UnaryExpr.Operator.POSTFIX_INCREMENT || o == UnaryExpr.Operator.PREFIX_INCREMENT;
            boolean dec = o == UnaryExpr.Operator.POSTFIX_DECREMENT || o == UnaryExpr.Operator.PREFIX_DECREMENT;
            if (!inc && !dec) continue;
            if (!(u.getExpression() instanceof ArrayAccessExpr)) continue;
            if (!(u.getParentNode().isPresent() && u.getParentNode().get() instanceof ExpressionStmt)) continue;
            ArrayAccessExpr aa = (ArrayAccessExpr) u.getExpression();
            String elem = arrayElemType(aa.getName());
            if (elem == null || !isPrimitiveName(elem) || elem.equals("boolean") || !isSimple(aa.getName()) || !isSimple(aa.getIndex())) continue;
            Expression value = new CastExpr(StaticJavaParser.parseType(elem), new EnclosedExpr(
                new BinaryExpr(aa.clone(), new IntegerLiteralExpr("1"), inc ? BinaryExpr.Operator.PLUS : BinaryExpr.Operator.MINUS)));
            u.replace(call("set", aa.getName().clone(), aa.getIndex().clone(), value));
        }
    }

    /**
     * Every remaining read of a known 1-D array element becomes DSVPHeap.rd(a, i): the value is unchanged,
     * but the read is remembered so a later comparison of that value can be attributed to the right index.
     */
    private void rewriteReads() {
        List<ArrayAccessExpr> all = cu.findAll(ArrayAccessExpr.class);
        Collections.reverse(all);
        for (ArrayAccessExpr aa : all) {
            if (knownArrayElem(aa) == null) continue;
            Node parent = aa.getParentNode().orElse(null);
            if (parent instanceof AssignExpr && ((AssignExpr) parent).getTarget() == aa) continue;      // a write target
            if (parent instanceof UnaryExpr && isIncDec(((UnaryExpr) parent).getOperator())) continue;  // a[i]++
            aa.replace(call("rd", aa.getName().clone(), aa.getIndex().clone()));
        }
    }

    private boolean qualifies(Expression e) {
        while (e instanceof EnclosedExpr) e = ((EnclosedExpr) e).getInner();
        if (e instanceof ArrayAccessExpr) return knownArrayElem(e) != null;
        if (e instanceof MethodCallExpr) return ((MethodCallExpr) e).getNameAsString().equals("get");
        if (e instanceof NameExpr) return heapNames.contains(((NameExpr) e).getNameAsString());
        if (e instanceof FieldAccessExpr) return heapNames.contains(((FieldAccessExpr) e).getNameAsString());
        return false;
    }

    private Expression operand(Expression e) {
        Expression inner = e;
        while (inner instanceof EnclosedExpr) inner = ((EnclosedExpr) inner).getInner();
        if (inner instanceof ArrayAccessExpr && knownArrayElem(inner) != null) {
            ArrayAccessExpr aa = (ArrayAccessExpr) inner;
            return call("vr", aa.getName().clone(), aa.getIndex().clone());
        }
        if (inner instanceof MethodCallExpr) return call("pg", call("v", e.clone()));
        if (qualifies(inner)) return call("p", call("v", e.clone()));
        return call("v", e.clone());
    }

    private void rewriteComparisons() {
        List<BinaryExpr> all = cu.findAll(BinaryExpr.class);
        Collections.reverse(all);
        for (BinaryExpr b : all) {
            String sym;
            switch (b.getOperator()) {
                case LESS: sym = "<"; break;
                case LESS_EQUALS: sym = "<="; break;
                case GREATER: sym = ">"; break;
                case GREATER_EQUALS: sym = ">="; break;
                default: continue;
            }
            if (!qualifies(b.getLeft()) && !qualifies(b.getRight())) continue;
            b.replace(call("cmp", operand(b.getLeft()), operand(b.getRight()), new StringLiteralExpr(sym)));
        }
    }

    private void rewriteCompareTo() {
        List<MethodCallExpr> all = cu.findAll(MethodCallExpr.class);
        Collections.reverse(all);
        for (MethodCallExpr m : all) {
            if (m.getNameAsString().equals("compareTo") && m.getArguments().size() == 1 && m.getScope().isPresent()) {
                m.replace(call("ct", m.getScope().get().clone(), m.getArgument(0).clone()));
            } else if (m.getNameAsString().equals("compare") && m.getArguments().size() == 2 && m.getScope().isPresent()
                && m.getScope().get() instanceof NameExpr && ((NameExpr) m.getScope().get()).getNameAsString().equals("Integer")
                && !userTypes.contains("Integer")) {
                m.replace(call("ic", m.getArgument(0).clone(), m.getArgument(1).clone()));
            }
        }
    }

    private void rewriteArrayList() {
        if (userTypes.contains("ArrayList")) return;
        for (ObjectCreationExpr oce : cu.findAll(ObjectCreationExpr.class)) {
            if (oce.getAnonymousClassBody().isPresent()) continue;
            if (oce.getType().getNameAsString().equals("ArrayList") && oce.getType().getScope().isEmpty()) {
                oce.getType().setName("DSVPList");
            }
        }
    }

    /** while / do-while / for / else-if conditions run again after the body: tag them with their own line. */
    private void tagConditions() {
        for (WhileStmt w : cu.findAll(WhileStmt.class)) {
            int line = w.getRange().map(r -> r.begin.line).orElse(0);
            if (line > 0 && mentionsHeap(w.getCondition())) w.setCondition(lineGuard(line, w.getCondition()));
        }
        for (DoStmt d : cu.findAll(DoStmt.class)) {
            int line = d.getCondition().getRange().map(r -> r.begin.line).orElse(0);
            if (line > 0 && mentionsHeap(d.getCondition())) d.setCondition(lineGuard(line, d.getCondition()));
        }
        for (ForStmt f : cu.findAll(ForStmt.class)) {
            if (f.getCompare().isEmpty()) continue;
            Expression c = f.getCompare().get();
            int line = f.getRange().map(r -> r.begin.line).orElse(0);
            if (line > 0 && mentionsHeap(c)) f.setCompare(lineGuard(line, c));
        }
        for (IfStmt i : cu.findAll(IfStmt.class)) {
            boolean isElseIf = i.getParentNode().isPresent() && i.getParentNode().get() instanceof IfStmt
                && ((IfStmt) i.getParentNode().get()).getElseStmt().map(e -> e == i).orElse(false);
            int line = i.getRange().map(r -> r.begin.line).orElse(0);
            if (isElseIf && line > 0 && mentionsHeap(i.getCondition())) i.setCondition(lineGuard(line, i.getCondition()));
        }
    }

    /** `DSVPHeap.at(line) && (cond)`: the line is set BEFORE the condition runs, every time it runs. */
    private Expression lineGuard(int line, Expression cond) {
        return new BinaryExpr(call("at", new IntegerLiteralExpr(String.valueOf(line))), new EnclosedExpr(cond.clone()), BinaryExpr.Operator.AND);
    }

    private static boolean mentionsHeap(Expression e) {
        return e.findAll(MethodCallExpr.class).stream().anyMatch(m -> m.getScope().map(s -> s.toString().equals("DSVPHeap")).orElse(false));
    }

    private void rewriteReturns() {
        for (ReturnStmt r : cu.findAll(ReturnStmt.class)) {
            if (r.getExpression().isEmpty()) continue;
            if (r.findAncestor(LambdaExpr.class).isPresent()) continue;
            if (r.findAncestor(MethodDeclaration.class).isEmpty()) continue;
            r.setExpression(call("rv", r.getExpression().get().clone()));
        }
    }

    private void insertScalarReports() {
        if (intFields.isEmpty()) return;
        for (BlockStmt block : cu.findAll(BlockStmt.class)) {
            NodeList<Statement> rebuilt = new NodeList<>();
            boolean changed = false;
            for (Statement s : new ArrayList<>(block.getStatements())) {
                rebuilt.add(s);
                if (!(s instanceof ExpressionStmt)) continue;
                Expression e = ((ExpressionStmt) s).getExpression();
                LinkedHashMap<String, Expression> targets = new LinkedHashMap<>();
                for (AssignExpr a : e.findAll(AssignExpr.class)) addIntTarget(targets, a.getTarget());
                for (UnaryExpr u : e.findAll(UnaryExpr.class)) if (isIncDec(u.getOperator())) addIntTarget(targets, u.getExpression());
                if (e instanceof AssignExpr) addIntTarget(targets, ((AssignExpr) e).getTarget());
                if (e instanceof UnaryExpr && isIncDec(((UnaryExpr) e).getOperator())) addIntTarget(targets, ((UnaryExpr) e).getExpression());
                if (targets.isEmpty()) continue;
                for (Map.Entry<String, Expression> t : targets.entrySet()) {
                    rebuilt.add(stmt(call("sc", new StringLiteralExpr(t.getKey()), t.getValue().clone())));
                    changed = true;
                }
            }
            if (changed) block.setStatements(rebuilt);
        }
    }

    private void addIntTarget(Map<String, Expression> targets, Expression t) {
        if (t instanceof NameExpr && intFields.contains(((NameExpr) t).getNameAsString())) {
            targets.putIfAbsent(((NameExpr) t).getNameAsString(), t);
        } else if (t instanceof FieldAccessExpr && intFields.contains(((FieldAccessExpr) t).getNameAsString())) {
            targets.putIfAbsent(((FieldAccessExpr) t).getNameAsString(), t);
        }
    }

    private void wrapMethods() {
        for (MethodDeclaration m : cu.findAll(MethodDeclaration.class)) {
            if (m.getBody().isEmpty()) continue;
            BlockStmt body = m.getBody().get();
            boolean isMain = m.getNameAsString().equals("main") && m.isStatic();
            if (isMain) {
                body.getStatements().addFirst(stmt(call("capOutput",
                    new MethodCallExpr(new NameExpr("Integer"), "getInteger",
                        NodeList.nodeList(new StringLiteralExpr("dsvp.maxOut"), new IntegerLiteralExpr("1048576"))))));
                continue;
            }
            int line = m.getRange().map(r -> r.begin.line).orElse(0);
            // Detach the original statements from the old list FIRST: replacing a block's statement list later
            // would otherwise null the parent of statements already moved into the new try block.
            List<Statement> originals = new ArrayList<>(body.getStatements());
            body.setStatements(new NodeList<>());
            BlockStmt tryBlock = new BlockStmt();
            for (Statement st : originals) tryBlock.addStatement(st);
            BlockStmt fin = new BlockStmt();
            fin.addStatement(stmt(call("exit", new StringLiteralExpr(m.getNameAsString()))));
            TryStmt ts = new TryStmt(tryBlock, new NodeList<>(), fin);

            NodeList<Expression> vals = new NodeList<>();
            for (Parameter p : m.getParameters()) vals.add(new NameExpr(p.getNameAsString()));
            ArrayCreationExpr argArr = new ArrayCreationExpr(StaticJavaParser.parseType("Object"),
                new NodeList<>(new ArrayCreationLevel()), new ArrayInitializerExpr(vals));

            NodeList<Statement> repl = new NodeList<>();
            repl.add(stmt(call("ln", new IntegerLiteralExpr(String.valueOf(line)))));
            repl.add(stmt(call("enter", new StringLiteralExpr(m.getNameAsString()), argArr)));
            repl.add(ts);
            body.setStatements(repl);
        }
    }

    private void insertLineMarkers() {
        for (BlockStmt block : cu.findAll(BlockStmt.class)) {
            NodeList<Statement> rebuilt = new NodeList<>();
            boolean changed = false;
            for (Statement s : new ArrayList<>(block.getStatements())) {
                if (!(s instanceof ExplicitConstructorInvocationStmt) && !(s instanceof LocalClassDeclarationStmt)
                    && !injected.contains(s) && s.getRange().isPresent()) {
                    rebuilt.add(stmt(call("ln", new IntegerLiteralExpr(String.valueOf(s.getRange().get().begin.line)))));
                    changed = true;
                }
                rebuilt.add(s);
            }
            if (changed) block.setStatements(rebuilt);
        }
    }

}
