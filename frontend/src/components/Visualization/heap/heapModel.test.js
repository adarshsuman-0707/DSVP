import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTimeline, stepView, layoutHeap, rolesFor, validity, measuredSince, complexityKeyFor,
  parentOf, leftOf, rightOf, heightOf, cmpVal, summarize, formatValue, COMPLEXITY,
} from './heapModel.js';

const st = (vals, size = vals.length, ids = vals.map((_, i) => i + 1)) => ({ ids, vals, size });
const ev = (kind, extra = {}) => ({ heapKind: kind, heapOrder: 'min', comparisons: 0, swaps: 0, ...extra });

test('index arithmetic matches the zero-indexed binary heap formulas', () => {
  assert.equal(parentOf(0), -1);
  for (let i = 1; i < 200; i++) assert.equal(parentOf(i), Math.floor((i - 1) / 2));
  for (let i = 0; i < 100; i++) {
    assert.equal(leftOf(i), 2 * i + 1);
    assert.equal(rightOf(i), 2 * i + 2);
    assert.equal(parentOf(leftOf(i)), i);
    assert.equal(parentOf(rightOf(i)), i);
  }
  assert.deepEqual([0, 1, 2, 3, 4, 7, 8, 15, 16].map(heightOf), [0, 1, 2, 2, 3, 3, 4, 4, 5]);
});

test('timeline forward-fills state: every step has the array as it was at that step', () => {
  const events = [
    ev('call'), ev('init', { state: st([]) }), ev('insert', { state: st([5]) }),
    ev('compare'), ev('insert', { state: st([5, 3]) }), ev('swap', { state: st([3, 5]) }), ev('return'),
  ];
  const tl = buildTimeline(events);
  assert.deepEqual(tl.map((s) => s.vals), [[], [], [5], [5], [5, 3], [3, 5], [3, 5]]);
});

test('stepping backwards restores the true earlier state (not a reversed animation)', () => {
  const events = [ev('init', { state: st([]) }), ev('insert', { state: st([4]) }), ev('insert', { state: st([4, 9]) }),
    ev('insert', { state: st([4, 9, 2]) }), ev('swap', { state: st([2, 9, 4]) })];
  const tl = buildTimeline(events);
  const forward = events.map((_, k) => stepView(events, k, tl));
  for (let k = events.length - 1; k >= 0; k--) {
    const back = stepView(events, k, tl);
    assert.deepEqual(back.items, forward[k].items);
    assert.equal(back.size, forward[k].size);
  }
  // without a precomputed timeline the answer is identical
  assert.deepEqual(stepView(events, 2).items, forward[2].items);
});

test('identity keys stay stable across a swap, even with equal values', () => {
  const a = st([7, 7, 3], 3, [10, 11, 12]);
  const b = st([7, 7, 3].slice(), 3, [11, 10, 12]);        // the two 7s traded places
  const events = [ev('init', { state: a }), ev('swap', { state: b, i: 0, j: 1 })];
  const v0 = stepView(events, 0); const v1 = stepView(events, 1);
  assert.deepEqual(v0.items.map((x) => x.id), [10, 11, 12]);
  assert.deepEqual(v1.items.map((x) => x.id), [11, 10, 12]);
  assert.equal(new Set(v1.items.map((x) => x.id)).size, 3);
});

test('slots beyond the heap size are reported as outside the heap', () => {
  const events = [ev('init', { state: st([1, 2, 3, 0, 0], 3) })];
  const v = stepView(events, 0);
  assert.deepEqual(v.items.map((x) => x.inHeap), [true, true, true, false, false]);
  assert.equal(v.size, 3);
  assert.equal(v.layout.positions.length, 3);
});

test('empty, single-element and full heaps lay out correctly', () => {
  assert.equal(layoutHeap(0).positions.length, 0);
  const one = layoutHeap(1);
  assert.deepEqual(one.positions, [{ slot: 0, depth: 0 }]);
  assert.equal(one.levels, 1);
  const full = layoutHeap(15);
  assert.equal(full.levels, 4);
  assert.equal(full.positions[0].depth, 0);
  assert.equal(full.positions[14].depth, 3);
});

