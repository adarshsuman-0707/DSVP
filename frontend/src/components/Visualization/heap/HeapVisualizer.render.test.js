/**
 * Render smoke tests for HeapVisualizer: the real component is loaded through
 * Vite's SSR loader and rendered to HTML for events produced by the real
 * backend reconstructor (from synthetic raw traces — no program is executed).
 * Verifies that the tree and the array show the same step, that every state
 * renders (empty / single / large / duplicates / error), and accessibility labels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const require = createRequire(import.meta.url);
const { buildHeapEvents } = require(path.resolve(root, '../backend/src/services/heap/heapReconstructor.js'));

let vite; let React; let renderToString; let HeapVisualizer;
test.before(async () => {
  vite = await createServer({
    root, logLevel: 'silent', appType: 'custom', server: { middlewareMode: true, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  HeapVisualizer = (await vite.ssrLoadModule('/src/components/Visualization/HeapVisualizer.jsx')).default;
  // react / react-dom are plain Node dependencies; the component under test gets the very same instances
  React = (await import('react')).default;
  ({ renderToString } = await import('react-dom/server'));
});
test.after(async () => { await vite.close(); });

const nw = (snap) => ({ op: 'hp_new', a: 1, k: 'list', snap, len: snap.length, line: 1 });
const rs = (k, i, v, snap) => ({ op: 'hp_rs', a: 1, k, i, v, snap, len: snap.length, line: 2 });
const set = (i, old, v, snap) => ({ op: 'hp_set', a: 1, i, old, v, snap, len: snap.length, line: 3 });
const cmp = (li, ri, lv, rv, r) => ({ op: 'hp_cmp', la: 1, li, ra: 1, ri, lv, rv, o: '<', r, line: 4 });

/** Build a min-heap by n inserts of the given values (each followed by its sift-up). */
function insertAll(values) {
  const raw = [nw([])];
  const arr = [];
  for (const v of values) {
    arr.push(v);
    raw.push(rs('append', arr.length - 1, v, arr.slice()));
    let i = arr.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      raw.push(cmp(i, p, arr[i], arr[p], arr[i] < arr[p]));
      if (!(arr[i] < arr[p])) break;
      const a = arr[i]; const b = arr[p];
      arr[i] = b; raw.push(set(i, a, b, arr.slice()));
      arr[p] = a; raw.push(set(p, b, a, arr.slice()));
      i = p;
    }
  }
  return buildHeapEvents(raw);
}

// React's server renderer separates adjacent text nodes with comment markers; drop them so text can be matched
const html = (props) => renderToString(React.createElement(HeapVisualizer, props)).replace(/<!-- -->/g, '');

test('renders the empty state without events (and the run error message)', () => {
  const a = html({ events: [], currentIndex: 0 });
  assert.match(a, /Run your heap program/);
  const b = html({ events: [], currentIndex: 0, runError: 'boom' });
  assert.match(b, /did not finish/);
});

test('tree and array show the same elements at every step', () => {
  const { events } = insertAll([5, 3, 8, 1, 3, -2, 0]);
  assert.ok(events.length > 10);
  for (let k = 0; k < events.length; k++) {
    const out = html({ events, currentIndex: k });
    // every <g role=listitem> (tree node) and every array cell is labelled "index i, value v"
    const items = [...out.matchAll(/aria-label="index (\d+), value ([^",]*)/g)].map((m) => `${m[1]}:${m[2]}`);
    const tree = items.slice(0, items.length / 2).sort();
    const arr = items.slice(items.length / 2).sort();
    assert.equal(items.length % 2, 0, `step ${k + 1}: nodes and cells come in pairs`);
    assert.deepEqual(tree, arr, `step ${k + 1}: tree nodes equal array cells`);
    const size = events[k].heapSize;
    assert.match(out, new RegExp(`size</span><b[^>]*>${size}</b>`));
    assert.match(out, new RegExp(`Step <b[^>]*>${k + 1}</b>`));
  }
});

test('the description, operation label and complexity table follow the observed step', () => {
  const { events } = insertAll([4, 2]);
  const swapStep = events.findIndex((e) => e.heapKind === 'swap');
  const out = html({ events, currentIndex: swapStep });
  assert.match(out, /Sift up/);
  assert.match(out, /Swapped index/);
  assert.match(out, /O\(log n\)/);
  assert.match(out, /Measured, this operation so far/);
  assert.match(out, /standard binary heap/);
});

test('duplicates render as distinct elements; negative, zero and tuple values render', () => {
  const { events } = insertAll([2, 2, 2, 0, -1, -1]);
  const out = html({ events, currentIndex: events.length - 1 });
  assert.ok((out.match(/value -1/g) || []).length >= 2);
  assert.ok((out.match(/value 2/g) || []).length >= 2);
  const tup = buildHeapEvents([nw([[1, 'a']]), rs('append', 1, [2, 'b'], [[1, 'a'], [2, 'b']])]);
  assert.match(html({ events: tup.events, currentIndex: tup.events.length - 1 }), /\(2, b\)|\(1, a\)/);
});

test('light theme, large heaps (256) and slots outside the heap all render', () => {
  const big = insertAll(Array.from({ length: 200 }, (_, i) => 200 - i));
  assert.equal(big.error, undefined);
  const t0 = Date.now();
  const dark = html({ events: big.events, currentIndex: big.events.length - 1, theme: 'dark' });
  const light = html({ events: big.events, currentIndex: big.events.length - 1, theme: 'light' });
  assert.ok(Date.now() - t0 < 4000, 'renders a 200-element heap quickly');
  assert.ok(dark.includes('Binary tree') && light.includes('Binary tree'));
  assert.notEqual(dark, light);
  // fixed-capacity array: slots beyond the heap size are marked as outside the heap
  const fixed = buildHeapEvents([
    { op: 'hp_sc', n: 'size', v: 0 }, nw([0, 0, 0, 0]),
    set(0, 0, 5, [5, 0, 0, 0]), { op: 'hp_sc', n: 'size', v: 1 },
  ]);
  const out = html({ events: fixed.events, currentIndex: fixed.events.length - 1, heapInfo: fixed.info });
  assert.match(out, /outside the heap/);
  assert.match(out, /integer field/);
});

test('accessibility: labelled regions, live description, keyboard-reachable tree, reduced motion', () => {
  const { events } = insertAll([3, 1]);
  const out = html({ events, currentIndex: 2 });
  assert.match(out, /aria-live="polite"/);
  assert.match(out, /tabindex="0"/);
  assert.match(out, /aria-label="Heap tree\./);
  assert.match(out, /aria-label="Heap array"/);
  assert.match(out, /aria-label="Zoom in \(\+\)"/);
  assert.match(out, /aria-label="Fit tree to screen"/);
  assert.match(out, /aria-label="Theoretical complexity/);
  assert.match(out, /prefers-reduced-motion: reduce/);
  // every node and cell announces its index, value and role in this step
  assert.match(out, /aria-label="index 1, value 1, inserted"/);
});

test('notes about how the heap was observed are shown (other lists, truncation, unknown order)', () => {
  const { events, info } = insertAll([1, 2]);
  const out = html({ events, currentIndex: 1, heapInfo: { ...info, ignoredArrays: 2, traceTruncated: true, order: 'unknown' } });
  assert.match(out, /2 other lists\/arrays were also touched/);
  assert.match(out, /cut at the event limit/);
});

test('program output is shown when provided', () => {
  const { events } = insertAll([1]);
  assert.match(html({ events, currentIndex: 0, userOutput: 'hello heap', language: 'python' }), /hello heap/);
});
