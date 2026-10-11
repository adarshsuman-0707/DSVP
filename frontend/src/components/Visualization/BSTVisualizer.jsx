import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { buildStepView, layoutTree, hasAnyTree } from './bst/bstModel';

/**
 * BSTVisualizer
 * ──────────────
 * Interactive view of a binary (search) tree, driven by the tree snapshots
 * the user's program actually produced (see bst/bstModel.js).
 *
 * Preferred inputs:  events (all normalized trace events) + currentIndex
 *   → every number, highlight and sentence shown is a pure function of the
 *     step, so stepping backwards / scrubbing always shows the observed
 *     state at that step.
 * Legacy inputs (treeState / activeNodeId / …) still work as a fallback.
 *
 * Nothing here assumes field names, a duplicate-key policy or which
 * operation is running; it only reports what the snapshots show.
 */

const R = 24;            // node radius
const DX = 76;           // horizontal slot width
const DY = 84;           // level height
const PAD = 28;

/* ── Theme Palette (unchanged DSVP palette + role colours) ── */
const PALETTE = {
  dark: {
    panelBg: '#090d16',
    panelBgImage: 'radial-gradient(circle at 50% 0%, rgba(30, 58, 138, 0.15) 0%, transparent 70%), radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
    headerBg: 'rgba(15, 23, 42, 0.75)',
    headerBorder: '1px solid rgba(255,255,255,.08)',
    badgeBg: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(139, 92, 246, 0.2))',
    badgeBorder: '1px solid rgba(96, 165, 250, 0.3)',
    textPrimary: '#e2e8f0',
    textMuted: '#94a3b8',
    textFaint: '#64748b',
    sizePillBg: 'rgba(56, 189, 248, 0.1)',
    sizePillBorder: '1px solid rgba(56, 189, 248, 0.25)',
    sizePillText: '#38bdf8',
    rootPillBg: 'rgba(245, 158, 11, 0.12)',
    rootPillBorder: '1px solid rgba(245, 158, 11, 0.3)',
    rootPillText: '#f59e0b',
    chipBg: 'rgba(255,255,255,0.05)',
    chipBorder: '1px solid rgba(255,255,255,0.1)',
    zoomDisabled: '#475569',
    zoomEnabled: '#cbd5e1',
    zoomResetIdle: '#64748b',
    zoomResetActive: '#38bdf8',
    stepText: '#94a3b8',
    stepValue: '#f1f5f9',
    bannerBg: 'rgba(15, 23, 42, 0.7)',
    bannerBorder: '1px solid rgba(255, 255, 255, 0.08)',
    bannerShadow: '0 4px 20px rgba(0,0,0,0.3)',
    stdoutBg: '#040711',
    stdoutBorder: '1px solid rgba(255,255,255,.07)',
    stdoutHeaderText: '#64748b',
    stdoutText: '#c9d1d9',
    emptyBorder: '1.5px dashed rgba(148,163,184,0.25)',
    emptyText: '#64748b',
    emptyHeading: '#94a3b8',
    edgeStroke: 'rgba(148,163,184,0.45)',
    nodeIdleBg: '#1e293b',
    nodeIdleBorder: 'rgba(148,163,184,0.45)',
    nodeRootBg: '#3a2c10',
    nodeRootBorder: 'rgba(245,158,11,0.7)',
    nodeIdleText: '#e2e8f0',
    panelBorder: '1px solid rgba(255,255,255,.08)',
    panelBg2: 'rgba(15, 23, 42, 0.55)',
    // roles
    current: '#38bdf8', currentText: '#0b1220',
    created: '#34d399', createdBg: '#0f3a2d',
    path: '#38bdf8', pathBg: '#0e2a3d',
    link: '#818cf8',
    removed: '#f87171',
    warn: '#fbbf24',
  },
  light: {
    panelBg: '#f6f8fa',
    panelBgImage: 'radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.08) 0%, transparent 70%), radial-gradient(rgba(15, 23, 42, 0.035) 1px, transparent 1px)',
    headerBg: 'rgba(255, 255, 255, 0.85)',
    headerBorder: '1px solid #d0d7de',
    badgeBg: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(139, 92, 246, 0.12))',
    badgeBorder: '1px solid rgba(59, 130, 246, 0.3)',
    textPrimary: '#1e293b',
    textMuted: '#64748b',
    textFaint: '#64748b',
    sizePillBg: 'rgba(2, 132, 199, 0.08)',
    sizePillBorder: '1px solid rgba(2, 132, 199, 0.25)',
    sizePillText: '#0284c7',
    rootPillBg: 'rgba(217, 119, 6, 0.1)',
    rootPillBorder: '1px solid rgba(217, 119, 6, 0.3)',
    rootPillText: '#d97706',
    chipBg: 'rgba(15, 23, 42, 0.04)',
    chipBorder: '1px solid #d0d7de',
    zoomDisabled: '#cbd5e1',
    zoomEnabled: '#1e293b',
    zoomResetIdle: '#64748b',
    zoomResetActive: '#0284c7',
    stepText: '#475569',
    stepValue: '#1e293b',
    bannerBg: '#ffffff',
    bannerBorder: '1px solid #e2e8f0',
    bannerShadow: '0 4px 14px rgba(15,23,42,0.08)',
    stdoutBg: '#ffffff',
    stdoutBorder: '1px solid #d0d7de',
    stdoutHeaderText: '#64748b',
    stdoutText: '#1e293b',
    emptyBorder: '1.5px dashed #d0d7de',
    emptyText: '#64748b',
    emptyHeading: '#475569',
    edgeStroke: 'rgba(100,116,139,0.5)',
    nodeIdleBg: '#ffffff',
    nodeIdleBorder: '#aab4c0',
    nodeRootBg: '#fdf1d8',
    nodeRootBorder: 'rgba(217,119,6,0.7)',
    nodeIdleText: '#1e293b',
    panelBorder: '1px solid #d0d7de',
    panelBg2: '#ffffff',
    current: '#0284c7', currentText: '#ffffff',
    created: '#059669', createdBg: '#d9f5ea',
    path: '#0284c7', pathBg: '#dbeefa',
    link: '#4f46e5',
    removed: '#dc2626',
    warn: '#b45309',
  },
};

