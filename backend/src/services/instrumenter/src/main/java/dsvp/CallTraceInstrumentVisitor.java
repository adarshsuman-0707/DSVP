package dsvp;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.type.VarType;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;



public class CallTraceInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private static final Set<String> SKIP_TYPES = Set.of(
        "DSVPArray", "void"
    );

    // className -> payload field name (e.g. "Node" -> "data"), detected the
    // same way LinkedListInstrumentVisitor detects Node classes. Needed so
    // a Node-typed local's traced "value" can show the actual pointed-to
    // data (e.g. the node's data field) instead of Java's default
    // Object.toString() (ClassName@hexhash), which is meaningless in the
    // Variables panel for a pointer that's mid-traversal in a loop.
    private final Map<String, String> nodeValueField = new HashMap<>();

    // Every user-declared class/interface name in this file — used so a
    // pointer to a non-Node user object (a hand-rolled Stack/Queue, etc.)
    // shows as "ClassName instance" in the Variables panel instead of
    // Java's default toString() ("Queue@14dad5dc"), a heap address that's
    // meaningless to a learner and, worse, looks identical every run
    // regardless of the object's actual state.
    private final Set<String> userClassNames = new java.util.HashSet<>();

    @Override
    public void visit(CompilationUnit cu, Void arg) {
        detectNodeClasses(cu);
        super.visit(cu, arg);
    }

    private void detectNodeClasses(CompilationUnit cu) {
        cu.findAll(ClassOrInterfaceDeclaration.class).forEach(cls -> {
            if (cls.isInterface()) return;
            String className = cls.getNameAsString();
            userClassNames.add(className);
            // Covers both a linked-list node (next/prev) and a tree node
            // (left/right) — either shape means "pointer to a payload
            // value", so both should render as "-> value" instead of
            // falling through to the generic "ClassName instance" text.
            boolean isPointerLike = false;
            String valFld = null;
            for (FieldDeclaration fd : cls.getFields()) {
                for (VariableDeclarator vd : fd.getVariables()) {
                    String fname = vd.getNameAsString();
                    String ftype = fd.getElementType().asString();
                    if ((fname.equals("next") || fname.equals("prev")
                            || fname.equals("left") || fname.equals("right"))
                            && (ftype.equals(className) || ftype.equals("Object"))) {
                        isPointerLike = true;
                    }
                    if (valFld == null && isValueFieldName(fname)) {
                        valFld = fname;
                    }
                }
            }
            if (isPointerLike) nodeValueField.put(className, valFld != null ? valFld : "data");
        });
    }

    private boolean isValueFieldName(String name) {
        return name.equals("data") || name.equals("val") || name.equals("value")
            || name.equals("key") || name.equals("item");
    }

    /** Returns true if this type should be tracked as a local variable. */
    private boolean isTraceableType(Type t) {
        String simple = simpleTypeName(t);
        // Skip arrays (shown in array panel), DSVPArray, void
        if (t.isArrayType()) return false;
        if (SKIP_TYPES.contains(simple)) return false;
        return true;
    }
    @Override
    public void visit(MethodDeclaration m, Void arg) {
        super.visit(m, arg); // instrument nested/lambda bodies first if any

        if (m.isAbstract() || m.getBody().isEmpty()) return;

        BlockStmt body = m.getBody().get();
        String methodName = m.getNameAsString();
        if (methodName.startsWith("_dsvp")) return;

        // Seed "locals in scope" with the method's own parameters.
        // Map name -> declared simple type, so Node-typed pointers can be
        // rendered as their pointed-to value instead of a raw toString().
        LinkedHashMap<String, String> paramTypes = new LinkedHashMap<>();
        for (Parameter p : m.getParameters()) {
            if (isTraceableType(p.getType())) {
                paramTypes.put(p.getNameAsString(), simpleTypeName(p.getType()));
            }
        }

        NodeList<Statement> newStmts = new NodeList<>();

        // Always inject traceCall — for main too — so a frame is pushed
        // onto ctx.frames in traceGeneratorService, making locals visible.
        newStmts.add(traceCallStmt(methodName, paramTypes));

        instrumentBlockStatements(body.getStatements(), methodName, new LinkedHashMap<>(paramTypes), newStmts);
        body.setStatements(newStmts);

        rewriteReturns(body, methodName);
    }
    /**
     * Walks a flat statement list, inserting a traceLine() before each
     * "real" statement, tracking locals declared along the way, and
     * recursing into nested blocks (if/else/for/while/etc.) so tracing
     * follows control flow rather than only the method's top level.
     */
    private void instrumentBlockStatements(NodeList<Statement> original, String methodName,
                                            LinkedHashMap<String, String> visibleLocals, NodeList<Statement> out) {
        for (Statement stmt : original) {
            out.add(traceLineStmt(methodName, stmt.getBegin().map(p -> p.line).orElse(0), visibleLocals));
            out.add(stmt);
            recordDeclarations(stmt, visibleLocals);
            recurseIntoNestedBlocks(stmt, methodName, visibleLocals);
        }
    }
    private void recurseIntoNestedBlocks(Statement stmt, String methodName, LinkedHashMap<String, String> outerLocals) {
        if (stmt instanceof BlockStmt) {
            BlockStmt block = (BlockStmt) stmt;
            LinkedHashMap<String, String> scoped = new LinkedHashMap<>(outerLocals);
            NodeList<Statement> rewritten = new NodeList<>();
            instrumentBlockStatements(block.getStatements(), methodName, scoped, rewritten);
            block.setStatements(rewritten);
        } else if (stmt instanceof IfStmt) {
            IfStmt ifs = (IfStmt) stmt;
            wrapAndRecurse(ifs.getThenStmt(), methodName, outerLocals, ifs::setThenStmt);
            ifs.getElseStmt().ifPresent(e -> wrapAndRecurse(e, methodName, outerLocals, ifs::setElseStmt));
        } else if (stmt instanceof ForStmt) {
            wrapAndRecurse(((ForStmt) stmt).getBody(), methodName, outerLocals, ((ForStmt) stmt)::setBody);
        } else if (stmt instanceof ForEachStmt) {
            wrapAndRecurse(((ForEachStmt) stmt).getBody(), methodName, outerLocals, ((ForEachStmt) stmt)::setBody);
        } else if (stmt instanceof WhileStmt) {
            wrapAndRecurse(((WhileStmt) stmt).getBody(), methodName, outerLocals, ((WhileStmt) stmt)::setBody);
        } else if (stmt instanceof DoStmt) {
            wrapAndRecurse(((DoStmt) stmt).getBody(), methodName, outerLocals, ((DoStmt) stmt)::setBody);
        } else if (stmt instanceof TryStmt) {
            TryStmt t = (TryStmt) stmt;
            recurseIntoNestedBlocks(t.getTryBlock(), methodName, outerLocals);
            t.getCatchClauses().forEach(cc -> recurseIntoNestedBlocks(cc.getBody(), methodName, outerLocals));
            t.getFinallyBlock().ifPresent(f -> recurseIntoNestedBlocks(f, methodName, outerLocals));
        }
        // switch statements are intentionally left un-instrumented at the
        // case level for now — top-level traceLine before the switch still
        // captures locals at entry, which is enough for the visualizer to
        // show progress without over-complicating control-flow edges here.
    }
    private void wrapAndRecurse(Statement body, String methodName, LinkedHashMap<String, String> outerLocals,
                                 java.util.function.Consumer<Statement> setter) {
        if (body instanceof BlockStmt) {
            recurseIntoNestedBlocks(body, methodName, outerLocals);
        } else if (!(body instanceof EmptyStmt)) {
            BlockStmt wrapped = new BlockStmt(new NodeList<>(body.clone()));
            recurseIntoNestedBlocks(wrapped, methodName, outerLocals);
            setter.accept(wrapped);
        }
    }
    /** Tracks newly-declared locals so later traceLine calls include them.
     *  All user-defined scalar/object variables are tracked — only arrays
     *  and DSVPArray are skipped (shown separately in the array visualizer).
     *  NOTE: for-loop and for-each initializers are NOT added to outer scope
     *  because they are scoped to the loop body only.
     */
    private void recordDeclarations(Statement stmt, LinkedHashMap<String, String> visibleLocals) {
        // Regular declaration: int x = 5;
        if (stmt instanceof ExpressionStmt) {
            extractVarsFromExpr(((ExpressionStmt) stmt).getExpression(), visibleLocals);
        }
        // for(int i=0;...) and for(int val : arr) are scoped inside the loop —
        // do NOT add to outer visibleLocals here; recurseIntoNestedBlocks will
        // pass them as part of the loop's own inner scope via loopLocals.
    }
    private void extractVarsFromExpr(Expression e, LinkedHashMap<String, String> visibleLocals) {
        if (!(e instanceof VariableDeclarationExpr)) return;
        VariableDeclarationExpr vde = (VariableDeclarationExpr) e;
        for (VariableDeclarator vd : vde.getVariables()) {
            if (isTraceableType(vd.getType()) && vd.getInitializer().isPresent()) {
                visibleLocals.put(vd.getNameAsString(), simpleTypeName(vd.getType()));
            }
        }
    }
    private String simpleTypeName(Type t) {
        String s = t.asString();
        int lt = s.indexOf('<');
        return lt >= 0 ? s.substring(0, lt) : s;
    }
    private Statement traceCallStmt(String methodName, LinkedHashMap<String, String> params) {
        MethodCallExpr call = new MethodCallExpr(new NameExpr("DSVPArray"), "traceCall",
            new NodeList<>(new StringLiteralExpr(methodName), buildJsonExpr(params)));
        return new ExpressionStmt(call);
    }
    private Statement traceLineStmt(String methodName, int line, LinkedHashMap<String, String> locals) {
        MethodCallExpr call = new MethodCallExpr(new NameExpr("DSVPArray"), "traceLine",
            new NodeList<>(new StringLiteralExpr(methodName), new IntegerLiteralExpr(String.valueOf(line)),
                           buildJsonExpr(locals)));
        return new ExpressionStmt(call);
    }
    private Expression buildJsonExpr(Map<String, String> vars) {
        if (vars.isEmpty()) return new StringLiteralExpr("{}");
        List<Map.Entry<String, String>> entries = new ArrayList<>(vars.entrySet());
        Expression acc = new StringLiteralExpr("{");
        for (int i = 0; i < entries.size(); i++) {
            String n = entries.get(i).getKey();
            String type = entries.get(i).getValue();
            // Build: "\"name\":\"" + <value expr for this var> + "\""
            // The StringLiteralExpr automatically escapes quotes, so we need raw strings with backslash-quote
            Expression pair = new BinaryExpr(
                new BinaryExpr(new StringLiteralExpr("\\\"" + n + "\\\":\\\""),
                                valueExprFor(n, type),
                                BinaryExpr.Operator.PLUS),
                new StringLiteralExpr("\\\""), BinaryExpr.Operator.PLUS
            );
            acc = new BinaryExpr(acc, pair, BinaryExpr.Operator.PLUS);
            if (i < entries.size() - 1) acc = new BinaryExpr(acc, new StringLiteralExpr(","), BinaryExpr.Operator.PLUS);
        }
        return new BinaryExpr(acc, new StringLiteralExpr("}"), BinaryExpr.Operator.PLUS);
    }

    /**
     * For a plain variable, this is just String.valueOf(var). But for a
     * pointer to a user-defined Node class, String.valueOf(var) calls the
     * default Object.toString() — "Node@1a2b3c", a heap address that tells
     * a student nothing about their traversal. Instead, show the actual
     * data the pointer currently points to: `data==5` (or "null" when the
     * pointer itself is null) — the whole point of a Variables panel while
     * stepping through a loop full of pointer reassignment.
     */
    private Expression valueExprFor(String varName, String declaredType) {
        String valField = nodeValueField.get(declaredType);
        if (valField == null) {
            if (userClassNames.contains(declaredType)) {
                Expression isNull = new BinaryExpr(new NameExpr(varName), new NullLiteralExpr(), BinaryExpr.Operator.EQUALS);
                return new EnclosedExpr(new ConditionalExpr(isNull,
                    new StringLiteralExpr("null"),
                    new StringLiteralExpr(declaredType + " instance")));
            }
            return new MethodCallExpr(new NameExpr("String"), "valueOf", new NodeList<>(new NameExpr(varName)));
        }
        Expression isNull = new BinaryExpr(new NameExpr(varName), new NullLiteralExpr(), BinaryExpr.Operator.EQUALS);
        Expression fieldVal = new MethodCallExpr(new NameExpr("String"), "valueOf",
            new NodeList<>(new FieldAccessExpr(new NameExpr(varName), valField)));
        Expression pointsTo = new BinaryExpr(
            new BinaryExpr(new StringLiteralExpr("-> "), fieldVal, BinaryExpr.Operator.PLUS),
            new StringLiteralExpr(""), BinaryExpr.Operator.PLUS
        );
        return new EnclosedExpr(new ConditionalExpr(isNull, new StringLiteralExpr("null"), pointsTo));
    }

    private int tmpReturnCounter = 0;

    /**
     * Expressions safe to evaluate twice (once for the trace string, once
     * for the actual return) because they have no observable side effects.
     * Anything else — method calls, array/index access, ++/--, assignments,
     * etc. — must be captured once into a temp var instead, or re-evaluating
     * it for tracing purposes silently changes the returned value (e.g.
     * `return stack[top--];` would decrement top twice and return the wrong
     * element).
     */
    private boolean isSideEffectFree(Expression e) {
        return e.isNameExpr() || e.isLiteralExpr() || e.isThisExpr();
    }

    private void rewriteReturns(BlockStmt body, String methodName) {
        // Only rewrite returns belonging to THIS method — findAll would
        // wrongly reach into nested lambda/anonymous-class returns, so we
        // stop descending at any nested MethodDeclaration/ObjectCreation body.
        for (ReturnStmt rs : body.findAll(ReturnStmt.class)) {
            if (isReturnFromNestedScope(rs, body)) continue;

            BlockStmt parent = findEnclosingBlock(rs);
            if (parent == null) continue;
            int idx = parent.getStatements().indexOf(rs);
            if (idx < 0) continue;

            Statement traceReturn;
            if (rs.getExpression().isPresent()) {
                Expression retExpr = rs.getExpression().get();

                if (!isSideEffectFree(retExpr)) {
                    // Evaluate once into a temp var — tracing must never
                    // re-run an expression with side effects (array access
                    // with a mutating index, method calls, ++/--, etc.).
                    String tmpName = "_dsvp_ret_" + (tmpReturnCounter++);
                    VariableDeclarator tmpDecl = new VariableDeclarator(new VarType(), tmpName, retExpr.clone());
                    Statement tmpStmt = new ExpressionStmt(new VariableDeclarationExpr(tmpDecl));
                    parent.getStatements().add(idx, tmpStmt);
                    idx++;
                    rs.setExpression(new NameExpr(tmpName));
                    retExpr = new NameExpr(tmpName);
                }

                MethodCallExpr call = new MethodCallExpr(new NameExpr("DSVPArray"), "traceReturn",
                    new NodeList<>(new StringLiteralExpr(methodName),
                        new MethodCallExpr(new NameExpr("String"), "valueOf", new NodeList<>(retExpr.clone())),
                        new StringLiteralExpr("{}")));
                traceReturn = new ExpressionStmt(call);
            } else {
                MethodCallExpr call = new MethodCallExpr(new NameExpr("DSVPArray"), "traceReturn",
                    new NodeList<>(new StringLiteralExpr(methodName), new StringLiteralExpr("void"), new StringLiteralExpr("{}")));
                traceReturn = new ExpressionStmt(call);
            }
            parent.getStatements().add(idx, traceReturn);
        }
    }

    private BlockStmt findEnclosingBlock(Statement s) {
        return s.findAncestor(BlockStmt.class).orElse(null);
    }

    private boolean isReturnFromNestedScope(ReturnStmt rs, BlockStmt methodBody) {
        // If there's a MethodDeclaration or lambda ancestor closer than methodBody, skip it.
        return rs.findAncestor(com.github.javaparser.ast.expr.LambdaExpr.class)
                .map(l -> true).orElse(false);
    }
}
