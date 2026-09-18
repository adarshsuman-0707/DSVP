/**
 * Compiler Service  — local child_process runner
 * ─────────────────────────────────────────────────
 * Executes user code by writing it to a temp file and spawning the
 * appropriate interpreter/compiler via child_process.execFile.
 *
 * INSTRUMENTATION SHIM
 * Before running, we prepend a language-specific DSVPArray helper to
 * the user's code.  The helper prints  DSVP_TRACE:<json>  on every
 * array operation.  traceGeneratorService parses those lines.
 *
 * SUPPORTED (needs runtime installed on host):
 *   python  → python      (Python 3, detected as 'python' or 'python3')
 *   java    → javac + java
 *   c       → gcc
 *   cpp     → g++
 *   csharp  → dotnet script  OR  mcs + mono
 *
 * If a runtime is not installed the service returns a clear install-hint
 * error rather than a cryptic crash.
 */

const { execFile, exec } = require('child_process');
const { promisify }      = require('util');
const fs                 = require('fs');
const os                 = require('os');
const path               = require('path');

// Absolute path to the Python AST instrumenter script
const INSTRUMENTER_PY = path.join(__dirname, 'python_instrumenter.py');

// Absolute path to the Java AST instrumenter jar (built via Maven)
const INSTRUMENTER_JAVA_JAR = path.join(__dirname, 'tools', 'dsvp-java-instrumenter.jar');

const execFileAsync = promisify(execFile);
const execAsync     = promisify(exec);

const TIMEOUT_MS = 12_000;   // max execution time per run

/* ── Shims (C / C++ / C#) ───────────────────────────────────────────── */
/* Python uses python_instrumenter.py for full AST-based auto-tracing.   */
/* Java uses dsvp-java-instrumenter.jar for full AST-based auto-tracing. */

const C_SHIM = `
#include <stdio.h>
#include <stdlib.h>
typedef struct { int *data; int size; } DSVPArray;
static void _emit(const char *op,int idx,int val,int *data,int size){
    printf("DSVP_TRACE:{\\"op\\":\\"%s\\",\\"idx\\":%d,\\"val\\":%d,\\"snap\\":[",op,idx,val);
    for(int _i=0;_i<size;_i++) printf("%d%s",data[_i],_i<size-1?",":"");
    printf("]}\\n"); fflush(stdout);
}
DSVPArray Array(int size){
    DSVPArray a; a.data=(int*)calloc(size,sizeof(int)); a.size=size;
    _emit("init",-1,0,a.data,size); return a;
}
void arr_set(DSVPArray *a,int i,int v){ a->data[i]=v; _emit("write",i,v,a->data,a->size); }
int  arr_get(DSVPArray *a,int i){ int v=a->data[i]; _emit("read",i,v,a->data,a->size); return v; }
void arr_swap(DSVPArray *a,int i,int j){ int t=a->data[i];a->data[i]=a->data[j];a->data[j]=t; _emit("swap",i,j,a->data,a->size); }
`;

const CPP_SHIM = `
#include <iostream>
#include <vector>
#include <string>
using namespace std;
class DSVPArray {
    vector<int> d;
    void emit(const string& op,int idx,int val) const {
        cout<<"DSVP_TRACE:{\\"op\\":\\""<<op<<"\\",\\"idx\\":" <<idx<<",\\"val\\":" <<val<<",\\"snap\\":[";
        for(int i=0;i<(int)d.size();i++) cout<<d[i]<<(i<(int)d.size()-1?",":"");
        cout<<"]}\\n"; cout.flush();
    }
public:
    DSVPArray(){}
    DSVPArray(int n,int fill=0):d(n,fill){ emit("init",-1,0); }
    DSVPArray(initializer_list<int> il):d(il){ emit("init",-1,0); }
    int& operator[](int i){ emit("read",i,d[i]); return d[i]; }
    void set(int i,int v){ d[i]=v; emit("write",i,v); }
    void swap_at(int i,int j){ swap(d[i],d[j]); emit("swap",i,j); }
    int size() const { return d.size(); }
};
`;

