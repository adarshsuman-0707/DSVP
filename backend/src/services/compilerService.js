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

const execFileAsync = promisify(execFile);
const execAsync     = promisify(exec);

const TIMEOUT_MS = 12_000;   // max execution time per run

/* ── Shims (Java / C / C++ / C#) ────────────────────────────────────── */
/* Python uses python_instrumenter.py for full AST-based auto-tracing.   */

const JAVA_SHIM = `
import java.util.Iterator;
import java.util.Arrays;
class DSVPArray implements Iterable<Integer> {
    private int[] d;
    DSVPArray(int size){ d=new int[size]; emitSnap("init",-1,0); }
    DSVPArray(int... vals){ d=vals.clone(); emitSnap("init",-1,0); }
    private String snapStr(){
        StringBuilder s=new StringBuilder("[");
        for(int i=0;i<d.length;i++) s.append(d[i]).append(i<d.length-1?",":"");
        return s.append("]").toString();
    }
    private void emitSnap(String op,int idx,int val){
        System.out.println("DSVP_TRACE:{\\"op\\":\\""+op+"\\",\\"idx\\":"+idx+",\\"val\\":"+val+",\\"snap\\":"+snapStr()+"}");
        System.out.flush();
    }
    // ── static call-stack helpers (called by instrumented user methods) ──
    public static void traceCall(String func, String argsJson){
        System.out.println("DSVP_TRACE:{\\"op\\":\\"call\\",\\"func\\":\\""+func+"\\",\\"args\\":"+argsJson+"}");
        System.out.flush();
    }
    public static void traceLine(String func, int line, String localsJson){
        System.out.println("DSVP_TRACE:{\\"op\\":\\"line\\",\\"func\\":\\""+func+"\\",\\"line\\":"+line+",\\"locals\\":"+localsJson+"}");
        System.out.flush();
    }
    public static void traceReturn(String func, String retVal, String localsJson){
        System.out.println("DSVP_TRACE:{\\"op\\":\\"return\\",\\"func\\":\\""+func+"\\",\\"ret\\":\\""+retVal+"\\",\\"locals\\":"+localsJson+"}");
        System.out.flush();
    }
    public int get(int i){ int v=d[i]; emitSnap("read",i,v); return v; }
    public void set(int i,int v){ d[i]=v; emitSnap("write",i,v); }
    public void swap(int i,int j){ int t=d[i];d[i]=d[j];d[j]=t; emitSnap("swap",i,j); }
    public int size(){ return d.length; }
    public int[] raw(){ return d; }
    @Override
    public Iterator<Integer> iterator(){
        return new Iterator<Integer>(){
            int pos=0;
            public boolean hasNext(){ return pos<d.length; }
            public Integer next(){
                int v=d[pos]; emitSnap("read",pos,v); pos++; return v;
            }
        };
    }
    public boolean gt(int i,int j){ emitSnap("compare",i,j); return d[i]> d[j]; }
    public boolean lt(int i,int j){ emitSnap("compare",i,j); return d[i]< d[j]; }
    public boolean gte(int i,int j){ emitSnap("compare",i,j); return d[i]>=d[j]; }
    public boolean lte(int i,int j){ emitSnap("compare",i,j); return d[i]<=d[j]; }
    public boolean eq(int i,int j){ emitSnap("compare",i,j); return d[i]==d[j]; }
    public boolean neq(int i,int j){ emitSnap("compare",i,j); return d[i]!=d[j]; }
    @Override public String toString(){ return snapStr(); }
}
`;

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
    return buildSuccess(stdout, stderr);
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

  // 1. Pull import statements out so they go before the shim class
  const { imports, body } = extractJavaImports(code);

  // 2. Auto-instrument the body (only rewrites int[] arrays it can identify)
  const { instrumented, arrayNames } = instrumentJava(body);

  // 3. Compose: imports → DSVPArray shim → instrumented user code
  const fullCode = imports + '\n' + JAVA_SHIM + '\n' + instrumented;

  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'dsvp_java_'));
  const srcFile = path.join(tmpDir, 'Main.java');
  fs.writeFileSync(srcFile, fullCode, 'utf8');

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

/**
 * Split Java source into import lines and the rest of the body.
 * Imports MUST appear before any class/type definitions.
 */
