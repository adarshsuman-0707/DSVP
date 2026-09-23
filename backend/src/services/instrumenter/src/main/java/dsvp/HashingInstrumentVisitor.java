package dsvp;

import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.ObjectCreationExpr;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.visitor.VoidVisitorAdapter;

/**
 * Rewrites java.util.HashMap&lt;K,V&gt; (and java.util.Hashtable&lt;K,V&gt;)
 * local variable declarations (and their `new HashMap&lt;&gt;()` /
 * `new Hashtable&lt;&gt;()` initializers) into DSVPHashMap&lt;K,V&gt;, the
 * traced runtime stand-in defined in RuntimeShim. DSVPHashMap exposes the
 * same put/get/remove/containsKey/size/isEmpty/keySet/toString surface as
 * java.util.HashMap (generic over K,V) — only the declared/constructed type
 * name changes, so call sites never need rewriting.
 *
 * IMPORTANT: if the user defines their OWN class/interface named "HashMap"
 * or "Hashtable" (vanishingly unlikely, but possible), that is what the name
 * resolves to in their code, NOT java.util.HashMap/Hashtable. We must never
 * rewrite references to a user-defined type, or we silently swap in a
 * runtime class with a different API and break their code.
 *
 * The caller MUST detect this and pass it in via the constructor — this
 * visitor cannot reliably detect it itself by re-scanning the tree, because
 * JavaInstrumenter's renameMainClassTo() may already have renamed a user
 * class literally named "HashMap"/"Hashtable" (if it also contains main())
 * to "Main" before this visitor ever runs. By that point no type is named
 * "HashMap"/"Hashtable" anymore even though the user very much has their
 * own class — only orphaned references to the old name remain, which must
 * NOT be treated as java.util.HashMap/Hashtable.
 */
public class HashingInstrumentVisitor extends VoidVisitorAdapter<Void> {

    private final boolean userDefinesHashMap;
    private boolean rewrote = false;

    public HashingInstrumentVisitor(boolean userDefinesHashMap) {
        this.userDefinesHashMap = userDefinesHashMap;
    }

    /** True once at least one java.util.HashMap/Hashtable was rewritten to DSVPHashMap. */
    public boolean didRewrite() {
        return rewrote;
    }

    @Override
    public void visit(com.github.javaparser.ast.CompilationUnit cu, Void arg) {
        if (userDefinesHashMap) return; // skip the whole pass — leave user's HashMap/Hashtable alone
        super.visit(cu, arg);
    }

    @Override
    public void visit(VariableDeclarator vd, Void arg) {
        super.visit(vd, arg);
        if (!isHashMapType(vd.getType())) return;

        renameToDSVPHashMap((ClassOrInterfaceType) vd.getType());

        vd.getInitializer().ifPresent(init -> {
            if (init instanceof ObjectCreationExpr) {
                ObjectCreationExpr oce = (ObjectCreationExpr) init;
                if (isHashMapType(oce.getType())) {
                    renameToDSVPHashMap(oce.getType());
                }
            }
        });
    }

    // Parameters: without this, passing a HashMap into ANY helper method
    // leaves the parameter typed as plain java.util.HashMap while the
    // caller's local variable was rewritten to DSVPHashMap, a straight type
    // mismatch that fails to compile before the program ever runs.
    @Override
    public void visit(Parameter p, Void arg) {
        super.visit(p, arg);
        if (isHashMapType(p.getType())) {
            renameToDSVPHashMap((ClassOrInterfaceType) p.getType());
        }
    }

    // Return types: a helper that BUILDS and returns a HashMap needs the
    // same rewrite.
    @Override
    public void visit(MethodDeclaration m, Void arg) {
        super.visit(m, arg);
        if (isHashMapType(m.getType())) {
            renameToDSVPHashMap((ClassOrInterfaceType) m.getType());
        }
    }

    private boolean isHashMapType(Type t) {
        if (!(t instanceof ClassOrInterfaceType)) return false;
        String name = ((ClassOrInterfaceType) t).getNameAsString();
        return name.equals("HashMap") || name.equals("Hashtable");
    }

    private void renameToDSVPHashMap(ClassOrInterfaceType t) {
        t.setScope(null);
        t.setName("DSVPHashMap");
        rewrote = true;
    }
}
