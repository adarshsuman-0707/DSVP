package dsvp;

import com.github.javaparser.ParseProblemException;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.TypeDeclaration;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * DSVP_TRACE Java Instrumenter
 * ─────────────────────────────
 * Usage:  java -jar dsvp-java-instrumenter.jar <path-to-UserCode.java>
 *
 * Reads the user's raw Java source, parses it into a REAL AST via
 * JavaParser (no regex, no string-matching), applies two transform
 * passes over the tree, and prints the fully instrumented source to
 * stdout. Node's compilerService.js pipes that output straight into
 * javac, exactly the way python_instrumenter.py's output is piped
 * into the Python interpreter.
 *
 * Passes:
 *   1. ArrayInstrumentVisitor — rewrites every int[]/double[]/etc
 *      local variable, field, and parameter into a DSVPArray, and
 *      rewrites every access/comparison/assignment/.length on that
 *      variable into the matching DSVPArray method call. This works
 *      no matter how the array is declared, indexed, or spread across
 *      lines/expressions, because it walks real ArrayAccessExpr /
 *      BinaryExpr / AssignExpr nodes instead of matching text.
 *   2. CallTraceInstrumentVisitor — inserts traceCall/traceLine/
 *      traceReturn statements into every user-defined method body by
 *      manipulating the AST's BlockStmt node lists directly, so
 *      injected statements always land in legal positions (unlike
 *      line-based text insertion, which can split multi-line
 *      expressions).
 *
 * On a parse error, this tool exits with a non-zero code and prints a
 * JSON error object to stderr; compilerService.js surfaces that as a
 * compile_error with the message untouched by javac's own diagnostics.
 */
