package dsvp;

import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.stmt.ExpressionStmt;
import com.github.javaparser.ast.type.ArrayType;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.HashSet;
import java.util.Set;

/**
 * Rewrites 1-D primitive/boxed-int arrays (int[], and by extension any
 * single-dimension numeric array) into DSVPArray usage, operating on the
 * real AST rather than text.
 *
 * Because JavaParser gives us actual ArrayAccessExpr / BinaryExpr /
 * AssignExpr / FieldAccessExpr nodes, this correctly handles:
 *   - arrays declared inline, split across statements, or as fields
 *   - arrays passed as method parameters
 *   - nested/indirect indexing like arr[arr[i]]
 *   - comparisons in any position (if/while/ternary/&&/||)
 *   - compound assignment is intentionally left alone for arrays (rare in
 *     teaching code); a plain assignment `arr[i] = expr` is what gets traced
 *
 * Two-pass design:
 *   Pass A (collectTrackedNames) walks the tree once to find every
 *   variable/field/parameter declared with a 1-D array type.
 *   Pass B (the visitor overrides below) rewrites every reference to those
 *   names.
 *
 * Multi-dimensional arrays and arrays of non-numeric types are left
 * untouched (return as-is) — visualizing those isn't in scope for the
 * array module, and leaving them alone means user code using them still
 * compiles normally.
 */
