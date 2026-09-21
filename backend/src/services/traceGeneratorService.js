

const ARRAY_OPS = new Set(['init', 'write', 'read', 'swap', 'append', 'compare', 'delete']);
const ARRAY2D_OPS = new Set(['init2d', 'read2d', 'write2d']);
const EXEC_OPS = new Set(['call', 'line', 'return']);
const LL_OPS = new Set(['ll_snap', 'll_init', 'll_update', 'll_insert', 'll_delete', 'll_traverse']);
const BST_OPS = new Set(['bst_snap', 'bst_init', 'bst_update', 'bst_insert', 'bst_delete', 'bst_traverse']);
const GRAPH_OPS = new Set(['graph_init', 'graph_step', 'graph_build']);

function buildTraceEvents({ language, rawTrace, moduleSlug, userOutput }) {
  if (!rawTrace || !Array.isArray(rawTrace.steps)) return [];
  const events = normalizeAll(rawTrace.steps, userOutput || '', moduleSlug);
  if (moduleSlug === 'linked-list') {
    return compactLLEvents(events, LL_OPS);
  }
  if (moduleSlug === 'bst') {
    return compactLLEvents(events, BST_OPS);
  }
  if (moduleSlug === 'graph') {
    return compactGraphEvents(events);
  }
  return events;
}

function compactLLEvents(events, OPS) {
  const hasLL = events.some(e => OPS.has(e.type));
  if (!hasLL) return events;

  const compacted = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    // Skip constructor call/return frames
    if ((e.type === 'call' || e.type === 'return') &&
      (e.func === 'Node' || e.func === 'ListNode' || e.func === '__init__' ||
        e.description?.includes('Called Node') || e.description?.includes('Node returned'))) {
      continue;
    }
    if (e.type === 'line' && compacted.length <= 1) {
      continue;
    }

    // Skip bare 'line' events when LL events are present
    if (e.type === 'line') {
      const next = events[i + 1];
      // If immediately followed by an LL event, the LL event already has the currentLine & locals
      if (next && OPS.has(next.type)) {
        continue;
      }
      // If preceded by an LL/BST event or call, skip empty intermediate loop check lines
      const prev = compacted[compacted.length - 1];
      if (prev && (OPS.has(prev.type) || prev.type === 'call')) {
        continue;
      }
    }

    // Filter duplicate consecutive LL/BST events that don't alter state or active node
    if (OPS.has(e.type)) {
      const prev = compacted[compacted.length - 1];
      if (prev && OPS.has(prev.type)) {
        const sameActive = (prev.activeNodeId === e.activeNodeId) && (prev.activeTreeNodeId === e.activeTreeNodeId);
        const sameNodes = JSON.stringify(prev.linkedListState) === JSON.stringify(e.linkedListState) &&
          JSON.stringify(prev.treeState) === JSON.stringify(e.treeState);
        if (sameActive && sameNodes) {
          compacted[compacted.length - 1] = e;
          continue;
        }
      }
    }
    compacted.push(e);
  }

  return compacted.map((e, idx) => ({ ...e, step: idx + 1 }));
}

function compactGraphEvents(events) {
  const hasGraph = events.some(e => GRAPH_OPS.has(e.type));
  if (!hasGraph) return events;

  const compacted = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === 'line') {
      const next = events[i + 1];
      if (next && GRAPH_OPS.has(next.type)) continue;
      const prev = compacted[compacted.length - 1];
      if (prev && (GRAPH_OPS.has(prev.type) || prev.type === 'call')) continue;
    }
    if (GRAPH_OPS.has(e.type)) {
      const prev = compacted[compacted.length - 1];
      if (prev && GRAPH_OPS.has(prev.type)) {
        const same = prev.activeGraphNodeId === e.activeGraphNodeId &&
          JSON.stringify(prev.graphVisited) === JSON.stringify(e.graphVisited) &&
          JSON.stringify(prev.graphFrontier) === JSON.stringify(e.graphFrontier) &&
          JSON.stringify(prev.graphEdges) === JSON.stringify(e.graphEdges);
        if (same) {
          compacted[compacted.length - 1] = e;
          continue;
        }
      }
    }
    compacted.push(e);
  }
  return compacted.map((e, idx) => ({ ...e, step: idx + 1 }));
}

