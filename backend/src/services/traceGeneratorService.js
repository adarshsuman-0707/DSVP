// /**
//  * Trace Generator Service
//  * ────────────────────────
//  * Converts raw DSVP_TRACE steps into normalized visualization events.
//  *
//  * Raw step types from shims:
//  *   Array ops : init | write | read | swap | append | compare
//  *   Call stack: call | return | line
//  *
//  * Normalized event shape (frontend contract):
//  * {
//  *   step        : number,
//  *   type        : 'init'|'write'|'read'|'swap'|'append'|'compare'|
//  *                 'call'|'return'|'line'|'highlight',
//  *   description : string,          // human label for description bar
//  *   arrayState  : number[],        // array snapshot (null if no array op)
//  *   activeIndex : number|null,
//  *   secondIndex : number|null,
//  *   value       : number|null,
//  *   userOutput  : string,
//  *   // ── call-stack fields ──
//  *   callStack   : StackFrame[],    // full stack at this moment
//  *   currentFunc : string|null,     // top-of-stack function name
//  *   currentLine : number|null,     // line number inside that function
//  * }
//  *
//  * StackFrame: { func, line, locals, args, returnVal }
//  */

// function buildTraceEvents({ language, rawTrace, moduleSlug, userOutput }) {
//   if (!rawTrace || !Array.isArray(rawTrace.steps)) return [];

//   // All modules go through the unified normalizer which handles both
//   // array ops and call-stack events in one pass.
//   return normalizeAll(rawTrace.steps, userOutput || '');
// }

// /* ── Unified normalizer ────────────────────────────────────────────────── */

// function normalizeAll(steps, userOutput) {
//   const events      = [];
//   let   lastSnap    = [];           // most recent array snapshot
//   let   callStack   = [];           // live call stack [ {func,line,locals,args} ]
//   let   stepCounter = 0;

//   for (const s of steps) {
//     const op = s.op ?? 'highlight';

//     // ── Call-stack maintenance ────────────────────────────────────────────
//     if (op === 'call') {
//       callStack = [
//         ...callStack,
//         { func: s.func ?? '?', line: s.line ?? null, locals: s.args ?? {}, args: s.args ?? {}, returnVal: null },
//       ];
//       stepCounter++;
//       events.push({
//         step:        stepCounter,
//         type:        'call',
//         description: buildCallDesc(s),
//         arrayState:  [...lastSnap],
//         activeIndex: null,
//         secondIndex: null,
//         value:       null,
//         userOutput,
//         callStack:   deepCloneStack(callStack),
//         currentFunc: topFunc(callStack),
//         currentLine: s.line ?? null,
//       });
//       continue;
//     }

//     if (op === 'return') {
//       const returningFunc = s.func ?? topFunc(callStack) ?? '?';
//       // Update the top frame's returnVal before popping
//       if (callStack.length > 0) {
//         const top = { ...callStack[callStack.length - 1], returnVal: s.ret ?? null, locals: s.locals ?? {} };
//         callStack = [...callStack.slice(0, -1)];   // pop
//         stepCounter++;
//         events.push({
//           step:        stepCounter,
//           type:        'return',
//           description: `↩ ${returningFunc} returned ${s.ret ?? 'void'}`,
//           arrayState:  [...lastSnap],
//           activeIndex: null,
//           secondIndex: null,
//           value:       null,
//           userOutput,
//           callStack:   deepCloneStack(callStack),   // stack AFTER pop
//           returningFrame: top,                       // the frame that just returned
//           currentFunc: topFunc(callStack),
//           currentLine: s.line ?? null,
//         });
//       }
//       continue;
//     }

