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
import com.github.javaparser.ast.type.ArrayType;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.PrimitiveType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.LinkedHashSet;
import java.util.Optional;
import java.util.Set;

/**
 * GraphInstrumentVisitor
 * ────────────────────────
 * Auto-instruments an adjacency-list graph shaped as List&lt;List&lt;T&gt;&gt; /
 * ArrayList&lt;ArrayList&lt;T&gt;&gt; — a shape the Map-based JS string-parsing
 * fallback (traceGeneratorService.js's detectJavaGraphFromLocals) can't see
 * at all, since it only recognizes Map&lt;Integer,List&lt;Integer&gt;&gt;.
 *
 * Handles TWO element shapes for T:
 *   1. Plain Integer — the common unweighted BFS/friend-recommendation
 *      style:  List&lt;List&lt;Integer&gt;&gt; graph;  graph.get(u).add(v);
 *   2. A custom weighted-edge class with a destination-like int field —
 *      the Dijkstra style:  class Edge { int destination; int distance; }
 *
 * Also recognizes, independently of which T shape is used:
 *   - A frontier variable — PriorityQueue (Dijkstra), or Queue/Deque/Stack
 *     (BFS/DFS) — instrumented on push (add/offer) and pop (poll/pop).
 *   - A `boolean[] visited` array — instrumented on writes, so visited
 *     nodes highlight as they're marked, not just when the frontier moves.
 *
 * Map&lt;Integer,List&lt;Integer&gt;&gt; graphs are NOT touched here — the
 * pre-existing JS fallback already handles those.
 *
 * Conservative by design, mirroring every other auto-detect pass in this
 * codebase: if no local/param anywhere in the file is List&lt;List&lt;T&gt;&gt;
 * shaped (T = Integer or a detected edge class), this pass does nothing.
 */