/* ── Main normalizer ───────────────────────────────────────────────────── */
function normalizeAll(steps, userOutput, moduleSlug) {
  const events = [];

  // Running context
  const ctx = {
    moduleSlug,
    frames: [],   // StackFrame stack
    lastSnap: [],   // most recent array snapshot (legacy single-panel fallback)
    // Per-variable array state — lets two separately-declared arrays
    // (e.g. arr1, arr2 of different sizes) each keep their own live panel
    // instead of one overwriting the other's display slot. Keyed by the
    // variable name DSVPArray tags itself with (falls back to a shared key
    // for languages/paths that don't tag a variable yet, e.g. Python —
    // that just continues the old single-slot behavior for those, no
    // regression). Insertion order == first-declared order.
    arraysByVar: new Map(),
    lastGrid2D: [],   // most recent 2D array snapshot
    lastLLSnap: [],   // most recent linked-list snapshot
    lastBSTSnap: [],   // most recent tree snapshot
    lastGraphState: { nodes: [], edges: [], visited: [], frontier: [] },
    lineNo: null,
  };

  let stepNo = 0;

  for (const s of steps) {
    stepNo++;
    const op = s.op ?? 'highlight';

    if (ARRAY_OPS.has(op)) {
      const evt = buildArrayEvt(s, stepNo, op, ctx, userOutput);
      ctx.lastSnap = evt.arrayState;
      events.push(evt);
      continue;
    }

    if (ARRAY2D_OPS.has(op)) {
      const evt = buildArray2DEvt(s, stepNo, op, ctx, userOutput);
      ctx.lastGrid2D = evt.grid2dState;
      events.push(evt);
      continue;
    }

    if (LL_OPS.has(op)) {
      const evt = buildLLEvt(s, stepNo, op, ctx, userOutput);
      ctx.lastLLSnap = evt.linkedListState;
      events.push(evt);
      continue;
    }

    if (BST_OPS.has(op)) {
      const evt = buildBSTEvt(s, stepNo, op, ctx, userOutput);
      ctx.lastBSTSnap = evt.treeState;
      events.push(evt);
      continue;
    }

    if (GRAPH_OPS.has(op)) {
      const evt = buildGraphEvt(s, stepNo, op, ctx, userOutput);
      ctx.lastGraphState = { nodes: evt.graphNodes, edges: evt.graphEdges, visited: evt.graphVisited, frontier: evt.graphFrontier };
      events.push(evt);
      continue;
    }

    if (EXEC_OPS.has(op)) {
      const evts = buildExecEvts(s, stepNo, op, ctx, userOutput);
      evts.forEach(e => events.push(e));
      continue;
    }

    // unknown — preserve as highlight
    events.push(base(stepNo, op, 'highlight', `Step ${stepNo}`, ctx, userOutput, {}));
  }

  return events;
}

/* ── Array event builder ──────────────────────────────────────────────── */
function buildArrayEvt(s, stepNo, op, ctx, userOutput) {
  const snap = Array.isArray(s.snap) ? s.snap : [...ctx.lastSnap];
  // Falls back to a shared key for traces that don't tag a variable yet
  // (e.g. Python) so those keep the old single-array behavior unchanged.
  const varName = s.var || '__default__';
  const label = s.var || 'arr';

  let activeIndex = (typeof s.idx === 'number' && s.idx >= 0) ? s.idx : null;
  let secondIndex = null;
  let value = s.val !== undefined && s.val !== null ? s.val : null;
  let description = '';

  switch (op) {
    case 'init':
      activeIndex = null;
      description = `${label} initialized: [${snap.join(', ')}]  (size ${snap.length})`;
      break;
    case 'write':
      description = `${label}[${activeIndex}] = ${value}`;
      break;
    case 'read':
      description = `Read ${label}[${activeIndex}]  →  ${value}`;
      break;
    case 'swap': {
      const j2 = typeof s.val === 'number' ? s.val : null;
      secondIndex = j2; value = null;
      description = `Swap ${label}[${s.idx}] ↔ ${label}[${j2}]  →  [${snap.join(', ')}]`;
      break;
    }
    case 'append':
      description = `Append ${value}  →  ${label}[${activeIndex}]`;
      break;
    case 'delete':
      description = `Removed ${value}  (was ${label}[${activeIndex}])`;
      // idx refers to the slot that existed BEFORE removal — the snapshot
      // already shrank, so that index is now out of range. Nothing in the
      // post-removal array should be marked active.
      activeIndex = null;
      break;
    case 'compare': {
      const j2 = typeof s.val === 'number' ? s.val : null;
      secondIndex = j2; value = null;
      const av = snap[s.idx] ?? '?', bv = j2 != null ? snap[j2] : '?';
      description = `Compare ${label}[${s.idx}]=${av}  vs  ${label}[${j2}]=${bv}`;
      break;
    }
    default:
      description = `Step ${stepNo}`;
  }

  // Update this variable's own slot — every other tracked array keeps
  // whatever it last had, so multiple arrays coexist instead of one
  // overwriting the others' display.
  ctx.arraysByVar.set(varName, {
    name: varName, state: snap, activeIndex, secondIndex, type: op,
  });

  return base(stepNo, op, 'array', description, ctx, userOutput, {
    arrayState: snap, activeIndex, secondIndex, value,
    arrays: Array.from(ctx.arraysByVar.values()),
    activeArrayVar: varName,
  });
}

