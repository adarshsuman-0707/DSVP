/**
 * Heap model — pure functions from the backend's heap events to what the
 * visualizer draws. Everything shown at step k is a function of events[0..k]
 * only, so stepping backwards or seeking restores the true state at that
 * step (it is recomputed, never "un-animated").
 *
 * Event shape (see backend/src/services/heap/heapReconstructor.js):
 *   { heapKind, i, j, vi, vj, res, opSym, removed, movedFrom, insertedId,
 *     state?: { ids, vals, size }, heapSize, heapOrder, heapValid,
 *     comparisons, swaps, writes, heapOpKey, heapOp, description, currentLine }
 * `state` is present only when the array changed; it carries forward.
 */

export const parentOf = (i) => (i > 0 ? (i - 1) >> 1 : -1);
export const leftOf = (i) => 2 * i + 1;
export const rightOf = (i) => 2 * i + 2;
export const heightOf = (n) => (n > 0 ? Math.floor(Math.log2(n)) + 1 : 0);

const EMPTY_STATE = Object.freeze({ ids: [], vals: [], size: 0 });

/** Forward-fill `state` so every step has the array as it was at that step. */
export function buildTimeline(events) {
  const out = new Array(events.length);
  let cur = EMPTY_STATE;
  for (let k = 0; k < events.length; k++) {
    if (events[k].state) cur = events[k].state;
    out[k] = cur;
  }
  return out;
}

/** Total order over JSON values — mirrors the backend so validity agrees. */
export function cmpVal(a, b) {
  const num = (x) => typeof x === 'number' && Number.isFinite(x);
  if (num(a) && num(b)) return a < b ? -1 : a > b ? 1 : 0;
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let k = 0; k < n; k++) { const c = cmpVal(a[k], b[k]); if (c) return c; }
    return a.length - b.length;
  }
  const ta = typeof a; const tb = typeof b;
  if (ta !== tb) return ta < tb ? -1 : 1;
  const sa = String(a); const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** Does the first `size` elements satisfy min-heap / max-heap order? */
export function validity(vals, size) {
  const n = Math.min(size, vals.length);
  let min = true; let max = true;
  for (let c = 1; c < n; c++) {
    const r = cmpVal(vals[c], vals[parentOf(c)]);
    if (r < 0) min = false;
    if (r > 0) max = false;
    if (!min && !max) break;
  }
  return { min, max };
}

export function formatValue(v) {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `(${v.map(formatValue).join(', ')})`;
  return String(v);
}

/** Roles an index plays at this step: 'current', 'other', 'parent', 'left', 'right', 'swap', 'write', 'inserted', 'removed', 'moved'. */
export function rolesFor(event, size) {
  const roles = new Map();
  const add = (idx, role) => {
    if (idx === null || idx === undefined || idx < 0) return;
    if (!roles.has(idx)) roles.set(idx, new Set());
    roles.get(idx).add(role);
  };
  if (!event) return roles;
  const family = (c) => {
    if (c === null || c === undefined) return;
    const p = parentOf(c);
    if (p >= 0 && p < size) add(p, 'parent');
    if (leftOf(c) < size) add(leftOf(c), 'left');
    if (rightOf(c) < size) add(rightOf(c), 'right');
  };
  switch (event.heapKind) {
    case 'compare':
      add(event.i, 'current'); add(event.j, 'other');
      family(event.i);
      break;
    case 'swap':
      add(event.i, 'swap'); add(event.j, 'swap');
      break;
    case 'write':
      add(event.i, 'write'); add(event.j, 'other');
      break;
    case 'insert':
      add(event.i, 'inserted'); family(event.i);
      break;
    case 'extract':
      add(0, 'moved'); add(event.movedFrom, 'other'); family(0);
      break;
    case 'remove':
      add(event.i, 'removed');
      break;
    default:
      break;
  }
  return roles;
}

