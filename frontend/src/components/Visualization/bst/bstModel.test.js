import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTree, layoutTree, diffTrees, buildStepView, operationPath,
  compareKeys, hasAnyTree,
} from './bstModel.js';

/* ── builders ─────────────────────────────────────────────────────────── */
const n = (id, val, leftId = -1, rightId = -1, isRoot = false) => ({ id, val, leftId, rightId, isRoot });

// 5 -> (3 -> (1, _), 8)
const T3 = [n(1, '5', 2, 3, true), n(2, '3', 4, -1), n(4, '1'), n(3, '8')];
// 5 -> (3, 8)
const T2 = [n(1, '5', 2, 3, true), n(2, '3'), n(3, '8')];
// 5
const T1 = [n(1, '5', -1, -1, true)];

const ev = (type, treeState, activeTreeNodeId = -1, extra = {}) => ({
  step: 0, type, treeState, activeTreeNodeId, description: '', userOutput: '', ...extra,
});

/* ── compareKeys ──────────────────────────────────────────────────────── */
test('compareKeys: numeric strings compare numerically, others lexically', () => {
  assert.equal(compareKeys('9', '10'), -1);          // not "9" > "10"
  assert.equal(compareKeys(2.5, '2.5'), 0);
  assert.equal(compareKeys('apple', 'banana'), -1);
  assert.equal(compareKeys('b', 'a'), 1);
});

/* ── analyzeTree ──────────────────────────────────────────────────────── */
test('analyzeTree: empty tree', () => {
  const a = analyzeTree([]);
  assert.equal(a.size, 0);
  assert.equal(a.height, 0);
  assert.equal(a.root, null);
  assert.equal(a.validBst, null);
});

test('analyzeTree: single node', () => {
  const a = analyzeTree(T1);
  assert.equal(a.size, 1);
  assert.equal(a.height, 1);
  assert.equal(a.leaves, 1);
  assert.equal(a.internal, 0);
  assert.equal(a.minVal, '5');
  assert.equal(a.maxVal, '5');
});

test('analyzeTree: shape stats on a small tree', () => {
  const a = analyzeTree(T3);
  assert.equal(a.size, 4);
  assert.equal(a.height, 3);
  assert.equal(a.leaves, 2);       // 1 and 8
  assert.equal(a.internal, 2);     // 5 and 3
  assert.equal(a.minVal, '1');
  assert.equal(a.maxVal, '8');
  assert.equal(a.validBst, true);
  assert.deepEqual(a.order.map((x) => x.val), ['1', '3', '5', '8']);
  assert.equal(a.parent.get(4), 2);
  assert.equal(a.depth.get(4), 2);
});

test('analyzeTree: deeply skewed tree does not overflow the stack', () => {
  const nodes = [];
  const N = 5000;
  for (let i = 0; i < N; i++) nodes.push(n(i + 1, String(i), -1, i + 1 < N ? i + 2 : -1, i === 0));
  const a = analyzeTree(nodes);
  assert.equal(a.size, N);
  assert.equal(a.height, N);
  assert.equal(a.leaves, 1);
  const l = layoutTree(nodes);
  assert.equal(l.positions.size, N);
});

test('analyzeTree: detects an out-of-order tree (user bug) instead of calling it valid', () => {
  const bad = [n(1, '5', 2, -1, true), n(2, '9')];   // 9 on the LEFT of 5
  assert.equal(analyzeTree(bad).validBst, false);
});

test('analyzeTree: duplicates follow the program (equal keys are not a violation)', () => {
  const dup = [n(1, '5', 2, -1, true), n(2, '5')];
  assert.equal(analyzeTree(dup).validBst, true);
  assert.equal(analyzeTree(dup).size, 2);
});

test('analyzeTree: a cycle is flagged and terminates', () => {
  const cyc = [n(1, '1', 2, -1, true), n(2, '2', 1, -1)];
  const a = analyzeTree(cyc);
  assert.equal(a.cyclic, true);
  assert.equal(a.size, 2);
});

test('analyzeTree: string keys', () => {
  const a = analyzeTree([n(1, 'm', 2, 3, true), n(2, 'c'), n(3, 'x')]);
  assert.equal(a.minVal, 'c');
  assert.equal(a.maxVal, 'x');
  assert.equal(a.validBst, true);
});

