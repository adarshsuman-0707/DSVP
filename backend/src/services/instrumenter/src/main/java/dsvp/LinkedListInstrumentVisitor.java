package dsvp;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.*;

/**
 * LinkedListInstrumentVisitor
 * ────────────────────────────
 * Automatically instruments ANY user-defined singly/doubly linked list.
 *
 * HOW IT WORKS (fully automatic, zero user changes):
 *
 * PASS A — detect Node classes:
 *   Scan all class declarations. A class is treated as a "Node class" if it has:
 *     - A field named "next" of a self-referential type (Node/ListNode/etc.)
 *     - A field named "data", "val", "value", "key", or "item" (the payload)
 *   The class name (e.g. "Node", "ListNode", "NodeLL") is recorded.
 *
 * PASS B — instrument every method that uses Node variables:
 *   For every statement in a method body, AFTER the statement is emitted:
 *     - If the statement assigns to a ".next" field  (e.g. cur.next = newNode)
 *       → inject a traceLL call that snapshots the whole chain from the nearest
 *         known "head" variable.
 *     - If a new Node is constructed (new Node(...))
 *       → inject a traceLL call.
 *     - For-loop / while-loop bodies with Node variables
 *       → inject traceLL at the top of the loop body to show traversal.
 *
 * TRACE EMISSION:
 *   A static helper method _dsvpTraceLL(Object head) is injected into the
 *   Main class. It walks the chain via reflection and emits:
 *
 *     DSVP_TRACE:{"op":"ll_snap",
 *                 "activeId":<int>,
 *                 "nodes":[{"id":<int>,"val":"<str>","nextId":<int|-1>,"isHead":true/false},...],
 *                 "desc":"<string>"}
 *
 *   to stderr (consistent with DSVPArray trace channel).
 *
 * SUPPORTED PATTERNS:
 *   Node head = new Node(10);
 *   head.next = new Node(20);        // ← instrumented
 *   cur.next = cur.next.next;        // ← instrumented
 *   head = head.next;                // ← NOT instrumented (pointer move only)
 *   while (cur != null) { ... }      // ← loop body instrumented
 */
public class LinkedListInstrumentVisitor extends VoidVisitorAdapter<Void> {

    // Names of classes detected as "Node" types
    private final Set<String> nodeClassNames = new LinkedHashSet<>();

    // Value field names seen in node classes
    private final Map<String, String> nodeValField = new HashMap<>(); // className → fieldName

    // The name of the injected helper method
    private static final String HELPER = "_dsvpTraceLL";

    // ══════════════════════════════════════════════════════
    // Entry point
    // ══════════════════════════════════════════════════════

    @Override
    public void visit(CompilationUnit cu, Void arg) {
        // Pass A: find Node classes
        detectNodeClasses(cu);
        if (nodeClassNames.isEmpty()) return; // no linked list found — skip

        // Inject helper method into Main class
        injectHelper(cu);

        // Pass B: instrument method bodies
        super.visit(cu, arg);
    }

    // ══════════════════════════════════════════════════════
    // PASS A — detect Node classes
    // ══════════════════════════════════════════════════════

