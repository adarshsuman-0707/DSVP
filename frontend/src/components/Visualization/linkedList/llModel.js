/**
 * llModel — pure, renderer-independent linked-list state model.
 *
 *   Execution event (trace snapshot)
 *        ↓  buildGraph()
 *   Data-structure state  { chain, floating, pointers, head, tail, ring, structure }
 *        ↓  diffGraphs()
 *   Semantic events      [{ type: 'SET_NEXT', from, to, ... }]
 *        ↓
 *   Renderer (LinkedListVisualizer)
 *
 * Nothing in here knows about React, Java or Python. A trace producer only has
 * to supply node snapshots ({id,val,nextId,prevId?,isHead?,detached?}) and —
 * optionally — a pointer map ({name: nodeId|-1}). Stack/Queue/Tree visualizers
 * can reuse the same shape (graph → diff → events) with their own buildGraph.
 *
 * Every function is deterministic and never mutates its input, so stepping
 * backwards is just "build the graph of event N-1" — no reversible-event
 * bookkeeping needed, and Previous/Next can never drift out of sync.
 */

export const HEAD_NAMES = ['head', 'first', 'start', 'front'];
export const TAIL_NAMES = ['tail', 'last', 'rear'];

export const isNullId = (id) => id === null || id === undefined || id === -1;

export const nodeKey = (id) => `node-${id}`;

/**
 * @param {Array}  state   event.linkedListState
 * @param {Object} meta    { ptrs, headId, tailId, ring, moduleSlug, isDoubly }
 */
export function buildGraph(state = [], meta = {}) {
  const all = Array.isArray(state) ? state : [];
  const byId = new Map();
  all.forEach(n => byId.set(n.id, n));

  const chain = all.filter(n => !n.detached);
  const floating = all.filter(n => n.detached);

  const ptrs = meta.ptrs && typeof meta.ptrs === 'object' ? meta.ptrs : null;

  // pointer variables grouped by the node they reference
  const ptrsByNode = new Map();
  const nullPtrs = [];
  if (ptrs) {
    Object.entries(ptrs).forEach(([name, id]) => {
      if (isNullId(id)) { nullPtrs.push(name); return; }
      if (!byId.has(id)) return; // variable references a node outside the snapshot
      if (!ptrsByNode.has(id)) ptrsByNode.set(id, []);
      ptrsByNode.get(id).push(name);
    });
  }

  // Ring = last chain node's next points back at the head (tail.next == head).
  // Trust the producer's flag when present, otherwise derive it.
  const headNode = chain[0] || null;
  const lastNode = chain.length ? chain[chain.length - 1] : null;
  const derivedRing = Boolean(headNode && lastNode && lastNode.nextId === headNode.id);
  const ring = typeof meta.ring === 'boolean' ? meta.ring : derivedRing;

  // Doubly: explicit flag, or any node carries a real prev pointer.
  const isDoubly = Boolean(meta.isDoubly) ||
    all.some(n => n.prevId !== undefined && n.prevId !== null);

  // Doubly + ring: head.prev should point at the tail.
  const prevRing = Boolean(isDoubly && headNode && lastNode && headNode.prevId === lastNode.id && chain.length > 0);

  const slug = meta.moduleSlug || '';
  const circularHint = slug.includes('circular');
  const circular = ring || circularHint;
  const structure = circular
    ? (isDoubly || slug.includes('doubly') ? 'circular-doubly' : 'circular')
    : (isDoubly ? 'doubly' : 'singly');

  return {
    byId, chain, floating, ptrs, ptrsByNode, nullPtrs,
    headId: headNode ? headNode.id : null,
    tailId: lastNode ? lastNode.id : null,
    ring, prevRing, isDoubly, circular, structure,
  };
}

export const STRUCTURE_LABEL = {
  'singly': 'Singly Linked List',
  'doubly': 'Doubly Linked List',
  'circular': 'Circular Linked List',
  'circular-doubly': 'Circular Doubly Linked List',
};

/**
 * Semantic difference between two graphs, expressed in the shared event
 * vocabulary. Used for the "what just happened" chips and the debug panel.
 * Node ids are the stable identity — never array indices.
 */
