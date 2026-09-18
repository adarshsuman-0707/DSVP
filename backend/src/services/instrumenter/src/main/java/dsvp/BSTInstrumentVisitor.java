package dsvp;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.*;

/**
 * BSTInstrumentVisitor
 * ─────────────────────
 * Automatically instruments ANY user-defined binary (search) tree.
 *
 * HOW IT WORKS (fully automatic, zero user changes), mirroring
 * LinkedListInstrumentVisitor but for two-child "left"/"right" pointers
 * instead of a single "next" chain:
 *
 * PASS A — detect TreeNode classes:
 *   A class counts as a "tree node class" if it has:
 *     - A field named "left" OR "right" of a self-referential type
 *       (TreeNode/Node/etc., or Object)
 *     - A field named "data", "val", "value", "key", or "item" (the payload)
 *
 * PASS B — instrument every method that uses tree-node variables:
 *   After a statement that assigns to a ".left"/".right" field, or
 *   declares `new TreeNode(...)`, or at the top of a loop body that
 *   touches a tree-node variable → inject a call to the reflection-based
 *   helper that walks the WHOLE tree from the best-known root and emits:
 *
 *     DSVP_TRACE:{"op":"bst_snap",
 *                 "activeId":<int>,
 *                 "nodes":[{"id":<int>,"val":"<str>","leftId":<int|-1>,
 *                           "rightId":<int|-1>,"isRoot":true/false},...],
 *                 "desc":"<string>"}
 *
 *   to stderr — same channel/format convention as ll_snap.
 */
