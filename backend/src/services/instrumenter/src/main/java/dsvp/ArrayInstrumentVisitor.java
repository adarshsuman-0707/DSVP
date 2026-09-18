package dsvp;

import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.type.ArrayType;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.HashSet;
import java.util.Set;

/**
 * Rewrites 1-D primitive array declarations and usages into DSVPArray.
 *
 * SCOPE: all methods, not just main.
 *
 * PASS A — build two maps:
 *   rewriteMap : "methodName#varName" → typeSuffix
 *                populated for local vars AND safe parameters
 *   safeParams : "methodName#paramName" set
 *                parameters where NO sibling overload has the same
 *                primitive-array type at the same position
 *                (safe = rewriting won't cause duplicate-signature error)
 *
 * PASS B — rewrite:
 *   local vars  → DSVPArray (all methods)
 *   parameters  → DSVPArray (only safeParams)
 *   arr[i] read → arr.getXxx(i)  (only when active in scope)
 *   arr[i]=v    → arr.set(i,v)   (only when active in scope)
 *   arr.length  → arr.size()     (only when active in scope)
 *   for-each    → counted for    (only when active in scope)
 *   call-site   → pass rawXxx()  when callee param was NOT rewritten
 *                 pass DSVPArray  when callee param WAS rewritten
 */
public class ArrayInstrumentVisitor extends VoidVisitorAdapter<Void> {

    // "methodName#varName" → type suffix ("Int","Long","Double","Float","Char")
    private final java.util.Map<String, String> rewriteMap = new java.util.HashMap<>();

    // "methodName#paramName" — parameters actually rewritten to DSVPArray
    private final Set<String> safeParams = new HashSet<>();

    @Override
    public void visit(com.github.javaparser.ast.CompilationUnit cu, Void arg) {
        buildRewriteMap(cu);
        super.visit(cu, arg);
    }

    /* ══════════════════════════════════════════════════════════════
       PASS A
       ══════════════════════════════════════════════════════════════ */

    private void buildRewriteMap(com.github.javaparser.ast.Node root) {
        // 1. Local variable declarations (all methods)
        root.findAll(VariableDeclarator.class).forEach(vd -> {
            if (!isTrackable(vd.getType())) return;
            MethodDeclaration md = vd.findAncestor(MethodDeclaration.class).orElse(null);
            if (md == null) return;  // skip class-level fields
            String suffix = suffix(vd.getType());
            rewriteMap.put(md.getNameAsString() + "#" + vd.getNameAsString(), suffix);
        });

        // 2. Parameters — only safe ones (no overload collision at that position)
        java.util.Map<String, java.util.List<MethodDeclaration>> byName = new java.util.HashMap<>();
        root.findAll(MethodDeclaration.class).forEach(m ->
            byName.computeIfAbsent(m.getNameAsString(), k -> new java.util.ArrayList<>()).add(m));

        root.findAll(Parameter.class).forEach(p -> {
            if (!isTrackable(p.getType())) return;
            if (isMainStringArgs(p)) return;
            // Never rewrite String[] parameters — too risky (overload collision with generic T[])
            if (((ArrayType) p.getType()).getComponentType().asString().equals("String")) return;

            MethodDeclaration md = p.findAncestor(MethodDeclaration.class).orElse(null);
            if (md == null) return;

            int pos = md.getParameters().indexOf(p);
            boolean collision = byName.getOrDefault(md.getNameAsString(),
                    java.util.Collections.emptyList()).stream()
                .filter(m -> m != md)
                .anyMatch(m -> m.getParameters().size() == md.getParameters().size()
                    && isTrackable(m.getParameters().get(pos).getType()));

            if (!collision) {
                String key = md.getNameAsString() + "#" + p.getNameAsString();
                rewriteMap.put(key, suffix(p.getType()));
                safeParams.add(key);
            }
        });
    }

    /* ══════════════════════════════════════════════════════════════
       SCOPE HELPERS
       ══════════════════════════════════════════════════════════════ */

    /** Is varName backed by a DSVPArray at the call site of refNode? */
    private boolean isActive(String varName, com.github.javaparser.ast.Node refNode) {
        String m = methodOf(refNode);
        return rewriteMap.containsKey(m + "#" + varName);
    }

    private String suffixOf(String varName, com.github.javaparser.ast.Node refNode) {
        return rewriteMap.getOrDefault(methodOf(refNode) + "#" + varName, "Int");
    }

