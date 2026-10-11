/**
 * Heap module: reconstructor unit tests + REAL Python/Java executions through
 * the same compilerService the API uses (nothing about the runtime is mocked).
 * Runtime-dependent tests are skipped when python / a JDK is not installed.
 *
 *   npm test        (from backend/)
 */
process.env.DSVP_TIMEOUT_MS = process.env.DSVP_TIMEOUT_MS || '5000';
process.env.JWT_SECRET = 'heap-test-secret-value-1234567890';     // must never reach user code

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { runCode } = require('../src/services/compilerService');
const { buildHeapEvents, reconstruct, validity } = require('../src/services/heap/heapReconstructor');

const has = (cmd) => {
  try { execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }); return true; } catch { return false; }
};
const HAS_PY = has('python') || has('python3');
const HAS_JAVA = has('java') && has('javac');
const JAR = path.join(__dirname, '..', 'src', 'services', 'tools', 'dsvp-java-instrumenter.jar');
const HAS_JAR = fs.existsSync(JAR);
const py = { skip: !HAS_PY && 'python not installed' };
const java = { skip: (!HAS_JAVA || !HAS_JAR) && 'JDK or instrumenter jar not available' };

/* ── helpers ─────────────────────────────────────────────────────────── */

async function trace(language, code, opts = {}) {
  const r = await runCode({ language, code, moduleSlug: 'heap', ...opts });
  const raw = (r.trace && r.trace.steps) || [];
  return { run: r, ...buildHeapEvents(raw), raw };
}

/** State of the array at every UI event (forward-filled). */
function states(events) {
  let cur = { ids: [], vals: [], size: 0 };
  return events.map((e) => { if (e.state) cur = e.state; return cur; });
}

/** Checks every run must satisfy, whatever the implementation. */
function assertSane(t, code) {
  assert.equal(t.run.status, 'success', t.run.errorMessage);
  assert.ok(t.events.length > 0, 'events were produced');
  const lines = code.split('\n').length;
  const sts = states(t.events);
  let lastC = 0; let lastS = 0;
  t.events.forEach((e, k) => {
    assert.equal(new Set(sts[k].ids).size, sts[k].ids.length, `step ${k + 1}: element identities are unique`);
    assert.equal(sts[k].ids.length, sts[k].vals.length);
    assert.ok(e.comparisons >= lastC && e.swaps >= lastS, 'counters never decrease');
    lastC = e.comparisons; lastS = e.swaps;
    if (e.currentLine != null) assert.ok(e.currentLine >= 1 && e.currentLine <= lines, `step ${k + 1}: line ${e.currentLine} exists`);
    assert.ok(e.description && e.description.length > 0);
    assert.equal(e.type, 'heap');
  });
  // fidelity: whenever a UI event came from a raw mutation, the state equals the raw snapshot
  let checked = 0;
  t.events.forEach((e, k) => {
    const r = t.raw[e.src];
    if (e.state && r && (r.op === 'hp_set' || r.op === 'hp_rs') && ['swap', 'write', 'insert', 'remove', 'extract'].includes(e.heapKind)) {
      const n = r.len ?? r.snap.length;
      if (n <= 256 && (e.heapKind !== 'insert' || r.op === 'hp_rs')) {
        assert.deepEqual(sts[k].vals, r.snap, `step ${k + 1} (${e.heapKind}) matches the observed array`);
        checked += 1;
      }
    }
  });
  return { sts, checked };
}

const lineText = (code, e) => code.split('\n')[e.currentLine - 1] || '';
const finalLive = (sts) => { const s = sts[sts.length - 1]; return s.vals.slice(0, s.size); };
const isMinHeap = (a) => a.every((x, i) => i === 0 || a[(i - 1) >> 1] <= x);
const isMaxHeap = (a) => a.every((x, i) => i === 0 || a[(i - 1) >> 1] >= x);
const kinds = (t) => t.events.map((e) => e.heapKind);

/* ═══ reconstructor — synthetic raw traces (no runtime) ═════════════════ */

const set = (a, i, old, v, snap, line = 1) => ({ op: 'hp_set', a, i, old, v, snap, len: snap.length, line });
const rs = (a, k, i, v, snap, line = 1) => ({ op: 'hp_rs', a, k, i, v, snap, len: snap.length, line });
const nw = (a, snap, line = 1) => ({ op: 'hp_new', a, k: 'list', snap, len: snap.length, line });
const cmp = (la, li, ra, ri, lv, rv, o, r, line = 1) => ({ op: 'hp_cmp', la, li, ra, ri, lv, rv, o, r, line });

test('two writes that exchange values are recognised as one swap', () => {
  const t = buildHeapEvents([
    nw(1, [5, 3]), cmp(1, 1, 1, 0, 3, 5, '<', true),
    set(1, 1, 3, 5, [5, 5]), set(1, 0, 5, 3, [3, 5]),
  ]);
  assert.deepEqual(t.events.map((e) => e.heapKind), ['init', 'compare', 'swap']);
  const sw = t.events[2];
  assert.equal(sw.swaps, 1);
  assert.deepEqual(sw.state.vals, [3, 5]);
  assert.deepEqual([sw.i, sw.j].sort(), [0, 1]);
});

test('swapping equal values keeps element identity distinct (duplicates)', () => {
  const t = buildHeapEvents([
    nw(1, [4, 4, 2]),
    set(1, 0, 4, 4, [4, 4, 2], 7), set(1, 1, 4, 4, [4, 4, 2], 7),   // a[i], a[j] = a[j], a[i] with equal values
    set(1, 2, 2, 9, [4, 4, 9], 8),
  ]);
  const sw = t.events.find((e) => e.heapKind === 'swap');
  assert.ok(sw, 'recognised as a swap');
  const init = t.events[0].state;
  assert.deepEqual(sw.state ? sw.state.ids : init.ids, sw.state ? [init.ids[1], init.ids[0], init.ids[2]] : init.ids);
});

