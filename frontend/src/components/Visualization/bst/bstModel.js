/**
 * bstModel
 * ────────
 * Pure (React-free) helpers that turn the normalized DSVP trace events into
 * everything the BST visualizer shows. Everything here is derived ONLY from
 * the tree snapshots the user's program actually produced (treeState on each
 * trace event) — nothing is simulated or assumed about naming, operations or
 * duplicate-key policy.
 *
 * Because every event carries a full snapshot, a step's view is a pure
 * function of (events, index): stepping backwards, scrubbing and restarting
 * always land on the exact state that was observed at that step.
 *
 * Node shape (from the instrumenters):
 *   { id, val, leftId, rightId, isRoot }       ids are stable per object;
 *   leftId/rightId are null or -1 when absent.
 */

export const BST_OPS = new Set([
  'bst_snap', 'bst_init', 'bst_update', 'bst_insert', 'bst_delete', 'bst_traverse',
]);

const hasId = (id) => id !== null && id !== undefined && id !== -1;

export function isBstOpEvent(e) {
  return !!e && BST_OPS.has(e.type);
}

/* ── key comparison ─────────────────────────────────────────────────── */

const NUMERIC_RE = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i;

/** Numeric compare when both keys look numeric, otherwise string compare. */
export function compareKeys(a, b) {
  const sa = String(a), sb = String(b);
  if (NUMERIC_RE.test(sa) && NUMERIC_RE.test(sb)) {
    const na = Number(sa), nb = Number(sb);
    return na < nb ? -1 : na > nb ? 1 : 0;
  }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/* ── structure analysis ─────────────────────────────────────────────── */

export function pickRoot(nodes) {
  if (!nodes || nodes.length === 0) return null;
  return nodes.find((n) => n.isRoot) || nodes[0];
}

/**
 * Shape + statistics of one snapshot. Iterative (skewed trees of hundreds of
 * nodes must not overflow the JS stack) and cycle-safe (user bugs can wire a
 * node back to an ancestor).
 */
export function analyzeTree(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = new Map(list.map((n) => [n.id, n]));
  const root = pickRoot(list);
  const parent = new Map();
  const depth = new Map();
  const inorder = [];
  let cyclic = false;
  let leaves = 0;
  let height = 0;

  if (root) {
    const seen = new Set([root.id]);
    depth.set(root.id, 0);

    // Returns the child id to descend into, or null. A child already seen
    // means the user's links form a cycle / share a node: flag it, don't loop.
    const descend = (node, side) => {
      const cid = node[`${side}Id`];
      if (!hasId(cid) || !byId.has(cid)) return null;
      if (seen.has(cid)) { cyclic = true; return null; }
      seen.add(cid);
      parent.set(cid, node.id);
      depth.set(cid, depth.get(node.id) + 1);
      return cid;
    };

    const stack = [];
    let curId = root.id;
    while (curId !== null || stack.length) {
      while (curId !== null) {
        stack.push(curId);
        curId = descend(byId.get(curId), 'left');
      }
      const id = stack.pop();
      const node = byId.get(id);
      inorder.push(node);
      height = Math.max(height, depth.get(id) + 1);
      if (!hasId(node.leftId) && !hasId(node.rightId)) leaves++;
      curId = descend(node, 'right');
    }
  }

  let validBst = true;
  for (let i = 1; i < inorder.length; i++) {
    if (compareKeys(inorder[i - 1].val, inorder[i].val) > 0) { validBst = false; break; }
  }

  const size = inorder.length;
  return {
    byId, root: size ? root : null, size, height, leaves,
    internal: size - leaves,
    parent, depth, order: inorder,
    minVal: size ? inorder[0].val : null,
    maxVal: size ? inorder[size - 1].val : null,
    validBst: size ? validBst : null,
    cyclic,
  };
}

/* ── layout ─────────────────────────────────────────────────────────── */

/**
 * {id -> {x, depth}} with leaves on consecutive slots left-to-right and each
 * parent centred over its children (x in slot units, 0-based).
 */
export function layoutTree(nodes) {
  const list = Array.isArray(nodes) ? nodes : [];
  const byId = new Map(list.map((n) => [n.id, n]));
  const root = pickRoot(list);
  const positions = new Map();
  if (!root) return { positions, slots: 0, levels: 0 };

  let leafCounter = 0;
  const seen = new Set([root.id]);
  // post-order via explicit stack
  const stack = [{ id: root.id, d: 0, phase: 0, lx: null }];
  const xOf = new Map();
  while (stack.length) {
    const f = stack[stack.length - 1];
    const node = byId.get(f.id);
    if (!node) { stack.pop(); continue; }
    if (f.phase === 0) {
      f.phase = 1;
      if (hasId(node.leftId) && !seen.has(node.leftId) && byId.has(node.leftId)) {
        seen.add(node.leftId);
        stack.push({ id: node.leftId, d: f.d + 1, phase: 0 });
        continue;
      }
    }
    if (f.phase === 1) {
      f.phase = 2;
      if (hasId(node.rightId) && !seen.has(node.rightId) && byId.has(node.rightId)) {
        seen.add(node.rightId);
        stack.push({ id: node.rightId, d: f.d + 1, phase: 0 });
        continue;
      }
    }
    stack.pop();
    const lx = hasId(node.leftId) && xOf.has(node.leftId) ? xOf.get(node.leftId) : null;
    const rx = hasId(node.rightId) && xOf.has(node.rightId) ? xOf.get(node.rightId) : null;
    let x;
    if (lx !== null && rx !== null) x = (lx + rx) / 2;
    else if (lx !== null) x = lx;
    else if (rx !== null) x = rx;
    else x = leafCounter++;
    xOf.set(node.id, x);
    positions.set(node.id, { x, depth: f.d });
  }

  let maxX = 0, maxD = 0;
  for (const p of positions.values()) { maxX = Math.max(maxX, p.x); maxD = Math.max(maxD, p.depth); }
  return { positions, slots: maxX + 1, levels: maxD + 1 };
}

/* ── snapshot diff ──────────────────────────────────────────────────── */

export function diffTrees(prevNodes, curNodes) {
  const prev = new Map((prevNodes || []).map((n) => [n.id, n]));
  const cur = new Map((curNodes || []).map((n) => [n.id, n]));
  const created = [];
  const removed = [];
  const relinks = [];
  for (const n of cur.values()) {
    const p = prev.get(n.id);
    if (!p) { created.push(n.id); continue; }
    for (const side of ['left', 'right']) {
      const a = p[`${side}Id`], b = n[`${side}Id`];
      const na = hasId(a) ? a : null, nb = hasId(b) ? b : null;
      if (na !== nb) relinks.push({ id: n.id, side, from: na, to: nb });
    }
  }
  for (const n of prev.values()) if (!cur.has(n.id)) removed.push(n.id);
  const prevRoot = pickRoot(prevNodes || []);
  const curRoot = pickRoot(curNodes || []);
  return {
    created, removed, relinks,
    rootChanged: (prevRoot ? prevRoot.id : null) !== (curRoot ? curRoot.id : null),
  };
}

/* ── per-step view ──────────────────────────────────────────────────── */

/** Index of the latest BST-op event at or before `idx` (or -1). */
function lastOpIndex(events, idx) {
  for (let i = Math.min(idx, events.length - 1); i >= 0; i--) {
    if (isBstOpEvent(events[i])) return i;
  }
  return -1;
}

function snapshotAt(events, i) {
  for (let k = i; k >= 0; k--) {
    const t = events[k] && events[k].treeState;
    if (Array.isArray(t) && (t.length > 0 || isBstOpEvent(events[k]))) return t;
  }
  return [];
}

/**
 * The traversal path of the operation in progress: active nodes of the
 * bst_traverse events from the latest one that sat on the root (every
 * insert/search/delete starts at the root) up to `opIdx`.
 */
export function operationPath(events, opIdx) {
  if (opIdx < 0) return [];
  let start = -1;
  for (let i = opIdx; i >= 0; i--) {
    const e = events[i];
    if (e && e.type === 'bst_traverse') {
      const tree = e.treeState || [];
      const r = pickRoot(tree);
      if (r && e.activeTreeNodeId === r.id) { start = i; break; }
    }
  }
  if (start === -1) return [];
  const path = [];
  for (let i = start; i <= opIdx; i++) {
    const e = events[i];
    if (e && e.type === 'bst_traverse' && hasId(e.activeTreeNodeId)) {
      if (path[path.length - 1] !== e.activeTreeNodeId) path.push(e.activeTreeNodeId);
    }
  }
  return path;
}

function labelOf(byId, id) {
  const n = byId.get(id);
  return n ? String(n.val) : '?';
}

/**
 * Everything the visualizer needs for step `idx` (0-based index into the
 * events array). Pure: same inputs, same output, any direction of travel.
 */
export function buildStepView(events, idx) {
  const evs = Array.isArray(events) ? events : [];
  const cursor = Math.max(0, Math.min(idx, evs.length - 1));
  const opIdx = lastOpIndex(evs, cursor);

  if (opIdx < 0) {
    const stats = statsFor(analyzeTree([]), 0, 0);
    return {
      hasTree: false, nodes: [], prevNodes: [], activeId: -1, type: 'bst_snap',
      createdIds: [], removedNodes: [], relinks: [], rootChanged: false,
      pathIds: [], move: null, stats, explanation: [], description: '',
      line: evs[cursor] ? evs[cursor].currentLine ?? null : null,
      userOutput: evs[cursor] ? evs[cursor].userOutput ?? '' : '',
    };
  }

  const ev = evs[opIdx];
  const nodes = snapshotAt(evs, opIdx);
  const prevOp = lastOpIndex(evs, opIdx - 1);
  const prevNodes = prevOp >= 0 ? snapshotAt(evs, prevOp) : [];
  const info = analyzeTree(nodes);
  const diff = diffTrees(prevNodes, nodes);
  const activeId = hasId(ev.activeTreeNodeId) && info.byId.has(ev.activeTreeNodeId)
    ? ev.activeTreeNodeId : -1;

  const prevById = new Map(prevNodes.map((n) => [n.id, n]));
  const removedNodes = diff.removed.map((id) => prevById.get(id)).filter(Boolean);

  const pathIds = operationPath(evs, opIdx).filter((id) => info.byId.has(id));

  // direction of the last hop of the path (measured from the actual links)
  let move = null;
  if (pathIds.length >= 2) {
    const from = info.byId.get(pathIds[pathIds.length - 2]);
    const toId = pathIds[pathIds.length - 1];
    if (from && from.leftId === toId) move = { side: 'left', fromId: from.id, toId };
    else if (from && from.rightId === toId) move = { side: 'right', fromId: from.id, toId };
  }

  // visits so far in this program (measured)
  let totalVisits = 0;
  for (let i = 0; i <= opIdx; i++) if (evs[i] && evs[i].type === 'bst_traverse') totalVisits++;

  const stats = statsFor(info, pathIds.length, totalVisits);

  const explanation = [];
  for (const id of diff.created) {
    explanation.push(`Created node ${labelOf(info.byId, id)}.`);
  }
  for (const n of removedNodes) {
    explanation.push(`Node ${String(n.val)} is no longer reachable from the root (removed).`);
  }
  for (const r of diff.relinks) {
    const owner = labelOf(info.byId, r.id);
    const toLabel = r.to === null ? 'null' : labelOf(info.byId, r.to);
    const fromLabel = r.from === null ? 'null' : (info.byId.has(r.from) ? labelOf(info.byId, r.from) : labelOf(prevById, r.from));
    explanation.push(`${owner}.${r.side}: ${fromLabel} → ${toLabel}.`);
  }
  if (diff.rootChanged && nodes.length) {
    explanation.push(`Root is now ${String(info.root.val)}.`);
  }
  if (move) {
    explanation.push(`Moved to the ${move.side} child of ${labelOf(info.byId, move.fromId)} (key ${labelOf(info.byId, move.toId)}).`);
  } else if (ev.type === 'bst_traverse' && activeId !== -1) {
    explanation.push(`Visiting node ${labelOf(info.byId, activeId)}${info.root && info.root.id === activeId ? ' (root)' : ''}.`);
  }

  return {
    hasTree: nodes.length > 0 || prevNodes.length > 0,
    nodes, prevNodes, activeId, type: ev.type,
    createdIds: diff.created, removedNodes, relinks: diff.relinks, rootChanged: diff.rootChanged,
    pathIds, move, stats, explanation,
    description: ev.description || '',
    line: evs[cursor] ? evs[cursor].currentLine ?? null : null,
    userOutput: evs[cursor] ? evs[cursor].userOutput ?? '' : '',
  };
}

function statsFor(info, pathVisits, totalVisits) {
  return {
    nodes: info.size,
    height: info.height,
    leaves: info.leaves,
    internal: info.internal,
    root: info.root ? info.root.val : null,
    min: info.minVal,
    max: info.maxVal,
    validBst: info.validBst,
    cyclic: info.cyclic,
    pathVisits,
    totalVisits,
  };
}

/** True when the run produced at least one tree snapshot. */
export function hasAnyTree(events) {
  return (events || []).some((e) => isBstOpEvent(e) && Array.isArray(e.treeState) && e.treeState.length > 0);
}
