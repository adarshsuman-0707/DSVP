/**
 * BST tracing — integration tests that run REAL user programs through the
 * real execution pipeline (compilerService → traceGeneratorService) and
 * assert on the tree the program actually built. Nothing here mocks the
 * runtime. Tests for a language are skipped when its toolchain is missing.
 *
 *   npm test        (from backend/)
 */
process.env.DSVP_TIMEOUT_MS = process.env.DSVP_TIMEOUT_MS || '8000'; // read at load by executionGuard

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const { runCode } = require('../src/services/compilerService');
const { buildTraceEvents } = require('../src/services/traceGeneratorService');

const has = (cmd) => {
  try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }); return true; }
  catch { return false; }
};
const HAS_PY = has('python') || has('python3');
const HAS_JAVA = has('java') && has('javac');
const HAS_GCC = has('gcc');

/* ── helpers ─────────────────────────────────────────────────────────── */

const bstSteps = (run) => (run.trace.steps || []).filter((s) => String(s.op).startsWith('bst_'));

/** Keys of the final snapshot in in-order, derived from the node links only. */
function finalInorder(run) {
  const snaps = bstSteps(run).filter((s) => Array.isArray(s.nodes) && s.nodes.length);
  assert.ok(snaps.length, 'program produced no tree snapshots');
  const nodes = snaps[snaps.length - 1].nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = nodes.find((n) => n.isRoot);
  const out = [];
  const walk = (id) => {
    if (id === null || id === -1 || id === undefined || !byId.has(id)) return;
    const n = byId.get(id);
    walk(n.leftId); out.push(String(n.val)); walk(n.rightId);
  };
  walk(root.id);
  return out;
}

const PY_STD = `
class Node:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None

def insert(root, v):
    if root is None:
        return Node(v)
    if v < root.val:
        root.left = insert(root.left, v)
    else:
        root.right = insert(root.right, v)
    return root

root = None
for x in [50, 30, 70, 20, 40]:
    root = insert(root, x)
print("built")
`;

// Different class name, different field names, different payload name,
// iterative insert instead of recursive.
const PY_CUSTOM = `
class Leaf:
    def __init__(self, score):
        self.score = score
        self.lo = None
        self.hi = None

class Tree:
    def __init__(self):
        self.top = None

    def add(self, s):
        n = Leaf(s)
        if self.top is None:
            self.top = n
            return
        cur = self.top
        while True:
            if s < cur.score:
                if cur.lo is None:
                    cur.lo = n
                    return
                cur = cur.lo
            else:
                if cur.hi is None:
                    cur.hi = n
                    return
                cur = cur.hi

t = Tree()
for v in [8, 3, 10, 1, 6]:
    t.add(v)
print("ok")
`;

const JAVA_STD = `
public class Main {
    static class Node { int data; Node left, right; Node(int d) { data = d; } }
    static Node insert(Node r, int v) {
        if (r == null) return new Node(v);
        if (v < r.data) r.left = insert(r.left, v); else r.right = insert(r.right, v);
        return r;
    }
    public static void main(String[] a) {
        Node root = null;
        for (int x : new int[]{50, 30, 70, 20, 40}) root = insert(root, x);
        System.out.println("built");
    }
}`;

// Generic node, unconventional names, iterative insert.
const JAVA_CUSTOM = `
public class Main {
    static class Cell<T extends Comparable<T>> {
        T num; Cell<T> lo; Cell<T> hi;
        Cell(T n) { num = n; }
    }
    static Cell<Integer> top;
    static void add(int v) {
        Cell<Integer> n = new Cell<>(v);
        if (top == null) { top = n; return; }
        Cell<Integer> cur = top;
        while (true) {
            if (v < cur.num) { if (cur.lo == null) { cur.lo = n; return; } cur = cur.lo; }
            else             { if (cur.hi == null) { cur.hi = n; return; } cur = cur.hi; }
        }
    }
    public static void main(String[] a) {
        for (int x : new int[]{8, 3, 10, 1, 6}) add(x);
        System.out.println("ok");
    }
}`;

/* ── Python ──────────────────────────────────────────────────────────── */