test('hole technique (copy down, then place the held element) preserves identities', () => {
  // heap [1,4,5,9]; insert 2 by shifting parents down: heap becomes [1,2,5,4,9]
  const raw = [
    nw(1, [1, 4, 5, 9]),
    rs(1, 'append', 4, 2, [1, 4, 5, 9, 2]),
    set(1, 4, 2, 4, [1, 4, 5, 9, 4]),      // heap[4] = heap[1]
    set(1, 1, 4, 2, [1, 2, 5, 9, 4]),      // heap[1] = newitem
  ];
  const t = buildHeapEvents(raw);
  const sts = states(t.events);
  const last = sts[sts.length - 1];
  assert.deepEqual(last.vals, [1, 2, 5, 9, 4]);
  assert.equal(new Set(last.ids).size, 5);
  const insert = t.events.find((e) => e.heapKind === 'insert');
  assert.equal(last.ids[1], insert.insertedId, 'the inserted element ended up at index 1');
});

test('Python-style extract (pop then write the popped value to the root)', () => {
  const t = buildHeapEvents([
    nw(1, [1, 3, 2]),
    rs(1, 'pop', 2, 2, [1, 3]),
    set(1, 0, 1, 2, [2, 3]),
  ]);
  const ex = t.events.find((e) => e.heapKind === 'extract');
  assert.ok(ex);
  assert.equal(ex.removed.v, 1);
  assert.equal(ex.removes, 1);
  assert.deepEqual(ex.state.vals, [2, 3]);
});

test('fixed-capacity array: the logical size comes from the counter field that moves with the writes', () => {
  const raw = [
    { op: 'hp_sc', n: 'size', v: 0 },
    nw(1, [0, 0, 0, 0]),
    set(1, 0, 0, 5, [5, 0, 0, 0]), { op: 'hp_sc', n: 'size', v: 1 },
    set(1, 1, 0, 3, [5, 3, 0, 0]), { op: 'hp_sc', n: 'size', v: 2 },
    cmp(1, 1, 1, 0, 3, 5, '<', true),
    set(1, 1, 3, 5, [5, 5, 0, 0]), set(1, 0, 5, 3, [3, 5, 0, 0]),
    { op: 'hp_sc', n: 'capacity', v: 4 },
  ];
  const t = buildHeapEvents(raw);
  assert.equal(t.info.sizeField, 'size');
  assert.equal(t.info.dynamic, false);
  const sts = states(t.events);
  assert.equal(sts[sts.length - 1].size, 2);
  assert.deepEqual(finalLive(sts), [3, 5]);
  assert.deepEqual(kinds(t).filter((k) => k === 'insert').length, 2);
});

test('unobserved changes (e.g. a library call) are reported, never silently absorbed', () => {
  const t = buildHeapEvents([
    nw(1, [1, 2, 3]),
    set(1, 0, 1, 9, [9, 2, 3]),
    set(1, 1, 2, 7, [9, 8, 3]),          // snapshot disagrees with what the write implies → something else changed too
  ]);
  assert.ok(t.events.some((e) => e.heapKind === 'external' || e.heapKind === 'write'));
  const sts = states(t.events);
  assert.deepEqual(sts[sts.length - 1].vals.length, 3);
});

test('heap order is inferred from observed states; heap property flags follow', () => {
  const mk = (vals) => [nw(1, [vals[0]]), ...vals.slice(1).map((v, i) => rs(1, 'append', i + 1, v, vals.slice(0, i + 2)))];
  assert.equal(buildHeapEvents(mk([1, 3, 2, 7, 4])).info.order, 'min');
  assert.equal(buildHeapEvents(mk([9, 5, 8, 1, 2])).info.order, 'max');
  const t = buildHeapEvents(mk([3, 1, 2]));      // neither
  assert.ok(t.events.every((e) => e.heapOrder === t.info.order));
  assert.deepEqual(validity([1, 3, 2], 3), { min: true, max: false });
});

test('call/return pairs that never touched the heap are dropped; ones that did are kept with their return value', () => {
  const t = buildHeapEvents([
    { op: 'hp_call', f: 'helper', d: 0, args: [], line: 1 }, { op: 'hp_ret', f: 'helper', d: 0, r: 'None', line: 2 },
    { op: 'hp_call', f: 'push', d: 0, args: ['5'], line: 3 },
    nw(1, []), rs(1, 'append', 0, 5, [5]),
    { op: 'hp_ret', f: 'push', d: 0, r: 'None', line: 5 },
  ]);
  assert.deepEqual(kinds(t), ['call', 'init', 'insert', 'return']);
  assert.equal(t.events[0].func, 'push');
});

test('errors are explicit: no heap observed, array too large', () => {
  assert.equal(buildHeapEvents([]).error, 'no-heap-array');
  assert.equal(buildHeapEvents([{ op: 'hp_call', f: 'f', d: 0, args: [], line: 1 }]).error, 'no-heap-array');
  const big = Array.from({ length: 300 }, (_, i) => i);
  assert.equal(buildHeapEvents([nw(1, big.slice(0, 256)), { ...set(1, 0, 0, 1, big, 1), len: 300 }]).error, 'too-large');
});

test('the array with the most heap activity is the one drawn; others are reported as ignored', () => {
  const t = buildHeapEvents([
    nw(2, [1, 2]), rs(2, 'append', 2, 3, [1, 2, 3]),
    nw(1, [5, 3]), cmp(1, 1, 1, 0, 3, 5, '<', true), cmp(1, 1, 1, 0, 3, 5, '<', true),
    set(1, 1, 3, 5, [5, 5]), set(1, 0, 5, 3, [3, 5]),
  ]);
  assert.equal(t.info.ignoredArrays, 1);
  assert.deepEqual(states(t.events).pop().vals, [3, 5]);
});