const CSHARP_SHIM = `
using System;
using System.Text;
class DSVPArray {
    private int[] d;
    public DSVPArray(int size){ d=new int[size]; Emit("init",-1,0); }
    public DSVPArray(params int[] vals){ d=(int[])vals.Clone(); Emit("init",-1,0); }
    private void Emit(string op,int idx,int val){
        var sb=new StringBuilder("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":"+val+",\\"snap\\":[");
        for(int i=0;i<d.Length;i++) sb.Append(d[i]+(i<d.Length-1?",":""));
        sb.Append("]}");
        Console.WriteLine(sb); Console.Out.Flush();
    }
    public int Get(int i){ int v=d[i]; Emit("read",i,v); return v; }
    public void Set(int i,int v){ d[i]=v; Emit("write",i,v); }
    public void Swap(int i,int j){ int t=d[i];d[i]=d[j];d[j]=t; Emit("swap",i,j); }
    public int Length => d.Length;
}
`;

/* ── Runtime detection ───────────────────────────────────────────────── */

/**
 * Well-known absolute bin directories to check when PATH lookup fails.
 * Node.js child_process inherits the machine PATH, not the user PATH,
 * so tools installed to user-level AppData won't be found by `where`.
 */
const EXTRA_BIN_DIRS = [
  // Java — Temurin / Adoptium (user-level install on Windows)
  `${process.env.LOCALAPPDATA || ''}\\Programs\\Eclipse Adoptium`,
  // Also scan all JDK subdirs inside that folder dynamically (see findJavaBin)
];

async function findExecutable(names) {
  for (const name of names) {
    try {
      const { stdout } = await execAsync(`where ${name}`, { timeout: 3000 });
      const found = stdout.trim().split('\n')[0].trim();
      if (found) return found;
    } catch (_) { /* not on system PATH */ }
  }
  return null;
}

/**
 * Find java / javac by scanning the Eclipse Adoptium user install directory.
 * Returns the full path to the bin folder (e.g. ".../jdk-25.0.4.7-hotspot/bin")
 * or null if not found.
 */
function findAdoptiumBin() {
  const adoptiumRoot = path.join(
    process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local',
    'Programs', 'Eclipse Adoptium'
  );
  if (!fs.existsSync(adoptiumRoot)) return null;

  // Pick the newest JDK folder
  let entries;
  try { entries = fs.readdirSync(adoptiumRoot); } catch (_) { return null; }

  const jdkDirs = entries
    .filter(e => e.startsWith('jdk'))
    .sort()
    .reverse(); // newest first (lexicographic works for semver-like names)

  for (const dir of jdkDirs) {
    const binPath = path.join(adoptiumRoot, dir, 'bin');
    if (fs.existsSync(path.join(binPath, 'java.exe')) ||
        fs.existsSync(path.join(binPath, 'java'))) {
      return binPath;
    }
  }
  return null;
}

/**
 * Returns { java, javac } full paths, or null if not found anywhere.
 */
async function findJava() {
  // 1. Try system PATH first
  const javaOnPath  = await findExecutable(['java']);
  const javacOnPath = await findExecutable(['javac']);
  if (javaOnPath && javacOnPath) {
    return { java: javaOnPath, javac: javacOnPath };
  }

  // 2. Fall back to known Adoptium user install location
  const binDir = findAdoptiumBin();
  if (binDir) {
    const javaExe  = path.join(binDir, process.platform === 'win32' ? 'java.exe'  : 'java');
    const javacExe = path.join(binDir, process.platform === 'win32' ? 'javac.exe' : 'javac');
    if (fs.existsSync(javaExe) && fs.existsSync(javacExe)) {
      return { java: javaExe, javac: javacExe };
    }
  }

  return null;
}

/* ── Language runners ────────────────────────────────────────────────── */