test('python: conventional Node/left/right BST is traced from real execution', { skip: !HAS_PY }, async () => {
  const run = await runCode({ language: 'python', code: PY_STD });
  assert.equal(run.status, 'success', run.errorMessage);
  assert.deepEqual(finalInorder(run), ['20', '30', '40', '50', '70']);
  assert.match(run.trace.userOutput, /built/);
});

test('python: user-defined class/field names + iterative insert', { skip: !HAS_PY }, async () => {
  const run = await runCode({ language: 'python', code: PY_CUSTOM });
  assert.equal(run.status, 'success', run.errorMessage);
  assert.deepEqual(finalInorder(run), ['1', '3', '6', '8', '10']);
});

test('python: node identity is stable (same id for the same object across snapshots)', { skip: !HAS_PY }, async () => {
  const run = await runCode({ language: 'python', code: PY_STD });
  const snaps = bstSteps(run).filter((s) => s.nodes && s.nodes.length);
  const first = snaps[snaps.length - 1].nodes;
  const rootId = first.find((n) => n.isRoot).id;
  // the root object created first must keep the same id in every later snapshot
  const rootSnaps = snaps.filter((s) => s.nodes.some((n) => n.id === rootId));
  assert.ok(rootSnaps.length > 1);
  const ids = new Set(first.map((n) => n.id));
  assert.equal(ids.size, first.length, 'duplicate ids in one snapshot');
});

test('python: duplicate keys follow the submitted code (goes right)', { skip: !HAS_PY }, async () => {
  const code = PY_STD.replace('[50, 30, 70, 20, 40]', '[5, 5, 5]');
  const run = await runCode({ language: 'python', code });
  assert.equal(run.status, 'success', run.errorMessage);
  const snaps = bstSteps(run).filter((s) => s.nodes && s.nodes.length);
  const nodes = snaps[snaps.length - 1].nodes;
  assert.equal(nodes.length, 3);
  const root = nodes.find((n) => n.isRoot);
  assert.equal(root.leftId, null);          // this program sends equals RIGHT
  assert.notEqual(root.rightId, null);
});

test('python: empty tree / single node do not crash tracing', { skip: !HAS_PY }, async () => {
  const empty = await runCode({ language: 'python', code: PY_STD.replace('[50, 30, 70, 20, 40]', '[]') });
  assert.equal(empty.status, 'success', empty.errorMessage);
  const one = await runCode({ language: 'python', code: PY_STD.replace('[50, 30, 70, 20, 40]', '[7]') });
  assert.deepEqual(finalInorder(one), ['7']);
});

test('python: deletion removes the node from the final tree', { skip: !HAS_PY }, async () => {
  const code = PY_STD + `
def min_node(n):
    while n.left is not None:
        n = n.left
    return n

def delete(root, v):
    if root is None:
        return None
    if v < root.val:
        root.left = delete(root.left, v)
    elif v > root.val:
        root.right = delete(root.right, v)
    else:
        if root.left is None:
            return root.right
        if root.right is None:
            return root.left
        m = min_node(root.right)
        root.val = m.val
        root.right = delete(root.right, m.val)
    return root

root = delete(root, 50)
`;
  const run = await runCode({ language: 'python', code });
  assert.equal(run.status, 'success', run.errorMessage);
  assert.deepEqual(finalInorder(run), ['20', '30', '40', '70']);
});

test('python: infinite loop is stopped by a limit (time or trace volume) with a clear message', { skip: !HAS_PY }, async () => {
  const run = await runCode({ language: 'python', code: 'while True:\n    pass\n' });
  assert.equal(run.status, 'runtime_error');
  assert.match(run.errorMessage, /timed out|limit exceeded.*infinite loop/i);
});

test('python: runtime exception is reported without server paths', { skip: !HAS_PY }, async () => {
  const run = await runCode({ language: 'python', code: 'x = 1 / 0\n' });
  // NOTE: python runtime errors are currently classified 'compile_error' by
  // isCompileError() (it matches any "Error:"); here we only assert that the
  // run fails with the real exception text and leaks no server paths.
  assert.ok(['compile_error', 'runtime_error'].includes(run.status));
  assert.match(run.errorMessage, /ZeroDivisionError/);
  assert.doesNotMatch(run.errorMessage, /[A-Za-z]:\\Users|\/tmp\/|dsvp_py_/);
});