public class JavaInstrumenter {

    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("{\"error\":\"usage: JavaInstrumenter <file.java>\"}");
            System.exit(2);
        }

        String source;
        try {
            source = Files.readString(Path.of(args[0]), StandardCharsets.UTF_8);
        } catch (Exception e) {
            System.err.println("{\"error\":\"cannot read input file: " + escape(e.getMessage()) + "\"}");
            System.exit(2);
            return;
        }

        CompilationUnit cu;
        try {
            cu = StaticJavaParser.parse(source);
        } catch (ParseProblemException e) {
            // Surface as a normal Java-style compile error so the existing
            // extractErrorLine() regex in executionController.js still works.
            System.err.println(toJavacStyleError(e));
            System.exit(1);
            return;
        }

        // If the user already wrote DSVPArray-aware code, don't touch it.
        boolean alreadyInstrumented = cu.toString().contains("DSVPArray");

        // MUST be captured before renameMainClassTo runs: if the user wrote
        // their entire program inside a single class literally named
        // "Stack" (containing both their stack logic AND main()),
        // renameMainClassTo below renames that class — and every
        // self-referential `new Stack(...)` call inside it — to "Main".
        // Checking for a user-defined "Stack" type AFTER that rename would
        // find nothing (the class is no longer named "Stack"), so
        // StackInstrumentVisitor would wrongly treat the now-orphaned
        // "Stack" type name as java.util.Stack and hijack it into
        // DSVPStack, while the constructor call had already become
        // `new Main(...)` — producing a mismatched, uncompilable result.
        boolean userHasOwnStackClass = cu.getTypes().stream()
            .anyMatch(t -> t.getNameAsString().equals("Stack"));

        // Same reasoning as userHasOwnStackClass above, for "Queue".
        boolean userHasOwnQueueClass = cu.getTypes().stream()
            .anyMatch(t -> t.getNameAsString().equals("Queue"));

        // Same reasoning as userHasOwnStackClass above, for "HashMap"/"Hashtable".
        boolean userHasOwnHashMapClass = cu.getTypes().stream()
            .anyMatch(t -> t.getNameAsString().equals("HashMap") || t.getNameAsString().equals("Hashtable"));

        // HashTable has no natural java.util type to hijack (unlike Stack/
        // Queue/HashMap above) — the user must explicitly write
        // `new HashTable<>(...)`. So instead of an AST-rewriting visitor, we
        // just detect whether the RAW source text mentions "HashTable" at
        // all (checked here, before any rewriting, mirroring the simplicity
        // of the alreadyInstrumented check above) and whether the user has
        // their own class/interface by that name (same guard pattern/timing
        // as userHasOwnStackClass — must be captured before renameMainClassTo
        // runs, for the same reasoning given there).
        boolean userHasOwnHashTableClass = cu.getTypes().stream()
            .anyMatch(t -> t.getNameAsString().equals("HashTable"));
        boolean needsHashTableShim = !userHasOwnHashTableClass && source.contains("HashTable");

        // Ensure there's exactly one public-ish entry class named Main so
        // `java -cp . Main` always works, regardless of what the user named
        // their class.
        renameMainClassTo(cu, "Main");
        demotoNonMainPublicTypes(cu, "Main");

        boolean needsStackShim = false;
        boolean needsQueueShim = false;
        boolean needsArray2DShim = false;
        boolean needsHashMapShim = false;

        if (!alreadyInstrumented) {
            // Hand-rolled array+top Stack classes — must run BEFORE
            // CallTraceInstrumentVisitor, which also rewrites `return`
            // statements (to make side-effecting return expressions
            // single-eval); if that ran first, the `return arr[idx];`
            // shape this pass looks for would already be gone.
            // Hand-rolled hash table classes — structural detection (no user
            // code changes required), the hash-table analogue of the
            // Stack/Queue-field and LinkedList passes. Must run BEFORE
            // StackFieldInstrumentVisitor/QueueFieldInstrumentVisitor so a
            // direct-address `int[] table` field is claimed here first and
            // never misread as a Stack/Queue backing array.
            HashTableFieldInstrumentVisitor hashFieldPass = new HashTableFieldInstrumentVisitor();
            hashFieldPass.visit(cu, null);

            StackFieldInstrumentVisitor stackFieldPass = new StackFieldInstrumentVisitor();
            stackFieldPass.visit(cu, null);

            // Hand-rolled array+front+rear Queue classes — same reasoning
            // and ordering requirement as stackFieldPass above (must run
            // before CallTraceInstrumentVisitor rewrites `return arr[idx];`
            // shapes out from under it).
            QueueFieldInstrumentVisitor queueFieldPass = new QueueFieldInstrumentVisitor();
            queueFieldPass.visit(cu, null);

            // Weighted adjacency-list graphs (List<List<EdgeClass>> +
            // PriorityQueue<int[]>, the standard Dijkstra shape) — must run
            // before ArrayInstrumentVisitor, which would otherwise wrap
            // `int[] current = pq.poll();` into a DSVPArray and hide the
            // `pq.poll()` MethodCallExpr shape this pass pattern-matches on.
            GraphInstrumentVisitor graphPass = new GraphInstrumentVisitor();
            graphPass.visit(cu, null);

            // int[][]/char[][] locals -> DSVPArray2DInt/Char. Also must run
            // before CallTraceInstrumentVisitor for the same reason as above
            // (a `return grid[i][j];` shape).
            Array2DInstrumentVisitor array2DPass = new Array2DInstrumentVisitor();
            array2DPass.visit(cu, null);
            needsArray2DShim = array2DPass.didRewrite();

            ArrayInstrumentVisitor arrayPass = new ArrayInstrumentVisitor();
            arrayPass.visit(cu, null);

            CallTraceInstrumentVisitor callPass = new CallTraceInstrumentVisitor();
            callPass.visit(cu, null);

            // LinkedList auto-instrumentation — detects user-defined Node classes
            // and injects trace calls after every .next assignment and in loop bodies
            LinkedListInstrumentVisitor llPass = new LinkedListInstrumentVisitor();
            llPass.visit(cu, null);

            // BST auto-instrumentation — detects user-defined tree-node classes
            // (left/right children) and injects trace calls after every
            // .left/.right assignment, new-node declaration, and in loop bodies.
            BSTInstrumentVisitor bstPass = new BSTInstrumentVisitor();
            bstPass.visit(cu, null);

            // Stack auto-instrumentation — rewrites java.util.Stack<T> locals
            // into DSVPStack<T> so push/pop/peek emit DSVP_TRACE events.
            // Skipped entirely (and DSVPStack never injected below) when the
            // user has their own class/interface named "Stack".
            StackInstrumentVisitor stackPass = new StackInstrumentVisitor(userHasOwnStackClass);
            stackPass.visit(cu, null);
            needsStackShim = stackPass.didRewrite();

            // Queue auto-instrumentation — rewrites java.util.Queue<T> locals
            // (LinkedList/ArrayDeque backed) into DSVPQueue<T> so
            // offer/poll/peek emit DSVP_TRACE events. Skipped entirely when
            // the user has their own class/interface named "Queue".
            QueueInstrumentVisitor queuePass = new QueueInstrumentVisitor(userHasOwnQueueClass);
            queuePass.visit(cu, null);
            needsQueueShim = queuePass.didRewrite();

            // HashMap auto-instrumentation — rewrites java.util.HashMap<K,V>
            // (and Hashtable<K,V>) locals into DSVPHashMap<K,V> so
            // put/get/remove emit DSVP_TRACE events. Skipped entirely when
            // the user has their own class/interface named "HashMap"/"Hashtable".
            HashingInstrumentVisitor hashingPass = new HashingInstrumentVisitor(userHasOwnHashMapClass);
            hashingPass.visit(cu, null);
            needsHashMapShim = hashingPass.didRewrite();
        }

        String printed = cu.toString();

        // Extract user imports from the instrumented code
        StringBuilder imports = new StringBuilder();
        StringBuilder rest = new StringBuilder();
        boolean inImports = false;
        
        for (String line : printed.split("\n")) {
            String trimmed = line.trim();
            if (trimmed.startsWith("import ")) {
                imports.append(line).append("\n");
                inImports = true;
            } else if (!trimmed.isEmpty() || inImports) {
                rest.append(line).append("\n");
                if (!trimmed.isEmpty()) inImports = false;
            }
        }

        // Print in correct order: user imports → runtime shims → user code
        System.out.print(imports.toString());
        System.out.println(RuntimeShim.SOURCE);
        if (needsStackShim) {
            System.out.println(RuntimeShim.STACK_SOURCE);
        }
        if (needsQueueShim) {
            System.out.println(RuntimeShim.QUEUE_SOURCE);
        }
        if (needsArray2DShim) {
            System.out.println(RuntimeShim.ARRAY2D_SOURCE);
        }
        if (needsHashMapShim) {
            System.out.println(RuntimeShim.HASHMAP_SOURCE);
        }
        if (needsHashTableShim) {
            System.out.println(RuntimeShim.HASHTABLE_SOURCE);
        }
        System.out.print(rest.toString());
    }

    /**
     * javac allows at most one public top-level type per file, and this
     * pipeline always writes the instrumented source to Main.java. A user's
     * own helper class (e.g. `public class Stack { ... }`) declared public
     * in the same file as Main would otherwise fail with
     * "class X is public, should be declared in a file named X.java" —
     * nothing to do with instrumentation, just single-file compilation
     * rules. Strip the public modifier from every other top-level type so
     * user code always compiles regardless of habit/copy-paste source.
     */
    private static void demotoNonMainPublicTypes(CompilationUnit cu, String mainName) {
        for (TypeDeclaration<?> type : cu.getTypes()) {
            if (type.getNameAsString().equals(mainName)) continue;
            type.setPublic(false);
        }
    }

    /** Finds the class containing `public static void main` and renames it (and its constructors) to Main. */
    private static void renameMainClassTo(CompilationUnit cu, String newName) {
        for (TypeDeclaration<?> type : cu.getTypes()) {
            if (!(type instanceof ClassOrInterfaceDeclaration)) continue;
            ClassOrInterfaceDeclaration cls = (ClassOrInterfaceDeclaration) type;
            boolean hasMain = cls.getMethods().stream().anyMatch(JavaInstrumenter::isMainMethod);
            if (hasMain && !cls.getNameAsString().equals(newName)) {
                String oldName = cls.getNameAsString();
                cls.setName(newName);
                cls.getConstructors().forEach(c -> c.setName(newName));
                // Fix any same-file self-references — not just `new OldName(...)`
                // (ObjectCreationExpr) but every other place the old type name
                // can appear: variable/field/parameter declarations, method
                // return types, generic type arguments, casts, instanceof, etc.
                // JavaParser represents all of those as ClassOrInterfaceType
                // nodes, so renaming that node type covers every case in one
                // pass. Fixing only ObjectCreationExpr (the old behavior) left
                // declarations like `OldName s = new OldName(5);` half-renamed
                // — `new OldName(5)` became `new Main(5)` while `OldName s`
                // stayed put, producing a mismatched, uncompilable result.
                cu.findAll(com.github.javaparser.ast.type.ClassOrInterfaceType.class).forEach(t -> {
                    if (t.getNameAsString().equals(oldName) && !t.getScope().isPresent()) {
                        t.setName(newName);
                    }
                });
                return;
            }
        }
    }

    private static boolean isMainMethod(MethodDeclaration m) {
        // Check if method is named "main", is static, returns void, and has String[] parameter
        if (!m.getNameAsString().equals("main") || !m.isStatic()) return false;
        if (!m.getType().asString().equals("void")) return false;
        if (m.getParameters().size() != 1) return false;
        
        // Check if parameter is String[] or String...
        String paramType = m.getParameters().get(0).getType().asString();
        return paramType.equals("String[]") || paramType.equals("String...");
    }

    private static String toJavacStyleError(ParseProblemException e) {
        StringBuilder sb = new StringBuilder();
        e.getProblems().forEach(p -> {
            int line = p.getLocation()
                .flatMap(l -> l.getBegin().getRange())
                .map(r -> r.begin.line)
                .orElse(0);
            sb.append("Main.java:").append(line).append(": error: ")
              .append(p.getMessage()).append('\n');
        });
        return sb.toString();
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("\"", "'").replace("\n", " ");
    }
}
