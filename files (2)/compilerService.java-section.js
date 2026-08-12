/**
 * ── PATCH NOTES ──────────────────────────────────────────────────────
 * Replace the OLD runJava() + instrumentJava() + injectJavaCallTrace()
 * + extractJavaImports() + JAVA_SHIM constant in compilerService.js
 * with the code below. Everything else in the file (Python/C/C++/C#
 * runners, buildSuccess/buildError, findJava, etc.) stays exactly as-is.
 *
 * Requires: dsvp-java-instrumenter.jar built from /instrumenter (see
 * instrumenter/README.md) and placed alongside this service, e.g. at
 * services/tools/dsvp-java-instrumenter.jar
 * ──────────────────────────────────────────────────────────────────── */

// Absolute path to the AST-based Java instrumenter jar (built via Maven —
// see /instrumenter/pom.xml). Mirrors INSTRUMENTER_PY below it.
const INSTRUMENTER_JAVA_JAR = path.join(__dirname, 'tools', 'dsvp-java-instrumenter.jar');

async function runJava(code) {
  const javaInfo = await findJava();
  if (!javaInfo) {
    return notInstalled('Java JDK', 'https://adoptium.net/');
  }
  const { java, javac } = javaInfo;

  if (!fs.existsSync(INSTRUMENTER_JAVA_JAR)) {
    return {
      status: 'compile_error',
      errorMessage:
        `Java AST instrumenter jar not found at ${INSTRUMENTER_JAVA_JAR}.\n` +
        `Build it with: cd instrumenter && mvn -q package, then copy ` +
        `target/dsvp-java-instrumenter.jar to services/tools/.`,
      rawOutput: '',
      trace: { steps: [], userOutput: '' },
    };
  }

  // 1. Write the user's RAW code to a temp file — no string surgery here.
  //    Exactly like runPython(): we hand the whole file to a real parser.
  const tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'dsvp_java_'));
  const userSrcFile = path.join(tmpDir, 'UserCode.java');
  fs.writeFileSync(userSrcFile, code, 'utf8');

  let instrumented;
  try {
    // java -jar dsvp-java-instrumenter.jar UserCode.java  →  stdout = full,
    // ready-to-compile Java source (shim + instrumented user code).
    const { stdout } = await execFileAsync(
      java,
      ['-jar', INSTRUMENTER_JAVA_JAR, userSrcFile],
      { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, cwd: tmpDir }
    );
    instrumented = stdout;
  } catch (err) {
    // Parse failures come back on stderr in a javac-style "Main.java:N:
    // error: ..." format (see JavaInstrumenter.toJavacStyleError), so the
    // existing extractErrorLine() regex in executionController.js keeps
    // working without any changes there.
    safeRmDir(tmpDir);
    return {
      status: 'compile_error',
      errorMessage: (err.stderr || err.message || 'Instrumentation failed').trim(),
      rawOutput: '',
      trace: { steps: [], userOutput: '' },
    };
  }

  // 2. Compile + run the instrumented source exactly as before.
  const srcFile = path.join(tmpDir, 'Main.java');
  fs.writeFileSync(srcFile, instrumented, 'utf8');

  try {
    await execFileAsync(javac, [srcFile], { timeout: TIMEOUT_MS, cwd: tmpDir });
    const { stdout, stderr } = await execFileAsync(java, ['-cp', tmpDir, 'Main'], {
      timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, cwd: tmpDir,
    });
    return buildSuccess(stdout, stderr);
  } catch (err) {
    return buildError(err, 'java');
  } finally {
    safeRmDir(tmpDir);
  }
}
