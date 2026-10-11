'use strict';

/**
 * Heap trace reconstructor
 * ────────────────────────
 * Turns the language-neutral *primitive* events emitted by the Python and
 * Java heap instrumenters into the high-level heap events the UI plays back.
 * Nothing here knows a variable, class or method name: every conclusion is
 * drawn from what the program was actually observed to do (array writes,
 * list resizes, comparisons, a size counter that moved, call/return).
 *
 * RAW EVENT SCHEMA (shared by both runtimes; JSON lines `DSVP_TRACE:`)
 *   hp_new  { a, k:'list'|'array', snap, len, line }        array first seen
 *   hp_set  { a, i, old, v, snap, len, line }               element write
 *   hp_rs   { a, k:'append'|'insert'|'pop'|'remove'|'del'|'extend'|'clear'|
 *                  'sort'|'reverse'|'replace', i, v, snap, len, line }
 *   hp_cmp  { la, li, ra, ri, lv, rv, o, r, line }          comparison (a/i may be null)
 *   hp_sc   { n, v, line }                                  integer field/attribute changed
 *   hp_call { f, d, args, line }   hp_ret { f, d, r, line }
 *   hp_trunc{}                                              raw event budget exhausted
 * `snap` is the array contents AFTER the event (authoritative); `a` is an
 * opaque array id.
 *
 * OUTPUT (one object per UI step) — see buildHeapEvents().
 */

const MAX_ITEMS = 256;