    private void detectNodeClasses(CompilationUnit cu) {
        cu.findAll(ClassOrInterfaceDeclaration.class).forEach(cls -> {
            if (cls.isInterface()) return;
            String className = cls.getNameAsString();

            boolean hasNext    = false;
            String  valFld     = null;

            for (FieldDeclaration fd : cls.getFields()) {
                for (VariableDeclarator vd : fd.getVariables()) {
                    String fname = vd.getNameAsString();
                    String ftype = fd.getElementType().asString();

                    if (fname.equals("next") || fname.equals("prev")) {
                        // Self-referential: type matches class name or is Object
                        if (ftype.equals(className) || ftype.equals("Object")
                                || nodeClassNames.contains(ftype)) {
                            hasNext = true;
                        }
                    }
                    if (valFld == null && isValueField(fname)) {
                        valFld = fname;
                    }
                }
            }

            if (hasNext) {
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

        // Collect Node-typed local variables and params → candidate "head" vars
        Set<String> nodeVars = collectNodeVars(m);
        if (nodeVars.isEmpty()) return;

        // Instrument the block
        instrumentBlock(body, nodeVars);
    }

    private Set<String> collectNodeVars(MethodDeclaration m) {
        Set<String> vars = new LinkedHashSet<>();

        // Parameters
        m.getParameters().forEach(p -> {
            if (nodeClassNames.contains(p.getType().asString())) {
                vars.add(p.getNameAsString());
            }
        });

        // Local variable declarations
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

            // After assignment to .next field → emit trace
            if (isNextAssignment(stmt)) {
                String head = pickHead(nodeVars);
                if (head != null) {
                    result.add(traceLLStmt(head, describeStmt(stmt), extractActiveFromNextAssign(stmt)));
                }
            }

            // After new Node(...) local declaration → emit trace
            else if (isNewNodeDecl(stmt)) {
                String head = pickHead(nodeVars);
                // Also register the new variable
                extractNewNodeVarName(stmt).ifPresent(nodeVars::add);
                if (head != null) {
                    result.add(traceLLStmt(head, "Created new node", null));
                }
            }

            // Recurse into nested blocks (if/else/for/while bodies)
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

    /** Add a traceLL at the start of a loop body to show traversal. */
    private void addTraceAtTopOfLoop(Statement loopBody, Set<String> nodeVars,
                                      java.util.function.Consumer<Statement> setter,
                                      Statement loopStmt) {
        String head = pickHead(nodeVars);
        if (head == null) { wrapAndInstrument(loopBody, nodeVars, setter); return; }

        // Determine active variable from loop condition (e.g. while (cur != null) → cur)
        String activeVar = extractLoopVar(loopStmt, nodeVars);

        BlockStmt block;
        if (loopBody instanceof BlockStmt) {
            block = (BlockStmt) loopBody;
        } else {
            block = new BlockStmt(new NodeList<>(loopBody.clone()));
            setter.accept(block);
        }

        // Inject at top: _dsvpTraceLL(head, cur, "Traversing")
        block.getStatements().add(0, traceLLStmt(head, "Traversing", activeVar));

        // Also recurse into the rest of the block
        instrumentBlock(block, new LinkedHashSet<>(nodeVars));
    }

    // ══════════════════════════════════════════════════════
    // Pattern detection helpers
    // ══════════════════════════════════════════════════════

    private boolean isNextAssignment(Statement stmt) {
        if (!(stmt instanceof ExpressionStmt)) return false;
        Expression e = ((ExpressionStmt) stmt).getExpression();
        if (!(e instanceof AssignExpr)) return false;
        Expression target = ((AssignExpr) e).getTarget();
        if (!(target instanceof FieldAccessExpr)) return false;
        String field = ((FieldAccessExpr) target).getNameAsString();
        return field.equals("next") || field.equals("prev");
    }

    private boolean isNewNodeDecl(Statement stmt) {
        if (!(stmt instanceof ExpressionStmt)) return false;
        Expression e = ((ExpressionStmt) stmt).getExpression();
        if (!(e instanceof VariableDeclarationExpr)) return false;
        VariableDeclarationExpr vde = (VariableDeclarationExpr) e;
        String type = vde.getElementType().asString();
        if (!nodeClassNames.contains(type)) return false;
        // Has an initializer that is a new expression
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

    private String extractActiveFromNextAssign(Statement stmt) {
        if (!(stmt instanceof ExpressionStmt)) return null;
        Expression e = ((ExpressionStmt) stmt).getExpression();
        if (!(e instanceof AssignExpr)) return null;
        Expression rhs = ((AssignExpr) e).getValue();
        // If RHS is just a name (variable), that's the active node
        if (rhs instanceof NameExpr) return ((NameExpr) rhs).getNameAsString();
        // If RHS is new Node(...), no active yet
        return null;
    }

    private String extractLoopVar(Statement loopStmt, Set<String> nodeVars) {
        // whle (cur != null) or while (cur != null && ...)
        Expression condition = null;
        if (loopStmt instanceof WhileStmt)
            condition = ((WhileStmt) loopStmt).getCondition();
        else if (loopStmt instanceof ForStmt)
            condition = ((ForStmt) loopStmt).getCompare().orElse(null);

        if (condition == null) return pickHead(nodeVars);

        // Look for a NameExpr in the condition that is a known nodeVar
        final String[] found = {null};
        condition.findAll(NameExpr.class).forEach(n -> {
            if (found[0] == null && nodeVars.contains(n.getNameAsString()))
                found[0] = n.getNameAsString();
        });
        return found[0] != null ? found[0] : pickHead(nodeVars);
    }

    private String pickHead(Set<String> nodeVars) {
        if (nodeVars.isEmpty()) return null;
        // Prefer variable named "head", else first one
        for (String v : nodeVars) if (v.equals("head")) return "head";
        for (String v : nodeVars) if (v.equals("first")) return "first";
        for (String v : nodeVars) if (v.equals("start")) return "start";
        return nodeVars.iterator().next();
    }

    private String describeStmt(Statement stmt) {
        String text = stmt.toString().trim();
        if (text.length() > 60) text = text.substring(0, 57) + "...";
        // Escape for Java string literal
        return text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", "");
    }

    // ══════════════════════════════════════════════════════
    // AST builders
    // ══════════════════════════════════════════════════════

    /**
     * Build: _dsvpTraceLL(head, active, "desc")
     * or:    _dsvpTraceLL(head, null, "desc")
     */
    private Statement traceLLStmt(String headVar, String desc, String activeVar) {
        NodeList<Expression> args = new NodeList<>();
        args.add(new NameExpr(headVar));
        args.add(activeVar != null ? new NameExpr(activeVar) : new NullLiteralExpr());
        args.add(new StringLiteralExpr(desc != null ? desc : ""));

        MethodCallExpr call = new MethodCallExpr(null, HELPER, args);
        return new ExpressionStmt(call);
    }

    /**
     * Inject _dsvpTraceLL static helper into the Main class.
     *
     * Generated code (reflects on any Node class at runtime):
     *
     *   private static void _dsvpTraceLL(Object head, Object active, String desc) {
     *       // walk the chain via reflection, build JSON, emit to stderr
     *   }
     */
    private void injectHelper(CompilationUnit cu) {
        ClassOrInterfaceDeclaration mainClass = cu.findAll(ClassOrInterfaceDeclaration.class)
            .stream()
            .filter(c -> !c.isInterface())
            .filter(c -> c.getMethods().stream().anyMatch(m ->
                m.getNameAsString().equals("main") && m.isStatic()))
            .findFirst().orElse(null);

        if (mainClass == null) return;

        // Build the helper as a raw method declaration string, then parse it
        String helperCode =
            "private static int _dsvpNodeIdCtr = 1;\n" +
            "private static java.util.Map<Object,Integer> _dsvpNodeIds =\n" +
            "    new java.util.IdentityHashMap<>();\n" +
            "private static int _dsvpGetId(Object n) {\n" +
            "    if (!_dsvpNodeIds.containsKey(n)) _dsvpNodeIds.put(n, _dsvpNodeIdCtr++);\n" +
            "    return _dsvpNodeIds.get(n);\n" +
            "}\n" +
            "private static Object _dsvpGetField(Object obj, String... names) {\n" +
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
            "}\n" +
            "private static void _dsvpTraceLL(Object head, Object active, String desc) {\n" +
            "    if (head == null) return;\n" +
            "    StringBuilder sb = new StringBuilder(\"[\");\n" +
            "    Object cur = head;\n" +
            "    java.util.Set<Object> seen = java.util.Collections.newSetFromMap(\n" +
            "        new java.util.IdentityHashMap<>());\n" +
            "    boolean first = true, isHead = true;\n" +
            "    int limit = 256;\n" +
            "    while (cur != null && !seen.contains(cur) && limit-- > 0) {\n" +
            "        seen.add(cur);\n" +
            "        Object val  = _dsvpGetField(cur, \"data\",\"val\",\"value\",\"key\",\"item\");\n" +
            "        Object next = _dsvpGetField(cur, \"next\");\n" +
            "        int id   = _dsvpGetId(cur);\n" +
            "        int nxId = (next != null) ? _dsvpGetId(next) : -1;\n" +
            "        if (!first) sb.append(\",\");\n" +
            "        first = false;\n" +
            "        sb.append(\"{\\\"id\\\":\").append(id)\n" +
            "          .append(\",\\\"val\\\":\\\"\").append(_dsvpEsc(val==null?\"null\":String.valueOf(val))).append(\"\\\"\")\n" +
            "          .append(\",\\\"nextId\\\":\").append(nxId)\n" +
            "          .append(\",\\\"isHead\\\":\").append(isHead).append(\"}\");\n" +
            "        isHead = false;\n" +
            "        cur = next;\n" +
            "    }\n" +
            "    sb.append(\"]\");\n" +
            "    int activeId = (active != null) ? _dsvpGetId(active) : -1;\n" +
            "    System.err.println(\"DSVP_TRACE:{\\\"op\\\":\\\"ll_snap\\\",\\\"activeId\\\":\"+activeId+\n" +
            "        \",\\\"nodes\\\":\"+sb+\",\\\"desc\\\":\\\"\"+_dsvpEsc(desc)+\"\\\"}\");\n" +
            "    System.err.flush();\n" +
            "}";

        // Parse each member and add to mainClass
        try {
            com.github.javaparser.JavaParser jp = new com.github.javaparser.JavaParser();
            String wrappedCode = "class __Tmp__ { " + helperCode + " }";
            com.github.javaparser.ParseResult<CompilationUnit> result = jp.parse(wrappedCode);
            if (result.isSuccessful() && result.getResult().isPresent()) {
                result.getResult().get().findAll(ClassOrInterfaceDeclaration.class)
                    .stream()
                    .filter(c -> c.getNameAsString().equals("__Tmp__"))
                    .findFirst()
                    .ifPresent(tmp -> tmp.getMembers().forEach(m -> mainClass.addMember(m.clone())));
            }
        } catch (Exception e) {
            // If parsing fails, skip helper injection gracefully
            System.err.println("[DSVP] Warning: could not inject LL helper: " + e.getMessage());
        }
    }
}
