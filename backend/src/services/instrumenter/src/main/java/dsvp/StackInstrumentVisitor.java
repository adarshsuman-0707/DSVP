package dsvp;

import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

/**
 * Rewrites java.util.Stack&lt;T&gt; local variable declarations (and their
 * `new Stack&lt;&gt;()` initializers) into DSVPStack&lt;T&gt;, the traced
 * runtime stand-in defined in RuntimeShim. DSVPStack exposes the exact same
 * push/pop/peek/isEmpty/size/toString surface as java.util.Stack (generic
 * over T, so `int x = stack.pop()` auto-unboxing still compiles) — only the
 * declared/constructed type name changes, so call sites never need rewriting.
 *
 * IMPORTANT: if the user defines their OWN class/interface named "Stack"
 * (e.g. a hand-rolled array/linked-list backed stack with its own API —
 * display(), custom constructors, etc.), that is what "Stack" resolves to
 * in their code, NOT java.util.Stack. We must never rewrite references to
 * a user-defined type, or we silently swap in a runtime class with a
 * different API and break their code.
 *
 * The caller MUST detect this and pass it in via the constructor — this
 * visitor cannot reliably detect it itself by re-scanning the tree,
 * because JavaInstrumenter's renameMainClassTo() may already have renamed
 * a user class literally named "Stack" (if it also contains main()) to
 * "Main" before this visitor ever runs. By that point no type is named
 * "Stack" anymore even though the user very much has their own Stack —
 * only orphaned references to the old name remain, which must NOT be
 * treated as java.util.Stack.
 */
public class StackInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private final boolean userDefinesStack;
    private boolean rewrote = false;

    public StackInstrumentVisitor(boolean userDefinesStack) {
        this.userDefinesStack = userDefinesStack;
    }

    /** True once at least one java.util.Stack&lt;T&gt; was rewritten to DSVPStack&lt;T&gt;. */
    public boolean didRewrite() {
        return rewrote;
    }

    @Override
    public void visit(com.github.javaparser.ast.CompilationUnit cu, Void arg) {
        if (userDefinesStack) return; // skip the whole pass — leave user's Stack alone
        super.visit(cu, arg);
    }

    @Override
    public void visit(VariableDeclarator vd, Void arg) {
        super.visit(vd, arg);
        if (!isStackType(vd.getType())) return;

        renameToDSVPStack((ClassOrInterfaceType) vd.getType());

        vd.getInitializer().ifPresent(init -> {
            if (init instanceof ObjectCreationExpr) {
                ObjectCreationExpr oce = (ObjectCreationExpr) init;
                if (isStackType(oce.getType())) {
                    renameToDSVPStack(oce.getType());
                }
            }
        });
    }

    private boolean isStackType(Type t) {
        if (!(t instanceof ClassOrInterfaceType)) return false;
        return ((ClassOrInterfaceType) t).getNameAsString().equals("Stack");
    }

    private void renameToDSVPStack(ClassOrInterfaceType t) {
        t.setScope(null);
        t.setName("DSVPStack");
        rewrote = true;
    }
}
