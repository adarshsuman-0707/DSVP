import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildTimeline, stepView, formatValue, summarize, COMPLEXITY, heightOf,
} from './heap/heapModel';

/**
 * HeapVisualizer
 * ───────────────
 * Two synchronized views of the heap the user's own program built — a binary
 * tree and the underlying array — driven only by the observed trace events
 * (see heap/heapModel.js). Both views render the same `step`, so they can
 * never disagree, and element identities (not values) key every node and
 * cell: duplicates animate to the right place, and stepping backwards
 * recomputes the real previous state instead of reversing an animation.
 */

const R = 22;           // node radius
const DX = 54;          // horizontal slot width
const DY = 74;          // level height
const PAD = 26;
const CW = 52;          // array cell width
const GAP = 6;

const PALETTE = {
  dark: {
    panelBg: '#090d16',
    panelBgImage: 'radial-gradient(circle at 50% 0%, rgba(30, 58, 138, 0.15) 0%, transparent 70%), radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
    headerBg: 'rgba(15, 23, 42, 0.75)', headerBorder: '1px solid rgba(255,255,255,.08)',
    text: '#e2e8f0', muted: '#94a3b8', faint: '#64748b',
    card: 'rgba(15, 23, 42, 0.55)', cardBorder: '1px solid rgba(255,255,255,.08)',
    chipBg: 'rgba(255,255,255,0.05)', chipBorder: '1px solid rgba(255,255,255,0.1)',
    edge: 'rgba(148,163,184,0.45)',
    nodeBg: '#1e293b', nodeBorder: 'rgba(148,163,184,0.45)', nodeText: '#e2e8f0',
    rootBg: '#3a2c10', rootBorder: 'rgba(245,158,11,0.7)',
    outside: 'rgba(148,163,184,0.25)',
    current: '#38bdf8', currentText: '#0b1220',
    other: '#a78bfa', otherText: '#0b1220',
    swap: '#fbbf24', swapText: '#0b1220',
    write: '#22d3ee', writeText: '#0b1220',
    inserted: '#34d399', insertedText: '#0b1220',
    removed: '#f87171', removedText: '#0b1220',
    family: '#818cf8',
    ok: '#34d399', bad: '#f87171', warn: '#fbbf24',
    stdoutBg: '#040711', zoom: '#cbd5e1', zoomOff: '#475569', accent: '#38bdf8',
  },
  light: {
    panelBg: '#f6f8fa',
    panelBgImage: 'radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.08) 0%, transparent 70%), radial-gradient(rgba(15, 23, 42, 0.035) 1px, transparent 1px)',
    headerBg: 'rgba(255, 255, 255, 0.85)', headerBorder: '1px solid #d0d7de',
    text: '#1e293b', muted: '#64748b', faint: '#64748b',
    card: '#ffffff', cardBorder: '1px solid #d0d7de',
    chipBg: 'rgba(15, 23, 42, 0.04)', chipBorder: '1px solid #d0d7de',
    edge: 'rgba(100,116,139,0.5)',
    nodeBg: '#ffffff', nodeBorder: '#aab4c0', nodeText: '#1e293b',
    rootBg: '#fdf1d8', rootBorder: 'rgba(217,119,6,0.7)',
    outside: 'rgba(100,116,139,0.35)',
    current: '#0284c7', currentText: '#ffffff',
    other: '#7c3aed', otherText: '#ffffff',
    swap: '#d97706', swapText: '#ffffff',
    write: '#0891b2', writeText: '#ffffff',
    inserted: '#059669', insertedText: '#ffffff',
    removed: '#dc2626', removedText: '#ffffff',
    family: '#4f46e5',
    ok: '#059669', bad: '#dc2626', warn: '#b45309',
    stdoutBg: '#ffffff', zoom: '#1e293b', zoomOff: '#cbd5e1', accent: '#0284c7',
  },
};

