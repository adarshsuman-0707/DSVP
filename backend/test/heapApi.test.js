/**
 * POST /api/execution/run for the Heap module — the real Express app, auth
 * middleware, validation, rate limiter, controller and execution pipeline;
 * only SQL/SMTP are faked (see helpers/world.js). Runtime-dependent tests
 * are skipped when python / a JDK is not installed.
 */
process.env.DSVP_TIMEOUT_MS = process.env.DSVP_TIMEOUT_MS || '5000';
const w = require('./helpers/world');
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { execFileSync } = require('node:child_process');

const has = (cmd) => {
  try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; }
};
const HAS_PY = has('python') || has('python3');
const HAS_JAVA = has('java') && has('javac') && fs.existsSync(path.join(__dirname, '..', 'src', 'services', 'tools', 'dsvp-java-instrumenter.jar'));
const py = { skip: !HAS_PY && 'python not installed' };
const java = { skip: !HAS_JAVA && 'JDK or instrumenter jar not available' };

let token;
test.before(async () => {
  await w.start();
});
test.after(() => w.stop());
test.beforeEach(() => {
  w.reset();
  // admins are exempt from the per-hour execution limit, so the tests are not throttled
  const admin = w.addUser({ Role: 'admin', Email: 'admin@example.com' });
  token = jwt.sign({ userId: admin.UserId, tokenVersion: 1, role: 'admin' }, process.env.JWT_SECRET);
});

const run = (body, t = token) => w.call('POST', '/execution/run', { token: t, body });

const PY_HEAP = `import heapq
h = []
for x in [4, 1, 3]:
    heapq.heappush(h, x)
print(heapq.heappop(h))
`;

test('requires authentication', async () => {
  assert.equal((await w.call('POST', '/execution/run', { body: { language: 'python', code: 'x=1', moduleSlug: 'heap' } })).status, 401);
});

test('request validation: language, code, module, input', async () => {
  assert.equal((await run({ language: 'ruby', code: 'x', moduleSlug: 'heap' })).status, 400);
  assert.equal((await run({ language: 'python', code: '   ', moduleSlug: 'heap' })).status, 400);
  assert.equal((await run({ language: 'python', code: 'x=1', moduleSlug: '../etc' })).status, 400);
  assert.equal((await run({ language: 'python', code: 'x=1', moduleSlug: 'heap', stdin: 5 })).status, 400);
  assert.equal((await run({ language: 'python', code: 'x'.repeat(70 * 1024), moduleSlug: 'heap' })).status, 400);
  assert.equal((await run({ language: 'python', code: 'x=1', moduleSlug: 'heap', stdin: 'a'.repeat(20 * 1024) })).status, 400);
});

test('the Heap module only accepts Python and Java', async () => {
  const r = await run({ language: 'c', code: 'int main(){return 0;}', moduleSlug: 'heap' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'compile_error');
  assert.match(r.body.errorMessage, /Python and Java/);
});

test('Python run: heap events, heapInfo and program output', py, async () => {
  const r = await run({ language: 'python', code: PY_HEAP, moduleSlug: 'heap' });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.status, 'success');
  assert.ok(r.body.events.length > 5);
  assert.ok(r.body.events.every((e) => e.type === 'heap'));
  assert.equal(r.body.userOutput, '1');
  assert.equal(r.body.heapInfo.order, 'min');
  assert.equal(r.body.heapInfo.dynamic, true);
  assert.equal(r.body.traceTruncated, false);
  assert.ok(r.body.events.some((e) => e.heapKind === 'swap'));
  assert.ok(r.body.events.every((e) => e.currentLine == null || (e.currentLine >= 1 && e.currentLine <= PY_HEAP.split('\n').length)));
});

test('Python runtime error: partial events and the failing line from the traceback', py, async () => {
  const code = 'import heapq\nh = [3, 1]\nheapq.heapify(h)\nprint(heapq.heappop(h))\nprint(heapq.heappop(h))\nprint(heapq.heappop(h))\n';
  const r = await run({ language: 'python', code, moduleSlug: 'heap' });
  assert.equal(r.body.status, 'runtime_error');
  assert.equal(r.body.errorLine, 6);
  assert.ok(r.body.events.length > 0);
  assert.match(r.body.errorMessage, /IndexError|pop from/);
  assert.ok(!/dsvp_/i.test(r.body.errorMessage), 'no server paths leak');
});

test('Python syntax error: compile_error with its line', py, async () => {
  const r = await run({ language: 'python', code: 'a = [1,\nb = 2\n', moduleSlug: 'heap' });
  assert.equal(r.body.status, 'compile_error');
  assert.ok(Number.isInteger(r.body.errorLine));
});

