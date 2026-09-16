package dsvp;

import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;



public class CallTraceInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private static final Set<String> SKIP_TYPES = Set.of(
        "DSVPArray", "void"
    );
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
        List<String> paramNames = new ArrayList<>();
        for (Parameter p : m.getParameters()) {
            if (isTraceableType(p.getType())) {
                paramNames.add(p.getNameAsString());
            }
        }

        NodeList<Statement> newStmts = new NodeList<>();

        // Always inject traceCall — for main too — so a frame is pushed
        // onto ctx.frames in traceGeneratorService, making locals visible.
        newStmts.add(traceCallStmt(methodName, paramNames));

        instrumentBlockStatements(body.getStatements(), methodName, new LinkedHashSet<>(paramNames), newStmts);
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
                                            LinkedHashSet<String> visibleLocals, NodeList<Statement> out) {
        for (Statement stmt : original) {
            out.add(traceLineStmt(methodName, stmt.getBegin().map(p -> p.line).orElse(0), visibleLocals));
            out.add(stmt);
            recordDeclarations(stmt, visibleLocals);
            recurseIntoNestedBlocks(stmt, methodName, visibleLocals);
        }
    }
    private void recurseIntoNestedBlocks(Statement stmt, String methodName, LinkedHashSet<String> outerLocals) {
        if (stmt instanceof BlockStmt) {
            BlockStmt block = (BlockStmt) stmt;
            LinkedHashSet<String> scoped = new LinkedHashSet<>(outerLocals);
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
    private void wrapAndRecurse(Statement body, String methodName, LinkedHashSet<String> outerLocals,
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
    private void recordDeclarations(Statement stmt, LinkedHashSet<String> visibleLocals) {
        // Regular declaration: int x = 5;
        if (stmt instanceof ExpressionStmt) {
            extractVarsFromExpr(((ExpressionStmt) stmt).getExpression(), visibleLocals);
        }
        // for(int i=0;...) and for(int val : arr) are scoped inside the loop —
        // do NOT add to outer visibleLocals here; recurseIntoNestedBlocks will
        // pass them as part of the loop's own inner scope via loopLocals.
    }
    private void extractVarsFromExpr(Expression e, LinkedHashSet<String> visibleLocals) {
        if (!(e instanceof VariableDeclarationExpr)) return;
        VariableDeclarationExpr vde = (VariableDeclarationExpr) e;
        for (VariableDeclarator vd : vde.getVariables()) {
            if (isTraceableType(vd.getType()) && vd.getInitializer().isPresent()) {
                visibleLocals.add(vd.getNameAsString());
            }
        }
    }
    private String simpleTypeName(Type t) {
        String s = t.asString();
        int lt = s.indexOf('<');
        return lt >= 0 ? s.substring(0, lt) : s;
    }
    private Statement traceCallStmt(String methodName, List<String> paramNames) {
        MethodCallExpr call = new MethodCallExpr(new NameExpr("DSVPArray"), "traceCall",
            new NodeList<>(new StringLiteralExpr(methodName), buildJsonExpr(paramNames)));
        return new ExpressionStmt(call);
    }
    private Statement traceLineStmt(String methodName, int line, Set<String> locals) {
        MethodCallExpr call = new MethodCallExpr(new NameExpr("DSVPArray"), "traceLine",
            new NodeList<>(new StringLiteralExpr(methodName), new IntegerLiteralExpr(String.valueOf(line)),
                           buildJsonExpr(new ArrayList<>(locals))));
        return new ExpressionStmt(call);
    }
    private Expression buildJsonExpr(List<String> names) {
        if (names.isEmpty()) return new StringLiteralExpr("{}");
        Expression acc = new StringLiteralExpr("{");
        for (int i = 0; i < names.size(); i++) {
            String n = names.get(i);
            // Build: "\"name\":\"" + String.valueOf(name) + "\""
            // The StringLiteralExpr automatically escapes quotes, so we need raw strings with backslash-quote
            Expression pair = new BinaryExpr(
                new BinaryExpr(new StringLiteralExpr("\\\"" + n + "\\\":\\\""),
                                new MethodCallExpr(new NameExpr("String"), "valueOf", new NodeList<>(new NameExpr(n))),
                                BinaryExpr.Operator.PLUS),
                new StringLiteralExpr("\\\""), BinaryExpr.Operator.PLUS
            );
            acc = new BinaryExpr(acc, pair, BinaryExpr.Operator.PLUS);
            if (i < names.size() - 1) acc = new BinaryExpr(acc, new StringLiteralExpr(","), BinaryExpr.Operator.PLUS);
        }
        return new BinaryExpr(acc, new StringLiteralExpr("}"), BinaryExpr.Operator.PLUS);
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