public class GraphInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private static final Set<String> DEST_FIELD_NAMES = Set.of(
        "destination", "dest", "to", "target", "node", "neighbor", "neighbour", "vertex"
    );
    private static final Set<String> WEIGHT_FIELD_NAMES = Set.of(
        "distance", "weight", "cost", "dist", "w"
    );
    private static final Set<String> FRONTIER_TYPE_NAMES = Set.of(
        "PriorityQueue", "Queue", "Deque", "ArrayDeque", "Stack"
    );

    private String edgeClassName;    // nullable — set only if a weighted-edge class is found
    private String destFieldName;    // nullable
    private String weightFieldName;  // nullable
    private boolean didRewrite = false;

    public boolean didRewrite() { return didRewrite; }

    @Override
    public void visit(CompilationUnit cu, Void arg) {
        detectEdgeClass(cu); // best-effort; edgeClassName may stay null (plain-Integer graphs are still valid)

        boolean anyGraphVar = cu.findAll(MethodDeclaration.class).stream()
            .anyMatch(m -> !collectGraphVars(m).isEmpty());
        if (!anyGraphVar) return;

        injectHelper(cu);
        didRewrite = true;
        super.visit(cu, arg);
    }

    /* ══════════════════════════════════════════════════════════════
       Detection
       ══════════════════════════════════════════════════════════════ */

    private void detectEdgeClass(CompilationUnit cu) {
        for (ClassOrInterfaceDeclaration cls : cu.findAll(ClassOrInterfaceDeclaration.class)) {
            if (cls.isInterface()) continue;
            String destFld = null, weightFld = null;
            for (FieldDeclaration fd : cls.getFields()) {
                for (VariableDeclarator vd : fd.getVariables()) {
                    if (!(vd.getType() instanceof PrimitiveType)
                        && !vd.getType().asString().equals("Integer")) continue;
                    String name = vd.getNameAsString();
                    if (destFld == null && DEST_FIELD_NAMES.contains(name.toLowerCase())) destFld = name;
                    if (weightFld == null && WEIGHT_FIELD_NAMES.contains(name.toLowerCase())) weightFld = name;
                }
            }
            if (destFld != null) {
                edgeClassName = cls.getNameAsString();
                destFieldName = destFld;
                weightFieldName = weightFld;
                return;
            }
        }
    }

    /** Is this type List<List<T>> / ArrayList<ArrayList<T>>, T = Integer or the detected edge class? */
    // The OUTER adjacency container stays List/ArrayList-only here — a Map
    // outer container (HashMap<Integer, List<Integer>> or
    // HashMap<Integer, Set<Integer>>) is already fully handled by the
    // separate JS-side string-parsing fallback in traceGeneratorService.js
    // (parseJavaAdjMap's regex matches "key=[v,v,...]", which is what BOTH
    // a List's and a Set's toString() print — Set-valued Map neighbors
    // already worked with zero changes needed there). Duplicating Map
    // detection here would risk double-instrumenting the same graph
    // through two different passes. The INNER neighbor container, though,
    // is List/Set-agnostic here — a plain adjacency list built with
    // `List<Set<Integer>> graph` (neighbors deduped via a Set instead of
    // a List) is a real, common pattern this pass didn't cover before.
    private static final Set<String> CONTAINER_TYPE_NAMES = Set.of(
        "List", "ArrayList", "Set", "HashSet", "LinkedHashSet"
    );

    private boolean isGraphAdjType(Type t) {
        if (!(t instanceof ClassOrInterfaceType)) return false;
        ClassOrInterfaceType outer = (ClassOrInterfaceType) t;
        if (!Set.of("List", "ArrayList").contains(outer.getNameAsString())) return false;
        if (outer.getTypeArguments().isEmpty()) return false;
        Type innerT = outer.getTypeArguments().get().get(0);
        if (!(innerT instanceof ClassOrInterfaceType)) return false;
        ClassOrInterfaceType inner = (ClassOrInterfaceType) innerT;
        if (!CONTAINER_TYPE_NAMES.contains(inner.getNameAsString())) return false;
        if (inner.getTypeArguments().isEmpty()) return false;
        Type elemT = inner.getTypeArguments().get().get(0);
        if (!(elemT instanceof ClassOrInterfaceType)) return false;
        String elemName = ((ClassOrInterfaceType) elemT).getNameAsString();
        return elemName.equals("Integer") || elemName.equals(edgeClassName);
    }

    private boolean isFrontierType(Type t) {
        return t instanceof ClassOrInterfaceType
            && FRONTIER_TYPE_NAMES.contains(((ClassOrInterfaceType) t).getNameAsString());
    }

    /** A `boolean[]` local/param — the "visited" array for a plain BFS/DFS. */
    private boolean isBooleanArrayType(Type t) {
        return t instanceof ArrayType
            && ((ArrayType) t).getComponentType() instanceof PrimitiveType
            && ((PrimitiveType) ((ArrayType) t).getComponentType()).getType() == PrimitiveType.Primitive.BOOLEAN;
    }

    /** `Set<Integer>` / `HashSet<Integer>` — the other common "visited" shape. */
    private boolean isIntSetType(Type t) {
        if (!(t instanceof ClassOrInterfaceType)) return false;
        ClassOrInterfaceType ct = (ClassOrInterfaceType) t;
        if (!Set.of("Set", "HashSet", "LinkedHashSet").contains(ct.getNameAsString())) return false;
        if (ct.getTypeArguments().isEmpty()) return false;
        Type elemT = ct.getTypeArguments().get().get(0);
        return elemT instanceof ClassOrInterfaceType && ((ClassOrInterfaceType) elemT).getNameAsString().equals("Integer");
    }

    private Set<String> collectGraphVars(MethodDeclaration m) {
        Set<String> vars = new LinkedHashSet<>();
        for (Parameter p : m.getParameters()) if (isGraphAdjType(p.getType())) vars.add(p.getNameAsString());
        m.findAll(VariableDeclarator.class).forEach(vd -> { if (isGraphAdjType(vd.getType())) vars.add(vd.getNameAsString()); });
        return vars;
    }

    private Optional<String> findFrontierVar(MethodDeclaration m) {
        for (Parameter p : m.getParameters()) if (isFrontierType(p.getType())) return Optional.of(p.getNameAsString());
        for (VariableDeclarator vd : m.findAll(VariableDeclarator.class)) if (isFrontierType(vd.getType())) return Optional.of(vd.getNameAsString());
        return Optional.empty();
    }

    /** boolean[] and Set<Integer> are both valid "visited" shapes — either is fine, detected uniformly. */
    private Optional<String> findVisitedVar(MethodDeclaration m) {
        for (Parameter p : m.getParameters()) if (isBooleanArrayType(p.getType()) || isIntSetType(p.getType())) return Optional.of(p.getNameAsString());
        for (VariableDeclarator vd : m.findAll(VariableDeclarator.class)) if (isBooleanArrayType(vd.getType()) || isIntSetType(vd.getType())) return Optional.of(vd.getNameAsString());
        return Optional.empty();
    }

    /* ══════════════════════════════════════════════════════════════
       Instrumentation
       ══════════════════════════════════════════════════════════════ */

    private static final class Ctx {
        final String graphVar, frontierVar, visitedVar; // frontierVar/visitedVar nullable
        Ctx(String g, String f, String v) { graphVar = g; frontierVar = f; visitedVar = v; }
    }

    @Override
    public void visit(MethodDeclaration m, Void arg) {
        super.visit(m, arg);
        if (m.getBody().isEmpty()) return;
        Set<String> graphVars = collectGraphVars(m);
        if (graphVars.isEmpty()) return;
        Ctx ctx = new Ctx(graphVars.iterator().next(), findFrontierVar(m).orElse(null), findVisitedVar(m).orElse(null));

        instrumentBlock(m.getBody().get(), ctx);
    }

    private void instrumentBlock(BlockStmt block, Ctx ctx) {
        NodeList<Statement> stmts = block.getStatements();
        NodeList<Statement> result = new NodeList<>();

        for (Statement stmt : stmts) {
            result.add(stmt);

            // graph.get(u).add(edgeExpr);  — edge construction
            if (isGraphEdgeAdd(stmt, ctx.graphVar)) {
                result.add(traceCallStmt(ctx, "null", "\"Building graph\""));
            }
            // frontierVar.add(x) / .offer(x) / .push(x)  — push onto the frontier
            else if (ctx.frontierVar != null && isFrontierPush(stmt, ctx.frontierVar)) {
                result.add(traceCallStmt(ctx, "null", "\"Frontier updated\""));
            }
            // visitedVar[idx] = <expr>;  — mark a node visited (boolean[] style)
            else if (ctx.visitedVar != null && isVisitedWrite(stmt, ctx.visitedVar)) {
                result.add(traceCallStmt(ctx, "null", "\"Marked visited\""));
            }
            // visitedVar.add(x);  — mark a node visited (Set<Integer> style)
            else if (ctx.visitedVar != null && isFrontierPush(stmt, ctx.visitedVar)) {
                result.add(traceCallStmt(ctx, "null", "\"Marked visited\""));
            }

            recurseIntoNested(stmt, ctx);
        }

        block.setStatements(result);

        // TYPE current = frontierVar.poll();  — pop from the frontier (needs
        // the declared variable's own name as the "active" argument, so
        // this is handled separately from the ExpressionStmt shapes above:
        // it must reference the popped-into local itself, not a literal).
        instrumentFrontierPops(block, ctx);
    }

    private void recurseIntoNested(Statement stmt, Ctx ctx) {
        if (stmt instanceof BlockStmt) {
            instrumentBlock((BlockStmt) stmt, ctx);
        } else if (stmt instanceof IfStmt) {
            IfStmt ifs = (IfStmt) stmt;
            wrapAndInstrument(ifs.getThenStmt(), ctx, ifs::setThenStmt);
            ifs.getElseStmt().ifPresent(e -> wrapAndInstrument(e, ctx, ifs::setElseStmt));
        } else if (stmt instanceof WhileStmt) {
            wrapAndInstrument(((WhileStmt) stmt).getBody(), ctx, ((WhileStmt) stmt)::setBody);
        } else if (stmt instanceof ForStmt) {
            wrapAndInstrument(((ForStmt) stmt).getBody(), ctx, ((ForStmt) stmt)::setBody);
        } else if (stmt instanceof ForEachStmt) {
            wrapAndInstrument(((ForEachStmt) stmt).getBody(), ctx, ((ForEachStmt) stmt)::setBody);
        }
    }

    private void wrapAndInstrument(Statement body, Ctx ctx, java.util.function.Consumer<Statement> setter) {
        if (body instanceof BlockStmt) {
            instrumentBlock((BlockStmt) body, ctx);
        } else if (!(body instanceof EmptyStmt)) {
            BlockStmt wrapped = new BlockStmt(new NodeList<>(body.clone()));
            instrumentBlock(wrapped, ctx);
            setter.accept(wrapped);
        }
    }

    /** `graphVar.get(idx).add(edgeExpr);` as a bare ExpressionStmt. */
    private boolean isGraphEdgeAdd(Statement stmt, String graphVar) {
        if (!(stmt instanceof ExpressionStmt)) return false;
        Expression e = ((ExpressionStmt) stmt).getExpression();
        if (!(e instanceof MethodCallExpr)) return false;
        MethodCallExpr add = (MethodCallExpr) e;
        if (!add.getNameAsString().equals("add")) return false;
        if (!add.getScope().isPresent() || !(add.getScope().get() instanceof MethodCallExpr)) return false;
        MethodCallExpr get = (MethodCallExpr) add.getScope().get();
        if (!get.getNameAsString().equals("get")) return false;
        return get.getScope().isPresent() && get.getScope().get() instanceof NameExpr
            && ((NameExpr) get.getScope().get()).getNameAsString().equals(graphVar);
    }

    /** `frontierVar.add(x);` / `.offer(x);` / `.push(x);` as a bare ExpressionStmt. */
    private boolean isFrontierPush(Statement stmt, String frontierVar) {
        if (!(stmt instanceof ExpressionStmt)) return false;
        Expression e = ((ExpressionStmt) stmt).getExpression();
        if (!(e instanceof MethodCallExpr)) return false;
        MethodCallExpr call = (MethodCallExpr) e;
        if (!Set.of("add", "offer", "push").contains(call.getNameAsString())) return false;
        return call.getScope().isPresent() && call.getScope().get() instanceof NameExpr
            && ((NameExpr) call.getScope().get()).getNameAsString().equals(frontierVar);
    }

    /** `visitedVar[idx] = <expr>;` as a bare ExpressionStmt. */
    private boolean isVisitedWrite(Statement stmt, String visitedVar) {
        if (!(stmt instanceof ExpressionStmt)) return false;
        Expression e = ((ExpressionStmt) stmt).getExpression();
        if (!(e instanceof AssignExpr)) return false;
        AssignExpr assign = (AssignExpr) e;
        if (!(assign.getTarget() instanceof ArrayAccessExpr)) return false;
        ArrayAccessExpr target = (ArrayAccessExpr) assign.getTarget();
        return target.getName() instanceof NameExpr
            && ((NameExpr) target.getName()).getNameAsString().equals(visitedVar);
    }

    /** `TYPE current = frontierVar.poll()/.pop();` — insert a trace call right after, referencing `current`. */
    private void instrumentFrontierPops(BlockStmt block, Ctx ctx) {
        if (ctx.frontierVar == null) return;
        NodeList<Statement> stmts = block.getStatements();
        for (int i = 0; i < stmts.size(); i++) {
            Statement stmt = stmts.get(i);
            if (!(stmt instanceof ExpressionStmt)) continue;
            Expression e = ((ExpressionStmt) stmt).getExpression();
            if (!(e instanceof VariableDeclarationExpr)) continue;
            VariableDeclarationExpr vde = (VariableDeclarationExpr) e;
            if (vde.getVariables().size() != 1) continue;
            VariableDeclarator vd = vde.getVariable(0);
            if (!vd.getInitializer().isPresent()) continue;
            Expression init = vd.getInitializer().get();
            if (!(init instanceof MethodCallExpr)) continue;
            MethodCallExpr call = (MethodCallExpr) init;
            if (!Set.of("poll", "pop", "remove").contains(call.getNameAsString())) continue;
            if (!call.getScope().isPresent() || !(call.getScope().get() instanceof NameExpr)) continue;
            if (!((NameExpr) call.getScope().get()).getNameAsString().equals(ctx.frontierVar)) continue;

            Statement traceStmt = traceCallStmt(ctx, vd.getNameAsString(), "\"Expanding node\"");
            stmts.add(i + 1, traceStmt);
            i++; // skip over the statement we just inserted
        }
    }

    private Statement traceCallStmt(Ctx ctx, String activeExpr, String descLiteral) {
        NodeList<Expression> args = new NodeList<>();
        args.add(new NameExpr(ctx.graphVar));
        args.add(ctx.frontierVar != null ? new NameExpr(ctx.frontierVar) : new NullLiteralExpr());
        args.add(activeExpr.equals("null") ? new NullLiteralExpr() : new NameExpr(activeExpr));
        args.add(ctx.visitedVar != null ? new NameExpr(ctx.visitedVar) : new NullLiteralExpr());
        args.add(destFieldName != null ? new StringLiteralExpr(destFieldName) : new NullLiteralExpr());
        args.add(weightFieldName != null ? new StringLiteralExpr(weightFieldName) : new NullLiteralExpr());
        // descLiteral is passed in already-quoted (e.g. "\"Building graph\"")
        // — strip the surrounding quotes back off to build a real string
        // literal node instead of a raw source-text expression.
        args.add(new StringLiteralExpr(descLiteral.substring(1, descLiteral.length() - 1)));
        return new ExpressionStmt(new MethodCallExpr(null, "_dsvpTraceGraph", args));
    }

    /* ══════════════════════════════════════════════════════════════
       Runtime helper injection
       ══════════════════════════════════════════════════════════════ */

    private void injectHelper(CompilationUnit cu) {
        ClassOrInterfaceDeclaration mainClass = cu.findAll(ClassOrInterfaceDeclaration.class)
            .stream()
            .filter(c -> !c.isInterface())
            .filter(c -> c.getMethods().stream().anyMatch(m -> m.getNameAsString().equals("main") && m.isStatic()))
            .findFirst().orElse(null);
        if (mainClass == null) return;

        String helperCode =
            "private static Object _dsvpGraphField(Object obj, String name) {\n" +
            "    if (obj == null || name == null) return null;\n" +
            "    Class<?> c = obj.getClass();\n" +
            "    while (c != null && c != Object.class) {\n" +
            "        try {\n" +
            "            java.lang.reflect.Field f = c.getDeclaredField(name);\n" +
            "            f.setAccessible(true);\n" +
            "            return f.get(obj);\n" +
            "        } catch (Exception ignored) {}\n" +
            "        c = c.getSuperclass();\n" +
            "    }\n" +
            "    return null;\n" +
            "}\n" +
            // Node ids on the graph itself are just the adjacency-list index
            // (0..n-1) — always a plain int, no identity mapping needed.
            // Frontier/active entries, though, can be an int[] (Dijkstra's
            // `new int[]{node, dist}`), a boxed Integer (plain BFS/DFS), or
            // an edge-shaped object — normalize all three to the underlying
            // node index.
            "private static int _dsvpGraphNodeId(Object x, String destField) {\n" +
            "    if (x == null) return -1;\n" +
            // A local declared `int[] current = pq.poll();` (or, for the
            // plain-int case, `int current = queue.poll();` gets autoboxed
            // to Integer when passed here as Object — no unwrap needed) also
            // gets independently wrapped into a DSVPArray by
            // ArrayInstrumentVisitor when it's an int[] — unwrap its private
            // `data` field back to the raw int[] before the instanceof
            // check below, or this Graph pass's own reflection would see a
            // DSVPArray object instead of the array it expects.
            "    if (x.getClass().getSimpleName().equals(\"DSVPArray\")) {\n" +
            "        Object raw = _dsvpGraphField(x, \"data\");\n" +
            "        if (raw != null) x = raw;\n" +
            "    }\n" +
            "    if (x instanceof int[]) return ((int[]) x).length > 0 ? ((int[]) x)[0] : -1;\n" +
            "    if (x instanceof Integer) return (Integer) x;\n" +
            "    Object v = _dsvpGraphField(x, destField);\n" +
            "    if (v instanceof Integer) return (Integer) v;\n" +
            "    return -1;\n" +
            "}\n" +
            "private static java.util.Set<String> _dsvpGraphLastEdges = new java.util.HashSet<>();\n" +
            "private static void _dsvpTraceGraph(Object graph, Object frontier, Object active, Object visited,\n" +
            "        String destField, String weightField, String desc) {\n" +
            "    if (!(graph instanceof java.util.List)) return;\n" +
            "    java.util.List<?> rows = (java.util.List<?>) graph;\n" +
            "    StringBuilder nodesSb = new StringBuilder(\"[\");\n" +
            "    StringBuilder edgesSb = new StringBuilder(\"[\");\n" +
            "    java.util.Set<String> curEdges = new java.util.HashSet<>();\n" +
            "    boolean firstNode = true, firstEdge = true;\n" +
            "    String newEdgeDesc = null;\n" +
            "    for (int u = 0; u < rows.size(); u++) {\n" +
            "        if (!firstNode) nodesSb.append(\",\");\n" +
            "        firstNode = false;\n" +
            "        nodesSb.append(\"{\\\"id\\\":\").append(u).append(\"}\");\n" +
            "        Object row = rows.get(u);\n" +
            "        if (!(row instanceof java.util.List)) continue;\n" +
            "        for (Object edge : (java.util.List<?>) row) {\n" +
            "            int v = _dsvpGraphNodeId(edge, destField);\n" +
            "            if (v < 0) continue;\n" +
            "            String key = u + \"->\" + v;\n" +
            "            curEdges.add(key);\n" +
            "            if (!_dsvpGraphLastEdges.contains(key)) newEdgeDesc = \"Added edge \" + u + \" -> \" + v;\n" +
            "            if (!firstEdge) edgesSb.append(\",\");\n" +
            "            firstEdge = false;\n" +
            "            edgesSb.append(\"{\\\"from\\\":\").append(u).append(\",\\\"to\\\":\").append(v).append(\"}\");\n" +
            "        }\n" +
            "    }\n" +
            "    nodesSb.append(\"]\");\n" +
            "    edgesSb.append(\"]\");\n" +
            "    _dsvpGraphLastEdges = curEdges;\n" +
            "    StringBuilder frontierSb = new StringBuilder(\"[\");\n" +
            "    boolean firstF = true;\n" +
            "    boolean frontierHasItems = false;\n" +
            // A java.util.Queue/Deque/PriorityQueue local is real
            // java.util.Collection — but this codebase's own Queue module
            // (QueueInstrumentVisitor) rewrites `Queue<T> q = new
            // LinkedList<>()`/`new ArrayDeque<>()` into a custom DSVPQueue
            // wrapper that only implements Iterable, NOT Collection, so
            // checking for Collection alone silently missed every
            // DSVPQueue-backed frontier (always showing frontier:[] even
            // with items in it). Iterable covers both cases.
            "    if (frontier instanceof Iterable) {\n" +
            "        for (Object f : (Iterable<?>) frontier) {\n" +
            "            frontierHasItems = true;\n" +
            "            int id = _dsvpGraphNodeId(f, destField);\n" +
            "            if (id < 0) continue;\n" +
            "            if (!firstF) frontierSb.append(\",\");\n" +
            "            firstF = false;\n" +
            "            frontierSb.append(id);\n" +
            "        }\n" +
            "    }\n" +
            "    frontierSb.append(\"]\");\n" +
            "    StringBuilder visitedSb = new StringBuilder(\"[\");\n" +
            "    boolean firstV = true;\n" +
            "    Object visitedArr = visited;\n" +
            "    if (visitedArr != null && visitedArr.getClass().getSimpleName().equals(\"DSVPArray\")) {\n" +
            "        Object raw = _dsvpGraphField(visitedArr, \"data\");\n" +
            "        if (raw != null) visitedArr = raw;\n" +
            "    }\n" +
            "    boolean visitedPresent = visitedArr instanceof boolean[] || visitedArr instanceof Iterable;\n" +
            "    if (visitedArr instanceof boolean[]) {\n" +
            "        boolean[] va = (boolean[]) visitedArr;\n" +
            "        for (int i = 0; i < va.length; i++) {\n" +
            "            if (!va[i]) continue;\n" +
            "            if (!firstV) visitedSb.append(\",\");\n" +
            "            firstV = false;\n" +
            "            visitedSb.append(i);\n" +
            "        }\n" +
            // Set<Integer>/HashSet<Integer> — the other common "visited"
            // shape (dedupe-by-membership instead of an index array).
            "    } else if (visitedArr instanceof Iterable) {\n" +
            "        for (Object o : (Iterable<?>) visitedArr) {\n" +
            "            int id = _dsvpGraphNodeId(o, destField);\n" +
            "            if (id < 0) continue;\n" +
            "            if (!firstV) visitedSb.append(\",\");\n" +
            "            firstV = false;\n" +
            "            visitedSb.append(id);\n" +
            "        }\n" +
            "    }\n" +
            "    visitedSb.append(\"]\");\n" +
            "    int activeId = _dsvpGraphNodeId(active, destField);\n" +
            "    boolean isTraversalStep = active != null || frontierHasItems || visitedPresent;\n" +
            "    String op = isTraversalStep ? \"graph_step\" : \"graph_build\";\n" +
            "    String finalDesc = (!isTraversalStep && newEdgeDesc != null) ? newEdgeDesc : desc;\n" +
            "    System.err.println(\"DSVP_TRACE:{\\\"op\\\":\\\"\" + op + \"\\\",\\\"nodes\\\":\" + nodesSb +\n" +
            "        \",\\\"edges\\\":\" + edgesSb + \",\\\"visited\\\":\" + visitedSb + \",\\\"frontier\\\":\" + frontierSb +\n" +
            "        \",\\\"activeId\\\":\" + (activeId < 0 ? \"null\" : activeId) + \",\\\"desc\\\":\\\"\" + finalDesc + \"\\\"}\");\n" +
            "    System.err.flush();\n" +
            "}";

        try {
            com.github.javaparser.JavaParser jp = new com.github.javaparser.JavaParser();
            String wrapped = "class __TmpGraph__ { " + helperCode + " }";
            com.github.javaparser.ParseResult<CompilationUnit> result = jp.parse(wrapped);
            if (result.isSuccessful() && result.getResult().isPresent()) {
                result.getResult().get().findAll(ClassOrInterfaceDeclaration.class).stream()
                    .filter(c -> c.getNameAsString().equals("__TmpGraph__"))
                    .findFirst()
                    .ifPresent(tmp -> tmp.getMembers().forEach(m -> mainClass.addMember(m.clone())));
            }
        } catch (Exception e) {
            System.err.println("[DSVP] Warning: could not inject Graph helper: " + e.getMessage());
        }
    }
}