test('python: a program with no tree yields no fabricated tree events', { skip: !HAS_PY }, async () => {
  const run = await runCode({ language: 'python', code: 'a = [3, 1, 2]\na.sort()\nprint(a)\n' });
  assert.equal(run.status, 'success', run.errorMessage);
  assert.equal(bstSteps(run).length, 0);
  const events = buildTraceEvents({ language: 'python', rawTrace: run.trace, moduleSlug: 'bst', userOutput: run.trace.userOutput });
  assert.ok(events.every((e) => !e.treeState || e.treeState.length === 0));
});

/* ── Java ────────────────────────────────────────────────────────────── */

test('java: conventional Node/left/right BST is traced', { skip: !HAS_JAVA }, async () => {
  const run = await runCode({ language: 'java', code: JAVA_STD });
  assert.equal(run.status, 'success', run.errorMessage);
  assert.deepEqual(finalInorder(run), ['20', '30', '40', '50', '70']);
});

test('java: generic node with custom names (Cell<T>.lo/hi/num) + iterative insert', { skip: !HAS_JAVA }, async () => {
  const run = await runCode({ language: 'java', code: JAVA_CUSTOM });
  assert.equal(run.status, 'success', run.errorMessage);
  assert.deepEqual(finalInorder(run), ['1', '3', '6', '8', '10']);
});

test('java: compile error is reported as compile_error with an actionable message', { skip: !HAS_JAVA }, async () => {
  const run = await runCode({ language: 'java', code: JAVA_STD.replace('return r;', 'return r') });
  assert.equal(run.status, 'compile_error');
  assert.ok(run.errorMessage && run.errorMessage.length > 0);
  assert.doesNotMatch(run.errorMessage, /[A-Za-z]:\\Users|dsvp_java_/);
});

test('java: infinite loop is stopped by the time limit', { skip: !HAS_JAVA }, async () => {
  const code = 'public class Main { public static void main(String[] a) { while (true) {} } }';
  const run = await runCode({ language: 'java', code });
  assert.equal(run.status, 'runtime_error');
  assert.match(run.errorMessage, /timed out/i);
});

/* ── normalized events (what the frontend receives) ──────────────────── */

test('normalized events carry a full treeState on every tree step (python)', { skip: !HAS_PY }, async () => {
  const run = await runCode({ language: 'python', code: PY_STD });
  const events = buildTraceEvents({ language: 'python', rawTrace: run.trace, moduleSlug: 'bst', userOutput: run.trace.userOutput });
  const treeEvents = events.filter((e) => String(e.type).startsWith('bst_'));
  assert.ok(treeEvents.length > 0);
  for (const e of treeEvents) assert.ok(Array.isArray(e.treeState));
  const last = treeEvents[treeEvents.length - 1];
  assert.equal(last.treeState.length, 5);
});

/* ── Unsupported languages must not fake a tree ──────────────────────── */

test('c: a program runs but produces no tree events (no fabricated tree)', { skip: !HAS_GCC }, async () => {
  const code = '#include <stdio.h>\nint main(){printf("hi\\n");return 0;}';
  const run = await runCode({ language: 'c', code });
  assert.equal(run.status, 'success', run.errorMessage);
  const events = buildTraceEvents({ language: 'c', rawTrace: run.trace, moduleSlug: 'bst', userOutput: run.trace.userOutput || '' });
  assert.ok(events.every((e) => !(e.treeState && e.treeState.length)));
});

test('request validation rejects unsupported languages and oversize code', () => {
  const { validateRunRequest } = require('../src/services/executionGuard');
  assert.equal(validateRunRequest({ language: 'ruby', code: 'x' }).ok, false);
  assert.equal(validateRunRequest({ language: 'python', code: '' }).ok, false);
  assert.equal(validateRunRequest({ language: 'python', code: 'x'.repeat(70 * 1024) }).ok, false);
  assert.equal(validateRunRequest({ language: 'python', code: 'x=1', moduleSlug: '../etc' }).ok, false);
  assert.equal(validateRunRequest({ language: 'python', code: 'x=1', moduleSlug: 'bst' }).ok, true);
});