public class BSTInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private final Set<String> nodeClassNames = new LinkedHashSet<>();
    private final Map<String, String> nodeValField = new HashMap<>();

    private static final String HELPER = "_dsvpTraceBST";

    @Override
    public void visit(CompilationUnit cu, Void arg) {
        detectNodeClasses(cu);
        if (nodeClassNames.isEmpty()) return;

        injectHelper(cu);

        super.visit(cu, arg);
    }

    // ══════════════════════════════════════════════════════
    // PASS A — detect TreeNode classes
    // ══════════════════════════════════════════════════════

    private void detectNodeClasses(CompilationUnit cu) {
        cu.findAll(ClassOrInterfaceDeclaration.class).forEach(cls -> {
            if (cls.isInterface()) return;
            String className = cls.getNameAsString();

            boolean hasChild = false;
            String  valFld   = null;

            for (FieldDeclaration fd : cls.getFields()) {
                for (VariableDeclarator vd : fd.getVariables()) {
                    String fname = vd.getNameAsString();
                    String ftype = fd.getElementType().asString();

                    if (fname.equals("left") || fname.equals("right")) {
                        if (ftype.equals(className) || ftype.equals("Object")
                                || nodeClassNames.contains(ftype)) {
                            hasChild = true;
                        }
                    }
                    if (valFld == null && isValueField(fname)) {
                        valFld = fname;
                    }
                }
            }

            // A class that ALSO declares "next" belongs to the linked-list
            // detector instead — keeps the two auto-detection systems from
            // ever double-firing on the same class.
            boolean hasNext = cls.getFields().stream()
                .flatMap(fd -> fd.getVariables().stream())
                .anyMatch(vd -> vd.getNameAsString().equals("next"));

            if (hasChild && !hasNext) {
                nodeClassNames.add(className);
                nodeValField.put(className, valFld != null ? valFld : "data");
            }
        });
    }

    private boolean isValueField(String name) {
        return name.equals("data") || name.equals("val") || name.equals("value")
            || name.equals("key")  || name.equals("item");
    }

    // ══════════════════════════════════════════════════════
    // PASS B — instrument method bodies
    // ══════════════════════════════════════════════════════

    @Override
    public void visit(MethodDeclaration m, Void arg) {
        super.visit(m, arg);
        if (m.getBody().isEmpty()) return;
        BlockStmt body = m.getBody().get();

        Set<String> nodeVars = collectNodeVars(m);
        if (nodeVars.isEmpty()) return;

        instrumentBlock(body, nodeVars);
    }

    private Set<String> collectNodeVars(MethodDeclaration m) {
        Set<String> vars = new LinkedHashSet<>();

        m.getParameters().forEach(p -> {
            if (nodeClassNames.contains(p.getType().asString())) {
                vars.add(p.getNameAsString());
            }
        });

        m.findAll(VariableDeclarator.class).forEach(vd -> {
            if (nodeClassNames.contains(vd.getType().asString())) {
                vars.add(vd.getNameAsString());
            }
        });

        return vars;
    }

    private void instrumentBlock(BlockStmt block, Set<String> nodeVars) {
        NodeList<Statement> stmts = block.getStatements();
        NodeList<Statement> result = new NodeList<>();

        for (Statement stmt : stmts) {
            result.add(stmt);

            if (isChildAssignment(stmt)) {
                String root = pickRoot(nodeVars);
                if (root != null) {
                    result.add(traceBSTStmt(root, describeStmt(stmt), extractActiveFromAssign(stmt)));
                }
            } else if (isNewNodeDecl(stmt)) {
                String root = pickRoot(nodeVars);
                extractNewNodeVarName(stmt).ifPresent(nodeVars::add);
                if (root != null) {
                    result.add(traceBSTStmt(root, "Created new node", null));
                }
            }

            recurseIntoNested(stmt, nodeVars);
        }

        block.setStatements(result);
    }

    private void recurseIntoNested(Statement stmt, Set<String> nodeVars) {
        if (stmt instanceof IfStmt) {
            IfStmt ifs = (IfStmt) stmt;
            wrapAndInstrument(ifs.getThenStmt(), nodeVars, ifs::setThenStmt);
            ifs.getElseStmt().ifPresent(e -> wrapAndInstrument(e, nodeVars, ifs::setElseStmt));

        } else if (stmt instanceof WhileStmt) {
            WhileStmt ws = (WhileStmt) stmt;
            addTraceAtTopOfLoop(ws.getBody(), nodeVars, ws::setBody, stmt);

        } else if (stmt instanceof ForStmt) {
            ForStmt fs = (ForStmt) stmt;
            addTraceAtTopOfLoop(fs.getBody(), nodeVars, fs::setBody, stmt);

        } else if (stmt instanceof ForEachStmt) {
            ForEachStmt fe = (ForEachStmt) stmt;
            wrapAndInstrument(fe.getBody(), nodeVars, fe::setBody);
        }
    }

    private void wrapAndInstrument(Statement body, Set<String> nodeVars,
                                    java.util.function.Consumer<Statement> setter) {
        if (body instanceof BlockStmt) {
            instrumentBlock((BlockStmt) body, new LinkedHashSet<>(nodeVars));
        } else if (!(body instanceof EmptyStmt)) {
            BlockStmt wrapped = new BlockStmt(new NodeList<>(body.clone()));
            instrumentBlock(wrapped, new LinkedHashSet<>(nodeVars));
            setter.accept(wrapped);
        }
    }

    private void addTraceAtTopOfLoop(Statement loopBody, Set<String> nodeVars,
                                      java.util.function.Consumer<Statement> setter,
                                      Statement loopStmt) {
        String root = pickRoot(nodeVars);
        if (root == null) { wrapAndInstrument(loopBody, nodeVars, setter); return; }

        String activeVar = extractLoopVar(loopStmt, nodeVars);

        BlockStmt block;
        if (loopBody instanceof BlockStmt) {
            block = (BlockStmt) loopBody;
        } else {
            block = new BlockStmt(new NodeList<>(loopBody.clone()));
            setter.accept(block);
        }

        block.getStatements().add(0, traceBSTStmt(root, "Traversing", activeVar));

        instrumentBlock(block, new LinkedHashSet<>(nodeVars));
    }

    // ══════════════════════════════════════════════════════
    // Pattern detection helpers
    // ══════════════════════════════════════════════════════

    private boolean isChildAssignment(Statement stmt) {
        if (!(stmt instanceof ExpressionStmt)) return false;
        Expression e = ((ExpressionStmt) stmt).getExpression();
        if (!(e instanceof AssignExpr)) return false;
        Expression target = ((AssignExpr) e).getTarget();
        if (!(target instanceof FieldAccessExpr)) return false;
        String field = ((FieldAccessExpr) target).getNameAsString();
        return field.equals("left") || field.equals("right");
    }

    private boolean isNewNodeDecl(Statement stmt) {
        if (!(stmt instanceof ExpressionStmt)) return false;
        Expression e = ((ExpressionStmt) stmt).getExpression();
        if (!(e instanceof VariableDeclarationExpr)) return false;
        VariableDeclarationExpr vde = (VariableDeclarationExpr) e;
        String type = vde.getElementType().asString();
        if (!nodeClassNames.contains(type)) return false;
        return vde.getVariables().stream().anyMatch(vd ->
            vd.getInitializer().map(init -> init instanceof ObjectCreationExpr).orElse(false));
    }

    private Optional<String> extractNewNodeVarName(Statement stmt) {
        if (!(stmt instanceof ExpressionStmt)) return Optional.empty();
        Expression e = ((ExpressionStmt) stmt).getExpression();
        if (!(e instanceof VariableDeclarationExpr)) return Optional.empty();
        VariableDeclarationExpr vde = (VariableDeclarationExpr) e;
        return vde.getVariables().stream()
            .findFirst()
            .map(VariableDeclarator::getNameAsString);
    }

    private String extractActiveFromAssign(Statement stmt) {
        if (!(stmt instanceof ExpressionStmt)) return null;
        Expression e = ((ExpressionStmt) stmt).getExpression();
        if (!(e instanceof AssignExpr)) return null;
        Expression rhs = ((AssignExpr) e).getValue();
        if (rhs instanceof NameExpr) return ((NameExpr) rhs).getNameAsString();
        return null;
    }

    private String extractLoopVar(Statement loopStmt, Set<String> nodeVars) {
        Expression condition = null;
        if (loopStmt instanceof WhileStmt)
            condition = ((WhileStmt) loopStmt).getCondition();
        else if (loopStmt instanceof ForStmt)
            condition = ((ForStmt) loopStmt).getCompare().orElse(null);

        if (condition == null) return pickRoot(nodeVars);

        final String[] found = {null};
        condition.findAll(NameExpr.class).forEach(n -> {
            if (found[0] == null && nodeVars.contains(n.getNameAsString()))
                found[0] = n.getNameAsString();
        });
        return found[0] != null ? found[0] : pickRoot(nodeVars);
    }

    private String pickRoot(Set<String> nodeVars) {
        if (nodeVars.isEmpty()) return null;
        for (String v : nodeVars) if (v.equals("root")) return "root";
        for (String v : nodeVars) if (v.equals("head")) return "head";
        return nodeVars.iterator().next();
    }

    private String describeStmt(Statement stmt) {
        String text = stmt.toString().trim();
        if (text.length() > 60) text = text.substring(0, 57) + "...";
        return text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", "");
    }

    // ══════════════════════════════════════════════════════
    // AST builders
    // ══════════════════════════════════════════════════════

    private Statement traceBSTStmt(String rootVar, String desc, String activeVar) {
        NodeList<Expression> args = new NodeList<>();
        args.add(new NameExpr(rootVar));
        args.add(activeVar != null ? new NameExpr(activeVar) : new NullLiteralExpr());
        args.add(new StringLiteralExpr(desc != null ? desc : ""));

        MethodCallExpr call = new MethodCallExpr(null, HELPER, args);
        return new ExpressionStmt(call);
    }

    /**
     * Inject _dsvpTraceBST static helper into the Main class. Reuses the
     * same reflection primitives (_dsvpHasField/_dsvpGetField/_dsvpGetId/
     * _dsvpEsc) that LinkedListInstrumentVisitor injects — if the user's
     * program ALSO has a linked list, both visitors run and each guards its
     * own helper injection with a name check so the methods aren't doubled.
     */
    private void injectHelper(CompilationUnit cu) {
        ClassOrInterfaceDeclaration mainClass = cu.findAll(ClassOrInterfaceDeclaration.class)
            .stream()
            .filter(c -> !c.isInterface())
            .filter(c -> c.getMethods().stream().anyMatch(m ->
                m.getNameAsString().equals("main") && m.isStatic()))
            .findFirst().orElse(null);

        if (mainClass == null) return;

        boolean sharedHelpersAlreadyPresent = mainClass.getMethods().stream()
            .anyMatch(m -> m.getNameAsString().equals("_dsvpGetId"));

        StringBuilder helper = new StringBuilder();

        if (!sharedHelpersAlreadyPresent) {
            helper.append(
                "private static int _dsvpNodeIdCtr = 1;\n" +
                "private static java.util.Map<Object,Integer> _dsvpNodeIds =\n" +
                "    new java.util.IdentityHashMap<>();\n" +
                "private static int _dsvpGetId(Object n) {\n" +
                "    if (!_dsvpNodeIds.containsKey(n)) _dsvpNodeIds.put(n, _dsvpNodeIdCtr++);\n" +
                "    return _dsvpNodeIds.get(n);\n" +
                "}\n" +
                "private static boolean _dsvpHasField(Object obj, String... names) {\n" +
                "    if (obj == null) return false;\n" +
                "    Class<?> c = obj.getClass();\n" +
                "    while (c != null && c != Object.class) {\n" +
                "        for (String name : names) {\n" +
                "            try {\n" +
                "                c.getDeclaredField(name);\n" +
                "                return true;\n" +
                "            } catch (Exception ignored) {}\n" +
                "        }\n" +
                "        c = c.getSuperclass();\n" +
                "    }\n" +
                "    return false;\n" +
                "}\n" +
                "private static Object _dsvpGetField(Object obj, String... names) {\n" +
                "    if (obj == null) return null;\n" +
                "    Class<?> c = obj.getClass();\n" +
                "    while (c != null && c != Object.class) {\n" +
                "        for (String name : names) {\n" +
                "            try {\n" +
                "                java.lang.reflect.Field f = c.getDeclaredField(name);\n" +
                "                f.setAccessible(true);\n" +
                "                return f.get(obj);\n" +
                "            } catch (Exception ignored) {}\n" +
                "        }\n" +
                "        c = c.getSuperclass();\n" +
                "    }\n" +
                "    return null;\n" +
                "}\n" +
                "private static String _dsvpEsc(String s) {\n" +
                "    return s.replace(\"\\\\\",\"\\\\\\\\\").replace(\"\\\"\",\"\\\\\\\"\").replace(\"\\n\",\"\\\\n\");\n" +
                "}\n"
            );
        }

        helper.append(
            // Count of nodes reachable from `start` walking left/right,
            // cycle-safe (a well-formed tree never cycles, but user code
            // can have bugs — e.g. accidentally wiring a node to itself —
            // so a visited-set guards against an infinite walk).
            "private static int _dsvpTreeReach(Object start) {\n" +
            "    if (start == null) return 0;\n" +
            "    int n = 0;\n" +
            "    java.util.Set<Object> seen = java.util.Collections.newSetFromMap(\n" +
            "        new java.util.IdentityHashMap<>());\n" +
            "    java.util.ArrayDeque<Object> stack = new java.util.ArrayDeque<>();\n" +
            "    stack.push(start);\n" +
            "    int limit = 512;\n" +
            "    while (!stack.isEmpty() && limit-- > 0) {\n" +
            "        Object cur = stack.pop();\n" +
            "        if (cur == null || seen.contains(cur)) continue;\n" +
            "        seen.add(cur);\n" +
            "        n++;\n" +
            "        Object l = _dsvpGetField(cur, \"left\");\n" +
            "        Object r = _dsvpGetField(cur, \"right\");\n" +
            "        if (l != null) stack.push(l);\n" +
            "        if (r != null) stack.push(r);\n" +
            "    }\n" +
            "    return n;\n" +
            "}\n" +
            "private static Object _dsvpStickyRootBST = null;\n" +
            // Root selection mirrors the linked-list sticky-root strategy:
            // keep the previously anchored root unless some OTHER reference
            // this program has touched now reaches STRICTLY more nodes (a
            // real structural change, e.g. re-rooting after a rotation) —
            // ties stay with the sticky root so an unrelated deep insert or
            // a search's traversal pointer never yanks the root marker
            // around. A tree shouldn't have cycles structurally, so unlike
            // the linked-list case there's no need for a separate "legit
            // terminator or self-cycle" validity check — _dsvpTreeReach's
            // visited-set already makes a buggy self-referential node count
            // itself once instead of looping forever, which is enough
            // defense for a shape that should never legitimately occur.
            "private static void _dsvpTraceBST(Object root, Object active, String desc) {\n" +
            "    if (root == null && active == null) return;\n" +
            "    Object bestRoot = root;\n" +
            "    int bestLen = (bestRoot != null) ? _dsvpTreeReach(bestRoot) : -1;\n" +
            "    if (_dsvpStickyRootBST != null) {\n" +
            "        int stickyLen = _dsvpTreeReach(_dsvpStickyRootBST);\n" +
            "        if (stickyLen >= bestLen) { bestLen = stickyLen; bestRoot = _dsvpStickyRootBST; }\n" +
            "    }\n" +
            "    for (Object candidate : _dsvpNodeIds.keySet()) {\n" +
            "        if (!_dsvpHasField(candidate, \"left\", \"right\")) continue;\n" +
            "        int len = _dsvpTreeReach(candidate);\n" +
            "        if (len > bestLen) { bestLen = len; bestRoot = candidate; }\n" +
            "    }\n" +
            "    if (bestRoot == null) bestRoot = active != null ? active : root;\n" +
            "    if (bestRoot == null) return;\n" +
            "    _dsvpStickyRootBST = bestRoot;\n" +
            "    StringBuilder sb = new StringBuilder(\"[\");\n" +
            "    java.util.Set<Object> seen = java.util.Collections.newSetFromMap(\n" +
            "        new java.util.IdentityHashMap<>());\n" +
            "    java.util.ArrayDeque<Object[]> stack = new java.util.ArrayDeque<>();\n" +
            "    stack.push(new Object[]{bestRoot, true});\n" +
            "    boolean first = true;\n" +
            "    int limit = 512;\n" +
            "    while (!stack.isEmpty() && limit-- > 0) {\n" +
            "        Object[] frame = stack.pop();\n" +
            "        Object cur = frame[0];\n" +
            "        boolean isRoot = (Boolean) frame[1];\n" +
            "        if (cur == null || seen.contains(cur)) continue;\n" +
            "        seen.add(cur);\n" +
            "        Object val   = _dsvpGetField(cur, \"data\",\"val\",\"value\",\"key\",\"item\");\n" +
            "        Object left  = _dsvpGetField(cur, \"left\");\n" +
            "        Object right = _dsvpGetField(cur, \"right\");\n" +
            "        int id  = _dsvpGetId(cur);\n" +
            "        int lId = (left  != null) ? _dsvpGetId(left)  : -1;\n" +
            "        int rId = (right != null) ? _dsvpGetId(right) : -1;\n" +
            "        if (!first) sb.append(\",\");\n" +
            "        first = false;\n" +
            "        sb.append(\"{\\\"id\\\":\").append(id)\n" +
            "          .append(\",\\\"val\\\":\\\"\").append(_dsvpEsc(val==null?\"null\":String.valueOf(val))).append(\"\\\"\")\n" +
            "          .append(\",\\\"leftId\\\":\").append(lId)\n" +
            "          .append(\",\\\"rightId\\\":\").append(rId)\n" +
            "          .append(\",\\\"isRoot\\\":\").append(isRoot).append(\"}\");\n" +
            "        if (right != null) stack.push(new Object[]{right, false});\n" +
            "        if (left  != null) stack.push(new Object[]{left,  false});\n" +
            "    }\n" +
            "    sb.append(\"]\");\n" +
            "    int activeId = (active != null) ? _dsvpGetId(active) : -1;\n" +
            "    System.err.println(\"DSVP_TRACE:{\\\"op\\\":\\\"bst_snap\\\",\\\"activeId\\\":\"+activeId+\n" +
            "        \",\\\"nodes\\\":\"+sb+\",\\\"desc\\\":\\\"\"+_dsvpEsc(desc)+\"\\\"}\");\n" +
            "    System.err.flush();\n" +
            "}"
        );

        try {
            com.github.javaparser.JavaParser jp = new com.github.javaparser.JavaParser();
            String wrappedCode = "class __Tmp__ { " + helper + " }";
            com.github.javaparser.ParseResult<CompilationUnit> result = jp.parse(wrappedCode);
            if (result.isSuccessful() && result.getResult().isPresent()) {
                result.getResult().get().findAll(ClassOrInterfaceDeclaration.class)
                    .stream()
                    .filter(c -> c.getNameAsString().equals("__Tmp__"))
                    .findFirst()
                    .ifPresent(tmp -> tmp.getMembers().forEach(m -> mainClass.addMember(m.clone())));
            }
        } catch (Exception e) {
            System.err.println("[DSVP] Warning: could not inject BST helper: " + e.getMessage());
        }
    }
}