/* ── 2D Array event builder ───────────────────────────────────────────── */
function buildArray2DEvt(s, stepNo, op, ctx, userOutput) {
  const grid = Array.isArray(s.grid) ? s.grid : [...ctx.lastGrid2D];

  const activeRow = (typeof s.row === 'number' && s.row >= 0) ? s.row : null;
  const activeCol = (typeof s.col === 'number' && s.col >= 0) ? s.col : null;
  const value = s.val !== undefined && s.val !== null ? s.val : null;
  let description = '';

  switch (op) {
    case 'init2d':
      description = `2D array initialized: ${grid.length} × ${grid[0]?.length ?? 0}`;
      break;
    case 'write2d':
      description = `grid[${activeRow}][${activeCol}] = ${value}`;
      break;
    case 'read2d':
      description = `Read grid[${activeRow}][${activeCol}]  →  ${value}`;
      break;
    default:
      description = `Step ${stepNo}`;
  }

  return base(stepNo, op, 'array2d', description, ctx, userOutput, {
    grid2dState: grid, activeRow, activeCol, value,
  });
}

/* ── Linked-List event builder ────────────────────────────────────────── */
function buildLLEvt(s, stepNo, op, ctx, userOutput) {
  // nodes: [{id, val, nextId, prevId?, isHead, isTail?}, ...]
  // prevId is present for doubly linked lists — pass it through as-is
  const nodes = Array.isArray(s.nodes) ? s.nodes : [...(ctx.lastLLSnap || [])];
  const activeId = (s.activeId !== undefined && s.activeId !== null) ? s.activeId : -1;
  const desc = s.desc || opToLLDesc(op, nodes, activeId);

  // Detect if doubly (explicit isDoubly flag, or any node has prevId defined that is not -1 and not null)
  const isDoubly = typeof s.isDoubly === 'boolean'
    ? s.isDoubly
    : nodes.some(n => n.prevId !== undefined && n.prevId !== null && n.prevId !== -1);

  return base(stepNo, op, 'linkedList', desc, ctx, userOutput, {
    linkedListState: nodes,
    activeNodeId: activeId,
    isDoubly,
  });
}

function opToLLDesc(op, nodes, activeId) {
  const node = nodes.find(n => n.id === activeId);
  const val = node ? node.val : '';
  switch (op) {
    case 'll_init': return `List initialized (${nodes.length} node${nodes.length !== 1 ? 's' : ''})`;
    case 'll_insert': return `Inserted node${val ? ' ' + val : ''}`;
    case 'll_delete': return `Deleted node${val ? ' ' + val : ''}`;
    case 'll_traverse': return `Visiting node${val ? ' → ' + val : ''}`;
    case 'll_update': return `Pointer updated`;
    case 'll_snap': return `List updated (${nodes.length} node${nodes.length !== 1 ? 's' : ''})`;
    default: return `Linked list step`;
  }
}