/* ── small hooks ─────────────────────────────────────────────────────── */

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Tween node positions between layouts; new nodes grow in (t: 0→1). */
function useTweenedPositions(target, reduced) {
  const [state, setState] = useState({ pos: target, t: 1, born: new Set() });
  const latest = useRef(target);

  useEffect(() => {
    const from = latest.current;
    const born = new Set();
    for (const id of target.keys()) if (!from.has(id)) born.add(id);

    if (reduced) {
      latest.current = target;
      setState({ pos: target, t: 1, born: new Set() });
      return undefined;
    }

    const DURATION = 240;
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      const e = 1 - Math.pow(1 - t, 3);
      const pos = new Map();
      for (const [id, to] of target) {
        const f = from.get(id) || to;
        pos.set(id, { x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e });
      }
      latest.current = pos;
      setState({ pos, t: e, born });
      if (t < 1) raf = requestAnimationFrame(tick);
      else latest.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);

  return state;
}

/* ── component ───────────────────────────────────────────────────────── */

export default function BSTVisualizer({
  // preferred
  events          = null,
  currentIndex    = 0,
  runError        = '',
  language        = '',
  // legacy fallback
  treeState       = [],
  activeNodeId    = -1,
  type            = 'bst_snap',
  description     = '',
  step            = 0,
  totalSteps      = 0,
  userOutput      = '',
  theme           = 'dark',
}) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const reduced = usePrefersReducedMotion();
  const [stdoutH, setStdoutH] = useState(110);
  const [resizing, setResizing] = useState(false);
  const rootRef = useRef(null);

  // Drag the divider above the output drawer to resize it.
  useEffect(() => {
    if (!resizing) return undefined;
    const onMove = (e) => {
      const el = rootRef.current;
      if (!el) return;
      const bottom = el.getBoundingClientRect().bottom;
      setStdoutH(Math.max(60, Math.min(el.clientHeight * 0.6, bottom - e.clientY)));
    };
    const onUp = () => setResizing(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  /* ── derive the step view ── */
  const useEvents = Array.isArray(events) && events.length > 0;
  const view = useMemo(() => {
    if (useEvents) return buildStepView(events, currentIndex);
    // legacy: wrap the props as a single synthetic event
    const synthetic = [{ type: treeState.length ? (type || 'bst_snap') : 'line', treeState, activeTreeNodeId: activeNodeId, description, userOutput }];
    return buildStepView(synthetic, 0);
  }, [useEvents, events, currentIndex, treeState, activeNodeId, type, description, userOutput]);

  const nodes = view.nodes;
  const { positions, slots, levels } = useMemo(() => layoutTree(nodes), [nodes]);

  const target = useMemo(() => {
    const m = new Map();
    for (const [id, p] of positions) m.set(id, { x: PAD + R + p.x * DX, y: PAD + R + p.depth * DY });
    return m;
  }, [positions]);
  const { pos, t: grow, born } = useTweenedPositions(target, reduced);

  const bounds = useMemo(() => ({
    w: Math.max(1, (slots - 1) * DX + 2 * R + 2 * PAD),
    h: Math.max(1, (levels - 1) * DY + 2 * R + 2 * PAD),
  }), [slots, levels]);

  /* ── pan / zoom ── */
  const wrapRef = useRef(null);
  const [cam, setCam] = useState({ k: 1, x: 0, y: 0 });
  const [autoFit, setAutoFit] = useState(true);
  const drag = useRef(null);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el || nodes.length === 0) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    if (!cw || !ch) return;
    const k = Math.max(0.2, Math.min(cw / bounds.w, ch / bounds.h, 1.25));
    setCam({ k, x: (cw - bounds.w * k) / 2, y: Math.max(8, (ch - bounds.h * k) / 2) });
  }, [bounds, nodes.length]);

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
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setAutoFit(false);
    setCam((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
  };
  const endDrag = (e) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };
  const onKeyDown = (e) => {
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.15); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(1 / 1.15); }
    else if (e.key === '0' || e.key.toLowerCase() === 'f') { e.preventDefault(); setAutoFit(true); fit(); }
  };

  /* ── derived display data ── */
  const stats = view.stats;
  const createdSet = useMemo(() => new Set(view.createdIds), [view.createdIds]);
  const pathSet = useMemo(() => new Set(view.pathIds), [view.pathIds]);
  const changedLinks = useMemo(() => {
    const s = new Set();
    for (const r of view.relinks) if (r.to !== null) s.add(`${r.id}>${r.to}`);
    return s;
  }, [view.relinks]);
  const pathEdges = useMemo(() => {
    const s = new Set();
    for (let i = 1; i < view.pathIds.length; i++) s.add(`${view.pathIds[i - 1]}>${view.pathIds[i]}`);
    return s;
  }, [view.pathIds]);

  const shownStep = step || (useEvents ? currentIndex + 1 : 0);
  const shownTotal = totalSteps || (useEvents ? events.length : 0);
  const out = view.userOutput || userOutput;
  const text = view.description || description;
  const empty = nodes.length === 0;
  const ranAndNoTree = useEvents && !hasAnyTree(events) && !runError;

  const ariaSummary = empty
    ? 'Empty binary tree'
    : `Binary tree with ${stats.nodes} node${stats.nodes === 1 ? '' : 's'}, root ${stats.root}, height ${stats.height}.` +
      (view.activeId !== -1 ? ` Current node ${view.nodes.find((n) => n.id === view.activeId)?.val}.` : '');

  return (
    <div
      ref={rootRef}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: pal.panelBg, backgroundImage: pal.panelBgImage,
        backgroundSize: '100% 100%, 20px 20px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        overflow: 'hidden', userSelect: resizing ? 'none' : 'auto', position: 'relative',
      }}
    >
      {/* ── TOP BAR ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', background: pal.headerBg,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: pal.headerBorder, flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8,
            background: pal.badgeBg, border: pal.badgeBorder,
          }}>
            <span aria-hidden="true" style={{ fontSize: 13 }}>🌳</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: pal.textPrimary, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Binary Search Tree
            </span>
          </div>
          <Pill pal={pal}>{stats.nodes} {stats.nodes === 1 ? 'Node' : 'Nodes'}</Pill>
          {stats.root !== null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6,
              background: pal.rootPillBg, border: pal.rootPillBorder,
              fontSize: 11, fontWeight: 600, color: pal.rootPillText,
            }}>
              <span style={{ fontSize: 9, opacity: 0.8 }}>ROOT</span><span>[{String(stats.root)}]</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} role="group" aria-label="Tree view controls">
          <div style={{ display: 'flex', alignItems: 'center', background: pal.chipBg, border: pal.chipBorder, borderRadius: 6, overflow: 'hidden' }}>
            <ZoomBtn pal={pal} label="Zoom out (-)" onClick={() => zoomAt(1 / 1.15)} disabled={cam.k <= 0.2}>−</ZoomBtn>
            <span aria-live="off" style={{ padding: '0 6px', fontSize: 11, fontWeight: 600, color: autoFit ? pal.zoomResetIdle : pal.zoomResetActive, minWidth: 38, textAlign: 'center' }}>
              {Math.round(cam.k * 100)}%
            </span>
            <ZoomBtn pal={pal} label="Zoom in (+)" onClick={() => zoomAt(1.15)} disabled={cam.k >= 2.5}>+</ZoomBtn>
          </div>
          <button type="button" onClick={() => { setAutoFit(true); fit(); }} aria-label="Fit tree to screen (F)" title="Fit to screen (F)"
            style={chipBtn(pal)}>Fit</button>
          <button type="button" onClick={() => { setAutoFit(false); setCam({ k: 1, x: 12, y: 12 }); }} aria-label="Reset view to 100%" title="Reset view"
            style={chipBtn(pal)}>100%</button>
          {shownStep > 0 && (
            <div style={{ fontSize: 11, fontWeight: 700, color: pal.stepText, letterSpacing: '.04em', minWidth: 65, textAlign: 'right' }}>
              Step <span style={{ color: pal.stepValue }}>{shownStep}</span>
              {shownTotal > 0 && <span style={{ opacity: 0.6 }}>/{shownTotal}</span>}
            </div>
          )}
        </div>
      </header>

      {/* ── STATS STRIP ── */}
      {!empty && (
        <div role="group" aria-label="Tree information" style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px',
          padding: '6px 18px', borderBottom: pal.headerBorder, flexShrink: 0, fontSize: 11.5,
        }}>
          <Stat pal={pal} k="Height" v={stats.height} />
          <Stat pal={pal} k="Leaves" v={stats.leaves} />
          <Stat pal={pal} k="Internal" v={stats.internal} />
          <Stat pal={pal} k="Min" v={stats.min} />
          <Stat pal={pal} k="Max" v={stats.max} />
          {stats.validBst === false && (
            <span role="alert" style={{ color: pal.warn, fontWeight: 600 }}>⚠ Keys not in BST order</span>
          )}
          {stats.cyclic && (
            <span role="alert" style={{ color: pal.warn, fontWeight: 600 }}>⚠ Node reachable twice (cycle)</span>
          )}
        </div>
      )}

      {/* ── STEP BANNER + EXPLANATION ── */}
      {(text || view.explanation.length > 0 || view.removedNodes.length > 0) && (
        <div role="status" aria-live="polite" style={{
          margin: '8px 16px 0', padding: '6px 12px', borderRadius: 10,
          background: pal.bannerBg, border: pal.bannerBorder, boxShadow: pal.bannerShadow, flexShrink: 0,
        }}>
          {text && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: pal.textPrimary }}>{text}</div>
          )}
          {view.explanation.length > 0 && (
            <ul style={{ margin: text ? '4px 0 0' : 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {view.explanation.slice(0, 3).map((line, i) => (
                <li key={i} style={{ fontSize: 12, color: pal.textMuted }}>{line}</li>
              ))}
            </ul>
          )}
          {view.removedNodes.length > 0 && (
            <div style={{ marginTop: 4, fontSize: 12, color: pal.removed, fontWeight: 600 }}>
              Removed from tree: {view.removedNodes.map((n) => String(n.val)).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* ── CANVAS + INFO ── */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', padding: '8px 16px', overflow: 'hidden' }}>
        <div
          ref={wrapRef}
          tabIndex={0}
          role="application"
          aria-label={`Tree canvas. ${ariaSummary} Press plus or minus to zoom, F to fit, drag to pan.`}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            flex: 1, minWidth: 0, minHeight: 0, position: 'relative', overflow: 'hidden',
            borderRadius: 12, border: pal.panelBorder, background: pal.panelBg2,
            cursor: 'grab', touchAction: 'none', outlineOffset: 2,
          }}
        >
          {empty ? (
            <EmptyHint pal={pal} ranAndNoTree={ranAndNoTree} language={language} />
          ) : (
            <svg width="100%" height="100%" role="img" aria-label={ariaSummary} style={{ display: 'block' }}>
              <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.k})`}>
                {nodes.map((n) => {
                  const p = pos.get(n.id);
                  if (!p) return null;
                  return ['left', 'right'].map((side) => {
                    const cid = n[`${side}Id`];
                    if (cid === null || cid === undefined || cid === -1) return null;
                    const c = pos.get(cid);
                    if (!c) return null;
                    const key = `${n.id}>${cid}`;
                    const onPath = pathEdges.has(key);
                    const changed = changedLinks.has(key);
                    return (
                      <line key={`${key}-${side}`} x1={p.x} y1={p.y} x2={c.x} y2={c.y}
                        stroke={changed ? pal.link : onPath ? pal.path : pal.edgeStroke}
                        strokeWidth={changed || onPath ? 3 : 2} strokeLinecap="round" />
                    );
                  });
                })}
                {nodes.map((n) => {
                  const p = pos.get(n.id);
                  if (!p) return null;
                  const isCurrent = n.id === view.activeId;
                  const isNew = createdSet.has(n.id);
                  const onPath = pathSet.has(n.id);
                  const isRoot = stats.root !== null && n.isRoot;
                  const scale = born.has(n.id) ? 0.4 + 0.6 * grow : 1;
                  const fill = isCurrent ? pal.current
                    : isNew ? pal.createdBg
                    : onPath ? pal.pathBg
                    : isRoot ? pal.nodeRootBg : pal.nodeIdleBg;
                  const stroke = isCurrent ? pal.current
                    : isNew ? pal.created
                    : onPath ? pal.path
                    : isRoot ? pal.nodeRootBorder : pal.nodeIdleBorder;
                  const label = String(n.val);
                  const shown = label.length > 6 ? `${label.slice(0, 5)}…` : label;
                  const role = isCurrent ? 'current node' : isNew ? 'new node' : onPath ? 'on visited path' : isRoot ? 'root' : 'node';
                  return (
                    <g key={n.id} transform={`translate(${p.x} ${p.y}) scale(${scale})`} opacity={born.has(n.id) ? grow : 1}>
                      <title>{`${label} — ${role}${n.leftId !== -1 && n.leftId !== null ? '' : ', no left child'}${n.rightId !== -1 && n.rightId !== null ? '' : ', no right child'}`}</title>
                      <circle r={R} fill={fill} stroke={stroke} strokeWidth={isCurrent || isNew || onPath ? 3 : 2}
                        style={isCurrent ? { filter: `drop-shadow(0 0 8px ${pal.current})` } : undefined} />
                      <text textAnchor="middle" dominantBaseline="central"
                        fontFamily="'JetBrains Mono', monospace" fontWeight="700"
                        fontSize={shown.length > 3 ? 12 : 15}
                        fill={isCurrent ? pal.currentText : pal.nodeIdleText}>
                        {shown}
                      </text>
                      <text y={R + 12} textAnchor="middle" fontSize="9" fill={pal.textFaint} aria-hidden="true">
                        {isRoot ? 'root' : ''}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
        </div>

      </div>

      {/* ── FOOTER: legend + measured/complexity (collapsed by default) ── */}
      {!empty && (
        <div style={{ flexShrink: 0, padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'flex-start' }}>
          <details>
            <summary style={detailsSummary(pal)}>Legend</summary>
            <ul aria-label="Legend" style={{
              listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '4px 14px',
              fontSize: 11, color: pal.textMuted,
            }}>
              <LegendItem color={pal.current} fill={pal.current} label="Current node" />
              <LegendItem color={pal.created} fill={pal.createdBg} label="Newly created" />
              <LegendItem color={pal.path} fill={pal.pathBg} label="Visited path" />
              <LegendItem color={pal.nodeRootBorder} fill={pal.nodeRootBg} label="Root" />
              <LegendItem color={pal.link} fill="transparent" label="Link changed" line />
              <LegendItem color={pal.removed} fill="transparent" label="Removed (listed above)" dashed />
            </ul>
          </details>
          <details>
            <summary style={detailsSummary(pal)}>Measured &amp; complexity</summary>
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 220, maxWidth: 360 }}>
              <Row pal={pal} k="Nodes visited (this op)" v={stats.pathVisits} />
              <Row pal={pal} k="Visit events so far" v={stats.totalVisits} />
              <div style={{ fontSize: 10.5, color: pal.textFaint, lineHeight: 1.4 }}>
                Measured: a visit is one node the code stepped onto; key comparisons aren’t counted separately.
              </div>
              <div style={{ fontSize: 11.5, color: pal.textMuted, lineHeight: 1.5 }}>
                Theory: search / insert / delete cost O(h). Here h = {stats.height} — O(log n) if balanced, O(n) if skewed.
              </div>
            </div>
          </details>
        </div>
      )}

      {/* ── STDOUT TERMINAL DRAWER ── */}
      {out && (
        <>
          <div onMouseDown={() => setResizing(true)} title="Drag to resize terminal output"
            style={{
              height: 5, cursor: 'row-resize', flexShrink: 0,
              background: resizing ? 'rgba(56, 189, 248, 0.7)' : (theme === 'light' ? '#d0d7de' : 'rgba(255,255,255,0.08)'),
            }} />
          <section aria-label="Program output" style={{
            height: stdoutH, flexShrink: 0, background: pal.stdoutBg, borderTop: pal.stdoutBorder,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ padding: '6px 16px', fontSize: 10, fontWeight: 700, color: pal.stdoutHeaderText, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Program Output
            </div>
            <pre style={{
              flex: 1, overflow: 'auto', margin: 0, padding: '0 16px 10px',
              fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 12.5, color: pal.stdoutText, whiteSpace: 'pre-wrap',
            }}>{out}</pre>
          </section>
        </>
      )}
    </div>
  );
}

/* ── presentational helpers ──────────────────────────────────────────── */

function chipBtn(pal) {
  return {
    padding: '3px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    background: pal.chipBg, border: pal.chipBorder, borderRadius: 6, color: pal.zoomEnabled,
  };
}

function ZoomBtn({ pal, label, onClick, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      style={{ padding: '3px 9px', background: 'none', border: 'none', fontSize: 14, cursor: disabled ? 'default' : 'pointer', color: disabled ? pal.zoomDisabled : pal.zoomEnabled }}>
      {children}
    </button>
  );
}

function Pill({ pal, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999,
      background: pal.sizePillBg, border: pal.sizePillBorder, fontSize: 11, fontWeight: 600, color: pal.sizePillText,
    }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: pal.sizePillText }} />
      {children}
    </div>
  );
}

function detailsSummary(pal) {
  return { cursor: 'pointer', fontSize: 11, fontWeight: 600, color: pal.textMuted, userSelect: 'none' };
}

function Stat({ pal, k, v }) {
  return (
    <span>
      <span style={{ color: pal.textFaint }}>{k} </span>
      <span style={{ color: pal.textPrimary, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
        {v === null || v === undefined ? '–' : String(v)}
      </span>
    </span>
  );
}

function Row({ pal, k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
      <span style={{ color: pal.textMuted }}>{k}</span>
      <span style={{ color: pal.textPrimary, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{v === null || v === undefined ? '–' : String(v)}</span>
    </div>
  );
}

function LegendItem({ color, fill, label, line = false, dashed = false }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {line ? (
        <span aria-hidden="true" style={{ width: 16, height: 0, borderTop: `3px solid ${color}` }} />
      ) : (
        <span aria-hidden="true" style={{
          width: 12, height: 12, borderRadius: '50%', background: fill,
          border: `2px ${dashed ? 'dashed' : 'solid'} ${color}`, boxSizing: 'border-box',
        }} />
      )}
      <span>{label}</span>
    </li>
  );
}

function EmptyHint({ pal, ranAndNoTree, language }) {
  const unsupportedLang = ['c', 'cpp', 'csharp'].includes(language);
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ padding: '36px 40px', textAlign: 'center', border: pal.emptyBorder, borderRadius: 16, color: pal.emptyText, maxWidth: 420 }}>
        <div aria-hidden="true" style={{ fontSize: 32, marginBottom: 10 }}>🌳</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: pal.emptyHeading }}>
          {ranAndNoTree ? 'No tree detected in this program' : 'No tree yet'}
        </div>
        <div style={{ fontSize: 12, marginTop: 8, lineHeight: 1.55 }}>
          {ranAndNoTree ? (
            <>
              DSVP draws what your code actually builds. It looks for a node class with two links to
              its own type (any names — <code>left</code>/<code>right</code>, <code>lo</code>/<code>hi</code>…) and a key
              field, and nothing was created that way.
              {unsupportedLang && (
                <> Tree tracing is currently available for <strong>Java</strong> and <strong>Python</strong>;
                  C, C++ and C# programs still run, but no tree is drawn for them.</>
              )}
            </>
          ) : (
            <>
              Run a BST program (Java or Python). Any node class with two self-links works — field names
              don’t have to be <code>left</code>/<code>right</code>.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
