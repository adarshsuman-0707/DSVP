

const ARRAY_OPS = new Set(['init','write','read','swap','append','compare']);
const EXEC_OPS  = new Set(['call','line','return']);

function buildTraceEvents({ language, rawTrace, moduleSlug, userOutput }) {
  if (!rawTrace || !Array.isArray(rawTrace.steps)) return [];
  return normalizeAll(rawTrace.steps, userOutput || '');
}

/* ── Main normalizer ───────────────────────────────────────────────────── */
function normalizeAll(steps, userOutput) {  
  const events = [];

  // Running context
  const ctx = {
    frames:    [],     // StackFrame stack — bottom [0] → top [last]
    lastSnap:  [],     // most recent array snapshot
    lineNo:    null,
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
  let value       = s.val !== undefined && s.val !== null ? s.val : null;
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

/* ── Execution event builder ──────────────────────────────────────────── */
function buildExecEvts(s, stepNo, op, ctx, userOutput) {
  if (op === 'call') {
    // Build args object from either s.args (Java) or parse from s.args string
    const args = parseArgs(s.args);

    // Push new frame
    const frame = {
      func:      s.func   ?? '?',
      line:      s.line   ?? null,
      locals:    args,
      args:      args,
      returnVal: null,
    };
    ctx.frames.push(frame);
    if (s.line != null) ctx.lineNo = s.line;

    const argStr = Object.entries(args).map(([k,v]) => `${k}=${v}`).join(', ');
    const desc   = s.func === '<module>'
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
      top.line   = s.line  ?? top.line;
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
    step:          stepNo,
    type,
    category,
    description,
    // array panel defaults (overridden by array events)
    arrayState:    [...ctx.lastSnap],
    activeIndex:   null,
    secondIndex:   null,
    value:         null,
    // call-stack panel
    callStack:     ctx.frames.map(f => ({ ...f, locals: { ...f.locals }, args: { ...f.args } })),
    currentFunc:   topFunc(ctx),
    currentLine:   topFrame?.line ?? ctx.lineNo ?? null,
    returningFrame:null,
    locals:        topFrame ? { ...topFrame.locals } : null,
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
