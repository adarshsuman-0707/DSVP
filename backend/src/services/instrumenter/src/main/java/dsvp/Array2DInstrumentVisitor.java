package dsvp;

import com.github.javaparser.ast.ArrayCreationLevel;
import com.github.javaparser.ast.NodeList;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.type.ArrayType;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.PrimitiveType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Rewrites 2-D array locals (int[][] / char[][]) into DSVPArray2DInt /
 * DSVPArray2DChar — the matrix-tracing runtime stand-ins defined in
 * RuntimeShim — so grid.get(r,c)/grid.set(r,c,v) emit DSVP_TRACE events
 * carrying a full grid snapshot, driving the 2D array visualizer.
 *
 * Mirrors ArrayInstrumentVisitor's approach but scoped to 2-D only (that
 * visitor explicitly rejects nested array types). Scope, matching the
 * existing StackFieldInstrumentVisitor/StackInstrumentVisitor philosophy:
 * local variables only, and only the operations students actually write
 * for matrix problems — declaration, `grid[i][j]` read/write/compound
 * assignment, `grid.length` (row count), and `grid[i].length` (column
 * count — matrix multiplication's classic dimension-check idiom).
 */
public class Array2DInstrumentVisitor extends VoidVisitorAdapter<Void> {

    // "methodName#varName" -> "Int" | "Char"
    private final Map<String, String> rewriteMap = new HashMap<>();
    private boolean rewrote = false;

    /** True once at least one int[][]/char[][] local was rewritten. */
    public boolean didRewrite() {
        return rewrote;
    }

    @Override
    public void visit(com.github.javaparser.ast.CompilationUnit cu, Void arg) {
        cu.findAll(VariableDeclarator.class).forEach(vd -> {
            String suffix = trackableSuffix(vd.getType());
            if (suffix == null) return;
            MethodDeclaration md = vd.findAncestor(MethodDeclaration.class).orElse(null);
            if (md == null) return; // skip fields — same scoping choice as ArrayInstrumentVisitor
            rewriteMap.put(md.getNameAsString() + "#" + vd.getNameAsString(), suffix);
        });
        if (!rewriteMap.isEmpty()) rewrote = true;
        super.visit(cu, arg);
    }

    private String trackableSuffix(Type t) {
        if (!(t instanceof ArrayType)) return null;
        ArrayType outer = (ArrayType) t;
        if (!(outer.getComponentType() instanceof ArrayType)) return null; // must be 2-D
        ArrayType inner = (ArrayType) outer.getComponentType();
        if (inner.getComponentType() instanceof ArrayType) return null; // reject 3-D+
        String e = inner.getComponentType().asString();
        if (e.equals("int")) return "Int";
        if (e.equals("char")) return "Char";
        return null;
    }

    private boolean isActive(String varName, com.github.javaparser.ast.Node refNode) {
        String m = methodOf(refNode);
        return rewriteMap.containsKey(m + "#" + varName);
    }

    private String suffixOf(String varName, com.github.javaparser.ast.Node refNode) {
        return rewriteMap.getOrDefault(methodOf(refNode) + "#" + varName, "Int");
    }

    private String methodOf(com.github.javaparser.ast.Node n) {
        return n.findAncestor(MethodDeclaration.class).map(MethodDeclaration::getNameAsString).orElse("");
    }

    // 1) Local var declarations
    @Override
    public void visit(VariableDeclarator vd, Void arg) {
        super.visit(vd, arg);
        String suffix = trackableSuffix(vd.getType());
        if (suffix == null) return;
        MethodDeclaration md = vd.findAncestor(MethodDeclaration.class).orElse(null);
        if (md == null) return;
        if (!rewriteMap.containsKey(md.getNameAsString() + "#" + vd.getNameAsString())) return;

        vd.setType(dsvpType(suffix));

        vd.getInitializer().ifPresent(init -> {
            if (init instanceof ArrayInitializerExpr) {
                // int[][] grid = {{1,2},{3,4}};
                vd.setInitializer(new ObjectCreationExpr(null, dsvpType(suffix),
                    new NodeList<>(rawLiteral(suffix, (ArrayInitializerExpr) init))));
            } else if (init instanceof ArrayCreationExpr) {
                ArrayCreationExpr ace = (ArrayCreationExpr) init;
                if (ace.getInitializer().isPresent()) {
                    // int[][] grid = new int[][]{{1,2},{3,4}};
                    vd.setInitializer(new ObjectCreationExpr(null, dsvpType(suffix),
                        new NodeList<>(rawLiteral(suffix, ace.getInitializer().get()))));
                } else if (ace.getLevels().size() >= 2
                        && ace.getLevels().get(0).getDimension().isPresent()
                        && ace.getLevels().get(1).getDimension().isPresent()) {
                    // int[][] grid = new int[rows][cols];
                    Expression rows = ace.getLevels().get(0).getDimension().get();
                    Expression cols = ace.getLevels().get(1).getDimension().get();
                    vd.setInitializer(new ObjectCreationExpr(null, dsvpType(suffix),
                        new NodeList<>(rows.clone(), cols.clone())));
                }
            }
        });
    }

    private Expression rawLiteral(String suffix, ArrayInitializerExpr init) {
        // `new int[]{...}` (ArrayCreationExpr defaults to ONE dimension
        // level) does NOT match a nested {{...},{...}} initializer — javac
        // rejects that combination outright ("illegal initializer for
        // int" / "int[] cannot be converted to int[][]"). A 2-D literal
        // needs TWO dimension levels: `new int[][]{...}`.
        Type elemType = suffix.equals("Char") ? PrimitiveType.charType() : PrimitiveType.intType();
        NodeList<ArrayCreationLevel> levels = new NodeList<>();
        levels.add(new ArrayCreationLevel());
        levels.add(new ArrayCreationLevel());
        return new ArrayCreationExpr(elemType, levels, init.clone());
    }

    // Compound-assignment support — same reasoning as ArrayInstrumentVisitor:
    // once grid becomes DSVPArray2DInt/Char, `grid[i][j] += v` no longer
    // compiles at all, so it must be rewritten to grid.addXxx(i, j, v).
    private static final Map<AssignExpr.Operator, String> COMPOUND_OPS = new HashMap<>();
    static {
        COMPOUND_OPS.put(AssignExpr.Operator.PLUS,      "add");
        COMPOUND_OPS.put(AssignExpr.Operator.MINUS,     "sub");
        COMPOUND_OPS.put(AssignExpr.Operator.MULTIPLY,  "mul");
        COMPOUND_OPS.put(AssignExpr.Operator.DIVIDE,    "div");
        COMPOUND_OPS.put(AssignExpr.Operator.REMAINDER, "mod");
    }

    // 2) Writes: grid[i][j] = v  ->  grid.set(i, j, v)
    @Override
    public void visit(AssignExpr n, Void arg) {
        if (n.getTarget() instanceof ArrayAccessExpr) {
            ArrayAccessExpr outer = (ArrayAccessExpr) n.getTarget();
            if (outer.getName() instanceof ArrayAccessExpr) {
                ArrayAccessExpr innerAccess = (ArrayAccessExpr) outer.getName();
                if (innerAccess.getName() instanceof NameExpr) {
                    String varName = ((NameExpr) innerAccess.getName()).getNameAsString();
                    if (isActive(varName, n)) {
                        String methodName = null;
                        if (n.getOperator() == AssignExpr.Operator.ASSIGN) {
                            methodName = "set";
                        } else {
                            String prefix = COMPOUND_OPS.get(n.getOperator());
                            if (prefix != null) methodName = prefix + suffixOf(varName, n);
                        }
                        if (methodName != null) {
                            innerAccess.getIndex().accept(this, arg);
                            outer.getIndex().accept(this, arg);
                            n.getValue().accept(this, arg);
                            n.replace(new MethodCallExpr(innerAccess.getName().clone(), methodName,
                                new NodeList<>(innerAccess.getIndex().clone(), outer.getIndex().clone(), n.getValue().clone())));
                            return;
                        }
                    }
                }
            }
        }
        super.visit(n, arg);
    }

    // 3) Reads: grid[i][j]  ->  grid.get(i, j)
    @Override
    public void visit(ArrayAccessExpr n, Void arg) {
        if (n.getName() instanceof ArrayAccessExpr) {
            ArrayAccessExpr innerAccess = (ArrayAccessExpr) n.getName();
            if (innerAccess.getName() instanceof NameExpr) {
                String varName = ((NameExpr) innerAccess.getName()).getNameAsString();
                if (isActive(varName, n)) {
                    super.visit(n, arg); // still visit children first (e.g. nested index exprs)
                    n.replace(new MethodCallExpr(innerAccess.getName().clone(), "get",
                        new NodeList<>(innerAccess.getIndex().clone(), n.getIndex().clone())));
                    return;
                }
            }
        }
        super.visit(n, arg);
    }

    // 4) grid.length -> grid.rows()      (row count)
    //    grid[i].length -> grid.cols()   (column count — assumes a
    //    rectangular grid, true for anything DSVPArray2D backs, since it's
    //    always constructed from a real int[][]/char[][])
    @Override
    public void visit(FieldAccessExpr n, Void arg) {
        if (!n.getNameAsString().equals("length")) {
            super.visit(n, arg);
            return;
        }

        if (n.getScope() instanceof NameExpr) {
            String varName = ((NameExpr) n.getScope()).getNameAsString();
            if (isActive(varName, n)) {
                n.replace(new MethodCallExpr(n.getScope().clone(), "rows"));
                return;
            }
        } else if (n.getScope() instanceof ArrayAccessExpr) {
            ArrayAccessExpr access = (ArrayAccessExpr) n.getScope();
            if (access.getName() instanceof NameExpr) {
                String varName = ((NameExpr) access.getName()).getNameAsString();
                if (isActive(varName, n)) {
                    // The row-index expression (access.getIndex()) is
                    // dropped since cols() doesn't need it — fine for the
                    // overwhelming majority of real code (a plain
                    // variable/literal index), at the cost of not
                    // evaluating an unusual side-effecting index like
                    // `grid[i++].length`, which is not a pattern anyone
                    // actually writes in practice.
                    n.replace(new MethodCallExpr(access.getName().clone(), "cols"));
                    return;
                }
            }
        }

        super.visit(n, arg);
    }

    private ClassOrInterfaceType dsvpType(String suffix) {
        return new ClassOrInterfaceType(null, "DSVPArray2D" + suffix);
    }
}