/**
 * Compact layout for a complete binary tree of n nodes: nodes are spaced by
 * in-order rank, so siblings never overlap and the width is (n) slots, not
 * 2^height. Returns slot coordinates (unit = one slot / one level).
 */
export function layoutHeap(n) {
  const positions = new Array(n);
  let rank = 0;
  const walk = (i, depth) => {
    if (i >= n) return;
    walk(leftOf(i), depth + 1);
    positions[i] = { slot: rank++, depth };
    walk(rightOf(i), depth + 1);
  };
  // iterative guard: recursion depth is log2(n) ≤ 9 for n ≤ 256, so this is safe
  walk(0, 0);
  return { positions, slots: Math.max(n, 1), levels: heightOf(n) };
}

/** Theoretical cost of the recognised operations (standard binary heap). */
export const COMPLEXITY = [
  { key: 'peek', label: 'Peek root', cost: 'O(1)' },
  { key: 'insert', label: 'Insert', cost: 'O(log n)' },
  { key: 'extract', label: 'Extract root', cost: 'O(log n)' },
  { key: 'build', label: 'Build heap (bottom-up)', cost: 'O(n)' },
  { key: 'search', label: 'Search an arbitrary value', cost: 'O(n)' },
  { key: 'sort', label: 'Heap sort', cost: 'O(n log n)' },
];

const OP_TO_COMPLEXITY = {
  insert: 'insert', siftUp: 'insert', extract: 'extract', siftDown: 'extract',
  build: 'build', sort: 'sort', peek: 'peek',
};

export function complexityKeyFor(opKey) {
  return OP_TO_COMPLEXITY[opKey] || null;
}

/**
 * Measured work of the operation in progress at step k: counted from the
 * last insert/extract (or the start) up to and including k. Reported next to
 * — never instead of — the theoretical cost.
 */
export function measuredSince(events, k) {
  let start = 0;
  for (let q = k; q >= 0; q--) {
    const kind = events[q].heapKind;
    if (kind === 'insert' || kind === 'extract' || kind === 'init') { start = q; break; }
  }
  let comparisons = 0; let swaps = 0; let writes = 0;
  for (let q = start; q <= k; q++) {
    const kind = events[q].heapKind;
    if (kind === 'compare') comparisons += 1;
    else if (kind === 'swap') swaps += 1;
    else if (kind === 'write') writes += 1;
  }
  return { comparisons, swaps, writes, from: start };
}

/** Everything the visualizer needs for step k. */
export function stepView(events, k, timeline = null) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      event: null, state: EMPTY_STATE, size: 0, items: [], roles: new Map(), valid: null, order: 'unknown',
      layout: layoutHeap(0), index: 0, total: 0, measured: null, complexityKey: null,
    };
  }
  const idx = Math.max(0, Math.min(k, events.length - 1));
  const tl = timeline || buildTimeline(events);
  const state = tl[idx];
  const event = events[idx];
  const size = Math.min(state.size, state.vals.length);
  const items = state.vals.map((v, i) => ({ id: state.ids[i], v, idx: i, inHeap: i < size }));
  const v = validity(state.vals, size);
  const order = event.heapOrder || 'unknown';
  const valid = size < 2 ? true : order === 'min' ? v.min : order === 'max' ? v.max : null;
  return {
    event, state, size, items, roles: rolesFor(event, size), valid, order,
    layout: layoutHeap(size), index: idx, total: events.length,
    measured: measuredSince(events, idx), complexityKey: complexityKeyFor(event.heapOpKey),
  };
}

/** Short accessible summary of the heap at this step. */
export function summarize(view) {
  if (!view.event) return 'No heap yet.';
  const vals = view.items.filter((x) => x.inHeap).map((x) => formatValue(x.v)).join(', ');
  return view.size === 0
    ? 'Empty heap.'
    : `Heap of ${view.size} element${view.size === 1 ? '' : 's'}: ${vals}. Root ${formatValue(view.state.vals[0])}.`;
}