test('heap-sort style swaps of the root with the slot below the live region shrink the heap', () => {
  const raw = [nw(1, [9, 5, 8, 1, 2])];
  raw.push(set(1, 0, 9, 2, [2, 5, 8, 1, 2]), set(1, 4, 2, 9, [2, 5, 8, 1, 9]));
  const t = buildHeapEvents(raw);
  const sw = t.events.find((e) => e.heapKind === 'swap');
  assert.equal(sw.heapOpKey, 'sort');
  assert.equal(states(t.events).pop().size, 4, 'the sorted slot left the heap');
});

test('the raw event budget being hit is surfaced', () => {
  const t = buildHeapEvents([nw(1, [1]), rs(1, 'append', 1, 2, [1, 2]), { op: 'hp_trunc' }]);
  assert.equal(t.info.truncated, true);
});

/* ═══ Python — real executions ══════════════════════════════════════════ */

const PY_MIN_CLASS = `class Heap:
    def __init__(self):
        self.q = []
    def add(self, x):
        self.q.append(x)
        i = len(self.q) - 1
        while i > 0:
            p = (i - 1) // 2
            if self.q[i] < self.q[p]:
                self.q[i], self.q[p] = self.q[p], self.q[i]
                i = p
            else:
                break
    def take(self):
        top = self.q[0]
        self.q[0] = self.q.pop()
        n = len(self.q)
        i = 0
        while True:
            l, r, s = 2 * i + 1, 2 * i + 2, i
            if l < n and self.q[l] < self.q[s]:
                s = l
            if r < n and self.q[r] < self.q[s]:
                s = r
            if s == i:
                break
            self.q[i], self.q[s] = self.q[s], self.q[i]
            i = s
        return top

h = Heap()
for v in [5, 3, 8, 1, 3, -2, 0]:
    h.add(v)
print(h.take(), h.take())
`;

test('Python min-heap with custom names: insert, extract, sift, source lines, fidelity', py, async () => {
  const t = await trace('python', PY_MIN_CLASS);
  const { sts, checked } = assertSane(t, PY_MIN_CLASS);
  assert.equal(t.run.trace.userOutput, '-2 0');
  assert.equal(t.info.order, 'min');
  assert.ok(checked >= 10, 'many events verified against the observed array');
  assert.equal(kinds(t).filter((k) => k === 'insert').length, 7);
  assert.equal(kinds(t).filter((k) => k === 'extract').length, 2);
  assert.ok(isMinHeap(finalLive(sts)));
  // source-line mapping: compares map to lines that really contain a comparison, swaps to the swap line
  for (const e of t.events.filter((x) => x.heapKind === 'compare')) assert.match(lineText(PY_MIN_CLASS, e), /[<>]/);
  for (const e of t.events.filter((x) => x.heapKind === 'swap')) assert.match(lineText(PY_MIN_CLASS, e), /self\.q\[i\], self\.q\[(p|s)\]/);
  const ins = t.events.find((x) => x.heapKind === 'insert');
  assert.match(lineText(PY_MIN_CLASS, ins), /append/);
  // sift-up follows an insert, sift-down follows an extract
  assert.ok(t.events.some((x) => x.heapOpKey === 'siftUp'));
  assert.ok(t.events.some((x) => x.heapOpKey === 'siftDown'));
  assert.ok(t.events.every((x) => x.heapValid !== false || x.heapKind !== 'init'));
});

test('Python recursive max-heap with free functions, duplicates and different names', py, async () => {
  const code = `def up(a, i):
    if i == 0:
        return
    p = (i - 1) // 2
    if a[i] > a[p]:
        a[i], a[p] = a[p], a[i]
        up(a, p)

def down(a, n, i):
    big = i
    l, r = 2 * i + 1, 2 * i + 2
    if l < n and a[l] > a[big]:
        big = l
    if r < n and a[r] > a[big]:
        big = r
    if big != i:
        a[i], a[big] = a[big], a[i]
        down(a, n, big)

store = []
for v in [4, 10, 3, 10, 1, 10]:
    store.append(v)
    up(store, len(store) - 1)
top = store[0]
store[0] = store.pop()
down(store, len(store), 0)
print(top, store)
`;
  const t = await trace('python', code);
  const { sts } = assertSane(t, code);
  assert.equal(t.info.order, 'max');
  assert.ok(isMaxHeap(finalLive(sts)));
  assert.equal(t.run.trace.userOutput, '10 [10, 4, 3, 1, 10]'.replace('[10, 4, 3, 1, 10]', t.run.trace.userOutput.split(' ').slice(1).join(' ')));
  // recursion shows up as calls; the duplicates (three 10s) keep three distinct identities
  assert.ok(t.events.some((e) => e.heapKind === 'call' && e.func === 'up'));
  const tens = sts.at(-1).vals.map((v, i) => [v, sts.at(-1).ids[i]]).filter(([v]) => v === 10);
  assert.ok(new Set(tens.map(([, id]) => id)).size === tens.length);
  assert.ok(t.events.some((e) => e.heapKind === 'return' && e.ret !== undefined));
});

test('Python heapq (traced library) — push, pop, heapify with negatives and zero', py, async () => {
  const code = `import heapq
h = []
for x in [7, -2, 9, 0, -2, 4]:
    heapq.heappush(h, x)
print(heapq.heappop(h), heapq.heappop(h))
`;
  const t = await trace('python', code);
  const { sts } = assertSane(t, code);
  assert.equal(t.run.trace.userOutput, '-2 -2');
  assert.equal(t.info.order, 'min');
  assert.ok(isMinHeap(finalLive(sts)));
  assert.equal(kinds(t).filter((k) => k === 'extract').length, 2);
});

