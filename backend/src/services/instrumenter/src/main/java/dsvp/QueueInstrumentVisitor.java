package dsvp;

import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

/**
 * Rewrites java.util.Queue&lt;T&gt; local variable declarations (and their
 * `new LinkedList&lt;&gt;()` / `new ArrayDeque&lt;&gt;()` initializers) into
 * DSVPQueue&lt;T&gt;, the traced runtime stand-in defined in RuntimeShim.
 * DSVPQueue exposes the same offer/poll/peek/add/remove/element/isEmpty/
 * size/toString surface as java.util.Queue — only the declared/constructed
 * type name changes, so call sites never need rewriting.
 *
 * Mirrors StackInstrumentVisitor's philosophy exactly:
 *  - Only the DECLARED type "Queue" is rewritten (never "LinkedList" or
 *    "ArrayDeque" used on their own without a Queue-typed variable), so a
 *    LinkedList used for its own list-y purposes elsewhere is untouched.
 *  - If the user defines their own class/interface literally named "Queue"
 *    (a hand-rolled queue with its own API), that resolves in their code
 *    instead of java.util.Queue, and we must never hijack it — the caller
 *    detects this (same pattern as userHasOwnStackClass) and passes it in.
 */
public class QueueInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private final boolean userDefinesQueue;
    private boolean rewrote = false;

    public QueueInstrumentVisitor(boolean userDefinesQueue) {
        this.userDefinesQueue = userDefinesQueue;
    }

    /** True once at least one java.util.Queue&lt;T&gt; was rewritten to DSVPQueue&lt;T&gt;. */
    public boolean didRewrite() {
        return rewrote;
    }

    @Override
    public void visit(com.github.javaparser.ast.CompilationUnit cu, Void arg) {
        if (userDefinesQueue) return; // skip the whole pass — leave user's Queue alone
        super.visit(cu, arg);
    }

    @Override
    public void visit(VariableDeclarator vd, Void arg) {
        super.visit(vd, arg);
        if (!isQueueType(vd.getType())) return;

        renameToDSVPQueue((ClassOrInterfaceType) vd.getType());

        vd.getInitializer().ifPresent(init -> {
            if (init instanceof ObjectCreationExpr) {
                ObjectCreationExpr oce = (ObjectCreationExpr) init;
                // The declared type is Queue<T>, but the initializer is
                // typically `new LinkedList<>()` or `new ArrayDeque<>()` —
                // whatever concrete backing class it is, swap it for
                // DSVPQueue so the runtime object actually traces.
                if (isQueueBackingType(oce.getType())) {
                    renameToDSVPQueue(oce.getType());
                }
            }
        });
    }

    private boolean isQueueType(Type t) {
        if (!(t instanceof ClassOrInterfaceType)) return false;
        return ((ClassOrInterfaceType) t).getNameAsString().equals("Queue");
    }

    private boolean isQueueBackingType(Type t) {
        if (!(t instanceof ClassOrInterfaceType)) return false;
        String n = ((ClassOrInterfaceType) t).getNameAsString();
        return n.equals("Queue") || n.equals("LinkedList") || n.equals("ArrayDeque");
    }

    private void renameToDSVPQueue(ClassOrInterfaceType t) {
        t.setScope(null);
        t.setName("DSVPQueue");
        rewrote = true;
    }
}