//     if (op === 'line') {
//       // Update locals on the top frame — don't emit a visible event
//       // (line events are too noisy; they just update the stack state
//       //  which will be attached to the NEXT array-op event)
//       if (callStack.length > 0) {
//         const top = callStack[callStack.length - 1];
//         callStack = [
//           ...callStack.slice(0, -1),
//           { ...top, line: s.line ?? top.line, locals: s.locals ?? top.locals },
//         ];
//       }
//       // We still emit a 'line' event so the editor can highlight it
//       stepCounter++;
//       events.push({
//         step:        stepCounter,
//         type:        'line',
//         description: `Line ${s.line} in ${s.func ?? '?'}`,
//         arrayState:  [...lastSnap],
//         activeIndex: null,
//         secondIndex: null,
//         value:       null,
//         userOutput,
//         callStack:   deepCloneStack(callStack),
//         currentFunc: s.func ?? topFunc(callStack),
//         currentLine: s.line ?? null,
//       });
//       continue;
//     }

//     // ── Array-op events ───────────────────────────────────────────────────
//     const snap = Array.isArray(s.snap) ? s.snap : lastSnap;
//     lastSnap   = snap;

//     let type        = op;
//     let activeIndex = typeof s.idx === 'number' && s.idx >= 0 ? s.idx : null;
//     let secondIndex = null;
//     let value       = typeof s.val === 'number' ? s.val : null;
//     let description = '';

//     switch (op) {
//       case 'init':
//         activeIndex = null;
//         description = `Array initialized: [${snap.join(', ')}]  (size ${snap.length})`;
//         break;

//       case 'write':
//         description = `arr[${activeIndex}] = ${value}`;
//         break;

//       case 'read':
//         description = `Read arr[${activeIndex}]  →  ${value}`;
//         break;

//       case 'swap': {
//         const j2 = typeof s.val === 'number' ? s.val : null;
//         secondIndex = j2;
//         value       = null;
//         description = `Swap arr[${s.idx}] ↔ arr[${j2}]  →  [${snap.join(', ')}]`;
//         break;
//       }

//       case 'append':
//         description = `Append ${value}  →  arr[${activeIndex}]`;
//         break;

//       case 'compare': {
//         const j2   = typeof s.val === 'number' ? s.val : null;
//         secondIndex = j2;
//         value       = null;
//         const av    = snap[s.idx] ?? '?';
//         const bv    = j2 !== null ? (snap[j2] ?? '?') : '?';
//         description = `Compare arr[${s.idx}]=${av}  vs  arr[${j2}]=${bv}`;
//         break;
//       }

//       default:
//         type        = 'highlight';
//         description = `Step ${stepCounter + 1}`;
//     }

//     stepCounter++;
//     events.push({
//       step:        stepCounter,
//       type,
//       description,
//       arrayState:  snap,
//       activeIndex,
//       secondIndex,
//       value,
//       userOutput,
//       callStack:   deepCloneStack(callStack),
//       currentFunc: topFunc(callStack),
//       currentLine: callStack.length > 0 ? callStack[callStack.length - 1].line : null,
//     });
//   }

//   return events;
// }

// /* ── Helpers ──────────────────────────────────────────────────────────── */

// function buildCallDesc(s) {
//   const args = s.args ?? {};
//   const argStr = Object.entries(args)
//     .map(([k, v]) => `${k}=${v}`)
//     .join(', ');
//   return `→ ${s.func ?? '?'}(${argStr})`;
// }

// function topFunc(stack) {
//   return stack.length > 0 ? stack[stack.length - 1].func : null;
// }

// function deepCloneStack(stack) {
//   return stack.map(f => ({ ...f, locals: { ...f.locals }, args: { ...f.args } }));
// }

