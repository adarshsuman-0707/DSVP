# DSVP Java AST Instrumenter

Replaces the old regex-based `instrumentJava()` in `compilerService.js`
with a real JavaParser-driven AST transformer — same idea as
`python_instrumenter.py`, but for Java.

## Why this fixes the bug you hit

The old code only rewrote `arr[i]` *indexing syntax* it found via regex.
If your generated/user code already called `arr.gt(...)`, `arr.get(...)`,
`arr.set(...)` directly, the regex never matched anything (it doesn't
understand method calls), so `arr` stayed a plain `int[]` and javac threw
`cannot find symbol`.

This version instead:
1. Parses the whole file into a real syntax tree (JavaParser).
2. Finds every `int[]`/`long[]`/etc. **1-D** variable, field, and parameter.
3. Walks the actual `ArrayAccessExpr` / `BinaryExpr` / `AssignExpr` nodes
   for those names and swaps them for `DSVPArray` method calls.
4. Injects `traceCall` / `traceLine` / `traceReturn` by editing the AST's
   statement lists, so it can never split a multi-line statement or land
   an injected call inside an expression — the old text/line based
   injector could do both.

Because it works on structure, not text, it handles arrays declared any
style, split across lines, passed as parameters, indexed indirectly
(`arr[arr[i]]`), used inside `if/while/for/ternary`, etc. — without needing
special-case regexes for each shape.

## Build

Requires Maven and normal internet access (Maven Central), which is why
this can't be built inside a network-locked sandbox — build it locally
or in CI:

```bash
cd instrumenter
mvn -q package
# produces target/dsvp-java-instrumenter.jar (shaded, self-contained)
cp target/dsvp-java-instrumenter.jar ../services/tools/dsvp-java-instrumenter.jar
```

## Wire into compilerService.js

Replace the old `runJava`, `instrumentJava`, `injectJavaCallTrace`,
`extractJavaImports`, and the `JAVA_SHIM` constant with the contents of
`compilerService.java-section.js` in this folder. Nothing else in
compilerService.js, traceGeneratorService.js, or executionController.js
needs to change — the instrumented output still emits the same
`DSVP_TRACE:{...}` lines on stdout, and parse errors still come back in
`Main.java:<line>: error: ...` format so `extractErrorLine()` keeps working.

## Test it

```bash
java -jar target/dsvp-java-instrumenter.jar SomeUserCode.java
```
prints the fully instrumented, ready-to-compile source to stdout — pipe
it straight into `javac` to sanity check compilation before wiring it
into the Node service.

## Known intentional limits

- Multi-dimensional arrays (`int[][]`) are left untouched — out of scope
  for the array visualizer module.
- `int[] arr = someMethod();` (array from a method call) is left
  un-instrumented on purpose: DSVPArray has no way to wrap an opaque
  return value safely, so this surfaces a clear compile error instead of
  silently mis-tracing.
- `switch` statement bodies get a `traceLine` at the switch itself but not
  per-case — easy to extend in `CallTraceInstrumentVisitor` if needed.