/* ── BST (binary tree) event builder ──────────────────────────────────── */
function buildBSTEvt(s, stepNo, op, ctx, userOutput) {
  // nodes: [{id, val, leftId, rightId, isRoot}, ...]
  const nodes = Array.isArray(s.nodes) ? s.nodes : [...(ctx.lastBSTSnap || [])];
  const activeId = (s.activeId !== undefined && s.activeId !== null) ? s.activeId : -1;
  const desc = s.desc || opToBSTDesc(op, nodes, activeId);

  return base(stepNo, op, 'tree', desc, ctx, userOutput, {
    treeState: nodes,
    activeTreeNodeId: activeId,
  });
}

function opToBSTDesc(op, nodes, activeId) {
  const node = nodes.find(n => n.id === activeId);
  const val = node ? node.val : '';
  switch (op) {
    case 'bst_init': return `Tree initialized (${nodes.length} node${nodes.length !== 1 ? 's' : ''})`;
    case 'bst_insert': return `Inserted node${val ? ' ' + val : ''}`;
    case 'bst_delete': return `Deleted node${val ? ' ' + val : ''}`;
    case 'bst_traverse': return `Visiting node${val ? ' → ' + val : ''}`;
    case 'bst_update': return `Pointer updated`;
    case 'bst_snap': return `Tree updated (${nodes.length} node${nodes.length !== 1 ? 's' : ''})`;
    default: return `Tree step`;
  }
}

/* ── Java graph auto-detection from locals' toString() reprs ───────────── */
// Map<Integer,List<Integer>>.toString()  -> "{0=[1, 2], 1=[0, 3]}"
// Set<Integer>/Deque<Integer>.toString() -> "[0, 1]"
const MAP_ADJ_RE = /^\{(.*)\}$/;
const LIST_RE = /^\[(.*)\]$/;

function parseJavaAdjMap(str) {
  const m = MAP_ADJ_RE.exec(str);
  if (!m) return null;
  const body = m[1].trim();
  if (body === '') return {};
  const adj = {};
  // Entries are "key=[v, v, ...]" separated by ", " at the top level —
  // safe to split this way since values never contain nested braces here.
  const entryRe = /(-?\d+)=\[([^\]]*)\]/g;
  let match; let any = false;
  while ((match = entryRe.exec(body)) !== null) {
    any = true;
    const key = parseInt(match[1], 10);
    const vals = match[2].trim() === '' ? [] : match[2].split(',').map(v => parseInt(v.trim(), 10)).filter(n => !Number.isNaN(n));
    adj[key] = vals;
  }
  return any ? adj : null;
}

function parseJavaIntList(str) {
  const m = LIST_RE.exec(str);
  if (!m) return null;
  const body = m[1].trim();
  if (body === '') return [];
  const parts = body.split(',').map(v => parseInt(v.trim(), 10));
  if (parts.some(n => Number.isNaN(n))) return null;
  return parts;
}