// module.exports = { buildTraceEvents };
/**
 * Trace Generator Service (v3 — call-stack + variables wired to the frontend)
 * ────────────────────────────────────────────────────────────────────────
 * v1: array ops only.
 * v2: added execution ops (call/line/return) but never exposed a call-stack
 *     snapshot — VisualizationCanvas/CallStackPanel expect `callStack`,
 *     `currentFunc`, `returningFrame`, `currentLine` on every event, so
 *     those panels always rendered empty. THAT was the bug.
 * v3: maintains a running call-stack while walking the raw steps and
 *     attaches a *snapshot* of it (plus currentFunc/returningFrame/
 *     currentLine/locals/changedVars/sourceLine) to every single event —
 *     including array events — so the call-stack panel and the editor
 *     line-highlight stay in sync no matter which panel/step you're on.
 *
 * Frontend contract (per event):
 * {
 *   step, type, category, description,
 *
 *   // array panel
 *   arrayState, activeIndex, secondIndex, value,
 *
 *   // call-stack / variables panel (NOW ALWAYS POPULATED)
 *   callStack      : string[],        // e.g. ['<module>', 'findGCD'] — bottom → top
 *   currentFunc    : string|null,     // top-of-stack function name at this step
 *   returningFrame : string|null,     // set only on the exact 'return' step —
 *                                      //   lets the UI animate that frame leaving
 *   currentLine    : number|null,     // source line highlighted in the editor
 *   sourceLine     : string|null,     // stripped text of that line
 *   locals         : object|null,     // {varName: reprString} of the active frame
 *   changedVars    : string[],        // which locals changed ON THIS EXACT STEP
 *                                      //   (empty array on carried-forward steps)
 *   depth          : number|null,
 *
 *   userOutput,
 * }
 */

const ARRAY_OPS = ['init', 'write', 'read', 'swap', 'append', 'compare'];
const EXEC_OPS   = ['call', 'line', 'return'];

function buildTraceEvents({ language, rawTrace, moduleSlug, userOutput }) {
  if (!rawTrace || !Array.isArray(rawTrace.steps)) return [];

  switch (moduleSlug) {
    case 'array':  return normalizeExecution(rawTrace.steps, userOutput || '');
    // future: case 'linked-list': return normalizeLinkedList(...)
    // future: case 'stack':       return normalizeStack(...)
    default:       return normalizeExecution(rawTrace.steps, userOutput || '');
  }
}

/* ── Combined array + execution + call-stack normalizer ────────────────── */
function normalizeExecution(steps, userOutput) {
  const events = [];

  // ── running context, carried across the whole replay ──
  const ctx = {
    callStackNames: [],   // ['<module>', 'findGCD', ...] bottom → top
    currentFunc: null,
    currentLine: null,
    sourceLine: null,
    locals: null,
    lastArraySnap: [],
  };

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];

    if (ARRAY_OPS.includes(s.op)) {
      const evt = buildArrayEvent(s, i, ctx);
      ctx.lastArraySnap = evt.arrayState;
      events.push({ ...evt, userOutput });
      continue;
    }

    if (EXEC_OPS.includes(s.op)) {
      const evt = buildExecutionEvent(s, i, ctx);
      events.push({ ...evt, userOutput });
      continue;
    }

    // Unknown op — degrade gracefully instead of dropping the step
    events.push(baseEvent(s, i, ctx, {
      type: 'highlight',
      category: 'execution',
      description: `Step ${i + 1}`,
    }));
  }

  return events;
}

/** Fields every single event gets, regardless of op type. */
function baseEvent(s, i, ctx, overrides) {
  return {
    step: typeof s.step === 'number' ? s.step : i + 1,
    arrayState: ctx.lastArraySnap,
    activeIndex: null,
    secondIndex: null,
    value: null,
    callStack: [...ctx.callStackNames],
    currentFunc: ctx.currentFunc,
    returningFrame: null,
    currentLine: ctx.currentLine,
    sourceLine: ctx.sourceLine,
    locals: ctx.locals,
    changedVars: [],
    depth: Math.max(ctx.callStackNames.length - 1, 0),
    ...overrides,
  };
}