function extractJavaImports(code) {
  const lines   = code.split('\n');
  const imports = [];
  const body    = [];
  let   inBody  = false;

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip leading blank lines before we decide import vs body
    if (!inBody && trimmed === '') continue;
    if (!inBody && trimmed.startsWith('import ')) {
      imports.push(line);
    } else {
      inBody = true;
      body.push(line);
    }
  }

  return {
    imports: imports.join('\n'),
    body:    body.join('\n'),
  };
}

/**
 * Java source-level auto-instrumentation.
 *
 * Strategy:
 *  - Find all variables declared as int[] in the body
 *  - Only rewrite operations on THOSE specific variable names
 *  - Leave everything else (loop variables, method params, etc.) untouched
 *
 * Transformations applied only to tracked int[] variable names:
 *  1. int[] name = {v1,v2,...};       → DSVPArray name = new DSVPArray(new int[]{...});
 *  2. int[] name = new int[n];        → DSVPArray name = new DSVPArray(n);
 *  3. name[i] OP name[j]  (compare)  → name.gt/lt/etc.(i, j)
 *  4. name[i] = expr;    (write)      → name.set(i, expr);
 *  5. name[expr]          (read)      → name.get(expr)
 *  6. name.length                     → name.size()
 *
 * If user already uses DSVPArray, returns unchanged.
 * If no int[] found, returns unchanged (code runs as-is).
 */