function detectJavaGraphFromLocals(locals, lastState, allowConstructionPhase) {
  if (!locals) return null;
  let adjName = null, adj = null;
  for (const [k, v] of Object.entries(locals)) {
    if (typeof v !== 'string') continue;
    const parsed = parseJavaAdjMap(v);
    if (parsed && Object.keys(parsed).length > 0) { adjName = k; adj = parsed; break; }
  }
  if (!adj) return null;

  let visited = null, visitedName = null;
  let frontier = null, frontierName = null;
  for (const [k, v] of Object.entries(locals)) {
    if (k === adjName || typeof v !== 'string') continue;
    const list = parseJavaIntList(v);
    if (list === null) continue;
    if (k.toLowerCase().includes('visit')) { visited = list; visitedName = k; continue; }
    if (['queue', 'q', 'stack', 'frontier', 'dq'].includes(k.toLowerCase())) { frontier = list; frontierName = k; }
  }
  // Outside the graph module, still require a visited/frontier-shaped local
  // as a disambiguator — an adjacency-shaped Map<Integer,List<Integer>> can
  // legitimately show up in unrelated algorithms, and without traversal
  // state to confirm it's actually a graph BFS/DFS we'd risk hijacking
  // those into the graph visualizer. Inside the graph module itself,
  // `allowConstructionPhase` lets a bare adjacency map (no traversal state
  // yet) through too — otherwise the graph's own construction (adding
  // nodes/edges before BFS/DFS starts) is invisible and the whole
  // structure just pops into existence, already complete, the instant
  // `visited`/`queue` first appears.
  if (visited === null && frontier === null && !allowConstructionPhase) return null;

  const nodes = Object.keys(adj).map(k => ({ id: parseInt(k, 10) }));
  const edges = [];
  for (const [k, nbrs] of Object.entries(adj)) {
    for (const w of nbrs) edges.push({ from: parseInt(k, 10), to: w });
  }

  const prevVisited = lastState?.visited || [];
  let activeId = null;
  const newly = (visited || []).filter(x => !prevVisited.includes(x));
  if (newly.length) {
    activeId = newly[newly.length - 1];
  } else if (frontier && frontier.length) {
    activeId = frontier[0];
  } else {
    // Construction phase — no visited/frontier yet. Highlight whichever
    // edge's target is new since the last snapshot, same idea as Python's
    // structural edge diffing, so adding an edge visibly lights up the
    // node it connects to instead of the graph silently growing unmarked.
    const prevEdgeKeys = new Set((lastState?.edges || []).map(e => `${e.from}->${e.to}`));
    const newEdges = edges.filter(e => !prevEdgeKeys.has(`${e.from}->${e.to}`));
    if (newEdges.length) activeId = newEdges[newEdges.length - 1].to;
  }

  return { nodes, edges, visited: visited || [], frontier: frontier || [], activeId };
}

/* ── Graph event builder ──────────────────────────────────────────────── */
function buildGraphEvt(s, stepNo, op, ctx, userOutput) {
  const nodes = Array.isArray(s.nodes) ? s.nodes : ctx.lastGraphState.nodes;
  const edges = Array.isArray(s.edges) ? s.edges : ctx.lastGraphState.edges;
  const visited = Array.isArray(s.visited) ? s.visited : [];
  const frontier = Array.isArray(s.frontier) ? s.frontier : [];
  const activeId = (s.activeId !== undefined) ? s.activeId : null;
  const desc = s.desc || (op === 'graph_init'
    ? `Graph initialized (${nodes.length} nodes)`
    : (activeId != null ? `Visit ${activeId}` : `Traversal step`));

  return base(stepNo, op, 'graph', desc, ctx, userOutput, {
    graphNodes: nodes,
    graphEdges: edges,
    graphVisited: visited,
    graphFrontier: frontier,
    activeGraphNodeId: activeId,
  });
}