    private String methodOf(com.github.javaparser.ast.Node n) {
        return n.findAncestor(MethodDeclaration.class)
                .map(MethodDeclaration::getNameAsString).orElse("");
    }

    private boolean isMainStringArgs(Parameter p) {
        return p.findAncestor(MethodDeclaration.class)
                .map(m -> m.getNameAsString().equals("main") && m.isStatic())
                .orElse(false);
    }

    private String suffix(Type t) {
        String e = ((ArrayType) t).getComponentType().asString();
        switch (e) {
            case "long":   return "Long";
            case "double": return "Double";
            case "float":  return "Float";
            case "char":   return "Char";
            case "String": return "String";
            default:       return "Int";
        }
    }

    private String normalizeElem(String e) {
        switch (e) {
            case "long":   return "long";
            case "double": return "double";
            case "float":  return "float";
            case "char":   return "char";
            case "String": return "String";
            default:       return "int";
        }
    }

    private boolean isTrackable(Type t) {
        if (!(t instanceof ArrayType)) return false;
        ArrayType at = (ArrayType) t;
        if (at.getComponentType() instanceof ArrayType) return false;
        if (at.getComponentType() instanceof com.github.javaparser.ast.type.TypeParameter) return false;
        String e = at.getComponentType().asString();
        return e.equals("int") || e.equals("long") || e.equals("double")
            || e.equals("float") || e.equals("char") || e.equals("String");
    }

    /* ══════════════════════════════════════════════════════════════
       PASS B — rewriting
       ══════════════════════════════════════════════════════════════ */

    // 1) Local var declarations: int[] arr = ... → DSVPArray arr = new DSVPArray(...)
    @Override
    public void visit(VariableDeclarator vd, Void arg) {
        super.visit(vd, arg);
        if (!isTrackable(vd.getType())) return;
        MethodDeclaration md = vd.findAncestor(MethodDeclaration.class).orElse(null);
        if (md == null) return;
        if (!rewriteMap.containsKey(md.getNameAsString() + "#" + vd.getNameAsString())) return;

        String elem = ((ArrayType) vd.getType()).getComponentType().asString();
        vd.setType(dsvpType());

        // Every DSVPArray instance is tagged with its own source variable
        // name, so two separately-declared arrays (arr1, arr2, ...) each
        // get their own identity in every trace event instead of
        // collapsing into one "last touched" array in the visualizer.
        String varName = vd.getNameAsString();

        vd.getInitializer().ifPresent(init -> {
            if (init instanceof ArrayInitializerExpr) {
                ArrayCreationExpr inner = new ArrayCreationExpr();
                inner.setElementType(primType(elem));
                inner.setInitializer((ArrayInitializerExpr) init);
                vd.setInitializer(wrap(inner, varName));
            } else if (init instanceof ArrayCreationExpr) {
                ArrayCreationExpr ace = (ArrayCreationExpr) init;
                if (ace.getInitializer().isPresent()) {
                    vd.setInitializer(wrap(ace, varName));
                } else if (!ace.getLevels().isEmpty()
                        && ace.getLevels().get(0).getDimension().isPresent()) {
                    Expression size = ace.getLevels().get(0).getDimension().get();
                    vd.setInitializer(new ObjectCreationExpr(null, dsvpType(),
                        new NodeList<>(size, new StringLiteralExpr(normalizeElem(elem)), new StringLiteralExpr(varName))));
                } else {
                    vd.setInitializer(wrap(init, varName));
                }
            }
        });
    }

    // 2) Parameters: rewrite only safe ones
    @Override
    public void visit(Parameter p, Void arg) {
        super.visit(p, arg);
        if (!isTrackable(p.getType()) || isMainStringArgs(p)) return;
        MethodDeclaration md = p.findAncestor(MethodDeclaration.class).orElse(null);
        if (md == null) return;
        if (safeParams.contains(md.getNameAsString() + "#" + p.getNameAsString())) {
            p.setType(dsvpType());
        }
    }

    // 2.5) Return types: int[] method() → DSVPArray method() (only if safe)
    @Override
    public void visit(MethodDeclaration m, Void arg) {
        super.visit(m, arg);
        // Only rewrite return type if ALL parameters of this method were safe to rewrite
        // (i.e., it's a "fully instrumented" helper)
        if (!isTrackable(m.getType())) return;
        // Check if this method has any array param that got rewritten
        boolean anyParamRewritten = m.getParameters().stream()
            .anyMatch(p -> safeParams.contains(m.getNameAsString() + "#" + p.getNameAsString()));
        if (anyParamRewritten) {
            m.setType(dsvpType());
        }
    }