const ROLE_ORDER = ['inserted', 'removed', 'swap', 'write', 'current', 'other', 'moved'];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Fill / ring colours for an index given the roles it plays at this step. */
function styleFor(pal, roles, isRoot) {
  const set = roles || new Set();
  const main = ROLE_ORDER.find((r) => set.has(r));
  const colorOf = { inserted: pal.inserted, removed: pal.removed, swap: pal.swap, write: pal.write, current: pal.current, other: pal.other, moved: pal.swap };
  const textOf = { inserted: pal.insertedText, removed: pal.removedText, swap: pal.swapText, write: pal.writeText, current: pal.currentText, other: pal.otherText, moved: pal.swapText };
  if (main) return { fill: colorOf[main], stroke: colorOf[main], text: textOf[main], role: main };
  const family = set.has('parent') || set.has('left') || set.has('right');
  return {
    fill: isRoot ? pal.rootBg : pal.nodeBg,
    stroke: family ? pal.family : isRoot ? pal.rootBorder : pal.nodeBorder,
    text: pal.nodeText,
    role: family ? 'family' : null,
    ring: family,
  };
}

const ROLE_WORDS = {
  current: 'current', other: 'compared with', swap: 'swapping', write: 'written', inserted: 'inserted',
  removed: 'leaving the heap', moved: 'moved to root', parent: 'parent', left: 'left child', right: 'right child',
};

function describeRoles(roles) {
  if (!roles) return '';
  return [...roles].map((r) => ROLE_WORDS[r] || r).join(', ');
}