/* ── generic value helpers ─────────────────────────────────────────────── */

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** Total order over JSON values (numbers numerically, strings lexically, arrays lexicographically). */
function cmpVal(a, b) {
  if (isNum(a) && isNum(b)) return a < b ? -1 : a > b ? 1 : 0;
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
const eqVal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function label(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return `(${v.map(label).join(', ')})`;
  return String(v);
}

const parentOf = (i) => (i > 0 ? (i - 1) >> 1 : -1);
const leftOf = (i) => 2 * i + 1;
const rightOf = (i) => 2 * i + 2;

/* ── Phase A: choose what to visualize ─────────────────────────────────── */

function analyze(raw) {
  const arrays = new Map();
  const get = (a) => {
    if (!arrays.has(a)) arrays.set(a, { a, cmps: 0, sets: 0, rs: 0, dynamic: false, maxLen: 0, first: null, kind: 'list' });
    return arrays.get(a);
  };
  const scalars = new Map();
  let truncated = false;

  for (let n = 0; n < raw.length; n++) {
    const e = raw[n];
    switch (e.op) {
      case 'hp_new': { const s = get(e.a); s.kind = e.k || s.kind; s.maxLen = Math.max(s.maxLen, e.len ?? (e.snap || []).length); if (!s.first) s.first = n; break; }
      case 'hp_set': { const s = get(e.a); s.sets += 1; s.maxLen = Math.max(s.maxLen, e.len ?? 0); if (!s.first) s.first = n; break; }
      case 'hp_rs': {
        const s = get(e.a); s.rs += 1; s.maxLen = Math.max(s.maxLen, e.len ?? 0);
        if (['append', 'insert', 'pop', 'remove', 'del', 'extend', 'clear'].includes(e.k)) s.dynamic = true;
        if (!s.first) s.first = n;
        break;
      }
      case 'hp_cmp':
        if (e.la != null) get(e.la).cmps += 1;
        if (e.ra != null && e.ra !== e.la) get(e.ra).cmps += 1;
        break;
      case 'hp_sc': {
        if (!scalars.has(e.n)) scalars.set(e.n, []);
        scalars.get(e.n).push({ n, v: e.v });
        break;
      }
      case 'hp_trunc': truncated = true; break;
      default: break;
    }
  }

  // The heap is the array with the most comparison / mutation activity.
  const ranked = [...arrays.values()]
    .map((s) => ({ ...s, score: s.cmps * 3 + s.sets + s.rs }))
    .filter((s) => s.score > 0 && s.maxLen > 0)
    .sort((x, y) => y.score - x.score || x.first - y.first);

  const primary = ranked[0] || null;
  return { primary, ignored: ranked.slice(1), scalars, truncated };
}

/** Which integer field/attribute is the logical heap size of a fixed-capacity array? */
function pickSizeScalar(info, raw) {
  const p = info.primary;
  if (!p || p.dynamic) return null;
  let best = null;
  for (const [name, series] of info.scalars) {
    if (!series.every((s) => Number.isInteger(s.v) && s.v >= 0 && s.v <= p.maxLen)) continue;
    let steps = 0; let prev = 0;
    for (const s of series) { if (Math.abs(s.v - prev) === 1) steps += 1; prev = s.v; }
    // reward changes that sit next to a write on the heap array
    let near = 0;
    for (const s of series) {
      for (let k = Math.max(0, s.n - 3); k <= Math.min(raw.length - 1, s.n + 3); k++) {
        if (raw[k].op === 'hp_set' && raw[k].a === p.a) { near += 1; break; }
      }
    }
    const score = steps * 2 + near;
    if (steps > 0 && (!best || score > best.score)) best = { name, score };
  }
  return best ? best.name : null;
}

/* ── Phase B: replay with element identity ─────────────────────────────── */

function reconstruct(raw, opts = {}) {
  const info = analyze(raw);
  const p = info.primary;
  if (!p) return { events: [], info, error: 'no-heap-array' };
  if (p.maxLen > MAX_ITEMS) {
    return { events: [], info, error: 'too-large', maxLen: p.maxLen };
  }

  const sizeName = pickSizeScalar(info, raw);
  const dynamic = p.dynamic;

  let vals = [];            // committed array contents
  let ids = [];             // element identities, parallel to vals
  let nextId = 1;
  let scalarSize = null;    // logical size from the counter field (fixed arrays)
  let boundary = null;      // heap-sort style shrinking boundary (fixed arrays, no counter)
  const held = [];          // recently overwritten elements {id, v}
  const out = [];
  const counters = { comparisons: 0, swaps: 0, writes: 0, inserts: 0, removes: 0 };
  let line = null;
  const callStack = [];       // {f, outIndex, act, mut}
  let activity = 0;           // non-call/return events so far
  let mutations = 0;          // events that changed the array
  let seenMutation = false;
  let pendingWrite = null;  // {i, old, v, line}
  let pendingPop = null;    // {i, v, id, line}
  let lastState = null;
  let curN = 0;               // raw event currently being processed

  const liveSize = () => {
    if (dynamic) return vals.length;
    if (sizeName && scalarSize !== null) return Math.min(scalarSize, vals.length);
    if (boundary !== null) return Math.min(boundary, vals.length);
    return vals.length;
  };

  const newId = () => nextId++;
  const remember = (id, v) => { held.push({ id, v }); if (held.length > 64) held.shift(); };

  function stateObj() {
    return { ids: ids.slice(), vals: vals.slice(), size: liveSize() };
  }

  function push(kind, data) {
    const st = stateObj();
    const same = lastState && lastState.size === st.size && lastState.ids.length === st.ids.length &&
      lastState.ids.every((x, k) => x === st.ids[k]) && eqVal(lastState.vals, st.vals);
    const ev = {
      kind,
      line: data.line ?? line,
      i: data.i ?? null,
      j: data.j ?? null,
      ...data,
      src: data.src ?? curN,
      depth: callStack.length,
      func: data.func !== undefined ? data.func : (callStack.length ? callStack[callStack.length - 1].f : null),
      counters: { ...counters },
      size: st.size,
    };
    ev.line = ev.line ?? null;
    if (kind !== 'call' && kind !== 'return') activity += 1;
    if (['swap', 'write', 'insert', 'remove', 'extract', 'bulk', 'external'].includes(kind)) mutations += 1;
    if (['insert', 'remove', 'extract', 'bulk', 'external', 'init'].includes(kind)) held.length = 0;
    // call/return markers never carry state, so dropping a pair can never drop a state change
    if (!same && kind !== 'call' && kind !== 'return') { ev.state = st; lastState = st; }
    out.push(ev);
    return ev;
  }

  /** Resync to an authoritative snapshot when something changed that we did not observe. */
  function resync(snap, why) {
    const before = vals.slice();
    const used = new Set();
    const newIds = snap.map((v) => {
      for (let k = 0; k < ids.length; k++) {
        if (!used.has(k) && k < before.length && eqVal(before[k], v)) { used.add(k); return ids[k]; }
      }
      for (let k = 0; k < ids.length; k++) {
        if (!used.has(k) && eqVal(before[k], v)) { used.add(k); return ids[k]; }
      }
      return newId();
    });
    vals = snap.slice();
    ids = newIds;
    return why;
  }

  function checkSnap(e, why) {
    if (!Array.isArray(e.snap)) return;
    if (e.snap.length !== vals.length || !eqVal(e.snap, vals)) {
      flush();
      resync(e.snap, why);
      push('external', { description: 'The array changed in a way that was not observed element-by-element (for example a library call).' });
    }
  }

  function writeSlot(i, v) {
    // identity rule: an overwritten element is remembered; a value written back that was just
    // overwritten is that same element returning; otherwise the element that already holds the
    // value elsewhere moves here (a clone stays behind), otherwise it is a brand-new element.
    const oldId = ids[i]; const oldV = vals[i];
    let id = null;
    if (eqVal(oldV, v)) return { id: oldId, noop: true };
    for (let k = held.length - 1; k >= 0; k--) {
      if (eqVal(held[k].v, v)) { id = held[k].id; held.splice(k, 1); break; }
    }
    let from = null;
    if (id === null) {
      const cands = [];
      for (let k = 0; k < vals.length; k++) if (k !== i && eqVal(vals[k], v)) cands.push(k);
      if (cands.length) {
        const rel = [parentOf(i), leftOf(i), rightOf(i)];
        from = cands.find((k) => rel.includes(k));
        if (from === undefined) from = cands.reduce((a, b) => (Math.abs(a - i) <= Math.abs(b - i) ? a : b));
        id = ids[from];
        ids[from] = newId();            // a copy remains behind in the old slot
      }
    }
    if (id === null) id = newId();
    if (oldId !== undefined) remember(oldId, oldV);
    ids[i] = id; vals[i] = v;
    return { id, from };
  }

  function flush() {
    if (pendingPop) {
      const pp = pendingPop; pendingPop = null;
      counters.removes += 1;
      push('remove', {
        i: pp.i, removed: { id: pp.id, v: pp.v, i: pp.i },
        description: `Removed ${label(pp.v)} from the end of the array`, line: pp.line, src: pp.n,
      });
    }
    if (pendingWrite) {
      const w = pendingWrite; pendingWrite = null;
      applyWrite(w);
    }
  }

  function applyWrite(w) {
    const { i, v } = w;
    if (i >= vals.length) { vals[i] = v; ids[i] = newId(); }
    const old = vals[i];
    // a fixed-capacity array's slots beyond the logical size are not part of the heap
    // (clearing a freed slot, staging a value): keep the array current without a heap event
    if (!dynamic && sizeName && scalarSize !== null && i >= liveSize()) {
      if (!eqVal(old, v)) { ids[i] = newId(); vals[i] = v; }
      return;
    }
    const res = writeSlot(i, v);
    if (res.noop) return;
    counters.writes += 1;
    push('write', {
      i, j: res.from ?? null, old, v, movedId: res.id, line: w.line, src: w.n,
      description: res.from != null
        ? `heap[${i}] = ${label(v)} (copied from index ${res.from}; it held ${label(old)})`
        : `heap[${i}] = ${label(v)} (was ${label(old)})`,
    });
  }

  function doSwap(i, j, ln) {
    [ids[i], ids[j]] = [ids[j], ids[i]];
    [vals[i], vals[j]] = [vals[j], vals[i]];
    counters.swaps += 1;
    // heap-sort style boundary: swapping the root with the slot just below the live region
    // moves that slot out of the heap in the same step
    if (!dynamic && !sizeName && j > 0 && i === 0) {
      const b = boundary === null ? vals.length : boundary;
      if (j === b - 1) boundary = j;
    }
    push('swap', {
      i, j, line: ln, vi: vals[j], vj: vals[i],
      description: `Swap index ${i} and index ${j}`,
    });
  }

  const isPrimary = (a) => a === p.a;

  for (let n = 0; n < raw.length; n++) {
    const e = raw[n];
    curN = n;
    if (e.line != null) line = e.line;

    switch (e.op) {
      case 'hp_new': {
        if (!isPrimary(e.a)) break;
        vals = (e.snap || []).slice(); ids = vals.map(newId);
        push('init', { description: vals.length ? `Array created with ${vals.length} element${vals.length === 1 ? '' : 's'}` : 'Empty heap created' });
        break;
      }

      case 'hp_set': {
        if (!isPrimary(e.a)) break;
        if (!vals.length && Array.isArray(e.snap) && e.snap.length) {
          // first sight of the array was a write
          const before = e.snap.slice(); before[e.i] = e.old;
          vals = before; ids = vals.map(newId);
          push('init', { description: `Array of ${vals.length} element${vals.length === 1 ? '' : 's'} observed`, line: e.line });
        }
        seenMutation = true;
        // swap: this write completes the pair started by the pending write
        if (pendingWrite && e.i !== pendingWrite.i &&
            eqVal(e.old, pendingWrite.v) && eqVal(e.v, pendingWrite.old) &&
            !eqVal(pendingWrite.old, pendingWrite.v)) {
          const w = pendingWrite; pendingWrite = null;
          doSwap(w.i, e.i, e.line);
          checkSnap(e, 'swap');
          break;
        }
        // equal-value swap: two no-op writes back to back on one line
        if (pendingWrite && pendingWrite.noop && e.i !== pendingWrite.i && eqVal(e.old, e.v) &&
            eqVal(e.v, pendingWrite.v) && e.line === pendingWrite.line) {
          const w = pendingWrite; pendingWrite = null;
          doSwap(w.i, e.i, e.line);
          break;
        }
        // extract (Python style): `a[0] = a.pop()` — pop then write the popped value to slot 0
        if (pendingPop && e.i < vals.length && eqVal(e.v, pendingPop.v) && e.i !== pendingPop.i) {
          const pp = pendingPop; pendingPop = null;
          const rootId = ids[e.i]; const rootV = vals[e.i];
          ids[e.i] = pp.id; vals[e.i] = pp.v;
          counters.removes += 1;
          push('extract', {
            i: e.i, j: pp.i, removed: { id: rootId, v: rootV, i: e.i }, movedId: pp.id, movedFrom: pp.i,
            description: `Extracted ${label(rootV)} from index ${e.i}; the last element ${label(pp.v)} moves to index ${e.i}`,
            line: e.line,
          });
          checkSnap(e, 'extract');
          break;
        }
        flush();
        if (eqVal(e.old, e.v)) { pendingWrite = { i: e.i, old: e.old, v: e.v, line: e.line, noop: true, n }; break; }
        pendingWrite = { i: e.i, old: e.old, v: e.v, line: e.line, n };
        // writes outside the live region of a fixed array are staging writes; they are
        // applied silently now and announced when the size counter grows to include them
        break;
      }

      case 'hp_rs': {
        if (!isPrimary(e.a)) break;
        seenMutation = true;
        flush();
        const k = e.k;
        if (k === 'append' || k === 'insert') {
          const idx = k === 'append' ? vals.length : e.i;
          const id = newId();
          vals.splice(idx, 0, e.v); ids.splice(idx, 0, id);
          counters.inserts += 1;
          push('insert', {
            i: idx, v: e.v, id, line: e.line,
            description: `Inserted ${label(e.v)} at index ${idx}`,
          });
        } else if (k === 'extend') {
          const start = vals.length;
          for (let q = start; q < (e.snap || []).length; q++) {
            vals.push(e.snap[q]); ids.push(newId());
          }
          counters.inserts += (e.snap || []).length - start;
          push('bulk', { description: `Added ${(e.snap || []).length - start} element(s) with extend()`, line: e.line });
        } else if (k === 'pop' || k === 'remove' || k === 'del') {
          const idx = e.i != null && e.i >= 0 && e.i < vals.length ? e.i : vals.length - 1;
          const id = ids[idx]; const v = vals[idx];
          vals.splice(idx, 1); ids.splice(idx, 1);
          if (k === 'pop' && idx === vals.length) {
            // may be the first half of `a[0] = a.pop()`
            pendingPop = { i: idx, v, id, line: e.line, n };
            // the popped slot is already out of the array; defer announcing it
          } else {
            counters.removes += 1;
            push('remove', {
              i: idx, removed: { id, v, i: idx }, line: e.line,
              description: `Removed ${label(v)} from index ${idx}`,
            });
          }
        } else if (k === 'clear') {
          vals = []; ids = [];
          push('bulk', { description: 'The array was cleared', line: e.line });
        } else {
          // sort / reverse / replace: keep identities by value matching
          resync(e.snap || [], k);
          push('bulk', {
            description: k === 'sort' ? 'The array was sorted in place by a library call'
              : k === 'reverse' ? 'The array was reversed in place' : 'The array contents were replaced',
            line: e.line,
          });
        }
        break;
      }

      case 'hp_cmp': {
        if ((e.la != null && !isPrimary(e.la)) && (e.ra != null && !isPrimary(e.ra))) break;
        if (e.la != null && !isPrimary(e.la) && e.ra == null) break;
        if (e.ra != null && !isPrimary(e.ra) && e.la == null) break;
        flush();
        counters.comparisons += 1;
        let li = e.la != null && isPrimary(e.la) ? e.li : null;
        let ri = e.ra != null && isPrimary(e.ra) ? e.ri : null;
        const live = liveSize();
        // resolve unknown sides by value when it is unambiguous
        const find = (v) => {
          const hits = [];
          for (let k = 0; k < live; k++) if (eqVal(vals[k], v)) hits.push(k);
          return hits.length === 1 ? hits[0] : null;
        };
        if (li == null && e.lv !== undefined) li = find(e.lv);
        if (ri == null && e.rv !== undefined) ri = find(e.rv);
        if (li != null && li === ri && !(e.la != null && e.ra != null)) { li = e.la != null ? li : null; ri = e.ra != null ? ri : null; }
        const holdL = li == null && e.lv !== undefined && held.some((h) => eqVal(h.v, e.lv));
        const holdR = ri == null && e.rv !== undefined && held.some((h) => eqVal(h.v, e.rv));
        push('compare', {
          i: li, j: ri, vi: e.lv, vj: e.rv, op: e.o, res: e.r, line: e.line, heldI: holdL, heldJ: holdR,
          description: typeof e.r === 'number' ? `Compare ${label(e.lv)}.${e.o}(${label(e.rv)}) → ${e.r}` : `Compare ${label(e.lv)} ${e.o} ${label(e.rv)} → ${e.r ? 'true' : 'false'}`,
        });
        break;
      }

      case 'hp_sc': {
        if (dynamic || e.n !== sizeName) break;
        const before = scalarSize === null ? 0 : scalarSize;
        const after = Math.min(e.v, vals.length);
        // writes parked outside the live region land in the array silently
        if (pendingWrite) {
          const w = pendingWrite;
          // extract (fixed array): root overwritten by the last live element, then size shrinks
          if (after < before && w.i === 0 && before - 1 < vals.length && eqVal(w.v, vals[before - 1]) && before > 1) {
            pendingWrite = null;
            const rootId = ids[0]; const rootV = vals[0];
            const lastId = ids[before - 1];
            ids[0] = lastId; vals[0] = w.v; ids[before - 1] = newId();
            scalarSize = e.v;
            counters.removes += 1;
            push('extract', {
              i: 0, j: before - 1, removed: { id: rootId, v: rootV, i: 0 }, movedId: lastId, movedFrom: before - 1,
              description: `Extracted ${label(rootV)} from the root; the last element ${label(w.v)} moves to the root`,
              line: w.line,
            });
            break;
          }
          if (after > before && w.i >= before && w.i < after) {
            // insert: element written at the first free slot, then the counter grows over it
            pendingWrite = null;
            const id = newId();
            vals[w.i] = w.v; ids[w.i] = id;
            scalarSize = e.v;
            counters.inserts += 1;
            push('insert', { i: w.i, v: w.v, id, line: w.line, description: `Inserted ${label(w.v)} at index ${w.i}` });
            break;
          }
        }
        flush();
        if (after < before) {
          for (let k = before - 1; k >= after; k--) {
            counters.removes += 1;
            push('remove', {
              i: k, removed: { id: ids[k], v: vals[k], i: k }, line: e.line,
              description: `Heap size decreased: index ${k} (${label(vals[k])}) leaves the heap`,
            });
          }
          scalarSize = e.v;
          lastState = null;
        } else if (after > before) {
          scalarSize = e.v;
          for (let k = before; k < after; k++) {
            counters.inserts += 1;
            push('insert', { i: k, v: vals[k], id: ids[k], line: e.line, description: `Heap size grew: index ${k} (${label(vals[k])}) joins the heap` });
          }
        } else {
          scalarSize = e.v;
        }
        break;
      }

      case 'hp_call': {
        flush();
        push('call', { description: `Call ${e.f}(${(e.args || []).join(', ')})`, args: e.args || [], line: e.line });
        out[out.length - 1].func = e.f;
        callStack.push({ f: e.f, outIndex: out.length - 1, act: activity, mut: mutations });
        break;
      }

      case 'hp_ret': {
        flush();
        const frame = callStack[callStack.length - 1];
        if (!frame) break;
        if (frame.act === activity) {
          // a call that never touched the heap is noise: drop the whole call/return pair
          out.splice(frame.outIndex, 1);
          callStack.pop();
          break;
        }
        const root = liveSize() > 0 ? vals[0] : undefined;
        callStack.pop();
        push('return', {
          description: e.r === 'None' || e.r === 'void' ? `${e.f}() returned` : `${e.f}() returned ${e.r}`,
          ret: e.r, func: e.f, line: e.line, noMutation: mutations === frame.mut,
          retIsRoot: root !== undefined && String(label(root)) === String(e.r),
        });
        break;
      }

      default: break;
    }
  }
  flush();

  // sizes that never changed observably: nothing to do. If the counter was found but the array was
  // pre-filled, the first state has size 0 — reveal it from the first non-zero counter value instead.
  void seenMutation;
  return { events: out, info, sizeName, dynamic };
}

/* ── heap property ─────────────────────────────────────────────────────── */

function validity(vals, size) {
  const n = Math.min(size, vals.length);
  let min = true; let max = true;
  for (let c = 1; c < n; c++) {
    const c1 = cmpVal(vals[c], vals[parentOf(c)]);
    if (c1 < 0) min = false;
    if (c1 > 0) max = false;
    if (!min && !max) break;
  }
  return { min, max };
}

function inferOrder(events) {
  let mins = 0; let maxs = 0;
  let cur = null;
  for (const e of events) {
    if (e.state) cur = e.state;
    if (!cur || cur.size < 2) continue;
    const v = validity(cur.vals, cur.size);
    if (v.min && !v.max) mins += 1;
    else if (v.max && !v.min) maxs += 1;
  }
  if (mins === 0 && maxs === 0) return 'unknown';
  return mins >= maxs ? 'min' : 'max';
}

/* ── annotation: operation phases, explanations, statistics ────────────── */

const OP_LABEL = {
  insert: 'Insert', extract: 'Extract root', siftUp: 'Sift up', siftDown: 'Sift down',
  build: 'Build heap (heapify)', sort: 'Heap sort', peek: 'Peek', fix: 'Restore heap order', other: 'Heap operation',
};

function height(n) { return n > 0 ? Math.floor(Math.log2(n)) + 1 : 0; }

function relation(i, j) {
  if (i == null || j == null) return null;
  if (j === parentOf(i)) return { child: i, parent: j, kind: 'child-parent' };
  if (i === parentOf(j)) return { child: j, parent: i, kind: 'parent-child' };
  if (i !== j && parentOf(i) === parentOf(j) && parentOf(i) >= 0) return { kind: 'siblings', parent: parentOf(i) };
  return null;
}

function annotate(events, order) {
  let cur = { ids: [], vals: [], size: 0 };
  let ctx = null;              // {kind:'insert'|'extract'|'sort', depth}
  let chainStart = null;       // smallest index a repair chain started from
  let buildChains = 0;
  let sortedCount = 0;
  let n0 = null;               // size of the initial array

  const detail = (e, st) => {
    const vals = st.vals;
    const rel = relation(e.i, e.j);
    const v = (k) => (k != null && k < vals.length ? label(vals[k]) : '?');
    if (e.kind === 'compare') {
      let s = '';
      if (rel && rel.kind === 'child-parent') {
        s = `Comparing the node at index ${e.i} (${label(e.vi)}) with its parent at index ${e.j} (${label(e.vj)}). `;
      } else if (rel && rel.kind === 'parent-child') {
        s = `Comparing the node at index ${e.i} (${label(e.vi)}) with its child at index ${e.j} (${label(e.vj)}). `;
      } else if (rel && rel.kind === 'siblings') {
        s = `Comparing the sibling nodes at index ${e.i} (${label(e.vi)}) and index ${e.j} (${label(e.vj)}) to pick the better child. `;
      } else {
        const side = (v, idx, held) => `${label(v)}${idx != null ? ` (index ${idx})` : held ? ' (the element being placed, held aside)' : ''}`;
        s = `Comparing ${side(e.vi, e.i, e.heldI)} with ${side(e.vj, e.j, e.heldJ)}. `;
      }
      s += typeof e.res === 'number'
        ? `${label(e.vi)}.${e.op}(${label(e.vj)}) returned ${e.res} (${e.res < 0 ? 'the first is smaller' : e.res > 0 ? 'the first is larger' : 'they are equal'}).`
        : `${label(e.vi)} ${e.op} ${label(e.vj)} is ${e.res ? 'true' : 'false'}.`;
      if (rel && (rel.kind === 'child-parent' || rel.kind === 'parent-child') && order !== 'unknown') {
        const c = rel.kind === 'child-parent' ? e.vi : e.vj;
        const pr = rel.kind === 'child-parent' ? e.vj : e.vi;
        const bad = order === 'min' ? cmpVal(c, pr) < 0 : cmpVal(c, pr) > 0;
        s += bad
          ? ` The child is ${order === 'min' ? 'smaller' : 'larger'} than its parent, so the ${order}-heap property is violated here.`
          : ` The ${order}-heap property holds for this parent and child.`;
      }
      return s;
    }
    if (e.kind === 'swap') {
      const r = relation(e.i, e.j);
      const where = r && r.kind === 'child-parent' ? ` (child index ${e.i} swaps with its parent index ${e.j})`
        : r && r.kind === 'parent-child' ? ` (parent index ${e.i} swaps with its child index ${e.j})` : '';
      return `Swapped index ${e.i} and index ${e.j}${where}: they now hold ${v(e.i)} and ${v(e.j)}.`;
    }
    return e.description;
  };

  const out = events.map((e, idx) => {
    if (e.state) cur = e.state;
    if (n0 === null && e.kind === 'init') n0 = cur.size;

    // ── operation phase: inferred only from what was observed ──
    // insert → the repair that follows is a sift-up; extract → sift-down. Both end when the
    // function in which the mutation happened returns. With no insert/extract in play
    // (e.g. heapifying a given array) the repair is labelled by the shape of the chains.
    let sortSwap = false;
    if (e.kind === 'insert') { ctx = { kind: 'insert', depth: e.depth }; }
    else if (e.kind === 'extract') { ctx = { kind: 'extract', depth: e.depth }; }
    else if (e.kind === 'remove' && !(ctx && ctx.kind === 'extract')) { ctx = { kind: 'extract', depth: e.depth }; }
    else if (e.kind === 'swap' && e.i === 0 && e.j != null && (e.j === cur.size - 1 || e.j === cur.size) && e.j > 0 &&
             n0 !== null && e.j === n0 - 1 - sortedCount) {
      ctx = { kind: 'sort', depth: e.depth }; sortedCount += 1; sortSwap = true;
    }
    let opKey = 'other';
    if (sortSwap) opKey = 'sort';
    else if (e.kind === 'insert') opKey = 'insert';
    else if (e.kind === 'extract' || e.kind === 'remove') opKey = ctx && ctx.kind === 'sort' ? 'sort' : 'extract';
    else if (e.kind === 'compare' || e.kind === 'swap' || e.kind === 'write') {
      if (ctx && ctx.kind === 'insert') opKey = 'siftUp';
      else if (ctx && ctx.kind === 'extract') opKey = 'siftDown';
      else if (ctx && ctx.kind === 'sort') opKey = 'siftDown';
      else {
        const r = relation(e.i, e.j);
        if (r && (r.kind === 'parent-child' || r.kind === 'siblings' || r.kind === 'child-parent')) {
          const start = r.kind === 'siblings' ? r.parent : Math.min(e.i, e.j);
          if (chainStart !== null && start < chainStart && Math.abs(start - chainStart) <= Math.max(2, chainStart)) buildChains += 1;
          if (chainStart === null || start < chainStart) chainStart = start;
          opKey = buildChains >= 1 ? 'build' : 'fix';
        }
      }
    } else if (e.kind === 'return') {
      const wasCtx = ctx;
      if (e.retIsRoot && e.noMutation && !ctx) opKey = 'peek';
      else if (wasCtx) opKey = wasCtx.kind === 'insert' ? 'insert' : wasCtx.kind === 'sort' ? 'sort' : 'extract';
      if (ctx && e.depth < ctx.depth) ctx = null;
    }

    const v = validity(cur.vals, cur.size);
    const okNow = cur.size < 2 ? true : order === 'min' ? v.min : order === 'max' ? v.max : null;

    return {
      step: idx + 1,
      type: 'heap',
      category: 'heap',
      heapKind: e.kind,
      heapOp: OP_LABEL[opKey] || OP_LABEL.other,
      heapOpKey: opKey,
      description: detail(e, cur),
      currentLine: e.line ?? null,
      i: e.i, j: e.j,
      vi: e.vi, vj: e.vj, opSym: e.op, res: e.res, heldI: !!e.heldI, heldJ: !!e.heldJ,
      v: e.v, removed: e.removed, movedId: e.movedId, movedFrom: e.movedFrom, insertedId: e.id,
      func: e.func, depth: e.depth, ret: e.ret, src: e.src,
      state: e.state,
      heapSize: cur.size,
      heapHeight: height(cur.size),
      heapRoot: cur.size > 0 ? cur.vals[0] : null,
      heapValid: okNow,
      heapOrder: order,
      comparisons: e.counters.comparisons,
      swaps: e.counters.swaps,
      writes: e.counters.writes,
      inserts: e.counters.inserts,
      removes: e.counters.removes,
      initialSize: n0,
    };
  });
  return out;
}

/**
 * Raw primitive events → UI events.
 * Returns { events, info } where info = { order, dynamic, sizeField, ignored, truncated }.
 * On failure returns { events: [], error: 'no-heap-array' | 'too-large' }.
 */
function buildHeapEvents(raw, { maxEvents = 5000 } = {}) {
  const r = reconstruct(raw);
  if (r.error) return r;
  const order = inferOrder(r.events);
  let events = annotate(r.events, order);
  let truncated = r.info.truncated;
  if (events.length > maxEvents) { events = events.slice(0, maxEvents); truncated = true; }
  return {
    events,
    info: {
      order,
      dynamic: r.dynamic,
      sizeField: r.sizeName || null,
      ignoredArrays: r.info.ignored.length,
      truncated,
    },
  };
}

module.exports = { buildHeapEvents, reconstruct, analyze, inferOrder, validity, cmpVal, parentOf, leftOf, rightOf, MAX_ITEMS };