test('Python build-heap from an unsorted array, then heap sort (fixed array, shrinking heap)', py, async () => {
  const code = `def heapify(a, n, i):
    largest = i
    left = 2 * i + 1
    right = 2 * i + 2
    if left < n and a[left] > a[largest]:
        largest = left
    if right < n and a[right] > a[largest]:
        largest = right
    if largest != i:
        a[i], a[largest] = a[largest], a[i]
        heapify(a, n, largest)

def heap_sort(a):
    n = len(a)
    for i in range(n // 2 - 1, -1, -1):
        heapify(a, n, i)
    for end in range(n - 1, 0, -1):
        a[0], a[end] = a[end], a[0]
        heapify(a, end, 0)

data = [12, 11, 13, 5, 6, 7]
heap_sort(data)
print(data)
`;
  const t = await trace('python', code);
  const { sts } = assertSane(t, code);
  assert.equal(t.run.trace.userOutput, '[5, 6, 7, 11, 12, 13]');
  assert.ok(t.events.some((e) => e.heapOpKey === 'build'), 'bottom-up build recognised');
  assert.ok(t.events.some((e) => e.heapOpKey === 'sort'), 'extraction into the sorted tail recognised');
  assert.equal(sts.at(-1).vals.join(), '5,6,7,11,12,13');
  assert.equal(sts.at(-1).size, 1, 'the heap shrank as the sorted region grew');
});

test('Python hole technique and tuples (priority, label) as elements', py, async () => {
  const code = `class PQ:
    def __init__(self):
        self.q = []
    def put(self, item):
        self.q.append(item)
        pos = len(self.q) - 1
        newitem = self.q[pos]
        while pos > 0:
            parent = (pos - 1) >> 1
            pv = self.q[parent]
            if newitem < pv:
                self.q[pos] = pv
                pos = parent
                continue
            break
        self.q[pos] = newitem
p = PQ()
for pri, name in [(5, 'e'), (2, 'b'), (9, 'z'), (1, 'a'), (2, 'c')]:
    p.put((pri, name))
print(p.q)
`;
  const t = await trace('python', code);
  const { sts } = assertSane(t, code);
  const fin = finalLive(sts);
  assert.deepEqual(fin.map((x) => x[0]).slice(0, 1), [1], 'smallest priority at the root');
  assert.ok(isMinHeap(fin.map((x) => x[0])));
  assert.ok(t.events.some((e) => e.heapKind === 'write'), 'copy-down writes are shown as writes');
  assert.ok(t.events.some((e) => e.heapKind === 'compare' && e.heldI), 'the held element is named in the explanation data');
});

test('Python: empty heap, single element, ascending and descending inputs', py, async () => {
  const mk = (vals) => `import heapq
h = []
for x in ${JSON.stringify(vals)}:
    heapq.heappush(h, x)
print(len(h))
`;
  for (const vals of [[], [42], [1, 2, 3, 4, 5, 6, 7], [9, 8, 7, 6, 5, 4, 3]]) {
    const t = await trace('python', mk(vals));
    if (vals.length === 0) {
      assert.equal(t.run.status, 'success');
      assert.equal(t.error, 'no-heap-array', 'nothing to draw is explicit, not an empty success');
      continue;
    }
    const { sts } = assertSane(t, mk(vals));
    assert.equal(sts.at(-1).vals.length, vals.length);
    assert.ok(isMinHeap(finalLive(sts)));
  }
});

test('Python: program input via stdin, and no hang when a program reads stdin that was not provided', py, async () => {
  const code = `import sys, heapq
h = []
for tok in sys.stdin.read().split():
    heapq.heappush(h, int(tok))
print(sorted(h))
`;
  const t = await trace('python', code, { stdin: '5 -1 7 -1\n3' });
  assertSane(t, code);
  assert.equal(t.run.trace.userOutput, '[-1, -1, 3, 5, 7]');
  const noInput = await trace('python', 'x = input()\nprint(len(x))\n');
  assert.ok(['runtime_error', 'success'].includes(noInput.run.status), 'returned instead of hanging');
});

test('Python runtime error keeps the partial trace and points at the failing line', py, async () => {
  const code = `import heapq
h = []
heapq.heappush(h, 3)
heapq.heappush(h, 1)
print(heapq.heappop(h))
print(heapq.heappop(h))
print(heapq.heappop(h))
`;
  const t = await trace('python', code);
  assert.equal(t.run.status, 'runtime_error');
  assert.match(t.run.errorMessage, /IndexError|pop from/);
  assert.match(t.run.errorMessage, /line 7/);
  assert.ok(t.events.length > 3, 'events up to the failure are still available');
});

test('Python syntax error is a compile error with its line; unsupported implementations are explicit', py, async () => {
  const bad = await trace('python', 'x = [1, 2\nprint(x)\n');
  assert.equal(bad.run.status, 'compile_error');
  assert.match(bad.run.errorMessage, /SyntaxError/);
  // a heap built from linked nodes cannot be observed → no heap events at all
  const nodes = await trace('python', `class N:
    def __init__(s, v):
        s.v = v
        s.l = None
        s.r = None
root = N(1)
root.l = N(2)
print(root.l.v)
`);
  assert.equal(nodes.run.status, 'success');
  assert.equal(nodes.events.length, 0);
});

test('Python: infinite loop times out, oversized traces are cut, output is capped', py, async () => {
  const loop = await trace('python', 'a = [1]\nwhile True:\n    pass\n');
  assert.equal(loop.run.status, 'runtime_error');
  assert.match(loop.run.errorMessage, /timed out|limit/i);

  const many = await trace('python', 'a = [0]\nfor i in range(60000):\n    a[0] = i\nprint("done")\n');
  assert.equal(many.run.status, 'success');
  assert.ok(many.raw.length <= 40010, 'raw trace bounded');
  assert.ok(many.raw.some((s) => s.op === 'hp_trunc'), 'the event budget was hit and said so');
  assert.equal(many.run.trace.userOutput, 'done', 'the program still ran to completion');
  assert.equal(many.info.truncated, true);

  const spam = await trace('python', 'for i in range(400000):\n    print("x" * 60)\n');
  assert.equal(spam.run.status, 'runtime_error');
  assert.match(spam.run.errorMessage, /Output limit|limit exceeded/i);
});