export default function HeapVisualizer({
  events = [], currentIndex = 0, theme = 'dark', runError = '', language = '',
  heapInfo = null, userOutput = '',
}) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const reduced = usePrefersReducedMotion();
  const total = events.length;

  const timeline = useMemo(() => buildTimeline(events), [events]);
  const view = useMemo(() => stepView(events, currentIndex, timeline), [events, currentIndex, timeline]);
  const { layout, size, items, roles, event } = view;
  const ev = event;

  const glide = reduced ? 'none' : 'transform 320ms cubic-bezier(.4,0,.2,1)';

  /* ── tree geometry ── */
  const bounds = useMemo(() => ({
    w: Math.max(1, (layout.slots - 1) * DX + 2 * R + 2 * PAD),
    h: Math.max(1, (Math.max(layout.levels, 1) - 1) * DY + 2 * R + 2 * PAD + 14),
  }), [layout]);
  const at = useCallback((idx) => {
    const p = layout.positions[idx];
    return p ? { x: PAD + R + p.slot * DX, y: PAD + R + p.depth * DY } : { x: 0, y: 0 };
  }, [layout]);

  /* ── pan / zoom (same interaction model as the other tree views) ── */
  const wrapRef = useRef(null);
  const [cam, setCam] = useState({ k: 1, x: 0, y: 0 });
  const [autoFit, setAutoFit] = useState(true);
  const drag = useRef(null);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el || size === 0) return;
    const cw = el.clientWidth; const ch = el.clientHeight;
    if (!cw || !ch) return;
    const k = Math.max(0.2, Math.min(cw / bounds.w, ch / bounds.h, 1.25));
    setCam({ k, x: (cw - bounds.w * k) / 2, y: Math.max(6, (ch - bounds.h * k) / 2) });
  }, [bounds, size]);

  useEffect(() => { if (autoFit) fit(); }, [autoFit, fit]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { if (autoFit) fit(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoFit, fit]);

  const zoomAt = useCallback((factor, cx, cy) => {
    setAutoFit(false);
    setCam((c) => {
      const el = wrapRef.current;
      const px = cx ?? (el ? el.clientWidth / 2 : 0);
      const py = cy ?? (el ? el.clientHeight / 2 : 0);
      const k = Math.max(0.2, Math.min(2.5, c.k * factor));
      const f = k / c.k;
      return { k, x: px - (px - c.x) * f, y: py - (py - c.y) * f };
    });
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setAutoFit(false);
        setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x; const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setAutoFit(false);
    setCam((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
  };
  const endDrag = (e) => { drag.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); };
  const onKeyDown = (e) => {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.15); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(1 / 1.15); }
    else if (e.key === '0' || e.key.toLowerCase() === 'f') { e.preventDefault(); setAutoFit(true); fit(); }
  };

  /* ── derived display values ── */
  const live = useMemo(() => items.filter((x) => x.inHeap), [items]);
  const rootVal = size > 0 ? view.state.vals[0] : null;
  const validText = view.valid === null ? 'unknown' : view.valid ? 'valid' : 'temporarily broken';
  const orderText = view.order === 'min' ? 'min-heap' : view.order === 'max' ? 'max-heap' : 'order not determined';
  const cx = ev ? ev.comparisons : 0;
  const sw = ev ? ev.swaps : 0;
  const ranAndNoHeap = total === 0 && !runError;
  const out = userOutput || (total > 0 ? events[total - 1].userOutput : '') || '';
  const complexityKey = view.complexityKey;

  const KIND_ICON = { compare: '⇄', swap: '↕', write: '✎', insert: '＋', remove: '－', extract: '⤒', bulk: '≋', external: '⚑', init: '◉', call: '▸', return: '◂' };

  /* ── pieces ── */
  const treeNodes = live.map((it) => {
    const p = at(it.idx);
    const st = styleFor(pal, roles.get(it.idx), it.idx === 0);
    const label = formatValue(it.v);
    const big = label.length > 3;
    return (
      <g
        key={it.id}
        role="listitem"
        aria-label={`index ${it.idx}, value ${label}${roles.get(it.idx) ? `, ${describeRoles(roles.get(it.idx))}` : ''}`}
        style={{ transform: `translate(${p.x}px, ${p.y}px)`, transition: glide }}
      >
        <g className={reduced ? undefined : 'heap-pop'}>
          {st.ring && <circle r={R + 5} fill="none" stroke={st.stroke} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.8} />}
          <circle r={R} fill={st.fill} stroke={st.stroke} strokeWidth={it.idx === 0 ? 2.5 : 2} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={big ? 11 : 15} fontWeight={700} fill={st.text}>
            {label.length > 7 ? `${label.slice(0, 6)}…` : label}
          </text>
          <text y={R + 14} textAnchor="middle" fontSize={10} fill={pal.faint}>{it.idx === 0 ? 'root · [0]' : `[${it.idx}]`}</text>
        </g>
      </g>
    );
  });

  const edges = [];
  for (let i = 1; i < size; i++) {
    const a = at((i - 1) >> 1); const b = at(i);
    const hot = roles.has(i) && (roles.get(i).has('swap') || roles.get(i).has('current')) && roles.has((i - 1) >> 1);
    edges.push(<line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hot ? pal.swap : pal.edge} strokeWidth={hot ? 2.5 : 1.5} />);
  }

  const arrayWidth = Math.max(items.length, 1) * (CW + GAP);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
        background: pal.panelBg, backgroundImage: pal.panelBgImage, backgroundSize: '100% 100%, 20px 20px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: pal.text, overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes heap-pop { from { transform: scale(.25); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .heap-pop { animation: heap-pop 300ms ease-out both; transform-box: fill-box; transform-origin: center; }
        .heap-cell-in { animation: heap-pop 260ms ease-out both; }
        @media (prefers-reduced-motion: reduce) { .heap-pop, .heap-cell-in { animation: none !important; } }
      `}</style>

      {/* ── header ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 12px',
        background: pal.headerBg, borderBottom: pal.headerBorder, flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>⛰ Heap</span>
        <Pill pal={pal} k="size" v={size} />
        <Pill pal={pal} k="root" v={size > 0 ? formatValue(rootVal) : '—'} color={pal.warn} />
        <Pill pal={pal} k="height" v={heightOf(size)} />
        <Pill pal={pal} k="order" v={orderText} />
        <Pill pal={pal} k="property" v={validText} color={view.valid === null ? pal.muted : view.valid ? pal.ok : pal.bad} />
        <Pill pal={pal} k="comparisons" v={cx} />
        <Pill pal={pal} k="swaps" v={sw} />
        <div style={{ flex: 1 }} />
        <ZoomBtn pal={pal} label="Zoom out (-)" onClick={() => zoomAt(1 / 1.15)} disabled={cam.k <= 0.2}>−</ZoomBtn>
        <span aria-live="off" style={{ fontSize: 11, fontWeight: 600, color: autoFit ? pal.muted : pal.accent, minWidth: 36, textAlign: 'center' }}>
          {autoFit ? 'Fit' : `${Math.round(cam.k * 100)}%`}
        </span>
        <ZoomBtn pal={pal} label="Zoom in (+)" onClick={() => zoomAt(1.15)} disabled={cam.k >= 2.5}>+</ZoomBtn>
        <button
          type="button" onClick={() => { setAutoFit(true); fit(); }} title="Fit to screen (F)" aria-label="Fit tree to screen"
          style={{ padding: '3px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 6, background: pal.chipBg, border: pal.chipBorder, color: pal.zoom }}
        >⤢ Fit</button>
        <span style={{ fontSize: 11, color: pal.muted }}>
          Step <b style={{ color: pal.text }}>{total ? view.index + 1 : 0}</b>{total > 0 && <span style={{ opacity: 0.6 }}>/{total}</span>}
        </span>
      </div>

      {/* ── body ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, padding: 8, overflowY: 'auto' }}>

        {/* what is happening (observed) */}
        <section
          aria-live="polite"
          style={{ background: pal.card, border: pal.cardBorder, borderRadius: 10, padding: '8px 12px', flexShrink: 0 }}
        >
          {ev ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: pal.accent, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {KIND_ICON[ev.heapKind] || '•'} {ev.heapOp}
                </span>
                {ev.func && <span style={{ fontSize: 11, color: pal.muted }}>in <code>{ev.func}()</code></span>}
                {ev.currentLine != null && <span style={{ fontSize: 11, color: pal.muted }}>line {ev.currentLine}</span>}
                {ev.heapKind === 'compare' && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: ev.res === true || (typeof ev.res === 'number' && ev.res < 0) ? pal.ok : pal.warn }}>
                    {typeof ev.res === 'number' ? `= ${ev.res}` : ev.res ? 'true' : 'false'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>{ev.description}</div>
              {ev.removed && (
                <div style={{ marginTop: 6, fontSize: 12, color: pal.removed, fontWeight: 600 }}>
                  ⤒ Left the heap: {formatValue(ev.removed.v)}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: pal.muted }}>
              {runError ? 'The run did not finish — see the error in the editor panel.' : 'Run your heap program to see it step by step.'}
            </div>
          )}
        </section>

        {/* tree + array */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flex: '1 1 320px', minHeight: 260 }}>
          {/* binary tree */}
          <section style={{ flex: '2 1 360px', minWidth: 0, minHeight: 240, display: 'flex', flexDirection: 'column', background: pal.card, border: pal.cardBorder, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: pal.muted, textTransform: 'uppercase', letterSpacing: '.05em', padding: '6px 10px' }}>Binary tree</div>
            <div
              ref={wrapRef}
              tabIndex={0}
              role="group"
              aria-label={`Heap tree. ${summarize(view)} Press plus or minus to zoom, F to fit, drag to pan.`}
              onKeyDown={onKeyDown}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: drag.current ? 'grabbing' : 'grab', outlineOffset: -2, minHeight: 200, touchAction: 'none' }}
            >
              {size === 0 ? (
                <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: pal.muted, fontSize: 13, textAlign: 'center', padding: 16 }}>
                  {total === 0
                    ? (ranAndNoHeap ? 'No heap observed yet.' : '')
                    : 'The heap is empty.'}
                </div>
              ) : (
                <svg width="100%" height="100%" role="list" aria-label="Heap nodes" style={{ display: 'block' }}>
                  <g style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`, transformOrigin: '0 0', transition: autoFit && !reduced ? 'transform 200ms ease' : 'none' }}>
                    {edges}
                    {treeNodes}
                  </g>
                </svg>
              )}
            </div>
          </section>

          {/* array */}
          <section style={{ flex: '1 1 260px', minWidth: 0, background: pal.card, border: pal.cardBorder, borderRadius: 10, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: pal.muted, textTransform: 'uppercase', letterSpacing: '.05em', padding: '6px 10px' }}>
              Array {items.length > size && <span style={{ textTransform: 'none', fontWeight: 500 }}> · heap uses the first {size} slot{size === 1 ? '' : 's'}</span>}
            </div>
            <div style={{ overflowX: 'auto', padding: '4px 10px 12px' }}>
              {items.length === 0 ? (
                <div style={{ fontSize: 13, color: pal.muted, padding: '12px 0' }}>[ ]  (empty array)</div>
              ) : (
                <div role="list" aria-label="Heap array" style={{ position: 'relative', width: arrayWidth, height: CW + 30 }}>
                  {items.map((it) => {
                    const r = roles.get(it.idx);
                    const st = styleFor(pal, r, it.idx === 0 && it.inHeap);
                    const label = formatValue(it.v);
                    return (
                      <div
                        key={it.id}
                        role="listitem"
                        aria-label={`index ${it.idx}, value ${label}${it.inHeap ? '' : ', outside the heap'}${r ? `, ${describeRoles(r)}` : ''}`}
                        style={{ position: 'absolute', left: 0, top: 0, width: CW, transform: `translateX(${it.idx * (CW + GAP)}px)`, transition: glide }}
                      >
                        <div
                          className={reduced ? undefined : 'heap-cell-in'}
                          style={{
                            height: CW, borderRadius: 8, display: 'grid', placeItems: 'center', fontWeight: 700,
                            fontSize: label.length > 4 ? 11 : 14,
                            background: it.inHeap ? st.fill : 'transparent',
                            color: it.inHeap ? st.text : pal.faint,
                            border: `2px ${it.inHeap ? 'solid' : 'dashed'} ${it.inHeap ? st.stroke : pal.outside}`,
                            opacity: it.inHeap ? 1 : 0.65,
                          }}
                        >{label.length > 7 ? `${label.slice(0, 6)}…` : label}</div>
                      </div>
                    );
                  })}
                  {items.map((it) => (
                    <div key={`i${it.idx}`} aria-hidden="true" style={{ position: 'absolute', top: CW + 6, left: it.idx * (CW + GAP), width: CW, textAlign: 'center', fontSize: 11, color: roles.has(it.idx) ? pal.accent : pal.faint, fontWeight: roles.has(it.idx) ? 700 : 500 }}>
                      {it.idx}
                    </div>
                  ))}
                </div>
              )}
              {ev && ev.i != null && (
                <div style={{ marginTop: 6, fontSize: 11, color: pal.muted }}>
                  {[
                    ev.i != null && `index ${ev.i}`,
                    ev.j != null && `with index ${ev.j}`,
                    ev.i != null && ev.i > 0 && `parent ${(ev.i - 1) >> 1}`,
                    ev.i != null && 2 * ev.i + 1 < size && `children ${2 * ev.i + 1}${2 * ev.i + 2 < size ? `, ${2 * ev.i + 2}` : ''}`,
                  ].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* legend */}
        <div aria-hidden="true" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: pal.muted }}>
          {[['current', 'current node'], ['other', 'compared with'], ['swap', 'swapped'], ['write', 'overwritten'], ['inserted', 'inserted'], ['removed', 'leaving heap']].map(([k, t]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: pal[k] }} />{t}
            </span>
          ))}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', border: `2px dashed ${pal.family}` }} />parent / children
          </span>
        </div>

        {/* complexity */}
        <section style={{ background: pal.card, border: pal.cardBorder, borderRadius: 10, padding: '8px 12px', flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: pal.muted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>
            Complexity — theory vs. what your code did
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 260 }} aria-label="Theoretical complexity of binary heap operations">
              <tbody>
                {COMPLEXITY.map((row) => {
                  const hot = row.key === complexityKey;
                  return (
                    <tr key={row.key} style={{ background: hot ? pal.chipBg : 'transparent' }}>
                      <td style={{ padding: '2px 10px 2px 4px', color: hot ? pal.text : pal.muted, fontWeight: hot ? 700 : 500 }}>{hot ? '▸ ' : ''}{row.label}</td>
                      <td style={{ padding: '2px 4px', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', color: hot ? pal.accent : pal.muted, fontWeight: hot ? 700 : 500 }}>{row.cost}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontSize: 12, color: pal.muted, lineHeight: 1.6, minWidth: 220, flex: 1 }}>
              <div>
                <b style={{ color: pal.text }}>Measured, this operation so far:</b>{' '}
                {view.measured ? `${view.measured.comparisons} comparison${view.measured.comparisons === 1 ? '' : 's'}, ${view.measured.swaps} swap${view.measured.swaps === 1 ? '' : 's'}${view.measured.writes ? `, ${view.measured.writes} write${view.measured.writes === 1 ? '' : 's'}` : ''}` : '—'}
              </div>
              <div><b style={{ color: pal.text }}>Measured, whole run so far:</b> {cx} comparisons, {sw} swaps</div>
              {size > 1 && <div>A heap of {size} elements has at most {heightOf(size) - 1} level{heightOf(size) - 1 === 1 ? '' : 's'} to climb or descend.</div>}
              <div style={{ marginTop: 4, color: pal.faint }}>
                The table is the theory for a <i>standard binary heap</i>. Your implementation may differ, so the measured counts are what it actually did.
              </div>
            </div>
          </div>
        </section>

        {/* notes about how the heap was observed */}
        {heapInfo && (heapInfo.sizeField || heapInfo.ignoredArrays > 0 || heapInfo.traceTruncated || heapInfo.order === 'unknown') && (
          <section style={{ background: pal.card, border: pal.cardBorder, borderRadius: 10, padding: '8px 12px', fontSize: 12, color: pal.muted, lineHeight: 1.6, flexShrink: 0 }}>
            {heapInfo.sizeField && <div>Heap size is read from the integer field <code>{heapInfo.sizeField}</code>; slots beyond it are shown dimmed in the array.</div>}
            {heapInfo.ignoredArrays > 0 && <div>{heapInfo.ignoredArrays} other list{heapInfo.ignoredArrays === 1 ? '' : 's'}/array{heapInfo.ignoredArrays === 1 ? ' was' : 's were'} also touched; only the one with the most heap activity is drawn.</div>}
            {heapInfo.order === 'unknown' && size > 1 && <div>The min/max order could not be determined, so the heap property is not judged.</div>}
            {heapInfo.traceTruncated && <div style={{ color: pal.warn }}>⚠ The trace was cut at the event limit; the visualization shows the first part of the run.</div>}
          </section>
        )}

        {/* program output */}
        {out && (
          <section style={{ background: pal.stdoutBg, border: pal.cardBorder, borderRadius: 10, padding: '6px 10px', flexShrink: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: pal.faint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
              Program output{language ? ` (${language})` : ''}
            </div>
            <pre style={{ margin: 0, fontSize: 12, color: pal.text, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, Menlo, Consolas, monospace', maxHeight: 120, overflow: 'auto' }}>{out}</pre>
          </section>
        )}
      </div>
    </div>
  );
}

function Pill({ pal, k, v, color }) {
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'baseline', padding: '2px 8px', borderRadius: 999, background: pal.chipBg, border: pal.chipBorder, fontSize: 11 }}>
      <span style={{ color: pal.faint }}>{k}</span>
      <b style={{ color: color || pal.text }}>{String(v)}</b>
    </span>
  );
}

function ZoomBtn({ pal, label, onClick, disabled, children }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      style={{ padding: '2px 9px', fontSize: 14, cursor: disabled ? 'default' : 'pointer', borderRadius: 6, background: pal.chipBg, border: pal.chipBorder, color: disabled ? pal.zoomOff : pal.zoom }}
    >{children}</button>
  );
}