test('layout: unique slots, children one level below parents, left of root < root < right', () => {
  for (const n of [2, 3, 7, 10, 31, 100, 256]) {
    const { positions, slots } = layoutHeap(n);
    assert.equal(new Set(positions.map((p) => p.slot)).size, n, `n=${n} slots unique`);
    assert.equal(slots, n);
    for (let i = 1; i < n; i++) {
      assert.equal(positions[i].depth, positions[parentOf(i)].depth + 1);
      if (i === leftOf(parentOf(i))) assert.ok(positions[i].slot < positions[parentOf(i)].slot);
      else assert.ok(positions[i].slot > positions[parentOf(i)].slot);
    }
  }
});

test('heap property validation for min, max, duplicates and partial states', () => {
  assert.deepEqual(validity([1, 3, 2, 7, 4], 5), { min: true, max: false });
  assert.deepEqual(validity([9, 5, 8, 1, 2], 5), { min: false, max: true });
  assert.deepEqual(validity([2, 2, 2], 3), { min: true, max: true });
  assert.deepEqual(validity([5, 1, 9, 0], 2), { min: false, max: true });   // only the first two count
  assert.deepEqual(validity([2, 3, 1], 3), { min: false, max: false });
  assert.deepEqual(validity([], 0), { min: true, max: true });
  assert.deepEqual(validity([42], 1), { min: true, max: true });
  assert.deepEqual(validity([-5, -1, 0, 3], 4), { min: true, max: false });
});

test('values of every kind order consistently', () => {
  assert.ok(cmpVal(1, 2) < 0 && cmpVal(2, 1) > 0 && cmpVal(2, 2) === 0);
  assert.ok(cmpVal([1, 'b'], [1, 'c']) < 0);
  assert.ok(cmpVal('a', 'b') < 0);
  assert.equal(formatValue([3, 'x']), '(3, x)');
  assert.equal(formatValue(null), 'null');
});

test('roles describe the observed step: compare, swap, insert, extract, remove', () => {
  const cmp = rolesFor(ev('compare', { i: 4, j: 1 }), 7);
  assert.ok(cmp.get(4).has('current') && cmp.get(1).has('other'));
  assert.ok(cmp.get(1).has('parent'));                 // parent of 4 is 1
  const swap = rolesFor(ev('swap', { i: 2, j: 0 }), 5);
  assert.ok(swap.get(2).has('swap') && swap.get(0).has('swap'));
  assert.ok(rolesFor(ev('insert', { i: 3 }), 4).get(3).has('inserted'));
  const ex = rolesFor(ev('extract', { movedFrom: 5 }), 5);
  assert.ok(ex.get(0).has('moved'));
  assert.ok(rolesFor(ev('remove', { i: 6 }), 6).get(6).has('removed'));
  assert.equal(rolesFor(ev('call'), 3).size, 0);
  // children beyond the heap size are never highlighted
  const small = rolesFor(ev('compare', { i: 0, j: null }), 2);
  assert.ok(small.get(1).has('left'));
  assert.ok(!small.has(2));
});

test('measured work counts since the last insert/extract; theory is mapped by operation', () => {
  const events = [ev('init'), ev('insert'), ev('compare'), ev('swap'), ev('compare'), ev('extract'), ev('compare'), ev('compare'), ev('swap')];
  assert.deepEqual(measuredSince(events, 4), { comparisons: 2, swaps: 1, writes: 0, from: 1 });
  assert.deepEqual(measuredSince(events, 8), { comparisons: 2, swaps: 1, writes: 0, from: 5 });
  assert.equal(complexityKeyFor('insert'), 'insert');
  assert.equal(complexityKeyFor('siftUp'), 'insert');
  assert.equal(complexityKeyFor('siftDown'), 'extract');
  assert.equal(complexityKeyFor('build'), 'build');
  assert.equal(complexityKeyFor('other'), null);
  const costs = Object.fromEntries(COMPLEXITY.map((r) => [r.key, r.cost]));
  assert.deepEqual(costs, { peek: 'O(1)', insert: 'O(log n)', extract: 'O(log n)', build: 'O(n)', search: 'O(n)', sort: 'O(n log n)' });
});

test('stepView on no events is a safe empty view; summaries are readable', () => {
  const v = stepView([], 0);
  assert.equal(v.size, 0);
  assert.equal(v.event, null);
  assert.equal(summarize(v), 'No heap yet.');
  const events = [ev('init', { state: st([1, 5, 2]) })];
  assert.match(summarize(stepView(events, 0)), /Heap of 3 elements: 1, 5, 2\. Root 1\./);
  // out-of-range index clamps instead of throwing
  assert.equal(stepView(events, 99).index, 0);
  assert.equal(stepView(events, -4).index, 0);
});