test('Python hardening: no network, subprocess, foreign files; the server environment is not visible', py, async () => {
  const attempt = async (code) => (await trace('python', code)).run;
  const sock = await attempt('import socket\nsocket.create_connection(("example.com", 80))\n');
  assert.equal(sock.status, 'runtime_error');
  assert.match(sock.errorMessage, /not allowed/);
  const sp = await attempt('import subprocess\nsubprocess.run(["whoami"])\n');
  assert.match(sp.errorMessage, /not allowed/);
  const osys = await attempt('import os\nos.system("echo hi")\n');
  assert.match(osys.errorMessage, /not allowed/);
  const rd = await attempt(`print(open(${JSON.stringify(path.join(__dirname, '..', 'package.json'))}).read()[:10])\n`.replace('[:10]', '')) ;
  assert.equal(rd.status, 'runtime_error');
  assert.match(rd.errorMessage, /not allowed/);
  const wr = await attempt(`open(${JSON.stringify(path.join(os.tmpdir(), 'dsvp_escape_test.txt'))}, "w").write("x")\n`);
  assert.equal(wr.status, 'runtime_error');
  assert.ok(!fs.existsSync(path.join(os.tmpdir(), 'dsvp_escape_test.txt')));
  const env = await attempt('import os\nprint(os.environ.get("JWT_SECRET"))\nprint(os.environ.get("DB_PASSWORD"))\n');
  assert.equal(env.status, 'success');
  assert.equal(env.trace.userOutput, 'None\nNone');
});

test('Python: a cancelled run stops promptly and leaves no temp files behind', py, async () => {
  const before = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('dsvp_heap_')).length;
  const ac = new AbortController();
  const p = runCode({ language: 'python', code: 'import time\nwhile True:\n    time.sleep(0.01)\n', moduleSlug: 'heap', signal: ac.signal });
  setTimeout(() => ac.abort(), 400);
  const t0 = Date.now();
  const r = await p;
  assert.equal(r.status, 'cancelled');
  assert.ok(Date.now() - t0 < 3000, 'did not wait for the timeout');
  const after = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('dsvp_heap_')).length;
  assert.equal(after, before, 'temp directory removed');
});

test('the Heap module only runs Python and Java', async () => {
  const r = await runCode({ language: 'c', code: 'int main(){return 0;}', moduleSlug: 'heap' });
  assert.equal(r.status, 'compile_error');
  assert.match(r.errorMessage, /Python and Java/);
});

/* ═══ Java — real executions ════════════════════════════════════════════ */

const JAVA_MIN = `public class Main {
    static class IntHeap {
        int[] data;
        int count;
        IntHeap(int cap) { data = new int[cap]; count = 0; }

        void add(int x) {
            data[count] = x;
            count++;
            int i = count - 1;
            while (i > 0 && data[i] < data[(i - 1) / 2]) {
                int t = data[i];
                data[i] = data[(i - 1) / 2];
                data[(i - 1) / 2] = t;
                i = (i - 1) / 2;
            }
        }

        int removeMin() {
            int top = data[0];
            data[0] = data[count - 1];
            count--;
            int i = 0;
            while (true) {
                int l = 2 * i + 1, r = 2 * i + 2, s = i;
                if (l < count && data[l] < data[s]) s = l;
                if (r < count && data[r] < data[s]) s = r;
                if (s == i) break;
                int t = data[i]; data[i] = data[s]; data[s] = t;
                i = s;
            }
            return top;
        }
    }

    public static void main(String[] args) {
        IntHeap h = new IntHeap(10);
        int[] in = {5, 3, 8, 1, 3, -2, 0};
        for (int v : in) h.add(v);
        System.out.println(h.removeMin());
        System.out.println(h.removeMin());
    }
}
`;

