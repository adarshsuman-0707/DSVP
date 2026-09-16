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

        // Ensure there's exactly one public-ish entry class named Main so
        // `java -cp . Main` always works, regardless of what the user named
        // their class.
        renameMainClassTo(cu, "Main");

        if (!alreadyInstrumented) {
            ArrayInstrumentVisitor arrayPass = new ArrayInstrumentVisitor();
            arrayPass.visit(cu, null);

            CallTraceInstrumentVisitor callPass = new CallTraceInstrumentVisitor();
            callPass.visit(cu, null);

            // LinkedList auto-instrumentation — detects user-defined Node classes
            // and injects trace calls after every .next assignment and in loop bodies
            LinkedListInstrumentVisitor llPass = new LinkedListInstrumentVisitor();
            llPass.visit(cu, null);
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
        System.out.print(rest.toString());
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
                // Fix any same-file self-references (e.g. recursive constructors).
                cu.findAll(com.github.javaparser.ast.expr.ObjectCreationExpr.class).forEach(oce -> {
                    if (oce.getType().getNameAsString().equals(oldName)) {
                        oce.getType().setName(newName);
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