async function runPython(code) {
  const pythonBin = await findExecutable(['python', 'python3']);
  if (!pythonBin) {
    return notInstalled('Python', 'https://www.python.org/downloads/');
  }

  // Write ONLY the user's raw code — no shim prepended.
  // The instrumenter script handles all AST transformation at runtime.
  const tmpFile = path.join(os.tmpdir(), `dsvp_user_${Date.now()}.py`);
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    // python python_instrumenter.py <user_code_file>
    const { stdout, stderr } = await execFileAsync(
      pythonBin,
      [INSTRUMENTER_PY, tmpFile],
      { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 }
    );
    // Trace goes to stderr, user output is clean stdout — same split as Java.
    return buildSuccessJava(stdout, stderr);
  } catch (err) {
    return buildError(err, 'python');
  } finally {
    safeUnlink(tmpFile);
  }
}

async function runJava(code) {
  const javaInfo = await findJava();
  if (!javaInfo) {
    return notInstalled('Java JDK', 'https://adoptium.net/');
  }
  const { java, javac } = javaInfo;

  // Check that the AST instrumenter JAR exists
  if (!fs.existsSync(INSTRUMENTER_JAVA_JAR)) {
    return {
      status: 'compile_error',
      errorMessage: `Java AST instrumenter jar not found at ${INSTRUMENTER_JAVA_JAR}. Please rebuild the instrumenter.`,
      rawOutput: '',
      trace: { steps: [], userOutput: '' }
    };
  }

  // Create temp directory and write user code
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsvp_java_'));
  const userSrcFile = path.join(tmpDir, 'UserCode.java');
  fs.writeFileSync(userSrcFile, code, 'utf8');

  // Run the AST instrumenter to transform the code
  let instrumented;
  try {
    const { stdout } = await execFileAsync(
      java,
      ['-jar', INSTRUMENTER_JAVA_JAR, userSrcFile],
      { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, cwd: tmpDir }
    );
    instrumented = stdout;
  } catch (err) {
    safeRmDir(tmpDir);
    return {
      status: 'compile_error',
      errorMessage: (err.stderr || err.message || 'Instrumentation failed').trim(),
      rawOutput: '',
      trace: { steps: [], userOutput: '' }
    };
  }

  // Write instrumented code and compile
  const srcFile = path.join(tmpDir, 'Main.java');
  fs.writeFileSync(srcFile, instrumented, 'utf8');

  try {
    // Compile the instrumented code. -encoding UTF-8 is required: the
    // instrumenter's injected runtime shim/comments can contain non-ASCII
    // characters (em-dashes, etc.), and javac otherwise falls back to the
    // platform default charset — which on Windows is commonly a non-UTF-8
    // codepage — causing spurious "unmappable character" compile errors
    // that have nothing to do with the user's actual code.
    await execFileAsync(javac, ['-encoding', 'UTF-8', srcFile], { timeout: TIMEOUT_MS, cwd: tmpDir });
    
    // Run the compiled code
    // NOTE: DSVP_TRACE lines go to stderr, user println goes to stdout
    const { stdout, stderr } = await execFileAsync(
      java,
      ['-cp', tmpDir, 'Main'],
      { timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, cwd: tmpDir }
    );
    
    return buildSuccessJava(stdout, stderr);
  } catch (err) {
    return buildError(err, 'java');
  } finally {
    safeRmDir(tmpDir);
  }
}


async function runC(code) {
  const gcc = await findExecutable(['gcc']);
  if (!gcc) return notInstalled('GCC (C compiler)', 'https://mingw-w64.org/');

  const fullCode = C_SHIM + '\n' + code;
  const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'dsvp_c_'));
  const srcFile  = path.join(tmpDir, 'main.c');
  const outFile  = path.join(tmpDir, 'main.exe');
  fs.writeFileSync(srcFile, fullCode, 'utf8');

  try {
    await execFileAsync(gcc, [srcFile, '-o', outFile, '-lm'], { timeout: TIMEOUT_MS, cwd: tmpDir });
    const { stdout, stderr } = await execFileAsync(outFile, [], {
      timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024,
    });
    return buildSuccess(stdout, stderr);
  } catch (err) {
    return buildError(err, 'c');
  } finally {
    safeRmDir(tmpDir);
  }
}