function instrumentJava(code) {
  if (code.includes('DSVPArray')) return { instrumented: code, arrayNames: [] };

  // Step 1: discover all int[] variable names declared in this code
  const arrayNames = new Set();
  const declPattern = /\bint\s*\[\s*\]\s+(\w+)\s*[=;({]/g;
  let m;
  while ((m = declPattern.exec(code)) !== null) {
    arrayNames.add(m[1]);
  }
  // Also catch  int name[] = ...  style
  const declPattern2 = /\bint\s+(\w+)\s*\[\s*\]/g;
  while ((m = declPattern2.exec(code)) !== null) {
    arrayNames.add(m[1]);
  }

  if (arrayNames.size === 0) {
    // No int[] arrays found — run code as plain Java, no instrumentation
    return { instrumented: code, arrayNames: [] };
  }

  const names = [...arrayNames];
  let out = code;

  // Step 2: rewrite declarations
  // int[] name = {v1, v2, ...};
  for (const name of names) {
    out = out.replace(
      new RegExp(`int\\s*\\[\\s*\\]\\s+${name}\\s*=\\s*\\{([^}]*)\\}\\s*;`, 'g'),
      (_, vals) => `DSVPArray ${name} = new DSVPArray(new int[]{${vals}});`
    );
    // int[] name = new int[expr];
    out = out.replace(
      new RegExp(`int\\s*\\[\\s*\\]\\s+${name}\\s*=\\s*new\\s+int\\s*\\[([^\\]]+)\\]\\s*;`, 'g'),
      (_, size) => `DSVPArray ${name} = new DSVPArray(${size.trim()});`
    );
    // int[] name;  (declaration only, no init)
    out = out.replace(
      new RegExp(`int\\s*\\[\\s*\\]\\s+${name}\\s*;`, 'g'),
      `DSVPArray ${name};`
    );
  }

  // Step 3: compare  name[i] OP name[j]  (same array both sides)
  const opMap = { '>': 'gt', '<': 'lt', '>=': 'gte', '<=': 'lte', '==': 'eq', '!=': 'neq' };
  for (const name of names) {
    out = out.replace(
      new RegExp(`\\b${name}\\s*\\[([^\\]]+)\\]\\s*(>=|<=|==|!=|>|<)\\s*${name}\\s*\\[([^\\]]+)\\]`, 'g'),
      (_, i, op, j) => `${name}.${opMap[op] || 'gt'}(${i.trim()}, ${j.trim()})`
    );
  }

  // Step 4: writes  name[i] = expr;
  for (const name of names) {
    out = out.replace(
      new RegExp(`\\b${name}\\s*\\[([^\\]]+)\\]\\s*=(?!=)\\s*([^;]+);`, 'g'),
      (_, idx, val) => `${name}.set(${idx.trim()}, ${val.trim()});`
    );
  }

  // Step 5: reads  name[expr]  → name.get(expr)
  // Run twice to handle nested like name[name[i]]
  for (let pass = 0; pass < 2; pass++) {
    for (const name of names) {
      out = out.replace(
        new RegExp(`\\b${name}\\s*\\[([^\\]]+)\\](?!\\s*=(?!=))`, 'g'),
        (_, idx) => `${name}.get(${idx.trim()})`
      );
    }
  }

  // Step 6: .length → .size()  (only for tracked array names)
  for (const name of names) {
    out = out.replace(new RegExp(`\\b${name}\\.length\\b`, 'g'), `${name}.size()`);
  }

  // Step 7: fix method signatures that had  int[] paramName  — these are
  // parameters, not local declarations. The user's methods that accept arrays
  // should receive DSVPArray instead. Rewrite method signatures.
  // Pattern: public/private/protected/static ... method(...int[] paramName...)
  for (const name of names) {
    out = out.replace(
      new RegExp(`int\\s*\\[\\s*\\]\\s+${name}(?=\\s*[,)])`, 'g'),
      `DSVPArray ${name}`
    );
  }

  // Step 8: inject call/return tracing into user-defined methods
  out = injectJavaCallTrace(out);

  return { instrumented: out, arrayNames: names };
}

/**
 * Inject DSVPArray.traceCall() at the start of every user method body
 * and DSVPArray.traceReturn() before every return statement.
 *
 * Targets: any  public/private/protected/static ... methodName(...) {
 * Skips: main(), constructors (class name = Main)
 */
function injectJavaCallTrace(code) {
  // Match method declarations:  modifier* returnType methodName(params) {
  // We use a regex that finds the opening brace of a method.
  const METHOD_RE = /\b(public|private|protected|static|\s)+\s+([\w<>\[\]]+)\s+(\w+)\s*\(([^)]*)\)\s*\{/g;

  let out = code;
  let offset = 0;
  let m;

  // Collect matches first (regex state is reset after replace)
  const matches = [];
  while ((m = METHOD_RE.exec(code)) !== null) {
    const methodName = m[3];
    if (methodName === 'main' || methodName === 'Main') continue; // skip entry point
    matches.push({
      index:      m.index + offset,
      fullMatch:  m[0],
      methodName,
      params:     m[4].trim(),
    });
  }

  // Process in reverse so offsets stay valid
  matches.reverse().forEach(({ index, fullMatch, methodName, params }) => {
    // Build args JSON: {"paramName": String.valueOf(paramName), ...}
    const paramList = params
      ? params.split(',').map(p => p.trim()).filter(Boolean).map(p => {
          const parts = p.split(/\s+/);
          const pname = parts[parts.length - 1].replace(/[[\]]/g, '');
          return `"\\"${pname}\\":\\""+String.valueOf(${pname})+"\\""`;
        })
      : [];
    const argsJson = paramList.length
      ? '"{"+' + paramList.join('+","+') + '+"}"'
      : '"{}"';

    // Locals JSON (simplified: use toString on known variables)
    const localsJson = '"{}"';

    const callInject = `\n        DSVPArray.traceCall("${methodName}", ${argsJson});`;

    // Insert after the opening brace
    const insertPos = index + fullMatch.length;
    out = out.slice(0, insertPos) + callInject + out.slice(insertPos);
  });

  // Now inject traceReturn before every return statement that has a value
  // Handle:  return expr;  (has value)
  out = out.replace(
    /\breturn\s+([^;{}]+);/g,
    (match, retExpr) => {
      if (retExpr.includes('traceReturn') || retExpr.includes('_dsvp_ret')) return match;
      const trimmed = retExpr.trim();
      // For simple expressions, inline directly to avoid type issues
      return `{ DSVPArray.traceReturn("?", String.valueOf(${trimmed}), "{}"); return ${trimmed}; }`;
    }
  );
  // Handle bare:  return;  (void)
  out = out.replace(/\breturn\s*;/g, match => {
    return `{ DSVPArray.traceReturn("?", "void", "{}"); return; }`;
  });

  return out;
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

module.exports = { runCode };

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

  /* If we got partial trace output before the crash, include it */
  const partial = parseTraceFromStdout(stdout);
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
