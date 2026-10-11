/**
 * Execution Guard
 * ───────────────
 * Central place for everything that protects the host from user code:
 * request validation, a scrubbed child-process environment, resource
 * limits, trace-size limits and error sanitization.
 */

const os = require('os');

const SUPPORTED_LANGUAGES = Object.freeze(['python', 'java', 'c', 'cpp', 'csharp']);

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

// All limits are overridable from the environment so ops can tune them
// without a code change.
const LIMITS = Object.freeze({
  maxCodeBytes:   num(process.env.DSVP_MAX_CODE_BYTES,   64 * 1024),         // source size
  timeoutMs:      num(process.env.DSVP_TIMEOUT_MS,       12_000),            // wall clock
  maxOutputBytes: num(process.env.DSVP_MAX_OUTPUT_BYTES, 1024 * 1024),       // stdout/stderr each
  maxTraceSteps:  num(process.env.DSVP_MAX_TRACE_STEPS,  5_000),             // visualization events
  maxJavaHeapMb:  num(process.env.DSVP_MAX_JAVA_HEAP_MB, 256),
  maxStdinBytes:  num(process.env.DSVP_MAX_STDIN_BYTES,  16 * 1024),         // program input
});

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Returns { ok:true, value } or { ok:false, message }. Never throws. */
function validateRunRequest(body) {
  if (!body || typeof body !== 'object') return { ok: false, message: 'Invalid request body.' };
  const { language, code } = body;
  let { moduleSlug } = body;

  if (typeof language !== 'string' || !SUPPORTED_LANGUAGES.includes(language)) {
    return { ok: false, message: `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.join(', ')}.` };
  }
  if (typeof code !== 'string' || code.trim() === '') {
    return { ok: false, message: 'language and code are required.' };
  }
  if (Buffer.byteLength(code, 'utf8') > LIMITS.maxCodeBytes) {
    return { ok: false, message: `Source code exceeds the ${Math.round(LIMITS.maxCodeBytes / 1024)} KB limit.` };
  }
  if (code.includes('\0')) {
    return { ok: false, message: 'Source code contains invalid characters.' };
  }
  if (moduleSlug === undefined || moduleSlug === null) moduleSlug = 'array';
  if (typeof moduleSlug !== 'string' || !SLUG_RE.test(moduleSlug)) {
    return { ok: false, message: 'Invalid module.' };
  }
  // Optional program input (fed to stdin by the runners that support it).
  let { stdin } = body;
  if (stdin !== undefined && stdin !== null) {
    if (typeof stdin !== 'string') return { ok: false, message: 'Input must be text.' };
    if (Buffer.byteLength(stdin, 'utf8') > LIMITS.maxStdinBytes) {
      return { ok: false, message: `Input exceeds the ${Math.round(LIMITS.maxStdinBytes / 1024)} KB limit.` };
    }
    if (stdin.includes('\0')) return { ok: false, message: 'Input contains invalid characters.' };
  } else {
    stdin = undefined;
  }
  return { ok: true, value: { language, code, moduleSlug, stdin } };
}

/**
 * Minimal environment for child processes. The server's own env (DB
 * credentials, JWT secret, payment keys, SMTP password …) is NEVER passed
 * through — only what a compiler/interpreter needs to locate itself.
 */
function safeChildEnv() {
  const keep = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'COMSPEC',
    'LOCALAPPDATA', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramData',
    'JAVA_HOME', 'DOTNET_ROOT', 'LANG', 'LC_ALL'];
  const env = {};
  for (const k of keep) if (process.env[k] !== undefined) env[k] = process.env[k];
  const tmp = os.tmpdir();
  env.TMP = tmp; env.TEMP = tmp; env.TMPDIR = tmp;
  env.PYTHONIOENCODING = 'utf-8';
  env.PYTHONDONTWRITEBYTECODE = '1';
  env.DOTNET_CLI_TELEMETRY_OPTOUT = '1';
  env.DOTNET_NOLOGO = '1';
  return env;
}

/** Options shared by every execFile call that runs or compiles user code. */
function execOptions(cwd, extra = {}) {
  return {
    timeout: LIMITS.timeoutMs,
    maxBuffer: LIMITS.maxOutputBytes,   // exceeding kills the child (ERR_CHILD_PROCESS_STDIO_MAXBUFFER)
    env: safeChildEnv(),
    cwd,
    windowsHide: true,
    killSignal: 'SIGKILL',
    ...extra,
  };
}

/** Strip server paths / infrastructure details from text sent to clients. */
function scrubPaths(text) {
  if (!text) return text;
  const tmp = os.tmpdir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text)
    .replace(new RegExp(`${tmp}[\\\\/]+dsvp_[^\\s:'"]*[\\\\/]`, 'gi'), '')
    .replace(/[A-Za-z]:\\[^\s:'"]*\\(?=[^\\\s:'"]+\.(?:py|java|c|cpp|cs|jar)\b)/g, '')
    .replace(/\/(?:home|Users|tmp|var|opt|usr)\/[^\s:'"]*\/(?=[^/\s:'"]+\.(?:py|java|c|cpp|cs|jar)\b)/g, '')
    .replace(/[A-Za-z]:\\[^\s'"]+/g, '<path>')
    .replace(/\/(?:home|Users|var|opt|etc)\/[^\s'"]+/g, '<path>');
}

/** Line-by-line filter that removes anything that looks like a secret from client output. */
function scrubSecrets(text) {
  if (!text) return text;
  let out = String(text);
  for (const [k, v] of Object.entries(process.env)) {
    if (!v || v.length < 8) continue;
    if (/(SECRET|PASSWORD|PASS|TOKEN|KEY|CONN|DATABASE|DB_|SMTP|RAZORPAY|JWT)/i.test(k)) {
      out = out.split(v).join('[redacted]');
    }
  }
  return out;
}

function sanitizeForClient(text) {
  return scrubSecrets(scrubPaths(text));
}

module.exports = {
  SUPPORTED_LANGUAGES, LIMITS,
  validateRunRequest, safeChildEnv, execOptions,
  scrubPaths, scrubSecrets, sanitizeForClient,
};