export function diffGraphs(prev, cur) {
  const events = [];
  const label = (g, id) => (isNullId(id) ? 'NULL' : g.byId.get(id) ? `${g.byId.get(id).val}` : nodeKey(id));
  const prevById = prev ? prev.byId : new Map();

  cur.byId.forEach((n, id) => {
    const p = prevById.get(id);
    if (!p) {
      events.push({ type: 'CREATE_NODE', nodeId: nodeKey(id), value: n.val });
      return;
    }
    if (p.val !== n.val) {
      events.push({ type: 'UPDATE_VALUE', nodeId: nodeKey(id), from: String(p.val), to: String(n.val) });
    }
    if (p.nextId !== n.nextId) {
      events.push({
        type: 'SET_NEXT', nodeId: nodeKey(id),
        from: isNullId(p.nextId) ? null : nodeKey(p.nextId),
        to: isNullId(n.nextId) ? null : nodeKey(n.nextId),
        text: `[${n.val}].next: ${label(prev, p.nextId)} → ${label(cur, n.nextId)}`,
      });
    }
    if ((p.prevId ?? -1) !== (n.prevId ?? -1)) {
      events.push({
        type: 'SET_PREV', nodeId: nodeKey(id),
        from: isNullId(p.prevId) ? null : nodeKey(p.prevId),
        to: isNullId(n.prevId) ? null : nodeKey(n.prevId),
        text: `[${n.val}].prev: ${label(prev, p.prevId)} → ${label(cur, n.prevId)}`,
      });
    }
  });

  if (prev) {
    prevById.forEach((n, id) => {
      if (!cur.byId.has(id)) events.push({ type: 'DELETE_NODE', nodeId: nodeKey(id), value: n.val });
    });
  }

  // head / tail / other pointer variables
  const prevPtrs = (prev && prev.ptrs) || {};
  const curPtrs = cur.ptrs || {};
  Object.keys(curPtrs).forEach(name => {
    const was = prevPtrs[name];
    const now = curPtrs[name];
    if (prev && prev.ptrs && was === now) return;
    if (!prev || !prev.ptrs) return; // no baseline to compare against
    const type = HEAD_NAMES.includes(name) ? 'SET_HEAD' : TAIL_NAMES.includes(name) ? 'SET_TAIL' : 'VISIT_NODE';
    events.push({
      type, variable: name,
      from: isNullId(was) ? null : nodeKey(was),
      to: isNullId(now) ? null : nodeKey(now),
      text: `${name}: ${label(prev, was)} → ${label(cur, now)}`,
    });
  });

  return events;
}

/** Pointer variables whose target changed in this step — drives the "moved" highlight. */
export function movedPointers(prev, cur) {
  const moved = new Set();
  if (!cur.ptrs) return moved;
  const prevPtrs = (prev && prev.ptrs) || null;
  Object.keys(cur.ptrs).forEach(name => {
    if (!prevPtrs || !(name in prevPtrs) || prevPtrs[name] !== cur.ptrs[name]) moved.add(name);
  });
  return moved;
}

/** Nodes that were on screen in `prev` but are gone entirely in `cur` (garbage after this step). */
export function removedNodes(prev, cur) {
  if (!prev) return [];
  const out = [];
  prev.byId.forEach((n, id) => { if (!cur.byId.has(id)) out.push(n); });
  return out;
}

/** Friendly label for the operation badge. */
export const KIND_META = {
  CREATE_NODE:  { label: 'CREATE NODE',  icon: '＋', tone: 'green'  },
  DELETE_NODE:  { label: 'DELETE NODE',  icon: '✕', tone: 'red'    },
  SET_NEXT:     { label: 'SET NEXT',     icon: '→', tone: 'amber'  },
  SET_PREV:     { label: 'SET PREV',     icon: '←', tone: 'violet' },
  SET_HEAD:     { label: 'SET HEAD',     icon: '◈', tone: 'amber'  },
  SET_TAIL:     { label: 'SET TAIL',     icon: '◈', tone: 'violet' },
  SET_PTR:      { label: 'POINTER',      icon: '➜', tone: 'cyan'   },
  VISIT_NODE:   { label: 'VISIT',        icon: '➜', tone: 'cyan'   },
  UPDATE_VALUE: { label: 'UPDATE VALUE', icon: '✎', tone: 'amber'  },
  COMPARE:      { label: 'COMPARE',      icon: '≟', tone: 'blue'   },
  NULL_ACCESS:  { label: 'NULL ACCESS',  icon: '⚠', tone: 'red'    },
};

export const TONE_COLOR = {
  dark:  { green: '#34d399', red: '#f87171', amber: '#fbbf24', violet: '#a78bfa', cyan: '#38bdf8', blue: '#60a5fa' },
  light: { green: '#047857', red: '#b91c1c', amber: '#a16207', violet: '#6d28d9', cyan: '#0e7490', blue: '#1d4ed8' },
};

/** Does a run error look like a null dereference (any supported language)? */
export function isNullAccessError(msg = '') {
  return /NullPointerException|NoneType|null reference|NullReferenceException|segmentation fault|is null/i.test(msg);
}
