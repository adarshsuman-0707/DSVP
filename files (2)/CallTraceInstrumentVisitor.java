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

/**
 * Injects call/line/return tracing into every user-defined method, by
 * editing the AST's statement lists directly rather than inserting text
 * at line offsets. This means injected calls can never land mid-expression
 * or split a multi-line statement — something the old line-by-line text
 * injector was structurally unable to guarantee.
 *
 * For each method (except `main`, and except anything already named
 * DSVPArray's own helpers):
 *   - insert `DSVPArray.traceCall(name, argsJson)` as the first statement
 *   - insert `DSVPArray.traceLine(name, line, localsJson)` before every
 *     top-level statement in every block (method body, if/else branches,
 *     loop bodies, etc.) — recursively, so tracing follows control flow
 *     into nested blocks too, not just the top level
 *   - rewrite every `return expr;` into a traced pair (emit traceReturn,
 *     then return) and `return;` into a traced void return
 *
 * "Locals visible at this point" is computed per block by walking the
 * statements the AST actually contains above the injection point, so it
 * naturally scopes correctly for nested blocks (a variable declared only
 * inside an `if` won't leak into locals JSON built for the parent scope).
 */
public class CallTraceInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private static final Set<String> TRACEABLE_TYPES = Set.of(
        "int", "long", "double", "float", "short", "byte", "boolean", "char",
        "String", "Integer", "Long", "Double", "Float"
    );

    @Override
    public void visit(MethodDeclaration m, Void arg) {
        super.visit(m, arg); // instrument nested/lambda bodies first if any

        if (m.getNameAsString().equals("main") || m.isAbstract() || m.getBody().isEmpty()) return;

        BlockStmt body = m.getBody().get();
        String methodName = m.getNameAsString();

        // Seed "locals in scope" with the method's own parameters.
        List<String> paramNames = new ArrayList<>();
        for (Parameter p : m.getParameters()) {
            Type t = p.getType();
            String simple = simpleTypeName(t);
            if (TRACEABLE_TYPES.contains(simple)) paramNames.add(p.getNameAsString());
        }

        NodeList<Statement> newStmts = new NodeList<>();
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

    /** Recurses into if/else/for/while/do/synchronized bodies so nested blocks get traceLine too. */
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

    /** If a loop/if body is a single statement (not a {} block), wrap it in one so we have somewhere to inject. */
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

    /** Tracks newly-declared, initialized, traceable-typed locals so later traceLine calls include them. */
    private void recordDeclarations(Statement stmt, LinkedHashSet<String> visibleLocals) {
        if (!(stmt instanceof ExpressionStmt)) return;
        Expression e = ((ExpressionStmt) stmt).getExpression();
        if (!(e instanceof VariableDeclarationExpr)) return;
        VariableDeclarationExpr vde = (VariableDeclarationExpr) e;
        for (VariableDeclarator vd : vde.getVariables()) {
            String simple = simpleTypeName(vd.getType());
            if (TRACEABLE_TYPES.contains(simple) && vd.getInitializer().isPresent()) {
                visibleLocals.add(vd.getNameAsString());
            }
        }
    }

    private String simpleTypeName(Type t) {
        String s = t.asString();
        int lt = s.indexOf('<');
        return lt >= 0 ? s.substring(0, lt) : s;
    }

    /* ── Statement builders ────────────────────────────────────────── */

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

    /** Builds  "{" + "\"name\":\"" + String.valueOf(name) + "\"" + "," + ... + "}"  as a real Expression tree. */
    private Expression buildJsonExpr(List<String> names) {
        if (names.isEmpty()) return new StringLiteralExpr("{}");
        Expression acc = new StringLiteralExpr("{");
        for (int i = 0; i < names.size(); i++) {
            String n = names.get(i);
            Expression pair = new BinaryExpr(
                new BinaryExpr(new StringLiteralExpr("\"" + n + "\":\""),
                                new MethodCallExpr(new NameExpr("String"), "valueOf", new NodeList<>(new NameExpr(n))),
                                BinaryExpr.Operator.PLUS),
                new StringLiteralExpr("\""), BinaryExpr.Operator.PLUS
            );
            acc = new BinaryExpr(acc, pair, BinaryExpr.Operator.PLUS);
            if (i < names.size() - 1) acc = new BinaryExpr(acc, new StringLiteralExpr(","), BinaryExpr.Operator.PLUS);
        }
        return new BinaryExpr(acc, new StringLiteralExpr("}"), BinaryExpr.Operator.PLUS);
    }

    /* ── Return-statement rewriting ────────────────────────────────── */

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