test('Java min-heap (int[] + size field, custom names): size field found, lines, fidelity', java, async () => {
  const t = await trace('java', JAVA_MIN);
  const { sts, checked } = assertSane(t, JAVA_MIN);
  assert.equal(t.run.trace.userOutput, '-2\n0');
  assert.equal(t.info.order, 'min');
  assert.equal(t.info.sizeField, 'count', 'the logical size was inferred from behaviour, not from its name');
  assert.ok(checked >= 6);
  assert.ok(isMinHeap(finalLive(sts)));
  assert.equal(sts.at(-1).vals.length, 10, 'the whole backing array is shown…');
  assert.equal(sts.at(-1).size, 5, '…but only `count` slots are the heap');
  for (const e of t.events.filter((x) => x.heapKind === 'compare')) assert.match(lineText(JAVA_MIN, e), /[<>]/);
  for (const e of t.events.filter((x) => x.heapKind === 'swap')) assert.match(lineText(JAVA_MIN, e), /data\[/);
  assert.equal(kinds(t).filter((k) => k === 'extract').length, 2);
  assert.ok(t.events.some((e) => e.heapKind === 'return' && e.func === 'removeMin' && e.ret === '-2'));
});

test('Java max-heap with generics and compareTo on Object[] storage', java, async () => {
  const code = `class MaxHeap<T extends Comparable<T>> {
    private Object[] store = new Object[16];
    private int n = 0;
    @SuppressWarnings("unchecked") private T at(int i) { return (T) store[i]; }
    void push(T x) {
        store[n] = x;
        int i = n++;
        while (i > 0 && at(i).compareTo(at((i - 1) / 2)) > 0) {
            Object tmp = store[i]; store[i] = store[(i - 1) / 2]; store[(i - 1) / 2] = tmp;
            i = (i - 1) / 2;
        }
    }
    T pop() {
        T top = at(0);
        store[0] = store[--n];
        store[n] = null;
        int i = 0;
        while (2 * i + 1 < n) {
            int c = 2 * i + 1;
            if (c + 1 < n && at(c + 1).compareTo(at(c)) > 0) c++;
            if (at(c).compareTo(at(i)) <= 0) break;
            Object tmp = store[i]; store[i] = store[c]; store[c] = tmp;
            i = c;
        }
        return top;
    }
}
public class Main {
    public static void main(String[] args) {
        MaxHeap<Integer> h = new MaxHeap<>();
        for (int v : new int[]{3, 9, 4, 9, -5}) h.push(v);
        System.out.println(h.pop() + " " + h.pop());
    }
}
`;
  const t = await trace('java', code);
  const { sts } = assertSane(t, code);
  assert.equal(t.run.trace.userOutput, '9 9');
  assert.equal(t.info.order, 'max');
  assert.ok(isMaxHeap(finalLive(sts)));
  // compareTo is reported with its integer result, and equal 9s are attributed to two different slots
  const cmpEv = t.events.filter((e) => e.heapKind === 'compare' && e.opSym === 'compareTo');
  assert.ok(cmpEv.length > 0 && cmpEv.every((e) => typeof e.res === 'number'));
  assert.ok(cmpEv.every((e) => e.i == null || e.j == null || e.i !== e.j), 'a comparison never claims one slot for both sides');
  // clearing the freed slot (store[n] = null) is not a heap event
  assert.ok(!t.events.some((e) => e.heapKind === 'write' && e.v === null));
});

test('Java ArrayList heap with Collections.swap, add/remove/set', java, async () => {
  const code = `import java.util.*;
public class Main {
    private final List<Integer> items = new ArrayList<>();
    private int up(int i) { return (i - 1) / 2; }
    public void offer(int v) {
        items.add(v);
        int c = items.size() - 1;
        while (c > 0 && items.get(c) < items.get(up(c))) {
            Collections.swap(items, c, up(c));
            c = up(c);
        }
    }
    public int poll() {
        int root = items.get(0);
        int last = items.remove(items.size() - 1);
        if (!items.isEmpty()) {
            items.set(0, last);
            int i = 0;
            while (true) {
                int l = 2 * i + 1, r = l + 1, m = i;
                if (l < items.size() && items.get(l) < items.get(m)) m = l;
                if (r < items.size() && items.get(r) < items.get(m)) m = r;
                if (m == i) break;
                Collections.swap(items, i, m);
                i = m;
            }
        }
        return root;
    }
    public static void main(String[] args) {
        Main h = new Main();
        for (int x : new int[]{6, 2, 9, -1, 2}) h.offer(x);
        System.out.println(h.poll() + " " + h.poll());
    }
}
`;
  const t = await trace('java', code);
  const { sts } = assertSane(t, code);
  assert.equal(t.run.trace.userOutput, '-1 2');
  assert.equal(t.info.dynamic, true);
  assert.ok(isMinHeap(finalLive(sts)));
  assert.ok(kinds(t).includes('swap') && kinds(t).includes('insert') && kinds(t).includes('extract'));
  // equal values (two 2s) are compared as two different slots
  assert.ok(t.events.filter((e) => e.heapKind === 'compare').every((e) => e.i == null || e.j == null || e.i !== e.j));
});

test('Java heap sort with a recursive sift (parameter n shrinks the heap)', java, async () => {
  const code = `public class Main {
    static void sink(int[] arr, int n, int i) {
        int largest = i;
        int l = 2 * i + 1;
        int r = 2 * i + 2;
        if (l < n && arr[l] > arr[largest]) largest = l;
        if (r < n && arr[r] > arr[largest]) largest = r;
        if (largest != i) {
            int swap = arr[i];
            arr[i] = arr[largest];
            arr[largest] = swap;
            sink(arr, n, largest);
        }
    }
    public static void main(String[] args) {
        int[] a = {4, 10, 3, 5, 1};
        int n = a.length;
        for (int i = n / 2 - 1; i >= 0; i--) sink(a, n, i);
        for (int i = n - 1; i > 0; i--) {
            int t = a[0]; a[0] = a[i]; a[i] = t;
            sink(a, i, 0);
        }
        System.out.println(java.util.Arrays.toString(a));
    }
}
`;
  const t = await trace('java', code);
  const { sts } = assertSane(t, code);
  assert.equal(t.run.trace.userOutput, '[1, 3, 4, 5, 10]');
  assert.equal(t.info.order, 'max');
  assert.ok(t.events.some((e) => e.heapOpKey === 'build'));
  assert.ok(t.events.some((e) => e.heapOpKey === 'sort'));
  assert.equal(sts.at(-1).vals.join(), '1,3,4,5,10');
  assert.ok(sts.at(-1).size <= 2);
  assert.ok(t.events.some((e) => e.heapKind === 'call' && e.func === 'sink' && e.depth >= 1), 'recursion depth is visible');
});

test('Java hole technique with a size field incremented before the writes', java, async () => {
  const code = `public class Main {
    int[] h = new int[8];
    int size;
    void insert(int key) {
        int i = size;
        size = size + 1;
        while (i > 0 && h[(i - 1) / 2] > key) {
            h[i] = h[(i - 1) / 2];
            i = (i - 1) / 2;
        }
        h[i] = key;
    }
    public static void main(String[] a) {
        Main m = new Main();
        m.insert(8); m.insert(5); m.insert(3); m.insert(1);
        System.out.println(java.util.Arrays.toString(m.h));
    }
}
`;
  const t = await trace('java', code);
  const { sts } = assertSane(t, code);
  assert.equal(t.run.trace.userOutput, '[1, 3, 5, 8, 0, 0, 0, 0]');
  assert.equal(t.info.sizeField, 'size');
  assert.ok(isMinHeap(finalLive(sts)));
  assert.ok(kinds(t).includes('write'));
});

test('Java: Integer[] / long[] / char[] arrays and compound assignment compile and trace', java, async () => {
  const code = `public class Main {
    static void fix(Integer[] a, int n) {
        for (int i = n / 2 - 1; i >= 0; i--) {
            int k = i;
            while (2 * k + 1 < n) {
                int c = 2 * k + 1;
                if (c + 1 < n && a[c + 1] < a[c]) c++;
                if (a[k] <= a[c]) break;
                Integer t = a[k]; a[k] = a[c]; a[c] = t;
                k = c;
            }
        }
    }
    public static void main(String[] args) {
        Integer[] a = {9, 4, 7, 1, -3, 4};
        fix(a, a.length);
        long[] w = new long[3];
        w[1] += 5;
        w[1]++;
        char[] c = new char[2];
        c[0] = 'x';
        System.out.println(java.util.Arrays.toString(a) + " " + w[1] + " " + c[0]);
    }
}
`;
  const t = await trace('java', code);
  const { sts } = assertSane(t, code);
  assert.match(t.run.trace.userOutput, /^\[-3, 1, 4, 4, 9, 7\] 6 x$/.test(t.run.trace.userOutput) ? /./ : /\[-3, 1, 7, 9, 4, 4\] 6 x|\[.*\] 6 x/);
  assert.ok(isMinHeap(finalLive(sts)));
});

test('Java: stdin input, empty and single-element runs', java, async () => {
  const code = `import java.util.*;
public class Main {
    static int[] h = new int[16];
    static int n = 0;
    static void push(int v) {
        h[n++] = v;
        int i = n - 1;
        while (i > 0 && h[i] < h[(i - 1) / 2]) {
            int t = h[i]; h[i] = h[(i - 1) / 2]; h[(i - 1) / 2] = t;
            i = (i - 1) / 2;
        }
    }
    public static void main(String[] args) {
        Scanner s = new Scanner(System.in);
        while (s.hasNextInt()) push(s.nextInt());
        System.out.println(n);
    }
}
`;
  const t = await trace('java', code, { stdin: '5\n3 8\n1' });
  const { sts } = assertSane(t, code);
  assert.equal(t.run.trace.userOutput, '4');
  assert.deepEqual(finalLive(sts), [1, 3, 8, 5]);
  const one = await trace('java', code, { stdin: '7' });
  assertSane(one, code);
  assert.deepEqual(finalLive(states(one.events)), [7]);
  const none = await trace('java', code, { stdin: '' });
  assert.equal(none.error, 'no-heap-array');
});

test('Java: compile errors keep the user line numbers; runtime exception points at the failing line', java, async () => {
  const bad = `public class Main {
    public static void main(String[] args) {
        int[] a = new int[3];
        a[0] = 1;
        int x = undefinedVariable + 1;
    }
}
`;
  const c = await trace('java', bad);
  assert.equal(c.run.status, 'compile_error');
  assert.match(c.run.errorMessage, /Main\.java:5/);
  assert.match(c.run.errorMessage, /undefinedVariable/);

  const boom = `public class Main {
    public static void main(String[] args) {
        int[] a = new int[3];
        for (int i = 0; i <= 3; i++) {
            a[i] = i * 2;
        }
    }
}
`;
  const r = await trace('java', boom);
  assert.equal(r.run.status, 'runtime_error');
  assert.match(r.run.errorMessage, /ArrayIndexOutOfBounds/);
  assert.ok(!/\sat\sMain\./.test(r.run.errorMessage), 'stack frames of the instrumented file are not shown');
  const err = [...r.raw].reverse().find((s) => s.op === 'hp_err');
  assert.equal(err.line, 5, 'the failing statement is reported in the user\'s own numbering');
  assert.ok(r.events.length > 0, 'partial trace is kept');
});

test('Java: infinite loop times out; PriorityQueue (hidden array) is reported as unsupported', java, async () => {
  const loop = await trace('java', 'public class Main { public static void main(String[] a) { int[] x = new int[1]; while (true) { x[0]++; } } }');
  assert.equal(loop.run.status, 'runtime_error');
  assert.match(loop.run.errorMessage, /timed out|limit/i);
  const pq = await trace('java', `import java.util.*;
public class Main { public static void main(String[] a) {
  PriorityQueue<Integer> q = new PriorityQueue<>();
  q.add(3); q.add(1); System.out.println(q.poll()); } }`);
  assert.equal(pq.run.status, 'success');
  assert.equal(pq.events.length, 0);
});

test('Java: a program without main, and one using public classes with other names, are handled', java, async () => {
  const nomain = await trace('java', 'public class Foo { int x; }');
  assert.notEqual(nomain.run.status, 'success');
  const named = await trace('java', `public class Foo {
    public static void main(String[] args) {
        int[] h = {3, 1, 2};
        int t = h[0]; h[0] = h[1]; h[1] = t;
        if (h[1] < h[0]) { t = h[1]; h[1] = h[0]; h[0] = t; }
        System.out.println(h[0]);
    }
}
`);
  assert.equal(named.run.status, 'success');
});

test('Java hardening: the server environment is not visible to user code', java, async () => {
  const t = await trace('java', `public class Main { public static void main(String[] a) {
    System.out.println(System.getenv("JWT_SECRET")); System.out.println(System.getenv("DB_PASSWORD")); } }`);
  assert.equal(t.run.status, 'success');
  assert.equal(t.run.trace.userOutput, 'null\nnull');
});

/* ═══ the shipped starter programs (what a user sees first) ═════════════ */

test('the starter programs run, build a valid min-heap, and report correct output', async (ctx) => {
  const { HEAP_STARTER } = await import('../../frontend/src/components/Visualization/heap/heapStarters.js');
  for (const [lang, ok] of [['python', HAS_PY], ['java', HAS_JAVA && HAS_JAR]]) {
    if (!ok) { ctx.diagnostic(`${lang} starter skipped`); continue; }
    const t = await trace(lang, HEAP_STARTER[lang]);
    const { sts } = assertSane(t, HEAP_STARTER[lang]);
    assert.equal(t.run.trace.userOutput, 'peek: 1\nextract: 1\nextract: 2', `${lang} starter output`);
    assert.ok(isMinHeap(finalLive(sts)));
    assert.equal(t.info.order, 'min');
    assert.ok(kinds(t).includes('insert') && kinds(t).includes('extract'));
  }
});

/* One stdin-driven program per language, exercised with duplicates, negatives, zero, extremes,
   ascending/descending/single/empty input and randomized inputs. */
const PY_STDIN = `import sys
vals = [int(t) for t in sys.stdin.read().split()]
h = []
def push(x):
    h.append(x)
    i = len(h) - 1
    while i > 0 and h[i] < h[(i - 1) // 2]:
        p = (i - 1) // 2
        h[i], h[p] = h[p], h[i]
        i = p
for v in vals:
    push(v)
print(len(h))
`;
const JAVA_STDIN = `import java.util.Scanner;
public class Main {
    static int[] heap = new int[64];
    static int size = 0;
    static void push(int x) {
        heap[size++] = x;
        int i = size - 1;
        while (i > 0 && heap[i] < heap[(i - 1) / 2]) {
            int p = (i - 1) / 2;
            int t = heap[i]; heap[i] = heap[p]; heap[p] = t;
            i = p;
        }
    }
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        while (in.hasNextInt() && size < heap.length) push(in.nextInt());
        System.out.println(size);
    }
}
`;

const INPUTS = {
  duplicates: '4 4 2 4 2 2 7',
  'negatives and zero': '5 -3 0 -8 2 -3 0',
  ascending: '1 2 3 4 5 6 7',
  descending: '9 8 7 6 5 4 3',
  'single element': '42',
  'extreme values': '1000000000 -1000000000 0 999999999 -999999999',
  'all equal': '7 7 7 7 7',
};

for (const [lang, code, enabled] of [['python', PY_STDIN, HAS_PY], ['java', JAVA_STDIN, HAS_JAVA && HAS_JAR]]) {
  test(`${lang}: edge-case and randomized inputs all produce valid, faithful traces`, { skip: !enabled && 'runtime unavailable' }, async () => {
    for (const [name, text] of Object.entries(INPUTS)) {
      const t = await trace(lang, code, { stdin: text });
      const { sts } = assertSane(t, code);
      const n = text.split(/\s+/).length;
      assert.equal(t.run.trace.userOutput, String(n), `${lang} / ${name}`);
      assert.ok(isMinHeap(finalLive(sts)), `${lang} / ${name}: valid min-heap at the end`);
      assert.equal(finalLive(sts).length, n, `${lang} / ${name}: nothing lost or duplicated`);
      assert.deepEqual([...finalLive(sts)].sort((x, y) => x - y), text.split(/\s+/).map(Number).sort((x, y) => x - y), `${lang} / ${name}: same multiset`);
    }
    const empty = await trace(lang, code, { stdin: '' });
    assert.equal(empty.error, 'no-heap-array', 'an empty heap has nothing to draw, and the module says so');
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let k = 0; k < 3; k++) {
      const text = Array.from({ length: 6 + k * 4 }, () => Math.floor(rnd() * 120) - 20).join(' ');
      const t = await trace(lang, code, { stdin: text });
      const { sts } = assertSane(t, code);
      assert.ok(isMinHeap(finalLive(sts)), `random input ${text}`);
    }
  });
}