    // 3) Fields — not handled

    // 4) .length → .size() — when active in scope
    @Override
    public void visit(FieldAccessExpr n, Void arg) {
        super.visit(n, arg);
        if (!n.getNameAsString().equals("length")) return;
        if (!(n.getScope() instanceof NameExpr)) return;
        String varName = ((NameExpr) n.getScope()).getNameAsString();
        if (!isActive(varName, n)) return;
        n.replace(new MethodCallExpr(n.getScope().clone(), "size"));
    }

    // 5) Writes: arr[i] = expr → arr.set(i, expr) — when active in scope
    // Also handles compound assignment (+=, -=, *=, /=, %=): once arr
    // becomes DSVPArray, `arr[i] += v` no longer compiles at all (you
    // can't apply an operator to a method-backed wrapper), so every
    // compound op on a tracked element must be rewritten too — to
    // arr.addXxx(i, v) etc. (see RuntimeShim), which evaluates the index
    // exactly once (as a normal method argument) regardless of whether it
    // has side effects, and returns the new value like Java's own
    // compound-assignment expressions do.
    private static final java.util.Map<AssignExpr.Operator, String> COMPOUND_OPS = java.util.Map.of(
        AssignExpr.Operator.PLUS,      "add",
        AssignExpr.Operator.MINUS,     "sub",
        AssignExpr.Operator.MULTIPLY,  "mul",
        AssignExpr.Operator.DIVIDE,    "div",
        AssignExpr.Operator.REMAINDER, "mod"
    );

    @Override
    public void visit(AssignExpr n, Void arg) {
        if (n.getTarget() instanceof ArrayAccessExpr) {
            ArrayAccessExpr target = (ArrayAccessExpr) n.getTarget();
            if (target.getName() instanceof NameExpr) {
                String varName = ((NameExpr) target.getName()).getNameAsString();
                if (isActive(varName, n)) {
                    if (n.getOperator() == AssignExpr.Operator.ASSIGN) {
                        target.getIndex().accept(this, arg);
                        n.getValue().accept(this, arg);
                        n.replace(new MethodCallExpr(target.getName().clone(), "set",
                            new NodeList<>(target.getIndex().clone(), n.getValue().clone())));
                        return;
                    }
                    String opPrefix = COMPOUND_OPS.get(n.getOperator());
                    String suffix = suffixOf(varName, n);
                    boolean isPlusOnString = n.getOperator() == AssignExpr.Operator.PLUS && suffix.equals("String");
                    if (opPrefix != null || isPlusOnString) {
                        String methodName = isPlusOnString ? "addString" : opPrefix + suffix;
                        target.getIndex().accept(this, arg);
                        n.getValue().accept(this, arg);
                        n.replace(new MethodCallExpr(target.getName().clone(), methodName,
                            new NodeList<>(target.getIndex().clone(), n.getValue().clone())));
                        return;
                    }
                }
            }
        }
        super.visit(n, arg);
    }

    // 6) Reads: arr[i] → arr.getXxx(i) — when active in scope
    @Override
    public void visit(ArrayAccessExpr n, Void arg) {
        super.visit(n, arg);
        if (!(n.getName() instanceof NameExpr)) return;
        String varName = ((NameExpr) n.getName()).getNameAsString();
        if (!isActive(varName, n)) return;
        String s = suffixOf(varName, n);
        n.replace(new MethodCallExpr(n.getName().clone(), "get" + s,
            new NodeList<>(n.getIndex().clone())));
    }

