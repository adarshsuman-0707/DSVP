package dsvp;

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.*;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.*;

/**
 * LinkedListInstrumentVisitor
 * ────────────────────────────
 * Automatically instruments ANY user-defined singly / doubly / circular
 * linked list (zero user changes).
 *
 * PASS A — detect Node classes (self-referential "next"/"prev" field).
 *
 * PASS B — for every method, walk the statements with a SCOPE-AWARE set of
 *   visible Node-typed names (parameters, fields reachable from the method,
 *   and locals that are definitely assigned at that point) and inject a
 *   trace call AFTER every statement that changes the pointer graph:
 *
 *     Node n = new Node(30);      → CREATE_NODE   (floating node appears)
 *     Node t = head;              → SET_PTR       (t label appears)
 *     a.next = b / a.prev = b     → SET_NEXT / SET_PREV
 *     node.data = 5               → UPDATE_VALUE
 *     head = n / tail = x / t = t.next → SET_HEAD / SET_TAIL / SET_PTR
 *     loop body entry             → COMPARE ("while (cur != null)")
 *     if/else branch entry        → COMPARE ("cur.data == target")
 *
 *   Each trace passes EVERY visible Node variable, so the runtime helper can
 *   report true per-variable pointer positions, nodes that are not (yet / any
 *   more) linked into the list, and whether the list is a ring.
 *
 * TRACE (stderr, same channel as every other DSVP module):
 *   DSVP_TRACE:{"op":"ll_snap","kind":"SET_NEXT","line":12,"activeId":3,
 *     "headId":1,"tailId":3,"ring":false,"isDoubly":false,
 *     "ptrs":{"head":1,"temp":2,"newNode":-1},
 *     "nodes":[{"id":1,"val":"10","nextId":2,"isHead":true},
 *              {"id":4,"val":"30","nextId":-1,"isHead":false,"detached":true}],
 *     "desc":"head.next = newNode;"}
 *
 *   Ids are stable per object identity (never reused, never array-index based).
 */