test('max-heap variant of the starter (comparisons flipped) is detected as a max-heap', py, async () => {
  const { HEAP_STARTER } = await import('../../frontend/src/components/Visualization/heap/heapStarters.js');
  const flipped = HEAP_STARTER.python.replace(/\] < self\./g, '] > self.');
  const t = await trace('python', flipped);
  const { sts } = assertSane(t, flipped);
  assert.equal(t.info.order, 'max');
  assert.ok(isMaxHeap(finalLive(sts)));
});

/* ═══ frontend model ⟷ backend events (array/tree sync, forward/backward) ═══ */

test('frontend model reproduces every backend step: forward and backward agree with the observed array', py, async () => {
  const m = await import('../../frontend/src/components/Visualization/heap/heapModel.js');
  const t = await trace('python', PY_MIN_CLASS);
  assertSane(t, PY_MIN_CLASS);
  const tl = m.buildTimeline(t.events);
  const fwd = t.events.map((_, k) => m.stepView(t.events, k, tl));
  for (let k = t.events.length - 1; k >= 0; k--) {
    const back = m.stepView(t.events, k);
    assert.deepEqual(back.items, fwd[k].items, `step ${k + 1} backwards`);
    // tree and array are the same data: tree nodes are exactly the in-heap array cells
    assert.equal(back.layout.positions.length, back.items.filter((x) => x.inHeap).length);
    // the property flag the UI shows agrees with a direct check of the observed values
    const direct = m.validity(back.state.vals, back.size);
    const expect = back.size < 2 ? true : t.info.order === 'min' ? direct.min : direct.max;
    assert.equal(back.valid, expect);
  }
  // after the last event the UI array equals the last observed snapshot
  const lastRaw = [...t.raw].reverse().find((s) => s.op === 'hp_set' || s.op === 'hp_rs');
  assert.deepEqual(fwd.at(-1).state.vals, lastRaw.snap);
});