    // 7) for-each → counted for with typed getter — when active in scope
    @Override
    public void visit(com.github.javaparser.ast.stmt.ForEachStmt n, Void arg) {
        if (!(n.getIterable() instanceof NameExpr)) { super.visit(n, arg); return; }
        String arrName = ((NameExpr) n.getIterable()).getNameAsString();
        if (!isActive(arrName, n)) { super.visit(n, arg); return; }

        String loopVar  = n.getVariable().getVariable(0).getNameAsString();
        Type   loopType = n.getVariable().getVariable(0).getType();
        String idxVar   = "_i_" + arrName;
        String s        = suffixOf(arrName, n);

        com.github.javaparser.ast.stmt.ForStmt forStmt =
            new com.github.javaparser.ast.stmt.ForStmt();
        forStmt.setInitialization(new NodeList<>(
            new com.github.javaparser.ast.expr.VariableDeclarationExpr(
                new VariableDeclarator(com.github.javaparser.ast.type.PrimitiveType.intType(),
                    idxVar, new IntegerLiteralExpr("0")))));
        forStmt.setCompare(new BinaryExpr(new NameExpr(idxVar),
            new MethodCallExpr(new NameExpr(arrName), "size"), BinaryExpr.Operator.LESS));
        forStmt.setUpdate(new NodeList<>(new UnaryExpr(
            new NameExpr(idxVar), UnaryExpr.Operator.POSTFIX_INCREMENT)));

        com.github.javaparser.ast.stmt.BlockStmt body =
            new com.github.javaparser.ast.stmt.BlockStmt();
        body.addStatement(new com.github.javaparser.ast.expr.VariableDeclarationExpr(
            new VariableDeclarator(loopType.clone(), loopVar,
                new MethodCallExpr(new NameExpr(arrName), "get" + s,
                    new NodeList<>(new NameExpr(idxVar))))));
        if (n.getBody() instanceof com.github.javaparser.ast.stmt.BlockStmt) {
            ((com.github.javaparser.ast.stmt.BlockStmt) n.getBody())
                .getStatements().forEach(body::addStatement);
        } else {
            body.addStatement(n.getBody().clone());
        }
        forStmt.setBody(body);
        n.replace(forStmt);
        forStmt.accept(this, arg);
    }

    // 8) Call-site fixup: if callee's param was rewritten → pass DSVPArray as-is
    //    if callee's param was NOT rewritten → pass rawXxx()
    @Override
    public void visit(MethodCallExpr n, Void arg) {
        super.visit(n, arg);

        for (int i = 0; i < n.getArguments().size(); i++) {
            Expression a = n.getArguments().get(i);
            if (!(a instanceof NameExpr)) continue;
            String varName = ((NameExpr) a).getNameAsString();
            if (!isActive(varName, n)) continue;

            // Find callee method declaration with matching array param at this position
            boolean calleeParamRewritten = isCalleeParamRewritten(n, i);

            if (!calleeParamRewritten) {
                // Callee still expects raw array → unwrap to int[]/long[]/etc.
                String s = suffixOf(varName, n);
                n.getArguments().set(i,
                    new MethodCallExpr(new NameExpr(varName), "raw" + s));
            }
            // else: callee expects DSVPArray → pass as-is
        }
    }

    /**
     * Returns true if the callee method at the given argument position has
     * its parameter in safeParams (i.e., was rewritten to DSVPArray).
     */
    private boolean isCalleeParamRewritten(MethodCallExpr call, int pos) {
        com.github.javaparser.ast.CompilationUnit cu =
            call.findAncestor(com.github.javaparser.ast.CompilationUnit.class).orElse(null);
        if (cu == null) return false;

        for (MethodDeclaration md : cu.findAll(MethodDeclaration.class)) {
            if (!md.getNameAsString().equals(call.getNameAsString())) continue;
            if (md.getParameters().size() <= pos) continue;
            Parameter p = md.getParameters().get(pos);
            String key = md.getNameAsString() + "#" + p.getNameAsString();
            if (safeParams.contains(key)) return true;
        }
        return false;
    }

    /* ══════════════════════════════════════════════════════════════
       AST helpers
       ══════════════════════════════════════════════════════════════ */

    private Type primType(String e) {
        switch (e) {
            case "long":   return com.github.javaparser.ast.type.PrimitiveType.longType();
            case "double": return com.github.javaparser.ast.type.PrimitiveType.doubleType();
            case "float":  return com.github.javaparser.ast.type.PrimitiveType.floatType();
            case "char":   return com.github.javaparser.ast.type.PrimitiveType.charType();
            case "String": return new ClassOrInterfaceType(null, "String");
            default:       return com.github.javaparser.ast.type.PrimitiveType.intType();
        }
    }

    private ClassOrInterfaceType dsvpType() {
        return new ClassOrInterfaceType(null, "DSVPArray");
    }

    private ObjectCreationExpr wrap(Expression a, String varName) {
        return new ObjectCreationExpr(null, dsvpType(), new NodeList<>(a, new StringLiteralExpr(varName)));
    }
}
