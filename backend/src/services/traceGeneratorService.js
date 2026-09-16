

const ARRAY_OPS = new Set(['init', 'write', 'read', 'swap', 'append', 'compare']);
const EXEC_OPS = new Set(['call', 'line', 'return']);
const LL_OPS = new Set(['ll_snap', 'll_init', 'll_update', 'll_insert', 'll_delete', 'll_traverse']);

function buildTraceEvents({ language, rawTrace, moduleSlug, userOutput }) {
  if (!rawTrace || !Array.isArray(rawTrace.steps)) return [];
  const events = normalizeAll(rawTrace.steps, userOutput || '');
  if (moduleSlug === 'linked-list') {
    return compactLLEvents(events);
  }
  return events;
}

function compactLLEvents(events) {
  const hasLL = events.some(e => LL_OPS.has(e.type));
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
      if (next && LL_OPS.has(next.type)) {
        continue;
      }
      // If preceded by an LL event or call, skip empty intermediate loop check lines
      const prev = compacted[compacted.length - 1];
      if (prev && (LL_OPS.has(prev.type) || prev.type === 'call')) {
        continue;
      }
    }

    // Filter duplicate consecutive LL events that don't alter state or active node
    if (LL_OPS.has(e.type)) {
      const prev = compacted[compacted.length - 1];
      if (prev && LL_OPS.has(prev.type)) {
        const sameActive = prev.activeNodeId === e.activeNodeId;
        const sameNodes = JSON.stringify(prev.linkedListState) === JSON.stringify(e.linkedListState);
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

/* ── Main normalizer ───────────────────────────────────────────────────── */
function normalizeAll(steps, userOutput) {
  const events = [];

  // Running context
  const ctx = {
    frames: [],   // StackFrame stack
    lastSnap: [],   // most recent array snapshot
    lastLLSnap: [],   // most recent linked-list snapshot
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

    if (LL_OPS.has(op)) {
      const evt = buildLLEvt(s, stepNo, op, ctx, userOutput);
      ctx.lastLLSnap = evt.linkedListState;
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

  let activeIndex = (typeof s.idx === 'number' && s.idx >= 0) ? s.idx : null;
  let secondIndex = null;
  let value = s.val !== undefined && s.val !== null ? s.val : null;
  let description = '';

  switch (op) {
    case 'init':
      activeIndex = null;
      description = `Array initialized: [${snap.join(', ')}]  (size ${snap.length})`;
      break;
    case 'write':
      description = `arr[${activeIndex}] = ${value}`;
      break;
    case 'read':
      description = `Read arr[${activeIndex}]  →  ${value}`;
      break;
    case 'swap': {
      const j2 = typeof s.val === 'number' ? s.val : null;
      secondIndex = j2; value = null;
      description = `Swap arr[${s.idx}] ↔ arr[${j2}]  →  [${snap.join(', ')}]`;
      break;
    }
    case 'append':
      description = `Append ${value}  →  arr[${activeIndex}]`;
      break;
    case 'compare': {
      const j2 = typeof s.val === 'number' ? s.val : null;
      secondIndex = j2; value = null;
      const av = snap[s.idx] ?? '?', bv = j2 != null ? snap[j2] : '?';
      description = `Compare arr[${s.idx}]=${av}  vs  arr[${j2}]=${bv}`;
      break;
    }
    default:
      description = `Step ${stepNo}`;
  }

  return base(stepNo, op, 'array', description, ctx, userOutput, {
    arrayState: snap, activeIndex, secondIndex, value,
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
    return [base(stepNo, 'line', 'execution', desc, ctx, userOutput, {
      currentLine: s.line ?? null,
      currentFunc: s.func ?? topFunc(ctx),
    })];
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
    // linked-list panel defaults (overridden by ll events)
    linkedListState: [...(ctx.lastLLSnap || [])],
    activeNodeId: -1,
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