async function runCpp(code) {
  const gpp = await findExecutable(['g++']);
  if (!gpp) return notInstalled('G++ (C++ compiler)', 'https://mingw-w64.org/');

  const fullCode = CPP_SHIM + '\n' + code;
  const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'dsvp_cpp_'));
  const srcFile  = path.join(tmpDir, 'main.cpp');
  const outFile  = path.join(tmpDir, 'main.exe');
  fs.writeFileSync(srcFile, fullCode, 'utf8');

  try {
    await execFileAsync(gpp, [srcFile, '-o', outFile, '-std=c++17'], { timeout: TIMEOUT_MS, cwd: tmpDir });
    const { stdout, stderr } = await execFileAsync(outFile, [], {
      timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024,
    });
    return buildSuccess(stdout, stderr);
  } catch (err) {
    return buildError(err, 'cpp');
  } finally {
    safeRmDir(tmpDir);
  }
}

async function runCsharp(code) {
  /* Try dotnet-script first, then mcs+mono */
  const dotnet = await findExecutable(['dotnet']);
  const mcs    = await findExecutable(['mcs', 'mono']);

  if (!dotnet && !mcs) {
    return notInstalled('.NET SDK or Mono', 'https://dotnet.microsoft.com/download');
  }

  const fullCode = CSHARP_SHIM + '\n' + code;
  const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), 'dsvp_cs_'));

  if (dotnet) {
    /* Use dotnet-script (csx) or a minimal console project */
    const srcFile = path.join(tmpDir, 'main.cs');
    const csproj  = path.join(tmpDir, 'app.csproj');
    fs.writeFileSync(srcFile, fullCode, 'utf8');
    fs.writeFileSync(csproj, `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net6.0</TargetFramework></PropertyGroup></Project>`, 'utf8');
    try {
      const { stdout, stderr } = await execAsync(`dotnet run --project "${csproj}"`, {
        timeout: TIMEOUT_MS * 2, maxBuffer: 2 * 1024 * 1024, cwd: tmpDir,
      });
      return buildSuccess(stdout, stderr);
    } catch (err) {
      return buildError(err, 'csharp');
    } finally {
      safeRmDir(tmpDir);
    }
  } else {
    /* Mono path */
    const srcFile = path.join(tmpDir, 'main.cs');
    const outFile = path.join(tmpDir, 'main.exe');
    fs.writeFileSync(srcFile, fullCode, 'utf8');
    try {
      await execFileAsync('mcs', [srcFile, '-out:' + outFile], { timeout: TIMEOUT_MS, cwd: tmpDir });
      const { stdout, stderr } = await execFileAsync('mono', [outFile], {
        timeout: TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024,
      });
      return buildSuccess(stdout, stderr);
    } catch (err) {
      return buildError(err, 'csharp');
    } finally {
      safeRmDir(tmpDir);
    }
  }
}

/* ── Main export ─────────────────────────────────────────────────────── */

const RUNNERS = {
  python: runPython,
  java:   runJava,
  c:      runC,
  cpp:    runCpp,
  csharp: runCsharp,
};

async function runCode({ language, code }) {
  const runner = RUNNERS[language];
  if (!runner) {
    return {
      status:       'compile_error',
      errorMessage: `Unsupported language: "${language}". Supported: python, java, c, cpp, csharp.`,
      rawOutput:    '',
      trace:        { steps: [], userOutput: '' },
    };
  }
  return runner(code);
}



/* ── Helpers ─────────────────────────────────────────────────────────── */

function buildSuccess(stdout, stderr) {
  const parsed = parseTraceFromStdout(stdout || '');
  /* stderr may carry warnings — not fatal */
  return {
    status:       'success',
    errorMessage: null,
    rawOutput:    stdout,
    trace:        parsed,
  };
}