public class LinkedListInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private static final Set<String> HEAD_NAMES = new LinkedHashSet<>(Arrays.asList("head", "first", "start", "front"));
    private static final Set<String> TAIL_NAMES = new LinkedHashSet<>(Arrays.asList("tail", "last", "rear"));

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
        detectNodeClasses(cu);
        if (nodeClassNames.isEmpty()) return; // no linked list found — skip

        injectHelper(cu);
        super.visit(cu, arg);
    }

    // ══════════════════════════════════════════════════════
    // PASS A — detect Node classes
    // ══════════════════════════════════════════════════════

    private static String baseTypeName(Type t) {
        if (t instanceof ClassOrInterfaceType) return ((ClassOrInterfaceType) t).getNameAsString();
        return t.asString();
    }

    private void detectNodeClasses(CompilationUnit cu) {
        cu.findAll(ClassOrInterfaceDeclaration.class).forEach(cls -> {
            if (cls.isInterface()) return;
            String className = cls.getNameAsString();

            boolean hasNext = false;
            String valFld = null;

            for (FieldDeclaration fd : cls.getFields()) {
                for (VariableDeclarator vd : fd.getVariables()) {
                    String fname = vd.getNameAsString();
                    String ftype = baseTypeName(fd.getElementType());

                    if (fname.equals("next") || fname.equals("prev")) {
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

    private boolean isNodeType(Type t) {
        return t instanceof ClassOrInterfaceType && nodeClassNames.contains(baseTypeName(t));
    }

    // ══════════════════════════════════════════════════════
    // PASS B — instrument method bodies
    // ══════════════════════════════════════════════════════

    @Override
    public void visit(MethodDeclaration m, Void arg) {
        super.visit(m, arg);
        if (m.getBody().isEmpty()) return;
        if (m.getNameAsString().startsWith("_dsvp")) return; // never trace the tracer
        BlockStmt body = m.getBody().get();

        // Names visible at method entry: Node-typed parameters + fields the
        // method can legally reference by bare name.
        Set<String> visible = new LinkedHashSet<>();
        m.getParameters().forEach(p -> {
            if (isNodeType(p.getType())) visible.add(p.getNameAsString());
        });
        Set<String> fieldNames = accessibleNodeFields(m);
        // A parameter/local of the same name shadows the field — same name, same set.
        visible.addAll(fieldNames);

        boolean hasNodeLocals = m.findAll(VariableDeclarator.class).stream()
            .anyMatch(vd -> isNodeType(vd.getType()));
        if (visible.isEmpty() && !hasNodeLocals) return;

        // Trace at method entry when a node-typed parameter is passed in — a
        // purely recursive traversal has no loop, so each re-entry becomes
        // one visible step.
        String entryParam = m.getParameters().stream()
            .filter(p -> isNodeType(p.getType()))
            .map(p -> p.getNameAsString())
            .findFirst().orElse(null);
        if (entryParam != null) {
            body.getStatements().add(0,
                traceLLStmt(visible, "VISIT_NODE",
                    "Visiting " + m.getNameAsString() + "(" + entryParam + ")",
                    entryParam, m.getBegin().map(p -> p.line).orElse(0)));
        }

        instrumentBlock(body, visible);
        appendVoidReturn(m, body);
    }

    /**
     * CallTraceInstrumentVisitor only reports a return for an explicit
     * `return` statement, so a void method that simply falls off its end never
     * pops its frame — the call stack then keeps every finished insert()/
     * delete() forever. Close the frame here, but only when the appended
     * statement is provably reachable (javac rejects unreachable code).
     */
    private void appendVoidReturn(MethodDeclaration m, BlockStmt body) {
        if (!m.getType().isVoidType()) return;
        NodeList<Statement> stmts = body.getStatements();
        if (stmts.isEmpty() || !endsNormally(stmts.get(stmts.size() - 1))) return;
        stmts.add(StaticJavaParser.parseStatement(
            "DSVPArray.traceReturn(\"" + m.getNameAsString() + "\", \"void\", \"{}\");"));
    }

    private boolean endsNormally(Statement s) {
        if (s instanceof ExpressionStmt) return true;
        if (s instanceof IfStmt) return ((IfStmt) s).getElseStmt().isEmpty();
        if (s instanceof ForEachStmt) return true;
        if (s instanceof ForStmt) {
            ForStmt f = (ForStmt) s;
            return f.getCompare().isPresent() && !isTrueLiteral(f.getCompare().get());
        }
        if (s instanceof WhileStmt) return !isTrueLiteral(((WhileStmt) s).getCondition());
        return false;
    }

    private boolean isTrueLiteral(Expression e) {
        return e instanceof BooleanLiteralExpr && ((BooleanLiteralExpr) e).getValue();
    }

    /** Node-typed fields of the enclosing (non-Node) class that this method may name directly. */
    private Set<String> accessibleNodeFields(MethodDeclaration m) {
        Set<String> out = new LinkedHashSet<>();
        Optional<ClassOrInterfaceDeclaration> cls = m.findAncestor(ClassOrInterfaceDeclaration.class);
        if (cls.isEmpty() || nodeClassNames.contains(cls.get().getNameAsString())) return out;
        for (FieldDeclaration fd : cls.get().getFields()) {
            if (!isNodeType(fd.getElementType())) continue;
            if (!m.isStatic() || fd.isStatic()) {
                fd.getVariables().forEach(v -> out.add(v.getNameAsString()));
            }
        }
        return out;
    }

    private void instrumentBlock(BlockStmt block, Set<String> visible) {
        NodeList<Statement> stmts = block.getStatements();
        NodeList<Statement> result = new NodeList<>();

        for (Statement stmt : stmts) {
            result.add(stmt);
            int line = stmt.getBegin().map(p -> p.line).orElse(0);

            // ── declarations: Node x = ...; ──
            if (stmt instanceof ExpressionStmt
                    && ((ExpressionStmt) stmt).getExpression() instanceof VariableDeclarationExpr) {
                VariableDeclarationExpr vde = (VariableDeclarationExpr) ((ExpressionStmt) stmt).getExpression();
                if (isNodeType(vde.getElementType())) {
                    VariableDeclarator withInit = null;
                    for (VariableDeclarator vd : vde.getVariables()) {
                        if (vd.getInitializer().isPresent()) {
                            visible.add(vd.getNameAsString());
                            if (withInit == null) withInit = vd;
                        } else {
                            visible.remove(vd.getNameAsString()); // shadows a field until assigned
                        }
                    }
                    if (withInit != null) {
                        Expression init = withInit.getInitializer().get();
                        boolean isNew = init instanceof ObjectCreationExpr;
                        String desc = isNew
                            ? "Create Node(" + argsText((ObjectCreationExpr) init) + ") -> " + withInit.getNameAsString()
                            : describeStmt(stmt);
                        result.add(traceLLStmt(visible, isNew ? "CREATE_NODE" : "SET_PTR",
                            desc, withInit.getNameAsString(), line));
                    }
                }
            }
            // ── assignments ──
            else if (stmt instanceof ExpressionStmt
                    && ((ExpressionStmt) stmt).getExpression() instanceof AssignExpr) {
                AssignExpr ae = (AssignExpr) ((ExpressionStmt) stmt).getExpression();
                Expression target = ae.getTarget();
                String desc = describeStmt(stmt);

                if (target instanceof FieldAccessExpr
                        && !(((FieldAccessExpr) target).getScope() instanceof ThisExpr)) {
                    String field = ((FieldAccessExpr) target).getNameAsString();
                    if (field.equals("next")) {
                        result.add(traceLLStmt(visible, "SET_NEXT", desc, ownerOf(target, ae.getValue(), visible), line));
                    } else if (field.equals("prev") || field.equals("previous")) {
                        result.add(traceLLStmt(visible, "SET_PREV", desc, ownerOf(target, ae.getValue(), visible), line));
                    } else if (isValueField(field)) {
                        result.add(traceLLStmt(visible, "UPDATE_VALUE", desc, rootName(((FieldAccessExpr) target).getScope(), visible), line));
                    }
                } else {
                    String name = null;
                    if (target instanceof NameExpr) {
                        name = ((NameExpr) target).getNameAsString();
                    } else if (target instanceof FieldAccessExpr) { // this.head = ...
                        name = ((FieldAccessExpr) target).getNameAsString();
                    }
                    if (name != null) {
                        boolean known = visible.contains(name);
                        // x = expr; directly in this block definitely-assigns a
                        // previously uninitialised Node local
                        if (!known && target instanceof NameExpr && declaredNodeLocal(block, name)) {
                            visible.add(name);
                            known = true;
                        }
                        if (known) {
                            String kind = HEAD_NAMES.contains(name) ? "SET_HEAD"
                                        : TAIL_NAMES.contains(name) ? "SET_TAIL" : "SET_PTR";
                            boolean isNew = ae.getValue() instanceof ObjectCreationExpr;
                            if (isNew) desc = "Create Node(" + argsText((ObjectCreationExpr) ae.getValue()) + ") -> " + name;
                            result.add(traceLLStmt(visible, isNew ? "CREATE_NODE" : kind, desc, name, line));
                        }
                    }
                }
            }

            recurseIntoNested(stmt, visible);
        }

        block.setStatements(result);
    }

    /** True if `name` is declared (without initializer) as a Node local somewhere in this block. */
    private boolean declaredNodeLocal(BlockStmt block, String name) {
        for (VariableDeclarator vd : block.findAll(VariableDeclarator.class)) {
            if (vd.getNameAsString().equals(name) && isNodeType(vd.getType())
                    && vd.getInitializer().isEmpty()) return true;
        }
        return false;
    }

    private void recurseIntoNested(Statement stmt, Set<String> visible) {
        if (stmt instanceof IfStmt) {
            IfStmt ifs = (IfStmt) stmt;
            String cond = conditionText(ifs.getCondition(), visible);
            wrapAndInstrument(ifs.getThenStmt(), visible, ifs::setThenStmt,
                cond == null ? null : "Condition true: " + cond, stmt);
            ifs.getElseStmt().ifPresent(e -> wrapAndInstrument(e, visible, ifs::setElseStmt,
                cond == null ? null : "Condition false: " + cond, stmt));

        } else if (stmt instanceof WhileStmt) {
            WhileStmt ws = (WhileStmt) stmt;
            wrapAndInstrument(ws.getBody(), visible, ws::setBody,
                loopDesc(ws.getCondition(), visible), stmt);

        } else if (stmt instanceof DoStmt) {
            DoStmt ds = (DoStmt) stmt;
            wrapAndInstrument(ds.getBody(), visible, ds::setBody,
                loopDesc(ds.getCondition(), visible), stmt);

        } else if (stmt instanceof ForStmt) {
            ForStmt fs = (ForStmt) stmt;
            Set<String> inner = new LinkedHashSet<>(visible);
            for (Expression init : fs.getInitialization()) {
                if (init instanceof VariableDeclarationExpr) {
                    VariableDeclarationExpr vde = (VariableDeclarationExpr) init;
                    if (isNodeType(vde.getElementType())) {
                        vde.getVariables().forEach(v -> {
                            if (v.getInitializer().isPresent()) inner.add(v.getNameAsString());
                        });
                    }
                }
            }
            wrapAndInstrument(fs.getBody(), inner, fs::setBody,
                loopDesc(fs.getCompare().orElse(null), inner), stmt);

        } else if (stmt instanceof ForEachStmt) {
            ForEachStmt fe = (ForEachStmt) stmt;
            Set<String> inner = new LinkedHashSet<>(visible);
            if (isNodeType(fe.getVariableDeclarator().getType())) inner.add(fe.getVariableDeclarator().getNameAsString());
            wrapAndInstrument(fe.getBody(), inner, fe::setBody, null, stmt);

        } else if (stmt instanceof TryStmt) {
            TryStmt ts = (TryStmt) stmt;
            instrumentBlock(ts.getTryBlock(), new LinkedHashSet<>(visible));
            ts.getCatchClauses().forEach(c -> instrumentBlock(c.getBody(), new LinkedHashSet<>(visible)));
            ts.getFinallyBlock().ifPresent(f -> instrumentBlock(f, new LinkedHashSet<>(visible)));

        } else if (stmt instanceof BlockStmt) {
            instrumentBlock((BlockStmt) stmt, new LinkedHashSet<>(visible));
        }
    }

    /**
     * Instrument a nested body with its own scope copy and, when `entryDesc`
     * is given, emit a COMPARE trace at the top so the condition that just
     * evaluated is visible as its own step.
     */
    private void wrapAndInstrument(Statement body, Set<String> visible,
                                   java.util.function.Consumer<Statement> setter,
                                   String entryDesc, Statement owner) {
        if (body instanceof EmptyStmt) return;
        BlockStmt block;
        if (body instanceof BlockStmt) {
            block = (BlockStmt) body;
        } else {
            block = new BlockStmt(new NodeList<>(body.clone()));
            setter.accept(block);
        }
        Set<String> scope = new LinkedHashSet<>(visible);
        instrumentBlock(block, scope);
        if (entryDesc != null && !visible.isEmpty()) {
            int line = owner.getBegin().map(p -> p.line).orElse(0);
            String active = firstNameIn(owner, visible);
            block.getStatements().add(0, traceLLStmt(visible, "COMPARE", entryDesc, active, line));
        }
    }

    // ══════════════════════════════════════════════════════
    // Pattern helpers
    // ══════════════════════════════════════════════════════

    /**
     * The node a pointer write ACTS ON: the variable on the left of `x.next = y`
     * (x), falling back to the assigned value when the owner isn't a plain
     * visible variable (e.g. `a.b.next = y`).
     */
    private String ownerOf(Expression target, Expression rhs, Set<String> visible) {
        String owner = rootName(((FieldAccessExpr) target).getScope(), visible);
        return owner != null ? owner : activeOf(rhs, visible);
    }

    private String activeOf(Expression rhs, Set<String> visible) {
        if (rhs instanceof NameExpr && visible.contains(((NameExpr) rhs).getNameAsString()))
            return ((NameExpr) rhs).getNameAsString();
        return null;
    }

    /** Leftmost variable name of an expression like a.b.c (a) when it is a visible Node var. */
    private String rootName(Expression e, Set<String> visible) {
        while (e instanceof FieldAccessExpr) e = ((FieldAccessExpr) e).getScope();
        if (e instanceof NameExpr && visible.contains(((NameExpr) e).getNameAsString()))
            return ((NameExpr) e).getNameAsString();
        return null;
    }

    private String firstNameIn(Statement owner, Set<String> visible) {
        Expression cond = null;
        if (owner instanceof WhileStmt) cond = ((WhileStmt) owner).getCondition();
        else if (owner instanceof DoStmt) cond = ((DoStmt) owner).getCondition();
        else if (owner instanceof IfStmt) cond = ((IfStmt) owner).getCondition();
        else if (owner instanceof ForStmt) cond = ((ForStmt) owner).getCompare().orElse(null);
        if (cond == null) return null;
        for (NameExpr n : cond.findAll(NameExpr.class)) {
            if (visible.contains(n.getNameAsString())) return n.getNameAsString();
        }
        return null;
    }

    /** Condition text, only if it mentions a visible Node variable (otherwise not list-relevant). */
    private String conditionText(Expression cond, Set<String> visible) {
        if (cond == null) return null;
        for (NameExpr n : cond.findAll(NameExpr.class)) {
            if (visible.contains(n.getNameAsString())) return cond.toString();
        }
        return null;
    }

    private String loopDesc(Expression cond, Set<String> visible) {
        String c = conditionText(cond, visible);
        return c == null ? null : "Loop check passed: " + c;
    }

    private String argsText(ObjectCreationExpr oce) {
        StringBuilder sb = new StringBuilder();
        for (Expression a : oce.getArguments()) {
            if (sb.length() > 0) sb.append(", ");
            sb.append(a.toString());
        }
        return sb.toString();
    }

    private String describeStmt(Statement stmt) {
        String text = stmt.toString().trim().replace("\r", "").replace("\n", " ");
        if (text.endsWith(";")) text = text.substring(0, text.length() - 1);
        if (text.length() > 90) text = text.substring(0, 87) + "...";
        return text;
    }

    /** Escape for embedding inside a Java string literal. */
    private String esc(String s) {
        StringBuilder b = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (c == '\\') b.append("\\\\");
            else if (c == '"') b.append("\\\"");
            else if (c == '\n') b.append("\\n");
            else if (c == '\r' || c == '\t') b.append(' ');
            else if (c < 32) { /* drop */ }
            else b.append(c);
        }
        return b.toString();
    }

    // ══════════════════════════════════════════════════════
    // AST builders
    // ══════════════════════════════════════════════════════

    /**
     * Build:
     *   _dsvpTraceLL(headExpr|null, tailExpr|null, headIsAuthoritative, active|null,
     *                "desc", "KIND", line, new String[]{names}, new Object[]{values});
     * Every name in `visible` is guaranteed in scope & definitely assigned here.
     */
    private Statement traceLLStmt(Set<String> visible, String kind, String rawDesc,
                                  String activeVar, int line) {
        String head = null, tail = null;
        for (String h : HEAD_NAMES) if (visible.contains(h)) { head = h; break; }
        for (String t : TAIL_NAMES) if (visible.contains(t)) { tail = t; break; }

        StringBuilder names = new StringBuilder();
        StringBuilder vals = new StringBuilder();
        for (String v : visible) {
            if (names.length() > 0) { names.append(", "); vals.append(", "); }
            names.append('"').append(v).append('"');
            vals.append(v);
        }

        String code = HELPER + "("
            + (head != null ? head : "null") + ", "
            + (tail != null ? tail : "null") + ", "
            + (head != null) + ", "
            + (activeVar != null ? activeVar : "null") + ", "
            + "\"" + esc(rawDesc) + "\", "
            + "\"" + kind + "\", "
            + line + ", "
            + "new String[]{" + names + "}, "
            + "new Object[]{" + vals + "});";
        return StaticJavaParser.parseStatement(code);
    }

    // ══════════════════════════════════════════════════════
    // Runtime helper injected into the Main class
    // ══════════════════════════════════════════════════════

    // Written as a text block with NO backslashes: quotes/backslashes/newlines
    // are produced through (char) constants so nothing needs double-escaping.
    private static final String HELPER_SRC = """
        private static int _dsvpNodeIdCtr = 1;
        private static java.util.Map<Object,Integer> _dsvpNodeIds = new java.util.IdentityHashMap<>();
        private static int _dsvpGetId(Object n) {
            if (!_dsvpNodeIds.containsKey(n)) _dsvpNodeIds.put(n, _dsvpNodeIdCtr++);
            return _dsvpNodeIds.get(n);
        }
        private static boolean _dsvpHasField(Object obj, String... names) {
            if (obj == null) return false;
            Class<?> c = obj.getClass();
            while (c != null && c != Object.class) {
                for (String name : names) {
                    try { c.getDeclaredField(name); return true; } catch (Exception ignored) {}
                }
                c = c.getSuperclass();
            }
            return false;
        }
        private static Object _dsvpGetField(Object obj, String... names) {
            if (obj == null) return null;
            Class<?> c = obj.getClass();
            while (c != null && c != Object.class) {
                for (String name : names) {
                    try {
                        java.lang.reflect.Field f = c.getDeclaredField(name);
                        f.setAccessible(true);
                        return f.get(obj);
                    } catch (Exception ignored) {}
                }
                c = c.getSuperclass();
            }
            return null;
        }
        private static String _dsvpEsc(String s) {
            StringBuilder b = new StringBuilder();
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                if (c == 34 || c == 92) { b.append((char) 92).append(c); }
                else if (c == 10) { b.append((char) 92).append('n'); }
                else if (c == 13 || c == 9) { b.append(' '); }
                else if (c < 32) { }
                else b.append(c);
            }
            return b.toString();
        }
        private static String _dsvpS(String s) {
            return "" + (char) 34 + _dsvpEsc(s == null ? "" : s) + (char) 34;
        }
        private static String _dsvpK(String k) {
            return "" + (char) 34 + k + (char) 34 + ":";
        }
        private static java.util.Set<Object> _dsvpIdSet() {
            return java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());
        }
        private static int _dsvpChainLen(Object start) {
            if (start == null) return 0;
            int n = 0;
            Object cur = start;
            java.util.Set<Object> seen = _dsvpIdSet();
            int limit = 256;
            while (cur != null && !seen.contains(cur) && limit-- > 0) {
                seen.add(cur);
                n++;
                cur = _dsvpGetField(cur, "next");
            }
            return n;
        }
        private static Object _dsvpStickyRoot = null;
        // A candidate is a legitimate root only if walking forward ends at null
        // (linear list) or returns to ITSELF (true cycle) — otherwise it is a
        // dangling leftover that still points into a live structure.
        private static boolean _dsvpIsValidRoot(Object start) {
            if (start == null) return false;
            Object cur = start;
            java.util.Set<Object> seen = _dsvpIdSet();
            int limit = 256;
            while (cur != null && limit-- > 0) {
                if (seen.contains(cur)) return cur == start;
                seen.add(cur);
                cur = _dsvpGetField(cur, "next");
            }
            return true;
        }
        // Legacy heuristic, used ONLY when the program exposes no head-like
        // variable (head/first/start/front): best-reaching ever-seen node.
        private static Object _dsvpPickRoot(Object head, Object active) {
            Object bestRoot = _dsvpIsValidRoot(head) ? head : null;
            int bestLen = (bestRoot != null) ? _dsvpChainLen(bestRoot) : -1;
            if (_dsvpStickyRoot != null && _dsvpIsValidRoot(_dsvpStickyRoot)) {
                int stickyLen = _dsvpChainLen(_dsvpStickyRoot);
                if (stickyLen >= bestLen) { bestLen = stickyLen; bestRoot = _dsvpStickyRoot; }
            }
            for (Object candidate : _dsvpNodeIds.keySet()) {
                if (!_dsvpIsValidRoot(candidate)) continue;
                int len = _dsvpChainLen(candidate);
                if (len > bestLen) { bestLen = len; bestRoot = candidate; }
            }
            if (bestRoot == null) bestRoot = _dsvpIsValidRoot(active) ? active : head;
            if (bestRoot != null) _dsvpStickyRoot = bestRoot;
            return bestRoot;
        }
        private static Object _dsvpPrev(Object n) {
            return _dsvpGetField(n, "prev", "previous", "back", "left", "prv");
        }
        private static void _dsvpNodeJson(StringBuilder sb, Object cur, boolean isDoubly, boolean isHead, boolean detached) {
            Object val = _dsvpGetField(cur, "data", "val", "value", "key", "item");
            Object next = _dsvpGetField(cur, "next");
            sb.append("{").append(_dsvpK("id")).append(_dsvpGetId(cur))
              .append(",").append(_dsvpK("val")).append(_dsvpS(val == null ? "null" : String.valueOf(val)))
              .append(",").append(_dsvpK("nextId")).append(next != null ? _dsvpGetId(next) : -1);
            if (isDoubly) {
                Object prev = _dsvpPrev(cur);
                sb.append(",").append(_dsvpK("prevId")).append(prev != null ? _dsvpGetId(prev) : -1);
            }
            sb.append(",").append(_dsvpK("isHead")).append(isHead);
            if (detached) sb.append(",").append(_dsvpK("detached")).append("true");
            sb.append("}");
        }
        private static void _dsvpTraceLL(Object head, Object tail, boolean auth, Object active,
                                         String desc, String kind, int line,
                                         String[] names, Object[] vals) {
            Object root = null;
            boolean rooted = false;
            if (auth) {
                root = head; rooted = true;                 // head variable is authoritative (may be null = empty list)
            } else if (tail != null && _dsvpGetField(tail, "next") != null) {
                root = _dsvpGetField(tail, "next"); rooted = true;   // tail-only circular list: head == tail.next
            }
            if (!rooted) {
                root = _dsvpPickRoot(head, active);
            }

            // ── main chain (stops at the first repeat, so a ring never loops) ──
            java.util.List<Object> chain = new java.util.ArrayList<>();
            java.util.Set<Object> inChain = _dsvpIdSet();
            Object cur = root;
            int limit = 256;
            while (cur != null && !inChain.contains(cur) && limit-- > 0) {
                inChain.add(cur);
                chain.add(cur);
                cur = _dsvpGetField(cur, "next");
            }
            boolean ring = !chain.isEmpty() && _dsvpGetField(chain.get(chain.size() - 1), "next") == root;

            // ── nodes that exist but are not part of the chain: referenced by a
            //    pointer variable, or still pointed at by next/prev of a live node ──
            java.util.List<Object> floating = new java.util.ArrayList<>();
            java.util.Set<Object> inFloat = _dsvpIdSet();
            java.util.ArrayDeque<Object> q = new java.util.ArrayDeque<>(chain);
            if (vals != null) {
                for (Object v : vals) {
                    if (v != null && !inChain.contains(v) && inFloat.add(v)) { floating.add(v); q.add(v); }
                }
            }
            while (!q.isEmpty() && floating.size() < 64) {
                Object n = q.poll();
                Object r1 = _dsvpGetField(n, "next");
                Object r2 = _dsvpPrev(n);
                if (r1 != null && !inChain.contains(r1) && inFloat.add(r1)) { floating.add(r1); q.add(r1); }
                if (r2 != null && !inChain.contains(r2) && inFloat.add(r2)) { floating.add(r2); q.add(r2); }
            }

            if (chain.isEmpty() && floating.isEmpty() && active == null && !auth) return;

            boolean isDoubly = false;
            for (Object n : chain) { if (_dsvpHasField(n, "prev", "previous", "back", "left", "prv")) { isDoubly = true; break; } }
            if (!isDoubly) for (Object n : floating) { if (_dsvpHasField(n, "prev", "previous", "back", "left", "prv")) { isDoubly = true; break; } }

            StringBuilder nodes = new StringBuilder("[");
            boolean first = true;
            for (int i = 0; i < chain.size(); i++) {
                if (!first) nodes.append(",");
                first = false;
                _dsvpNodeJson(nodes, chain.get(i), isDoubly, i == 0, false);
            }
            for (Object f : floating) {
                if (!first) nodes.append(",");
                first = false;
                _dsvpNodeJson(nodes, f, isDoubly, false, true);
            }
            nodes.append("]");

            StringBuilder ptrs = new StringBuilder("{");
            for (int i = 0; names != null && i < names.length; i++) {
                if (i > 0) ptrs.append(",");
                ptrs.append(_dsvpK(names[i])).append(vals[i] != null ? _dsvpGetId(vals[i]) : -1);
            }
            ptrs.append("}");

            int headId = (root != null && !chain.isEmpty()) ? _dsvpGetId(root) : -1;
            int tailId = chain.isEmpty() ? -1 : _dsvpGetId(chain.get(chain.size() - 1));
            int activeId = (active != null) ? _dsvpGetId(active) : -1;

            StringBuilder out = new StringBuilder("DSVP_TRACE:{");
            out.append(_dsvpK("op")).append(_dsvpS("ll_snap"))
               .append(",").append(_dsvpK("kind")).append(_dsvpS(kind))
               .append(",").append(_dsvpK("line")).append(line)
               .append(",").append(_dsvpK("activeId")).append(activeId)
               .append(",").append(_dsvpK("headId")).append(headId)
               .append(",").append(_dsvpK("tailId")).append(tailId)
               .append(",").append(_dsvpK("ring")).append(ring)
               .append(",").append(_dsvpK("isDoubly")).append(isDoubly)
               .append(",").append(_dsvpK("ptrs")).append(ptrs)
               .append(",").append(_dsvpK("nodes")).append(nodes)
               .append(",").append(_dsvpK("desc")).append(_dsvpS(desc))
               .append("}");
            System.err.println(out);
            System.err.flush();
        }
        """;

    private void injectHelper(CompilationUnit cu) {
        ClassOrInterfaceDeclaration mainClass = cu.findAll(ClassOrInterfaceDeclaration.class)
            .stream()
            .filter(c -> !c.isInterface())
            .filter(c -> c.getMethods().stream().anyMatch(m ->
                m.getNameAsString().equals("main") && m.isStatic()))
            .findFirst().orElse(null);

        if (mainClass == null) return;

        try {
            com.github.javaparser.JavaParser jp = new com.github.javaparser.JavaParser();
            String wrappedCode = "class __Tmp__ { " + HELPER_SRC + " }";
            com.github.javaparser.ParseResult<CompilationUnit> result = jp.parse(wrappedCode);
            if (result.isSuccessful() && result.getResult().isPresent()) {
                result.getResult().get().findAll(ClassOrInterfaceDeclaration.class)
                    .stream()
                    .filter(c -> c.getNameAsString().equals("__Tmp__"))
                    .findFirst()
                    .ifPresent(tmp -> tmp.getMembers().forEach(m -> mainClass.addMember(m.clone())));
            } else {
                System.err.println("[DSVP] Warning: LL helper failed to parse: " + result.getProblems());
            }
        } catch (Exception e) {
            System.err.println("[DSVP] Warning: could not inject LL helper: " + e.getMessage());
        }
    }
}