function buildArrayEvent(s, i, ctx) {
  const snap = Array.isArray(s.snap) ? s.snap : [];

  let type        = s.op ?? 'highlight';
  let activeIndex = typeof s.idx === 'number' && s.idx >= 0 ? s.idx : null;
  let secondIndex = null;
  let value       = typeof s.val === 'number' ? s.val : null;
  let description = '';

  switch (s.op) {
    case 'init':
      activeIndex = null;
      description = `Array initialized with ${snap.length} element${snap.length !== 1 ? 's' : ''}: [${snap.join(', ')}]`;
      break;
    case 'write':
      description = `arr[${activeIndex}] = ${value}`;
      break;
    case 'read':
      description = `Read arr[${activeIndex}] → ${value}`;
      break;
    case 'swap': {
      const jIdx = typeof s.val === 'number' ? s.val : null;
      activeIndex = s.idx;
      secondIndex = jIdx;
      value       = null;
      description = `Swap arr[${s.idx}] ↔ arr[${jIdx}]  →  [${snap.join(', ')}]`;
      break;
    }
    case 'append':
      description = `Append ${value} → arr[${activeIndex}]`;
      break;
    case 'compare': {
      const jIdx = typeof s.val === 'number' ? s.val : null;
      activeIndex = s.idx;
      secondIndex = jIdx;
      value       = null;
      const aVal  = s.idx >= 0 ? snap[s.idx] : '?';
      const bVal  = jIdx  >= 0 ? snap[jIdx]  : '?';
      description = `Compare arr[${s.idx}]=${aVal} vs arr[${jIdx}]=${bVal}`;
      break;
    }
    default:
      type        = 'highlight';
      description = `Step ${i + 1}`;
  }

  return {
    ...baseEvent(s, i, ctx, {
      type,
      category: 'array',
      description,
      arrayState: snap,
      activeIndex,
      secondIndex,
      value,
    }),
  };
}

function buildExecutionEvent(s, i, ctx) {
  let description = '';
  let returningFrame = null;

  if (s.op === 'call') {
    // entering a new frame — push BEFORE building the event so callStack
    // in this event already shows the function we just entered
    ctx.callStackNames.push(s.func);
    ctx.currentFunc = s.func;
    if (typeof s.line === 'number') ctx.currentLine = s.line;

    const argsStr = s.args && Object.keys(s.args).length
      ? Object.entries(s.args).map(([k, v]) => `${k}=${v}`).join(', ')
      : '';
    description = s.func === '<module>'
      ? 'Program started'
      : `Called ${s.func}(${argsStr})`;
  }

  else if (s.op === 'line') {
    ctx.currentFunc  = s.func;
    ctx.currentLine  = s.line;
    ctx.sourceLine   = s.source ?? null;
    ctx.locals       = s.locals ?? ctx.locals;

    const changed = Array.isArray(s.changed) ? s.changed : [];
    if (changed.length && s.locals) {
      const changeStr = changed
        .filter((k) => k in s.locals)
        .map((k) => `${k} = ${s.locals[k]}`)
        .join(', ');
      description = changeStr
        ? `Line ${s.line}: ${s.source}  →  ${changeStr}`
        : `Line ${s.line}: ${s.source}`;
    } else {
      description = `Line ${s.line}: ${s.source}`;
    }
  }

  else if (s.op === 'return') {
    // still on the stack for this one event — UI animates it leaving,
    // THEN we pop it so subsequent steps show the popped stack
    ctx.currentFunc = s.func;
    ctx.currentLine = s.line;
    ctx.locals      = s.locals ?? ctx.locals;
    returningFrame  = s.func;

    description = s.func === '<module>'
      ? 'Program finished'
      : `${s.func} returned ${s.ret}`;
  }

  const evt = baseEvent(s, i, ctx, {
    type: s.op,
    category: 'execution',
    description,
    value: s.op === 'return' ? (s.ret ?? null) : null,
    returningFrame,
    changedVars: Array.isArray(s.changed) ? s.changed : [],
  });

  // pop AFTER building the event, so the returning frame was visible above
  if (s.op === 'return') {
    if (ctx.callStackNames[ctx.callStackNames.length - 1] === s.func) {
      ctx.callStackNames.pop();
    }
    ctx.currentFunc = ctx.callStackNames[ctx.callStackNames.length - 1] ?? null;
  }

  return evt;
}

module.exports = { buildTraceEvents };