/* ── layoutTree ───────────────────────────────────────────────────────── */
test('layoutTree: parent is centred over children and siblings do not overlap', () => {
  const { positions } = layoutTree(T2);
  const p = (id) => positions.get(id);
  assert.equal(p(1).x, (p(2).x + p(3).x) / 2);
  assert.ok(p(2).x < p(3).x);
  assert.equal(p(1).depth, 0);
  assert.equal(p(2).depth, 1);
});

test('layoutTree: no two nodes on the same level share an x', () => {
  const { positions } = layoutTree(T3);
  const seen = new Set();
  for (const { x, depth } of positions.values()) {
    const key = `${depth}:${x}`;
    assert.ok(!seen.has(key), `overlap at ${key}`);
    seen.add(key);
  }
});

/* ── diffTrees ────────────────────────────────────────────────────────── */
test('diffTrees: creation, relink and removal are all detected', () => {
  const d = diffTrees(T2, T3);                 // node 4 created under 3
  assert.deepEqual(d.created, [4]);
  assert.deepEqual(d.relinks, [{ id: 2, side: 'left', from: null, to: 4 }]);
  assert.deepEqual(d.removed, []);

  const r = diffTrees(T3, T2);                 // node 4 unlinked
  assert.deepEqual(r.removed, [4]);
  assert.equal(r.relinks.length, 1);

  const root = diffTrees(T1, [n(9, '7', -1, -1, true)]);
  assert.equal(root.rootChanged, true);
});

/* ── buildStepView / seeking ──────────────────────────────────────────── */
function insertRun() {
  return [
    ev('bst_traverse', T1, 1),                     // 0: visiting root
    ev('bst_traverse', T2, 1),                     // 1: start of next op at root
    ev('bst_traverse', T2, 2),                     // 2: went to 3
    ev('bst_update', T3, 2),                       // 3: 3.left created
  ];
}

test('buildStepView: no tree events -> hasTree false', () => {
  const v = buildStepView([{ type: 'line', treeState: [] }], 0);
  assert.equal(v.hasTree, false);
  assert.equal(hasAnyTree([{ type: 'line', treeState: [] }]), false);
});

test('buildStepView: reports created node, link change and stats', () => {
  const v = buildStepView(insertRun(), 3);
  assert.deepEqual(v.createdIds, [4]);
  assert.equal(v.relinks[0].side, 'left');
  assert.equal(v.stats.nodes, 4);
  assert.equal(v.stats.height, 3);
  assert.ok(v.explanation.some((l) => l.startsWith('Created node 1')));
});

test('buildStepView: path starts at the latest root visit and reports the hop direction', () => {
  const events = insertRun();
  assert.deepEqual(operationPath(events, 2), [1, 2]);
  const v = buildStepView(events, 2);
  assert.deepEqual(v.pathIds, [1, 2]);
  assert.equal(v.move.side, 'left');
  assert.equal(v.stats.pathVisits, 2);
  assert.ok(v.explanation.some((l) => l.includes('left child of 5')));
});

test('buildStepView: removed node is surfaced as a ghost with its old data', () => {
  const events = [ev('bst_update', T3, 1), ev('bst_update', T2, 1)];
  const v = buildStepView(events, 1);
  assert.deepEqual(v.removedNodes.map((x) => x.val), ['1']);
});

test('seeking is a pure function of the index: forward, back and jump agree', () => {
  const events = insertRun();
  const snap = (i) => JSON.stringify(buildStepView(events, i));
  const forward = events.map((_, i) => snap(i));
  // walk backwards
  for (let i = events.length - 1; i >= 0; i--) assert.equal(snap(i), forward[i]);
  // random jumps
  for (const i of [3, 0, 2, 1, 3, 0]) assert.equal(snap(i), forward[i]);
});

test('non-tree events between tree events keep showing the last tree state', () => {
  const events = [
    ev('bst_update', T2, 1),
    { type: 'line', treeState: T2, currentLine: 7, userOutput: '' },
  ];
  const v = buildStepView(events, 1);
  assert.equal(v.hasTree, true);
  assert.equal(v.stats.nodes, 3);
  assert.equal(v.line, 7);
});

test('bounds: out-of-range index is clamped, empty list is safe', () => {
  assert.equal(buildStepView([], 5).hasTree, false);
  assert.equal(buildStepView(insertRun(), 99).stats.nodes, 4);
  assert.equal(buildStepView(insertRun(), -3).stats.nodes, 1);
});