public class ArrayInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private final Set<String> tracked = new HashSet<>();

    @Override
    public void visit(com.github.javaparser.ast.CompilationUnit cu, Void arg) {
        collectTrackedNames(cu);
        super.visit(cu, arg);
    }

    /* ── Pass A: discovery ─────────────────────────────────────────── */

    private void collectTrackedNames(com.github.javaparser.ast.Node root) {
        root.findAll(VariableDeclarator.class).forEach(vd -> {
            if (isTrackable1DArrayType(vd.getType())) tracked.add(vd.getNameAsString());
        });
        root.findAll(Parameter.class).forEach(p -> {
            if (isTrackable1DArrayType(p.getType())) tracked.add(p.getNameAsString());
        });
    }

    private boolean isTrackable1DArrayType(Type t) {
        if (!(t instanceof ArrayType)) return false;
        ArrayType at = (ArrayType) t;
        // Reject multi-dimensional (component itself is still an array).
        if (at.getComponentType() instanceof ArrayType) return false;
        String elem = at.getComponentType().asString();
        return elem.equals("int") || elem.equals("Integer")
            || elem.equals("long") || elem.equals("Long")
            || elem.equals("double") || elem.equals("Double")
            || elem.equals("float") || elem.equals("Float");
    }

    /* ── Pass B: rewriting ─────────────────────────────────────────── */

    // 1) Declarations:  int[] arr = {1,2,3};  /  int[] arr = new int[5];  /  int[] arr;
    @Override
    public void visit(VariableDeclarator vd, Void arg) {
        super.visit(vd, arg);
        if (!isTrackable1DArrayType(vd.getType())) return;
        String name = vd.getNameAsString();
        if (!tracked.contains(name)) return;

        vd.setType(dsvpArrayType());

        vd.getInitializer().ifPresent(init -> {
            if (init instanceof ArrayInitializerExpr) {
                // {1,2,3}  →  new DSVPArray(new int[]{1,2,3})
                ArrayCreationExpr innerArr = new ArrayCreationExpr(
                    com.github.javaparser.ast.type.PrimitiveType.intType(),
                    new NodeList<>(),
                    (ArrayInitializerExpr) init
                );
                vd.setInitializer(newDsvpArray(innerArr));
            } else if (init instanceof ArrayCreationExpr) {
                // new int[5]  →  new DSVPArray(5)
                ArrayCreationExpr ace = (ArrayCreationExpr) init;
                if (ace.getInitializer().isPresent()) {
                    vd.setInitializer(newDsvpArray(ace));
                } else if (!ace.getLevels().isEmpty() && ace.getLevels().get(0).getDimension().isPresent()) {
                    vd.setInitializer(newDsvpArray(ace.getLevels().get(0).getDimension().get()));
                } else {
                    vd.setInitializer(newDsvpArray(init));
                }
            }
            // else: e.g. `int[] arr = someMethodReturningIntArray();` — leave
            // the call as-is; DSVPArray has no matching constructor, so this
            // intentionally surfaces a clear javac error rather than silently
            // mis-instrumenting a value we can't reason about statically.
        });
    }

    // 2) Parameters:  void sort(int[] arr)  →  void sort(DSVPArray arr)
    @Override
    public void visit(Parameter p, Void arg) {
        super.visit(p, arg);
        if (isTrackable1DArrayType(p.getType()) && tracked.contains(p.getNameAsString())) {
            p.setType(dsvpArrayType());
        }
    }

    // 3) Fields:  static int[] arr;  →  static DSVPArray arr;
    @Override
    public void visit(FieldDeclaration fd, Void arg) {
        super.visit(fd, arg);
        fd.getVariables().forEach(vd -> {
            if (tracked.contains(vd.getNameAsString()) && vd.getType() instanceof ClassOrInterfaceType
                    && vd.getType().asString().equals("DSVPArray")) {
                // already handled by the VariableDeclarator visit above
            }
        });
    }

    // 4) .length  →  .size()   (only for tracked names, and only the plain
    //    `name.length` field-access form — arr[i].length on a 2-D array of
    //    a *non-tracked* outer name is left untouched since outer wasn't
    //    tracked in that case).
    @Override
    public void visit(FieldAccessExpr n, Void arg) {
        super.visit(n, arg);
        if (n.getNameAsString().equals("length")
                && n.getScope() instanceof NameExpr
                && tracked.contains(((NameExpr) n.getScope()).getNameAsString())) {
            MethodCallExpr call = new MethodCallExpr(n.getScope().clone(), "size");
            n.replace(call);
        }
    }

    // 5) Comparisons:  arr[i] > arr[j]  →  arr.gt(i, j)   (any binary op)
    //    Runs BEFORE array-access rewriting below (VoidVisitorAdapter visits
    //    children first via super.visit, so ArrayAccessExpr rewriting for
    //    the *operands* happens first — we detect the raw pattern here on
    //    the way back up, before the generic ArrayAccessExpr visit fires on
    //    this same pair, by checking node identity below).
    @Override
    public void visit(BinaryExpr n, Void arg) {
        // Only treat as a "tracked compare" if both sides are still raw
        // ArrayAccessExpr on the SAME tracked array — do this check BEFORE
        // recursing, so children aren't rewritten out from under us first.
        Expression left = n.getLeft();
        Expression right = n.getRight();

        if (left instanceof ArrayAccessExpr && right instanceof ArrayAccessExpr) {
            ArrayAccessExpr la = (ArrayAccessExpr) left;
            ArrayAccessExpr ra = (ArrayAccessExpr) right;
            String opMethod = compareMethodFor(n.getOperator());
            if (opMethod != null
                    && la.getName() instanceof NameExpr
                    && ra.getName() instanceof NameExpr
                    && ((NameExpr) la.getName()).getNameAsString().equals(((NameExpr) ra.getName()).getNameAsString())
                    && tracked.contains(((NameExpr) la.getName()).getNameAsString())) {

                // Recurse into the index expressions only (they may themselves
                // contain tracked-array reads, e.g. arr[i] > arr[perm[j]]).
                la.getIndex().accept(this, arg);
                ra.getIndex().accept(this, arg);

                MethodCallExpr call = new MethodCallExpr(
                    la.getName().clone(), opMethod,
                    new NodeList<>(la.getIndex().clone(), ra.getIndex().clone())
                );
                n.replace(call);
                return;
            }
        }
        super.visit(n, arg);
    }

    private String compareMethodFor(BinaryExpr.Operator op) {
        switch (op) {
            case GREATER: return "gt";
            case LESS: return "lt";
            case GREATER_EQUALS: return "gte";
            case LESS_EQUALS: return "lte";
            case EQUALS: return "eq";
            case NOT_EQUALS: return "neq";
            default: return null;
        }
    }

    // 6) Writes:  arr[i] = expr;   →  arr.set(i, expr);
    @Override
    public void visit(AssignExpr n, Void arg) {
        if (n.getTarget() instanceof ArrayAccessExpr && n.getOperator() == AssignExpr.Operator.ASSIGN) {
            ArrayAccessExpr target = (ArrayAccessExpr) n.getTarget();
            if (target.getName() instanceof NameExpr
                    && tracked.contains(((NameExpr) target.getName()).getNameAsString())) {

                target.getIndex().accept(this, arg);
                n.getValue().accept(this, arg);

                MethodCallExpr call = new MethodCallExpr(
                    target.getName().clone(), "set",
                    new NodeList<>(target.getIndex().clone(), n.getValue().clone())
                );
                n.replace(call);
                return;
            }
        }
        super.visit(n, arg);
    }

    // 7) Plain reads:  arr[i]   →  arr.get(i)   (anything not already
    //    consumed by the AssignExpr / BinaryExpr rewrites above — e.g.
    //    System.out.println(arr[i]), return arr[i], nested arr[arr[i]]).
    @Override
    public void visit(ArrayAccessExpr n, Void arg) {
        super.visit(n, arg); // rewrite nested index expressions first
        if (n.getName() instanceof NameExpr
                && tracked.contains(((NameExpr) n.getName()).getNameAsString())) {
            MethodCallExpr call = new MethodCallExpr(
                n.getName().clone(), "get", new NodeList<>(n.getIndex().clone())
            );
            n.replace(call);
        }
    }

    /* ── AST-building helpers ──────────────────────────────────────── */

    private ClassOrInterfaceType dsvpArrayType() {
        return new ClassOrInterfaceType(null, "DSVPArray");
    }

    private ObjectCreationExpr newDsvpArray(Expression ctorArg) {
        return new ObjectCreationExpr(null, dsvpArrayType(), new NodeList<>(ctorArg));
    }
}