/* ── Execution event builder ──────────────────────────────────────────── */
function buildExecEvts(s, stepNo, op, ctx, userOutput) {
  if (op === 'call') {
    // Build args object from either s.args (Java) or parse from s.args string
    const args = parseArgs(s.args);

    // Push new frame
    const frame = {
      func: s.func ?? '?',
      line: s.line ?? null,
      locals: args,
      args: args,
      returnVal: null,
    };
    ctx.frames.push(frame);
    if (s.line != null) ctx.lineNo = s.line;

    const argStr = Object.entries(args).map(([k, v]) => `${k}=${v}`).join(', ');
    const desc = s.func === '<module>'
      ? 'Program started'
      : `Called ${s.func}(${argStr})`;

    return [base(stepNo, 'call', 'execution', desc, ctx, userOutput, {
      currentLine: s.line ?? null,
    })];
  }

  if (op === 'line') {
    const locals = typeof s.locals === 'object' ? s.locals : {};

    // Update top frame
    if (ctx.frames.length > 0) {
      const top = ctx.frames[ctx.frames.length - 1];
      top.line = s.line ?? top.line;
      // Merge new locals in
      if (s.locals && typeof s.locals === 'object') {
        Object.assign(top.locals, s.locals);
      }
    }
    ctx.lineNo = s.line ?? ctx.lineNo;

    const desc = `Line ${s.line} in ${s.func ?? '?'}`;
    const overrides = {
      currentLine: s.line ?? null,
      currentFunc: s.func ?? topFunc(ctx),
    };

    // ── Java graph fallback ──────────────────────────────────────────
    // Java has no runtime AST hook like Python's sys.settrace, so instead
    // of a dedicated graph_* op we recognize the adjacency-list BFS/DFS
    // shape from the already-emitted locals' toString() reprs (a
    // Map<Integer,List<Integer>> prints "{0=[1, 2], ...}", a
    // Set<Integer>/Deque<Integer> prints "[0, 1]") — same technique the
    // frontend already relies on for readable variable display.
    const g = detectJavaGraphFromLocals(
      ctx.frames.length ? ctx.frames[ctx.frames.length - 1].locals : {},
      ctx.lastGraphState,
      ctx.moduleSlug === 'graph'
    );
    if (g) {
      ctx.lastGraphState = { nodes: g.nodes, edges: g.edges, visited: g.visited, frontier: g.frontier };
      Object.assign(overrides, {
        graphNodes: g.nodes,
        graphEdges: g.edges,
        graphVisited: g.visited,
        graphFrontier: g.frontier,
        activeGraphNodeId: g.activeId,
      });
    }

    return [base(stepNo, 'line', 'execution', desc, ctx, userOutput, overrides)];
  }

  if (op === 'return') {
    const returningFrame = ctx.frames.length > 0
      ? { ...ctx.frames[ctx.frames.length - 1], returnVal: String(s.ret ?? 'void') }
      : { func: s.func ?? '?', line: s.line ?? null, locals: {}, args: {}, returnVal: String(s.ret ?? 'void') };

    const desc = `${s.func ?? returningFrame.func} returned ${s.ret ?? 'void'}`;

    // Build event BEFORE popping so stack still shows the returning function
    const evt = base(stepNo, 'return', 'execution', desc, ctx, userOutput, {
      returningFrame,
      currentLine: s.line ?? null,
    });

    // Pop frame after building
    if (ctx.frames.length > 0) ctx.frames.pop();
    ctx.lineNo = null;

    return [evt];
  }

  return [];
}

/* ── Base event factory ───────────────────────────────────────────────── */
function base(stepNo, type, category, description, ctx, userOutput, overrides) {
  const topFrame = ctx.frames.length > 0 ? ctx.frames[ctx.frames.length - 1] : null;
  return {
    step: stepNo,
    type,
    category,
    description,
    // array panel defaults (overridden by array events)
    arrayState: [...ctx.lastSnap],
    activeIndex: null,
    secondIndex: null,
    value: null,
    // Multi-array defaults — sticky across line/call events between array
    // ops, same pattern as arrayState above, so each tracked array keeps
    // showing its own last-known state rather than flashing empty.
    arrays: Array.from(ctx.arraysByVar.values()),
    activeArrayVar: null,
    // 2D array panel defaults (overridden by array2d events)
    grid2dState: (ctx.lastGrid2D || []).map(row => [...row]),
    activeRow: null,
    activeCol: null,
    // linked-list panel defaults (overridden by ll events)
    linkedListState: [...(ctx.lastLLSnap || [])],
    activeNodeId: -1,
    // tree panel defaults (overridden by bst events)
    treeState: [...(ctx.lastBSTSnap || [])],
    activeTreeNodeId: -1,
    // graph panel defaults (overridden by graph events)
    graphNodes: [...(ctx.lastGraphState?.nodes || [])],
    graphEdges: [...(ctx.lastGraphState?.edges || [])],
    graphVisited: [...(ctx.lastGraphState?.visited || [])],
    graphFrontier: [...(ctx.lastGraphState?.frontier || [])],
    activeGraphNodeId: null,
    // call-stack panel
    callStack: ctx.frames.map(f => ({ ...f, locals: { ...f.locals }, args: { ...f.args } })),
    currentFunc: topFunc(ctx),
    currentLine: topFrame?.line ?? ctx.lineNo ?? null,
    returningFrame: null,
    locals: topFrame ? { ...topFrame.locals } : null,
    userOutput,
    ...overrides,
  };
}

/* ── Helpers ──────────────────────────────────────────────────────────── */
function topFunc(ctx) {
  return ctx.frames.length > 0 ? ctx.frames[ctx.frames.length - 1].func : null;
}

function parseArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  // Java emits args as a JSON string like {"nums":"[1,2,3]"}
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

module.exports = { buildTraceEvents };