test('unsupported implementations get an explanation, not an empty success', py, async () => {
  const none = await run({ language: 'python', code: 'x = 1\nprint(x)\n', moduleSlug: 'heap' });
  assert.equal(none.body.status, 'unsupported_implementation');
  assert.match(none.body.errorMessage, /no array-based heap was observed/);
  assert.match(none.body.errorMessage, /left\/right pointers|linked nodes/i);
  assert.equal(none.body.events.length, 0);

  const big = await run({ language: 'python', code: 'import heapq\nh = list(range(300, 0, -1))\nheapq.heapify(h)\n', moduleSlug: 'heap' });
  assert.equal(big.body.status, 'unsupported_implementation');
  assert.match(big.body.errorMessage, /up to 256/);
});

test('Java run: events, size field, line of a runtime failure in the user\'s own numbering', java, async () => {
  const ok = await run({
    language: 'java', moduleSlug: 'heap',
    code: `public class Main {
    static int[] h = new int[8]; static int n = 0;
    static void add(int v) {
        h[n++] = v;
        int i = n - 1;
        while (i > 0 && h[i] < h[(i - 1) / 2]) { int p = (i - 1) / 2; int t = h[i]; h[i] = h[p]; h[p] = t; i = p; }
    }
    public static void main(String[] a) { add(5); add(2); add(7); System.out.println(h[0]); }
}
`,
  });
  assert.equal(ok.body.status, 'success', ok.body.errorMessage);
  assert.equal(ok.body.userOutput, '2');
  assert.equal(ok.body.heapInfo.sizeField, 'n');
  assert.ok(ok.body.events.some((e) => e.heapKind === 'swap'));

  const boom = await run({
    language: 'java', moduleSlug: 'heap',
    code: `public class Main {
    public static void main(String[] args) {
        int[] a = new int[2];
        a[0] = 1;
        a[1] = 2;
        a[2] = 3;
    }
}
`,
  });
  assert.equal(boom.body.status, 'runtime_error');
  assert.equal(boom.body.errorLine, 6);
  assert.match(boom.body.errorMessage, /ArrayIndexOutOfBounds/);

  const bad = await run({ language: 'java', moduleSlug: 'heap', code: 'public class Main {\n  public static void main(String[] a) {\n    int x = missing;\n  }\n}\n' });
  assert.equal(bad.body.status, 'compile_error');
  assert.equal(bad.body.errorLine, 3);
});

test('Java: PriorityQueue is explained as unsupported (its array is hidden)', java, async () => {
  const r = await run({
    language: 'java', moduleSlug: 'heap',
    code: 'import java.util.*;\npublic class Main { public static void main(String[] a) { PriorityQueue<Integer> q = new PriorityQueue<>(); q.add(2); q.add(1); System.out.println(q.poll()); } }\n',
  });
  assert.equal(r.body.status, 'unsupported_implementation');
  assert.match(r.body.errorMessage, /PriorityQueue/);
});

test('a client that disconnects mid-run does not leave its program running or its files behind', py, async () => {
  const count = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('dsvp_heap_py_')).length;
  const before = count();
  const ac = new AbortController();
  const base = `http://127.0.0.1:${new URL(process.env.__BASE || 'http://x').port}`; void base;
  const pending = fetch(w.baseUrl() + '/execution/run', {
    method: 'POST', signal: ac.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ language: 'python', moduleSlug: 'heap', code: 'import time\nwhile True:\n    time.sleep(0.01)\n' }),
  }).catch(() => 'aborted');
  await new Promise((r) => setTimeout(r, 800));
  ac.abort();
  assert.equal(await pending, 'aborted');
  // the server notices the closed connection, kills the child and removes its directory
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && count() > before) await new Promise((r) => setTimeout(r, 100));
  assert.equal(count(), before, 'temp directory removed after the client left');
});

test('other modules are untouched: a plain array run still uses the existing pipeline', py, async () => {
  const r = await run({ language: 'python', moduleSlug: 'array', code: 'a = [3, 1, 2]\na[0], a[1] = a[1], a[0]\nprint(a)\n' });
  assert.equal(r.body.status, 'success');
  assert.ok(r.body.events.length > 0);
  assert.ok(r.body.events.every((e) => e.type !== 'heap'));
  assert.equal(r.body.heapInfo, undefined);
});

test('a password-change-restricted session cannot execute code', py, async () => {
  const u = w.addUser({ MustChangePassword: true, TempPasswordExpiresAt: new Date(Date.now() + 60000) });
  const restricted = jwt.sign({ userId: u.UserId, tokenVersion: 1, mustChangePassword: true }, process.env.JWT_SECRET);
  const r = await run({ language: 'python', code: 'x=1', moduleSlug: 'heap' }, restricted);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'PASSWORD_CHANGE_REQUIRED');
});