// Java/Python: trace goes to stderr, user output is clean stdout
function buildSuccessJava(stdout, stderr) {
  const traceData = parseTraceFromStdout(stderr || '');
  const userOut   = (stdout || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  return {
    status:       'success',
    errorMessage: null,
    rawOutput:    stdout,
    trace:        { steps: traceData.steps, userOutput: userOut },
  };
}

function buildError(err, language) {
  /* execFileAsync rejects with err.killed (timeout) or err.stderr (compile/runtime) */
  if (err.killed || err.signal === 'SIGTERM') {
    return {
      status:       'runtime_error',
      errorMessage: 'Execution timed out (12 s limit). Check for infinite loops.',
      rawOutput:    err.stdout || '',
      trace:        parseTraceFromStdout(err.stdout || ''),
    };
  }

  const stderr = err.stderr || err.message || '';
  const stdout = err.stdout || '';

  /* If we got partial trace output before the crash, include it.
     Java/Python emit trace events on stderr (stdout is clean user output),
     other languages interleave DSVP_TRACE lines into stdout. */
  const tracedStreamsFromStderr = language === 'java' || language === 'python';
  const partial = tracedStreamsFromStderr
    ? parseTraceFromStdout(stderr)
    : parseTraceFromStdout(stdout);
  const isCompile = isCompileError(stderr, language);

  return {
    status:       isCompile ? 'compile_error' : 'runtime_error',
    errorMessage: sanitizeError(stderr, language),
    rawOutput:    stdout,
    trace:        partial,
  };
}

function notInstalled(name, url) {
  return {
    status:       'compile_error',
    errorMessage: `${name} is not installed on this server.\nTo enable this language, install it and restart the server.\nDownload: ${url}`,
    rawOutput:    '',
    trace:        { steps: [], userOutput: '' },
  };
}

function isCompileError(stderr, language) {
  if (!stderr) return false;
  const compileKeywords = ['SyntaxError', 'error:', 'Error:', 'cannot find symbol',
    'undeclared', 'undefined reference', 'expected', ': error'];
  return compileKeywords.some(k => stderr.includes(k));
}

function sanitizeError(stderr, language) {
  if (!stderr) return 'An unknown error occurred.';
  
  // For Java, keep more context and clean up paths more carefully
  if (language === 'java') {
    return stderr
      .split('\n')
      .map(l => l
        // Replace temp directory paths with 'Main.java' for clarity
        .replace(/[A-Z]:\\[^\s:]+dsvp[^\s:]*\\Main\.java/gi, 'Main.java')
        .replace(/\/tmp\/dsvp[^\s:]*\/Main\.java/g, 'Main.java')
        // Keep full error context for Java
        .trim()
      )
      .filter(Boolean)
      .slice(0, 30)  // More lines for Java compilation errors
      .join('\n');
  }
  
  // Original handling for other languages
  return stderr
    .split('\n')
    .filter(l => l.trim())
    .map(l => l
      .replace(/[A-Z]:\\[^\s:]+dsvp[^\s:]*\\/gi, '')   // remove tmp paths
      .replace(/\/tmp\/dsvp[^\s:]*/g, '')                // unix tmp paths
      .trim()
    )
    .filter(Boolean)
    .slice(0, 15)
    .join('\n');
}

function parseTraceFromStdout(stdout) {
  const steps   = [];
  const outputs = [];

  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('DSVP_TRACE:')) {
      try {
        steps.push(JSON.parse(line.slice('DSVP_TRACE:'.length)));
      } catch (_) { /* malformed — skip */ }
    } else if (line) {
      outputs.push(line);
    }
  }

  return { steps, userOutput: outputs.join('\n') };
}

function safeUnlink(f) {
  try { fs.unlinkSync(f); } catch (_) {}
}

function safeRmDir(d) {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
}

module.exports = { runCode };