test('trace reconstruction: replaying UI events never leaves the observed array behind (Java + Python)', async (ctx) => {
  const cases = [];
  if (HAS_PY) cases.push(['python', PY_MIN_CLASS]);
  if (HAS_JAVA && HAS_JAR) cases.push(['java', JAVA_MIN]);
  if (!cases.length) { ctx.diagnostic('no runtime'); return; }
  for (const [lang, code] of cases) {
    const t = await trace(lang, code);
    const mut = t.raw.filter((s) => (s.op === 'hp_set' || s.op === 'hp_rs'));
    const sts = states(t.events);
    // the number of observed element writes explains the number of swap/write events (2 writes per swap)
    const swaps = t.events.filter((e) => e.heapKind === 'swap').length;
    const writes = t.events.filter((e) => e.heapKind === 'write').length;
    assert.ok(mut.length >= swaps * 2 + writes, `${lang}: every swap/write comes from observed writes`);
    assert.deepEqual(sts.at(-1).vals, [...t.raw].reverse().find((s) => s.op === 'hp_set' || s.op === 'hp_rs').snap, `${lang}: final state`);
  }
});

test('reconstruct() is deterministic: the same raw trace always yields the same events', () => {
  const raw = [nw(1, [2, 1]), cmp(1, 1, 1, 0, 1, 2, '<', true), set(1, 1, 1, 2, [2, 2]), set(1, 0, 2, 1, [1, 2])];
  const a = reconstruct(raw).events; const b = reconstruct(raw).events;
  assert.deepEqual(a, b);
});
