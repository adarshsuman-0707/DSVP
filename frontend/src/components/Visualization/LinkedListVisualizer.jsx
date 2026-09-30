import { memo, useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  HEAD_NAMES, TAIL_NAMES, STRUCTURE_LABEL, KIND_META, TONE_COLOR,
  buildGraph, diffGraphs, movedPointers, removedNodes, isNullId, isNullAccessError, nodeKey,
} from './linkedList/llModel';

/**
 * LinkedListVisualizer — v2 (Fixed Edition)
 * ──────────────────────────────────────────
 * FIX-1 ▸ Stable SVG marker IDs via SharedArrowDefs — eliminates flicker
 * FIX-2 ▸ Clear address labeling: "Addr: 0xXXX" on node header + arrow annotations
 * FIX-3 ▸ Cycle detection + Bezier arc overlay for backward/cycle pointers
 *
 * v3 (pointer-accurate)
 *  ▸ Renders the real pointer graph of each execution step (llModel.js):
 *    unlinked nodes, per-variable pointer chips that glide between nodes,
 *    data-driven prev arrows, tail → head ring, dangling edges.
 *  ▸ Null-access banner, step-effect chips and a debug panel.
 */

/* ══════════════════════════════════════════════════════
   FIX-1: Shared SVG Defs — ONE definition, stable IDs
   All arrow SVGs in the document reference these via url(#...)
   This eliminates per-SVG <defs> that caused ID collisions & flicker.
   ══════════════════════════════════════════════════════ */
function SharedArrowDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: 'absolute', overflow: 'hidden', pointerEvents: 'none' }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Singly forward — inactive */}
        <marker id="ll-fwd-inactive" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="rgba(148,163,184,0.55)" />
        </marker>
        {/* Singly forward — active cyan (traverse / snap) */}
        <marker id="ll-fwd-active" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#38bdf8" />
        </marker>
        {/* Singly forward — insert green */}
        <marker id="ll-fwd-insert" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#34d399" />
        </marker>
        {/* Singly forward — delete red */}
        <marker id="ll-fwd-delete" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#f87171" />
        </marker>
        {/* Doubly PREV arrow — violet */}
        <marker id="ll-prev-h" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#818cf8" />
        </marker>
        {/* Doubly PREV arrow — active violet */}
        <marker id="ll-prev-h-active" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#c4b5fd" />
        </marker>
        {/* Doubly NEXT arrow — cyan */}
        <marker id="ll-next-h" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#38bdf8" />
        </marker>
        {/* Doubly NEXT arrow — active cyan */}
        <marker id="ll-next-h-active" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="5" markerHeight="5" orient="auto">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#60a5fa" />
        </marker>
        {/* Cycle / backward pointer — orange */}
        <marker id="ll-cycle" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#f97316" />
        </marker>
      </defs>
    </svg>
  );
}

/** Returns the stable marker-end URL for singly arrows based on active state + type */
function getFwdMarkerId(isActive, type) {
  if (!isActive) return 'url(#ll-fwd-inactive)';
  switch (type) {
    case 'll_insert':   return 'url(#ll-fwd-insert)';
    case 'll_delete':   return 'url(#ll-fwd-delete)';
    default:            return 'url(#ll-fwd-active)';
  }
}

/* ══════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════ */
const PALETTE = {
  dark: {
    bg: '#090d16',
    bgImage: 'radial-gradient(circle at 50% 0%, rgba(30, 58, 138, 0.15) 0%, transparent 70%), radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
    headerBg: 'rgba(15, 23, 42, 0.75)', hairline: 'rgba(255,255,255,.08)',
    text: '#f8fafc', textMuted: '#94a3b8', textFaint: '#475569', textDim: '#64748b',
    badgeBg: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(139, 92, 246, 0.2))',
    badgeBorder: 'rgba(96, 165, 250, 0.3)', badgeText: '#e2e8f0',
    btnBg: 'rgba(255,255,255,0.05)', btnBorder: 'rgba(255,255,255,0.1)', btnText: '#94a3b8', btnTextDisabled: '#475569',
    zoomText: '#cbd5e1',
    descBg: 'rgba(15, 23, 42, 0.7)', descBorder: 'rgba(255, 255, 255, 0.08)',
    addrPillBg: 'rgba(255,255,255,0.06)',
    cardBg: 'linear-gradient(160deg, #131b2e 0%, #0d121f 100%)',
    inactiveBorder: 'rgba(255,255,255,0.12)', inactiveHeaderBg: 'rgba(255, 255, 255, 0.04)',
    inactiveVal: '#f1f5f9', inactiveLabel: '#64748b', inactivePtr: '#94a3b8',
    addrChipBg: 'rgba(0,0,0,0.3)', addrChipText: '#64748b', addrChipActiveBg: 'rgba(255,255,255,0.15)',
    idxBadgeBg: 'rgba(255,255,255,0.06)', idxBadgeBorder: 'rgba(255,255,255,0.1)', idxBadgeText: '#475569',
    inactiveArrow: 'rgba(148, 163, 184, 0.4)', arrowLabelInactive: '#475569',
    consoleBg: '#040711', consoleText: '#f8fafc',
    emptyBg: 'rgba(15, 23, 42, 0.4)', emptyBorder: 'rgba(255, 255, 255, 0.07)',
    codeChipBg: 'rgba(255,255,255,0.04)', codeChipBorder: 'rgba(255,255,255,0.08)', codeChipText: '#cbd5e1',
    snakeTurnDefault: 'rgba(255,255,255,0.2)',
  },
  light: {
    bg: '#ffffff',
    bgImage: 'radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.06) 0%, transparent 70%), radial-gradient(rgba(15, 23, 42, 0.035) 1px, transparent 1px)',
    headerBg: 'rgba(255, 255, 255, 0.9)', hairline: '#e2e8f0',
    text: '#0f172a', textMuted: '#475569', textFaint: '#94a3b8', textDim: '#64748b',
    badgeBg: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(139, 92, 246, 0.12))',
    badgeBorder: 'rgba(37, 99, 235, 0.25)', badgeText: '#1e293b',
    btnBg: '#f6f8fa', btnBorder: '#d0d7de', btnText: '#475569', btnTextDisabled: '#94a3b8',
    zoomText: '#334155',
    descBg: '#f6f8fa', descBorder: '#d0d7de',
    addrPillBg: '#eef1f5',
    cardBg: 'linear-gradient(160deg, #ffffff 0%, #f6f8fa 100%)',
    inactiveBorder: '#d0d7de', inactiveHeaderBg: '#f6f8fa',
    inactiveVal: '#1e293b', inactiveLabel: '#64748b', inactivePtr: '#475569',
    addrChipBg: '#e2e8f0', addrChipText: '#475569', addrChipActiveBg: 'rgba(255,255,255,0.6)',
    idxBadgeBg: '#eef1f5', idxBadgeBorder: '#d0d7de', idxBadgeText: '#64748b',
    inactiveArrow: '#94a3b8', arrowLabelInactive: '#94a3b8',
    consoleBg: '#f6f8fa', consoleText: '#1e293b',
    emptyBg: '#f8fafc', emptyBorder: '#e2e8f0',
    codeChipBg: '#f0f2f5', codeChipBorder: '#d0d7de', codeChipText: '#334155',
    snakeTurnDefault: '#cbd5e1',
  },
};


export default function LinkedListVisualizer({
  linkedListState = [],
  activeNodeId    = -1,
  type            = 'll_snap',
  description     = '',
  step            = 0,
  totalSteps      = 0,
  userOutput      = '',
  isDoubly: isDoublyProp = false,
  theme           = 'dark',
  // ── pointer-aware extras (all optional — legacy traces simply omit them) ──
  kind            = null,      // CREATE_NODE | SET_NEXT | SET_PREV | SET_HEAD | SET_PTR | COMPARE …
  ptrs            = null,      // { varName: nodeId | -1 }
  ring            = null,      // tail.next === head, as reported by the tracer
  prevEvent       = null,      // { linkedListState, ptrs, ring } of the step before this one
  moduleSlug      = '',
  currentLine     = null,
  runError        = '',        // run-level error text (shown on the final step)
  isLastStep      = false,
}) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const [flashSet, setFlashSet]           = useState(new Set());
  const prevStateRef                       = useRef([]);
  const isDoublyStickyRef                 = useRef(false);
  const [stdoutH, setStdoutH]             = useState(110);
  const [resizing, setResizing]           = useState(false);
  const [zoom, setZoom]                   = useState(1);
  const [layoutMode, setLayoutMode]       = useState('wrap'); // 'wrap' | 'horizontal'
  const [showAddresses, setShowAddresses] = useState(true);
  const [debug, setDebug]                 = useState(false);
  const containerRef                       = useRef(null);

  // Detect Doubly Linked List (via prop, sticky memory, or node data)
  const isDoubly = useMemo(() => {
    if (isDoublyProp || isDoublyStickyRef.current) return true;
    const detected = linkedListState.some(
      n => n.prevId !== undefined && n.prevId !== null && n.prevId !== -1
    );
    if (detected) isDoublyStickyRef.current = true;
    return detected;
  }, [isDoublyProp, linkedListState]);

  /* ── Model: event snapshot → graph → semantic diff (see llModel.js) ── */
  const graph = useMemo(
    () => buildGraph(linkedListState, { ptrs, ring, isDoubly, moduleSlug }),
    [linkedListState, ptrs, ring, isDoubly, moduleSlug]
  );
  const prevGraph = useMemo(() => {
    if (!prevEvent) return null;
    return buildGraph(prevEvent.linkedListState, {
      ptrs: prevEvent.ptrs, ring: prevEvent.ring, isDoubly, moduleSlug,
    });
  }, [prevEvent, isDoubly, moduleSlug]);
  const diff     = useMemo(() => diffGraphs(prevGraph, graph), [prevGraph, graph]);
  const moved    = useMemo(() => movedPointers(prevGraph, graph), [prevGraph, graph]);
  const removed  = useMemo(() => removedNodes(prevGraph, graph), [prevGraph, graph]);

  // Generate deterministic hex memory addresses (covers chain, unlinked and removed nodes)
  const addrMap = useMemo(() => {
    const map = new Map();
    const hex = (node, idx) => {
      const hash = typeof node.id === 'number' && node.id < 1000
        ? (0x100 + node.id * 0x30)
        : (0x100 + ((Math.abs(Number(node.id) || idx)) % 0x8FF));
      map.set(node.id, '0x' + hash.toString(16).toUpperCase().padStart(3, '0'));
    };
    linkedListState.forEach(hex);
    removed.forEach(hex);
    return map;
  }, [linkedListState, removed]);

  const headNode = graph.chain[0] || null;
  const tailNode = graph.chain.length ? graph.chain[graph.chain.length - 1] : null;

  /* ── Flash & mutation detection ── */
  useEffect(() => {
    const prev    = prevStateRef.current;
    const prevMap = new Map(prev.map(n => [n.id, n]));
    const changed = new Set();

    linkedListState.forEach(n => {
      const p = prevMap.get(n.id);
      if (!p || p.val !== n.val || p.nextId !== n.nextId || p.prevId !== n.prevId) {
        changed.add(n.id);
      }
    });
    if (activeNodeId !== -1 && activeNodeId !== null) {
      changed.add(activeNodeId);
    }

    setFlashSet(changed);
    prevStateRef.current = linkedListState;
    const t = setTimeout(() => setFlashSet(new Set()), 600);
    return () => clearTimeout(t);
  }, [linkedListState, activeNodeId]);

  /* ── Stdout drawer resize ── */
  useEffect(() => {
    if (!resizing) return;
    const onMove = e => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setStdoutH(Math.max(50, Math.min(360, r.bottom - e.clientY)));
    };
    const onUp = () => setResizing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  const empty = linkedListState.length === 0;
  // A ring can only be drawn cleanly on a single row — snake-wrapping would
  // route the tail→head arc straight through the rows in between.
  const effectiveLayout = graph.circular ? 'horizontal' : layoutMode;
  const kindMeta  = kind ? KIND_META[kind] : null;
  const tones     = TONE_COLOR[theme] || TONE_COLOR.dark;
  const kindColor = kindMeta ? tones[kindMeta.tone] : getTypeColor(type, theme);
  const showRunError = Boolean(runError) && isLastStep;
  const nullAccess   = showRunError && isNullAccessError(runError);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: pal.bg,
        backgroundImage: pal.bgImage,
        backgroundSize: '100% 100%, 20px 20px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        overflow: 'hidden', userSelect: resizing ? 'none' : 'auto',
        position: 'relative',
      }}
    >
      {/* FIX-1: Single shared defs island — renders once, no flicker */}
      <SharedArrowDefs />

      {/* ── TOP CONTROL & STATS BAR ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 18px',
        background: pal.headerBg,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${pal.hairline}`,
        flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        {/* Left: Module Badge & Live Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 8,
            background: pal.badgeBg,
            border: `1px solid ${pal.badgeBorder}`,
          }}>
            <span style={{ fontSize: 13 }}>{graph.circular ? '↻' : graph.isDoubly ? '⇄' : '⛓'}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: pal.badgeText,
              textTransform: 'uppercase', letterSpacing: '.06em',
            }}>
              {STRUCTURE_LABEL[graph.structure]}
            </span>
          </div>

          {/* Node count pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 999,
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            fontSize: 11, fontWeight: 600, color: '#38bdf8',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 6px #38bdf8' }} />
            {graph.chain.length} {graph.chain.length === 1 ? 'Node' : 'Nodes'}
            {graph.floating.length > 0 && (
              <span style={{ opacity: 0.75 }}> · {graph.floating.length} unlinked</span>
            )}
          </div>

          {/* Head peek pill */}
          {headNode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              fontSize: 11, fontWeight: 600, color: '#f59e0b',
            }}>
              <span style={{ fontSize: 9, opacity: 0.8 }}>HEAD</span>
              <span>[{headNode.val}]</span>
            </div>
          )}

          {/* Tail peek pill */}
          {tailNode && tailNode !== headNode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6,
              background: 'rgba(20, 184, 166, 0.12)',
              border: '1px solid rgba(20, 184, 166, 0.3)',
              fontSize: 11, fontWeight: 600, color: '#2dd4bf',
            }}>
              <span style={{ fontSize: 9, opacity: 0.8 }}>TAIL</span>
              <span>[{tailNode.val}]</span>
            </div>
          )}

          {/* Active Operation pill (legacy traces without a semantic kind) */}
          {!kindMeta && <OperationBadge type={type} theme={theme} />}
        </div>

        {/* Right: View & Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Debug panel toggle */}
          <button
            onClick={() => setDebug(v => !v)}
            title="Toggle debug panel (event, pointers, head/tail)"
            aria-pressed={debug}
            style={{
              padding: '4px 8px', borderRadius: 6,
              background: debug ? 'rgba(236, 72, 153, 0.18)' : pal.btnBg,
              border: `1px solid ${debug ? 'rgba(236, 72, 153, 0.5)' : pal.btnBorder}`,
              color: debug ? '#f472b6' : pal.btnText,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Debug
          </button>

          {/* Memory addresses toggle */}
          <button
            onClick={() => setShowAddresses(v => !v)}
            title="Toggle Memory Addresses (0x...)"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 6,
              background: showAddresses ? (theme === 'light' ? 'rgba(99, 102, 241, 0.14)' : 'rgba(99, 102, 241, 0.2)') : pal.btnBg,
              border: `1px solid ${showAddresses ? (theme === 'light' ? 'rgba(79, 70, 229, 0.4)' : 'rgba(99, 102, 241, 0.4)') : pal.btnBorder}`,
              color: showAddresses ? (theme === 'light' ? '#4338ca' : '#a5b4fc') : pal.btnText,
              fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms',
            }}
          >
            <span>0x</span>
            <span>Addr</span>
          </button>

          {/* Layout Mode Toggle */}
          <button
            onClick={() => setLayoutMode(m => m === 'wrap' ? 'horizontal' : 'wrap')}
            disabled={graph.circular}
            title={graph.circular
              ? 'Circular lists are always drawn on one row so the tail → head link stays readable'
              : layoutMode === 'wrap' ? 'Switch to Continuous Horizontal Line' : 'Switch to Snake Row Wrap'}
            style={{
              padding: '4px 8px', borderRadius: 6,
              background: pal.btnBg,
              border: `1px solid ${pal.btnBorder}`,
              color: graph.circular ? pal.btnTextDisabled : pal.btnText,
              fontSize: 11, fontWeight: 600, cursor: graph.circular ? 'default' : 'pointer',
            }}
          >
            {effectiveLayout === 'wrap' ? '⤾ Wrap' : '→ Line'}
          </button>

          {/* Zoom controls */}
          <div style={{
            display: 'flex', alignItems: 'center',
            background: pal.btnBg,
            border: `1px solid ${pal.btnBorder}`,
            borderRadius: 6, overflow: 'hidden',
          }}>
            <button
              onClick={() => setZoom(z => Math.max(0.4, Math.round((z - 0.1) * 10) / 10))}
              disabled={zoom <= 0.4}
              title="Zoom out"
              style={{
                padding: '3px 8px', background: 'none', border: 'none',
                color: zoom <= 0.4 ? pal.btnTextDisabled : pal.zoomText, fontSize: 13, cursor: zoom <= 0.4 ? 'default' : 'pointer',
              }}
            >−</button>
            <span
              onClick={() => setZoom(1)}
              title="Reset Zoom to 100%"
              style={{
                padding: '0 5px', fontSize: 11, fontWeight: 600,
                color: zoom === 1 ? pal.textDim : '#38bdf8', cursor: 'pointer',
              }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(z => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))}
              disabled={zoom >= 1.5}
              title="Zoom in"
              style={{
                padding: '3px 8px', background: 'none', border: 'none',
                color: zoom >= 1.5 ? pal.btnTextDisabled : pal.zoomText, fontSize: 13, cursor: zoom >= 1.5 ? 'default' : 'pointer',
              }}
            >+</button>
          </div>

          {/* Step indicator */}
          {step > 0 && (
            <div style={{
              fontSize: 11, fontWeight: 700, color: pal.textMuted,
              letterSpacing: '.04em', minWidth: 65, textAlign: 'right',
            }}>
              Step <span style={{ color: pal.inactiveVal }}>{step}</span>
              {totalSteps > 0 && <span style={{ opacity: 0.6 }}>/{totalSteps}</span>}
            </div>
          )}
        </div>
      </header>

      {/* ── STEP ACTION BANNER: what this step did + its semantic effects ── */}
      {(description || kindMeta) && (
        <div style={{
          margin: '12px 20px 0',
          padding: '8px 16px',
          borderRadius: 10,
          background: pal.descBg,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${pal.descBorder}`,
          boxShadow: theme === 'light' ? '0 4px 16px rgba(15,23,42,0.06)' : '0 4px 20px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column', gap: 6,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {kindMeta ? (
                <span style={{
                  padding: '2px 8px', borderRadius: 5, flexShrink: 0,
                  background: `${kindColor}22`, border: `1px solid ${kindColor}55`,
                  color: kindColor, fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
                }}>
                  {kindMeta.icon} {kindMeta.label}
                </span>
              ) : (
                <span style={{ fontSize: 16 }}>{getTypeIcon(type)}</span>
              )}
              <span style={{
                fontSize: 12.5, fontWeight: 600, letterSpacing: '.01em',
                color: kindMeta ? pal.text : getTypeColor(type, theme),
                fontFamily: kindMeta ? "'JetBrains Mono', monospace" : 'inherit',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }} title={description}>
                {description}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {currentLine ? (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: pal.textMuted,
                  fontFamily: "'JetBrains Mono', monospace",
                  padding: '2px 8px', borderRadius: 4, background: pal.addrPillBg,
                }}>
                  Line {currentLine}
                </span>
              ) : null}
              {activeNodeId !== -1 && activeNodeId !== null && addrMap.has(activeNodeId) && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: pal.textMuted,
                  fontFamily: "'JetBrains Mono', monospace",
                  padding: '2px 8px', borderRadius: 4,
                  background: pal.addrPillBg,
                }}>
                  Active: {addrMap.get(activeNodeId)}
                </span>
              )}
            </div>
          </div>

          {/* Effects of this step — derived by diffing the previous and current graph */}
          {diff.length > 0 && kindMeta && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {diff.slice(0, 5).map((d, i) => (
                <span key={i} style={{
                  fontSize: 10.5, fontWeight: 600, color: pal.codeChipText,
                  fontFamily: "'JetBrains Mono', monospace",
                  padding: '1px 8px', borderRadius: 4,
                  background: pal.codeChipBg, border: `1px solid ${pal.codeChipBorder}`,
                }}>
                  {d.text || (d.type === 'CREATE_NODE' ? `+ node ${d.value}` : d.type === 'DELETE_NODE' ? `− node ${d.value} unreachable` : d.type === 'UPDATE_VALUE' ? `value ${d.from} → ${d.to}` : d.type)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── POINTER LEGEND: every tracked reference, including NULL ones ── */}
      {graph.ptrs && Object.keys(graph.ptrs).length > 0 && (
        <div style={{ margin: '8px 20px 0', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          {Object.entries(graph.ptrs).map(([name, id]) => {
            const target = isNullId(id) ? null : graph.byId.get(id);
            const isMoved = moved.has(name);
            const col = isNullId(id) ? (theme === 'light' ? '#b91c1c' : '#f87171') : pointerColor(name, theme);
            return (
              <span key={name} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 8px', borderRadius: 999,
                fontSize: 10.5, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                color: col,
                background: isMoved ? `${col}26` : `${col}10`,
                border: `1px solid ${isMoved ? col : col + '44'}`,
                transition: 'all 240ms ease',
              }}>
                {name}
                <span style={{ opacity: 0.6 }}>{target ? '→' : '='}</span>
                {target ? `[${target.val}]` : 'NULL'}
              </span>
            );
          })}
        </div>
      )}

      {/* ── RUNTIME ERROR: stop the story at the step that failed ── */}
      {showRunError && (
        <div role="alert" style={{
          margin: '10px 20px 0', padding: '10px 14px', borderRadius: 10, flexShrink: 0,
          background: 'rgba(239, 68, 68, 0.10)', border: '1px solid rgba(239, 68, 68, 0.45)',
          color: theme === 'light' ? '#991b1b' : '#fecaca',
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>
            ⚠ {nullAccess ? 'Null Reference Access' : 'Execution stopped with an error'}
          </div>
          {nullAccess && graph.nullPtrs.length > 0 && (
            <div style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
              {graph.nullPtrs.map(n => `${n} = NULL`).join('   ·   ')}
            </div>
          )}
          <div style={{ fontSize: 11.5, opacity: 0.85, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {runError.split('\n')[0].slice(0, 220)}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            Execution stopped here — no further steps are rendered.
          </div>
        </div>
      )}

      {/* ── MAIN INTERACTIVE CANVAS ── */}
      <main style={{
        flex: 1, minHeight: 0, overflow: 'auto',
        padding: '12px 32px 32px',
        display: 'flex', alignItems: 'flex-start',
      }}>
        <div style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          transition: 'transform 180ms ease-out',
          minWidth: 'fit-content',
        }}>
          {empty ? (
            <EmptyHint isDoubly={isDoubly} circular={graph.circular} theme={theme} />
          ) : (
            <NodeChain
              graph={graph}
              removed={removed}
              moved={moved}
              activeNodeId={activeNodeId}
              flashSet={flashSet}
              type={type}
              isDoubly={graph.isDoubly}
              layoutMode={effectiveLayout}
              showAddresses={showAddresses}
              addrMap={addrMap}
              zoom={zoom}
              theme={theme}
            />
          )}
        </div>
      </main>

      {/* ── DEBUG PANEL ── */}
      {debug && (
        <pre style={{
          position: 'absolute', left: 12, bottom: userOutput ? stdoutH + 16 : 12,
          maxWidth: 'min(420px, 70%)', maxHeight: '45%', overflow: 'auto', margin: 0,
          padding: '10px 12px', borderRadius: 10, zIndex: 30,
          background: theme === 'light' ? 'rgba(255,255,255,0.96)' : 'rgba(4,7,17,0.94)',
          border: `1px solid ${pal.hairline}`, color: pal.text,
          fontSize: 11, lineHeight: 1.55, fontFamily: "'JetBrains Mono', Consolas, monospace",
          boxShadow: '0 8px 30px rgba(0,0,0,0.35)', whiteSpace: 'pre-wrap',
        }}>
{`Execution Step: ${step}${totalSteps ? ' / ' + totalSteps : ''}
Source line:    ${currentLine ?? '-'}

Event:          ${kind || '(snapshot)'}
${diff.length ? diff.map(d =>
`  ${d.type}${d.nodeId ? '  ' + d.nodeId : ''}${d.variable ? '  ' + d.variable : ''}${(d.from !== undefined || d.to !== undefined) ? `\n    From: ${d.from ?? 'null'}\n    To:   ${d.to ?? 'null'}` : ''}`
).join('\n') : '  (no structural change)'}

Structure:      ${graph.structure}${graph.ring ? '  (tail.next → head)' : ''}
Current Head:   ${graph.headId != null ? nodeKey(graph.headId) : 'null'}
Current Tail:   ${graph.tailId != null ? nodeKey(graph.tailId) : 'null'}
Linked / Unlinked nodes: ${graph.chain.length} / ${graph.floating.length}
Pointers:
${graph.ptrs ? Object.entries(graph.ptrs).map(([k, v]) => `  ${k.padEnd(10)} ${isNullId(v) ? 'null' : nodeKey(v)}`).join('\n') : '  (not reported by tracer)'}`}
        </pre>
      )}

      {/* ── STDOUT TERMINAL DRAWER ── */}
      {userOutput && (
        <>
          <div
            onMouseDown={() => setResizing(true)}
            title="Drag to resize terminal output"
            style={{
              height: 5, cursor: 'row-resize', flexShrink: 0,
              background: resizing ? 'rgba(56, 189, 248, 0.7)' : pal.hairline,
              transition: resizing ? 'none' : 'background 150ms',
            }}
          />
          <section style={{
            height: stdoutH, flexShrink: 0,
            background: pal.consoleBg,
            borderTop: `1px solid ${pal.hairline}`,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '6px 16px', fontSize: 10, fontWeight: 700,
              color: pal.textDim, textTransform: 'uppercase', letterSpacing: '.08em',
              borderBottom: `1px solid ${pal.hairline}`, flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
              Program Output
            </div>
            <pre style={{
              flex: 1, overflow: 'auto', margin: 0,
              padding: '10px 16px', fontSize: 12, color: pal.consoleText,
              fontFamily: "'JetBrains Mono', Consolas, monospace",
              lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{userOutput}</pre>
          </section>
        </>
      )}
    </div>
  );
}

/** Colour for a pointer variable name (head/tail keep fixed, semantic colours). */
function pointerColor(name, theme = 'dark') {
  const light = theme === 'light';
  if (HEAD_NAMES.includes(name)) return light ? '#b45309' : '#f59e0b';
  if (TAIL_NAMES.includes(name)) return light ? '#4338ca' : '#818cf8';
  return light ? '#0e7490' : '#38bdf8';
}

/* ══════════════════════════════════════════════════════
   NodeChain Layout Engine
   ──────────────────────────────────────────────────────
   - `graph.chain`    nodes linked from head, drawn in rows with inline arrows
   - `graph.floating` nodes that exist but are NOT linked into the list
                      (new node before it is attached, a spliced-out node that
                      is still referenced) — drawn in their own "unlinked" lane
   - `removed`        nodes that became unreachable in THIS step (ghosts for one
                      step, so a deletion is visible before the node vanishes)
   - pointer chips    (head/tail/temp/cur/…) are an absolutely positioned
                      overlay keyed by variable name, so a moving pointer
                      GLIDES from node to node instead of teleporting
   - edge overlay     cycle / ring arcs and any edge touching an unlinked node
   ══════════════════════════════════════════════════════ */
const ROW_SIZE = 5;
const CHIP_H = 22;

function sameLayout(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) {
    const p = a[k], q = b[k];
    if (!q || p.l !== q.l || p.r !== q.r || p.t !== q.t || p.b !== q.b) return false;
  }
  return true;
}

function NodeChain({
  graph,
  removed,
  moved,
  activeNodeId,
  flashSet,
  type,
  isDoubly,
  layoutMode,
  showAddresses,
  addrMap,
  zoom = 1,
  theme = 'dark',
}) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const nodes    = graph.chain;
  const floating = graph.floating;
  const nodeById = graph.byId;
  const containerRef = useRef(null);
  // nodeId -> DOM element (wrapper around the node card; never transformed)
  const nodeElRefs = useRef(new Map());
  const [layout, setLayout] = useState({});

  const rows = useMemo(() => {
    if (layoutMode === 'horizontal') return [nodes];
    const r = [];
    for (let i = 0; i < nodes.length; i += ROW_SIZE) {
      r.push(nodes.slice(i, i + ROW_SIZE));
    }
    return r;
  }, [nodes, layoutMode]);

  const indexMap = useMemo(() => {
    const m = new Map();
    nodes.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [nodes]);

  /* Backward / ring edges between chain nodes (next or prev pointing to an
     earlier/same node, or prev pointing forward). The tail → head link of a
     circular list is the special case `isRing`. */
  const cycleEdges = useMemo(() => {
    const edges = [];
    const last = nodes.length - 1;
    nodes.forEach((n, i) => {
      if (!isNullId(n.nextId)) {
        const ti = indexMap.get(n.nextId);
        if (ti !== undefined && ti <= i) {
          edges.push({ fromId: n.id, toId: n.nextId, pointerType: 'next', isRing: ti === 0 && i === last });
        }
      }
      if (!isNullId(n.prevId)) {
        const ti = indexMap.get(n.prevId);
        if (ti !== undefined && ti > i) {
          edges.push({ fromId: n.id, toId: n.prevId, pointerType: 'prev', isRing: i === 0 && ti === last });
        }
      }
    });
    return edges;
  }, [nodes, indexMap]);

  const cycleSources = useMemo(() => {
    const s = new Set();
    cycleEdges.forEach(e => { if (e.pointerType === 'next') s.add(e.fromId); });
    return s;
  }, [cycleEdges]);

  /* Edges that cannot be drawn as an inline arrow: anything starting at an
     unlinked node, and a chain node's prev pointing at an unlinked node. */
  const extraEdges = useMemo(() => {
    const out = [];
    const push = (from, to, kind) => {
      if (isNullId(to) || !nodeById.has(to)) return;
      out.push({ fromId: from.id, toId: to, kind, dangling: floating.includes(from) });
    };
    floating.forEach(n => {
      push(n, n.nextId, 'next');
      if (isDoubly) push(n, n.prevId, 'prev');
    });
    if (isDoubly) {
      nodes.forEach(n => {
        if (!isNullId(n.prevId) && nodeById.has(n.prevId) && !indexMap.has(n.prevId)) {
          out.push({ fromId: n.id, toId: n.prevId, kind: 'prev', dangling: false });
        }
      });
    }
    return out;
  }, [floating, nodes, nodeById, indexMap, isDoubly]);

  /* Pointer chips per node, bottom-up: structural HEAD/TAIL first, then every
     tracked variable (head, tail, temp, cur, …) in declaration order. */
  const chipsByNode = useMemo(() => {
    const map = new Map();
    const add = (id, chip) => {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(chip);
    };
    // Structural HEAD/TAIL markers are only a fallback: when the program has
    // its own head/tail variable, THAT chip is the truth (mid-operation the
    // variable can legitimately point somewhere other than the chain ends).
    const hasVar = (names) => Boolean(graph.ptrs) && names.some(n => n in graph.ptrs);
    if (nodes.length) {
      const h = nodes[0].id;
      const t = nodes[nodes.length - 1].id;
      if (!hasVar(HEAD_NAMES)) {
        add(h, { key: '__head', label: 'HEAD', color: pointerColor('head', theme), implicit: true });
      }
      if ((isDoubly || graph.circular) && !hasVar(TAIL_NAMES)) {
        add(t, { key: '__tail', label: 'TAIL', color: pointerColor('tail', theme), implicit: true });
      }
    }
    graph.ptrsByNode.forEach((names, id) => {
      names.forEach(n => add(id, { key: `ptr-${n}`, label: n, color: pointerColor(n, theme), moved: moved.has(n) }));
    });
    // Legacy traces carry no variable map: fall back to a single gliding cursor
    if (!graph.ptrs && activeNodeId != null && activeNodeId !== -1 && nodeById.has(activeNodeId)) {
      add(activeNodeId, { key: '__active', label: 'POINTER', color: getTypeColor(type, theme), moved: true });
    }
    return map;
  }, [graph, nodes, moved, theme, isDoubly, activeNodeId, nodeById, type]);

  const maxStack = useMemo(() => {
    let m = 1;
    chipsByNode.forEach(c => { if (c.length > m) m = c.length; });
    return m;
  }, [chipsByNode]);

  const registerNodeRef = useCallback((nodeId, el) => {
    if (el) nodeElRefs.current.set(nodeId, el);
    else nodeElRefs.current.delete(nodeId);
  }, []);

  /* Measure every registered node relative to the container. The container
     lives inside an ancestor with `transform: scale(zoom)`; getBoundingClientRect
     returns post-transform pixels, so dividing by `zoom` converts back into the
     container's own coordinate space (where the overlays are positioned). The
     state only changes when a number actually changes, so this cannot loop. */
  const measure = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const cr = c.getBoundingClientRect();
    const z = zoom || 1;
    const next = {};
    nodeElRefs.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      const l = Math.round((r.left - cr.left) / z);
      const rr = Math.round((r.right - cr.left) / z);
      const t = Math.round((r.top - cr.top) / z);
      const b = Math.round((r.bottom - cr.top) / z);
      next[id] = { l, r: rr, t, b, cx: Math.round((l + rr) / 2), cy: Math.round((t + b) / 2) };
    });
    setLayout(prev => (sameLayout(prev, next) ? prev : next));
  }, [zoom]);

  useLayoutEffect(() => { measure(); });

  // Re-measure when the container or the scroll parent resizes (panel drags,
  // window resize) — none of which re-render this component.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(el);
    const scrollParent = el.closest('main');
    if (scrollParent) ro.observe(scrollParent);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [measure]);

  // Keep the node being worked on in view (centered horizontally) in long lists.
  useEffect(() => {
    let target = activeNodeId;
    if (target == null || target === -1) {
      for (const name of moved) {
        const id = graph.ptrs ? graph.ptrs[name] : undefined;
        if (!isNullId(id)) { target = id; break; }
      }
    }
    const el = target != null ? nodeElRefs.current.get(target) : null;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    const reduce = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduce ? 'auto' : 'smooth' });
  }, [activeNodeId, moved, graph]);

  const rowGap = (isDoubly ? 64 : 52) + (maxStack - 1) * CHIP_H;
  const hasLane = floating.length > 0 || removed.length > 0;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column',
        gap: rowGap,
        padding: `${maxStack * (CHIP_H + 2) + 14}px 0 ${cycleEdges.length ? 88 : 10}px`,
        position: 'relative', // anchor for the pointer + edge overlays
      }}
    >
      {/* Ring / cycle arcs and edges touching unlinked nodes */}
      <EdgeOverlay cycleEdges={cycleEdges} extraEdges={extraEdges} layout={layout} theme={theme} />

      {/* Pointer chips — keyed by variable name so moves animate */}
      {[...chipsByNode].flatMap(([id, chips]) => {
        const r = layout[id];
        if (!r) return [];
        return chips.map((c, i) => (
          <div
            key={c.key}
            aria-label={`${c.label} points here`}
            style={{
              position: 'absolute', left: 0, top: 0, zIndex: 10, pointerEvents: 'none',
              transform: `translate(${r.cx}px, ${r.t - 6 - (i + 1) * CHIP_H}px) translateX(-50%)`,
              transition: 'transform 420ms cubic-bezier(.4,0,.2,1)',
              willChange: 'transform',
            }}
          >
            <div style={{
              height: CHIP_H - 3, display: 'flex', alignItems: 'center', gap: 4,
              padding: '0 8px', borderRadius: 5, whiteSpace: 'nowrap',
              background: c.implicit ? `${c.color}1f` : c.moved ? c.color : `${c.color}33`,
              border: `1px solid ${c.implicit ? c.color + '66' : c.color}`,
              color: c.implicit || !c.moved ? c.color : (theme === 'light' ? '#ffffff' : '#090d16'),
              fontSize: 10, fontWeight: 800, letterSpacing: c.implicit ? '.08em' : '.02em',
              fontFamily: "'JetBrains Mono', monospace",
              boxShadow: c.moved ? `0 2px 10px ${c.color}77` : 'none',
              textTransform: c.implicit ? 'uppercase' : 'none',
            }}>
              {c.label}
              {i === 0 && <span style={{ fontSize: 9, marginLeft: 1 }}>▼</span>}
            </div>
          </div>
        ));
      })}

      {rows.map((row, rowIdx) => {
        const isEven    = rowIdx % 2 === 0;
        const display   = (isEven || layoutMode === 'horizontal') ? row : [...row].reverse();
        const firstG    = rowIdx * ROW_SIZE;

        return (
          <div key={rowIdx} style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {display.map((node, colIdx) => {
                const globalIdx = (isEven || layoutMode === 'horizontal')
                  ? firstG + colIdx
                  : firstG + (row.length - 1 - colIdx);

                const isActive   = node.id === activeNodeId;
                const isFlashing = flashSet.has(node.id);
                const isLast     = globalIdx === nodes.length - 1;
                const hasArrow   = colIdx < display.length - 1;
                const isRowEnd   = colIdx === display.length - 1;
                const hasWrap    = !isLast && isRowEnd && layoutMode === 'wrap';
                const isCycleSource = cycleSources.has(node.id);

                // Target address for the connector arrow (FIX-2)
                const nextNode = hasArrow ? display[colIdx + 1] : null;
                const arrowTargetAddr = nextNode ? (addrMap.get(nextNode.id) || null) : null;
                // Is the visual "prev" arrow real? Only when B.prev actually is A.
                const prevOk = nextNode
                  ? (isEven || layoutMode === 'horizontal'
                      ? nextNode.prevId === node.id
                      : node.prevId === nextNode.id)
                  : true;

                return (
                  <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', position: 'relative',
                    }}>
                      <div ref={el => registerNodeRef(node.id, el)}>
                        <NodeCard
                          node={node}
                          index={globalIdx}
                          isActive={isActive}
                          isFlashing={isFlashing}
                          type={type}
                          isDoubly={isDoubly}
                          showAddresses={showAddresses}
                          addrMap={addrMap}
                          nodeById={nodeById}
                          theme={theme}
                        />
                      </div>

                      {/* Ring / cycle badge on the source node (instead of NULL) */}
                      {isLast && isCycleSource ? (
                        <div style={{
                          marginTop: 8, display: 'flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 4,
                          background: 'rgba(249, 115, 22, 0.12)',
                          border: '1px dashed rgba(249, 115, 22, 0.5)',
                          color: '#fb923c', fontSize: 10, fontWeight: 700,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          <span>↻</span> {graph.ring ? 'CIRCULAR' : 'CYCLE'}
                        </div>
                      ) : isLast && isNullId(node.nextId) && (
                        <div style={{
                          marginTop: 8, display: 'flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 4,
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px dashed rgba(239, 68, 68, 0.3)',
                          color: '#f87171', fontSize: 10, fontWeight: 700,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          <span>⏚</span> NULL
                        </div>
                      )}
                    </div>

                    {/* Arrow between consecutive nodes in same row */}
                    {hasArrow && (
                      isDoubly
                        ? <DoublyHArrow
                            isActive={isActive}
                            type={type}
                            isReversed={!isEven && layoutMode === 'wrap'}
                            targetAddr={showAddresses ? arrowTargetAddr : null}
                            prevAddr={showAddresses ? (addrMap.get(node.id) || null) : null}
                            prevOk={prevOk}
                            theme={theme}
                          />
                        : <SinglyHArrow
                            isActive={isActive}
                            type={type}
                            isReversed={!isEven && layoutMode === 'wrap'}
                            targetAddr={showAddresses ? arrowTargetAddr : null}
                            theme={theme}
                          />
                    )}

                    {/* Corner Curve for wrapped snake row */}
                    {hasWrap && (
                      <SnakeRowTurn fromRight={isEven} color={isActive ? getTypeColor(type, theme) : pal.snakeTurnDefault} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Unlinked lane: nodes that exist but are not reachable from head */}
      {hasLane && (
        <div style={{ marginTop: cycleEdges.length ? 8 : 44, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase',
            color: theme === 'light' ? '#a16207' : '#fbbf24', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ flex: '0 0 18px', height: 1, background: 'currentColor', opacity: 0.6 }} />
            Not linked into the list
            <span style={{ flex: 1, height: 1, background: 'currentColor', opacity: 0.25 }} />
          </div>
          <div style={{ display: 'flex', gap: 44, alignItems: 'flex-start', flexWrap: 'wrap', paddingTop: 34 }}>
            {floating.map(node => (
              <div key={node.id} ref={el => registerNodeRef(node.id, el)}>
                <NodeCard
                  node={node}
                  index={-1}
                  detached
                  isActive={node.id === activeNodeId}
                  isFlashing={flashSet.has(node.id)}
                  type={type}
                  isDoubly={isDoubly}
                  showAddresses={showAddresses}
                  addrMap={addrMap}
                  nodeById={nodeById}
                  theme={theme}
                />
              </div>
            ))}
            {removed.map(node => (
              <div key={`removed-${node.id}`}>
                <NodeCard
                  node={node}
                  index={-1}
                  removed
                  isActive={false}
                  isFlashing={false}
                  type={type}
                  isDoubly={isDoubly}
                  showAddresses={showAddresses}
                  addrMap={addrMap}
                  nodeById={nodeById}
                  theme={theme}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   EdgeOverlay — bezier edges that cannot be inline arrows
     • ring / cycle arcs (tail.next → head, head.prev → tail, back edges)
     • any edge that starts at, or points to, an unlinked node
   Geometry comes from measured node rectangles (container coordinates).
   ══════════════════════════════════════════════════════ */
function EdgeOverlay({ cycleEdges, extraEdges, layout, theme = 'dark' }) {
  if (!cycleEdges.length && !extraEdges.length) return null;
  const labelBg = theme === 'light' ? '#ffffff' : '#0b1020';
  const items = [];

  cycleEdges.forEach((e, i) => {
    const a = layout[e.fromId];
    const b = layout[e.toId];
    if (!a || !b) return;
    const isNext = e.pointerType === 'next';
    const color = isNext ? '#f97316' : '#818cf8';
    const self = e.fromId === e.toId;
    const dx = isNext ? 14 : -14;
    const sx = self ? a.cx + (isNext ? 22 : -22) : a.cx + dx;
    const ex = self ? a.cx + (isNext ? -22 : 22) : b.cx + dx;
    const floor = Math.max(a.b, b.b) + (isNext ? 52 : 78);
    const path = `M ${sx} ${a.b} C ${sx} ${floor}, ${ex} ${floor}, ${ex} ${b.b}`;
    const midX = (sx + ex) / 2;
    const midY = 0.75 * floor + 0.125 * (a.b + b.b);
    const label = isNext
      ? (e.isRing ? '↻ tail.next → head' : '↩ next cycle')
      : (e.isRing ? 'head.prev → tail' : '← prev cycle');
    items.push(
      <g key={`c${i}`}>
        <path d={path} fill="none" stroke={color} strokeWidth="5" opacity="0.14" />
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeDasharray="6 3"
          markerEnd="url(#ll-cycle)" className="cycle-arc-flowing" opacity="0.95" />
        <rect x={midX - 52} y={midY - 9} width={104} height={17} rx={5}
          fill={labelBg} stroke={color} strokeWidth="0.9" opacity="0.97" />
        <text x={midX} y={midY + 3.5} textAnchor="middle" fill={color}
          fontSize="9" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
          {label}
        </text>
      </g>
    );
  });

  extraEdges.forEach((e, i) => {
    const a = layout[e.fromId];
    const b = layout[e.toId];
    if (!a || !b) return;
    const isNext = e.kind === 'next';
    const color = isNext ? '#38bdf8' : '#818cf8';
    // offset past the NULL badge that sits centred under a tail node
    const off = isNext ? 34 : -34;
    let path;
    let lx; let ly;
    if (Math.abs(b.cy - a.cy) < 24) {
      // same row: side to side, or loop underneath when the target is behind
      if (b.cx > a.cx) {
        const y = a.cy + off * 0.5;
        path = `M ${a.r} ${y} L ${b.l} ${y}`;
        lx = (a.r + b.l) / 2; ly = y - 6;
      } else {
        const floor = Math.max(a.b, b.b) + 34;
        path = `M ${a.cx + off} ${a.b} C ${a.cx + off} ${floor}, ${b.cx + off} ${floor}, ${b.cx + off} ${b.b}`;
        lx = (a.cx + b.cx) / 2 + off; ly = 0.75 * floor + 0.25 * a.b;
      }
    } else if (b.cy < a.cy) {
      // target above (unlinked lane → chain): leave the top, arrive at the bottom
      const sx = a.cx + off;
      const ex = b.cx + off;
      path = `M ${sx} ${a.t} C ${sx} ${a.t - 46}, ${ex} ${b.b + 46}, ${ex} ${b.b}`;
      lx = (sx + ex) / 2; ly = (a.t + b.b) / 2;
    } else {
      // target below (chain → unlinked lane)
      const sx = a.cx + off;
      const ex = b.cx + off;
      path = `M ${sx} ${a.b} C ${sx} ${a.b + 46}, ${ex} ${b.t - 46}, ${ex} ${b.t}`;
      lx = (sx + ex) / 2; ly = (a.b + b.t) / 2;
    }
    items.push(
      <g key={`x${i}`}>
        <path d={path} fill="none" stroke={color} strokeWidth="2" strokeDasharray={e.dangling ? '5 4' : undefined}
          markerEnd={isNext ? 'url(#ll-next-h)' : 'url(#ll-prev-h)'} opacity="0.95" />
        <text x={lx + (isNext ? 8 : -8)} y={ly} textAnchor={isNext ? 'start' : 'end'} fill={color}
          fontSize="9" fontWeight="800" fontFamily="'JetBrains Mono', monospace">
          {isNext ? 'next' : 'prev'}
        </text>
      </g>
    );
  });

  return (
    <svg
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        overflow: 'visible', pointerEvents: 'none', zIndex: 4,
      }}
      aria-hidden="true"
    >
      {items}
    </svg>
  );
}

/* ══════════════════════════════════════════════════════
   NodeCard — FIX-2: Clear Address Display
   ══════════════════════════════════════════════════════ */
function NodeCardImpl({
  node,
  index,
  isActive,
  isFlashing,
  type,
  isDoubly,
  showAddresses,
  addrMap,
  nodeById,
  detached = false,   // exists but is not linked into the list
  removed = false,    // became unreachable in this very step (one-step ghost)
  theme = 'dark',
}) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const nodeAddr = addrMap.get(node.id) || '0x???';
  const nextAddr = node.nextId != null && node.nextId !== -1 ? addrMap.get(node.nextId) : null;
  const prevAddr = node.prevId != null && node.prevId !== -1 ? addrMap.get(node.prevId) : null;

  // DLL integrity check: does the neighbor actually point back at us?
  // (node.next.prev should === node, and node.prev.next should === node)
  // Flags the single most common DLL bug — a forward link set without
  // updating the matching backward link — right where it happens.
  const nextNode = isDoubly && nextAddr ? nodeById?.get(node.nextId) : null;
  const nextLinkBroken = isDoubly && nextAddr && nextNode && nextNode.prevId !== node.id;
  const prevNode = isDoubly && prevAddr ? nodeById?.get(node.prevId) : null;
  const prevLinkBroken = isDoubly && prevAddr && prevNode && prevNode.nextId !== node.id;

  const colors = getNodeColors(isActive, type, theme);
  // Unlinked / removed nodes keep the same card anatomy but are visibly "outside" the list
  const stateColor = removed ? (theme === 'light' ? '#b91c1c' : '#f87171')
                   : detached ? (theme === 'light' ? '#a16207' : '#fbbf24') : null;
  const borderColor = stateColor && !isActive ? stateColor : colors.border;

  return (
    <div
      className={isActive ? 'pulse-active' : ''}
      title={removed ? 'Unreachable after this step — will be garbage collected' : detached ? 'Not reachable from head' : undefined}
      style={{
        display: 'flex', flexDirection: 'column',
        borderRadius: 12,
        background: pal.cardBg,
        border: `2px ${stateColor ? 'dashed' : 'solid'} ${borderColor}`,
        opacity: removed ? 0.6 : 1,
        boxShadow: isActive
          ? `0 0 0 4px ${colors.glow}, 0 8px 32px ${colors.shadow}`
          : isFlashing
            ? (theme === 'light' ? '0 0 0 3px rgba(37,99,235,0.2), 0 4px 20px rgba(37,99,235,0.1)' : '0 0 0 3px rgba(255,255,255,0.25), 0 4px 20px rgba(255,255,255,0.1)')
            : (theme === 'light' ? '0 2px 10px rgba(15,23,42,0.08)' : '0 4px 16px rgba(0,0,0,0.4)'),
        transform: isFlashing
          ? 'translateY(-6px) scale(1.06)'
          : isActive
            ? 'translateY(-2px)'
            : 'none',
        transition: 'all 240ms cubic-bezier(.34,1.56,.64,1)',
        minWidth: isDoubly ? 168 : 132,
        overflow: 'hidden',
      }}
    >
      {/* FIX-2: Node header — Addr (left, prominent) + Index badge (right) */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px',
        background: isActive ? colors.headerBg : pal.inactiveHeaderBg,
        borderBottom: `1px solid ${colors.border}`,
        fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {/* FIX-2: Own address — clearly labeled "Addr:" */}
        {showAddresses ? (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3,
            color: isActive ? pal.text : pal.textMuted,
          }}>
            <span style={{ color: isActive ? colors.label : pal.textFaint, fontSize: 8.5 }}>Addr</span>
            <span style={{
              background: isActive ? pal.addrChipActiveBg : pal.addrChipBg,
              padding: '1px 5px', borderRadius: 3,
              color: isActive ? pal.text : pal.addrChipText,
            }}>
              {nodeAddr}
            </span>
          </span>
        ) : (
          <span style={{ color: colors.label }}>node</span>
        )}
        {/* Index badge */}
        <span style={{
          background: isActive ? `${colors.label}22` : pal.idxBadgeBg,
          border: `1px solid ${isActive ? colors.label + '44' : pal.idxBadgeBorder}`,
          color: isActive ? colors.label : pal.idxBadgeText,
          padding: '0px 5px', borderRadius: 3, fontSize: 9,
        }}>
          {removed ? 'REMOVED' : detached ? 'UNLINKED' : `[${index}]`}
        </span>
      </div>

      {/* Compartments Row */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* PREV Compartment (Doubly only) */}
        {isDoubly && (
          <>
            <div style={{
              padding: '10px 8px', minWidth: 46,
              background: isActive
                ? (theme === 'light' ? 'rgba(124, 58, 237, 0.1)' : 'rgba(139, 92, 246, 0.15)')
                : (theme === 'light' ? 'rgba(124, 58, 237, 0.04)' : 'rgba(139, 92, 246, 0.04)'),
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, color: theme === 'light' ? '#6d28d9' : '#c4b5fd', letterSpacing: '.06em' }}>
                  PREV
                </span>
                {prevLinkBroken && (
                  <span title="Broken back-link: this node's prev does not point back at this node's next" style={{ fontSize: 9 }}>⚠</span>
                )}
              </span>
              {/* FIX-2: ← prefix to indicate direction */}
              <span style={{
                fontSize: 9.5, fontWeight: 700,
                color: prevLinkBroken ? (theme === 'light' ? '#dc2626' : '#f87171') : prevAddr ? (theme === 'light' ? '#7c3aed' : '#a78bfa') : pal.textFaint,
                fontFamily: "'JetBrains Mono', monospace",
                textAlign: 'center',
              }}>
                {prevAddr ? (
                  <><span style={{ opacity: 0.6 }}>←</span>{prevAddr}</>
                ) : (
                  <span style={{ color: pal.textFaint }}>null</span>
                )}
              </span>
            </div>
            <div style={{ width: 1, background: colors.border, opacity: 0.5 }} />
          </>
        )}

        {/* DATA Compartment */}
        <div style={{
          padding: '10px 14px', flex: 1, minWidth: 58,
          background: colors.dataBg,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: colors.label, letterSpacing: '.06em' }}>
            DATA
          </span>
          <span style={{
            fontSize: 19, fontWeight: 800, color: colors.val,
            fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.1,
          }}>
            <span style={removed ? { textDecoration: 'line-through' } : undefined}>{String(node.val)}</span>
          </span>
        </div>

        <div style={{ width: 1, background: colors.border, opacity: 0.5 }} />

        {/* NEXT Compartment */}
        <div style={{
          padding: '10px 8px', minWidth: 50,
          background: colors.nextBg,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: colors.label, letterSpacing: '.06em' }}>
              NEXT
            </span>
            {nextLinkBroken && (
              <span title="Broken back-link: the next node's prev does not point back at this node" style={{ fontSize: 9 }}>⚠</span>
            )}
          </span>
          {/* FIX-2: → prefix to indicate direction */}
          <span style={{
            fontSize: 9.5, fontWeight: 700,
            color: nextLinkBroken ? (theme === 'light' ? '#dc2626' : '#f87171') : nextAddr ? colors.ptr : (theme === 'light' ? '#dc2626' : '#ef4444'),
            fontFamily: "'JetBrains Mono', monospace",
            textAlign: 'center',
          }}>
            {nextAddr ? (
              <><span style={{ opacity: 0.6 }}>→</span>{nextAddr}</>
            ) : (
              <span style={{ color: theme === 'light' ? '#dc2626' : '#ef4444' }}>null</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/* Re-render a card only when something it actually draws changed. Trace steps
   hand us brand-new node objects every time, so reference equality is useless;
   compare the fields that reach the DOM (incl. the neighbour back-links used
   by the DLL integrity check). */
const NodeCard = memo(NodeCardImpl, (a, b) => {
  if (a.index !== b.index || a.isActive !== b.isActive || a.isFlashing !== b.isFlashing
    || a.type !== b.type || a.isDoubly !== b.isDoubly || a.showAddresses !== b.showAddresses
    || a.theme !== b.theme || a.detached !== b.detached || a.removed !== b.removed) return false;
  const p = a.node, q = b.node;
  if (p.id !== q.id || p.val !== q.val || p.nextId !== q.nextId || p.prevId !== q.prevId) return false;
  if (a.addrMap.get(p.id) !== b.addrMap.get(q.id)
    || a.addrMap.get(p.nextId) !== b.addrMap.get(q.nextId)
    || a.addrMap.get(p.prevId) !== b.addrMap.get(q.prevId)) return false;
  if (a.isDoubly) {
    const an = a.nodeById?.get(p.nextId), bn = b.nodeById?.get(q.nextId);
    const ap = a.nodeById?.get(p.prevId), bp = b.nodeById?.get(q.prevId);
    if ((an && an.prevId) !== (bn && bn.prevId) || (ap && ap.nextId) !== (bp && bp.nextId)
      || Boolean(an) !== Boolean(bn) || Boolean(ap) !== Boolean(bp)) return false;
  }
  return true;
});

/* ══════════════════════════════════════════════════════
   FIX-1 + FIX-2: Connector Arrows — stable IDs, address labels
   ══════════════════════════════════════════════════════ */

// Singly forward/reverse arrow with optional address annotation
function SinglyHArrow({ isActive, type, isReversed = false, targetAddr = null, theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const markerId    = getFwdMarkerId(isActive, type);
  const strokeColor = isActive ? getTypeColor(type, theme) : pal.inactiveArrow;
  const svgH = targetAddr ? 36 : 24;

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', flexShrink: 0 }}>
      <svg width="44" height={svgH} viewBox={`0 0 44 ${svgH}`}>
        {/* FIX-2: Target address label above arrow */}
        {targetAddr && (
          <text
            x="22" y="10"
            textAnchor="middle"
            fontSize="7.5"
            fontWeight="600"
            fill={isActive ? strokeColor : pal.arrowLabelInactive}
            fontFamily="'JetBrains Mono', monospace"
          >
            {targetAddr}
          </text>
        )}
        {/* Arrow line — no inline <defs>, uses shared markers */}
        {isReversed ? (
          <line
            x1="40" y1={targetAddr ? 24 : 12}
            x2="6"  y2={targetAddr ? 24 : 12}
            stroke={strokeColor}
            strokeWidth="2.5"
            className={isActive ? 'arrow-flowing' : ''}
            markerEnd={markerId}
          />
        ) : (
          <line
            x1="4"  y1={targetAddr ? 24 : 12}
            x2="38" y2={targetAddr ? 24 : 12}
            stroke={strokeColor}
            strokeWidth="2.5"
            className={isActive ? 'arrow-flowing' : ''}
            markerEnd={markerId}
          />
        )}
      </svg>
    </div>
  );
}

// Doubly bidirectional arrows with stable IDs + optional address label
function DoublyHArrow({ isActive, type, _isReversed = false, targetAddr = null, prevAddr = null, prevOk = true, theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const nextMarkerId = isActive ? 'url(#ll-next-h-active)' : 'url(#ll-next-h)';
  const prevMarkerId = isActive ? 'url(#ll-prev-h-active)' : 'url(#ll-prev-h)';
  const nextColor    = isActive ? getTypeColor(type, theme) : '#38bdf8';
  const prevColor    = isActive ? '#c4b5fd' : '#818cf8';
  const hasLabel     = targetAddr || prevAddr;
  const svgW         = 46;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '0 6px', flexShrink: 0, gap: 2,
    }}>
      {/* FIX-2: Prev address label */}
      {hasLabel && (
        <span style={{
          fontSize: 7, fontWeight: 600,
          color: pal.textFaint,
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: 'center',
        }}>
          {prevAddr || '—'}
        </span>
      )}

      {/* Prev Arrow (Violet) — right to left. Drawn only when B.prev really is A;
          otherwise a red dashed stub with no head shows the back-link is missing. */}
      <svg width={svgW} height="12" viewBox={`0 0 ${svgW} 12`}>
        {prevOk ? (
          <line
            x1="40" y1="6" x2="6" y2="6"
            stroke={prevColor} strokeWidth="2"
            className={isActive ? 'arrow-flowing' : ''}
            markerEnd={prevMarkerId}
          />
        ) : (
          <g>
            <title>prev pointer does not point back at the previous node</title>
            <line x1="40" y1="6" x2="14" y2="6" stroke="#ef4444" strokeWidth="2" strokeDasharray="3 3" />
            <text x="8" y="9.5" fontSize="10" fontWeight="800" fill="#ef4444">✕</text>
          </g>
        )}
      </svg>

      {/* Next Arrow (Cyan) — left to right */}
      <svg width={svgW} height="12" viewBox={`0 0 ${svgW} 12`}>
        <line
          x1="6" y1="6" x2="40" y2="6"
          stroke={nextColor} strokeWidth="2"
          className={isActive ? 'arrow-flowing' : ''}
          markerEnd={nextMarkerId}
        />
      </svg>

      {/* FIX-2: Next address label */}
      {hasLabel && (
        <span style={{
          fontSize: 7, fontWeight: 600,
          color: isActive ? nextColor : pal.textFaint,
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: 'center',
        }}>
          {targetAddr || '—'}
        </span>
      )}
    </div>
  );
}

// Smooth curved loop for snake rows (unchanged)
function SnakeRowTurn({ fromRight, color }) {
  return (
    <div style={{
      padding: '0 8px', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="34" height="42" viewBox="0 0 34 42" fill="none">
        <path
          d={fromRight ? "M 2 8 C 30 8, 30 34, 2 34" : "M 32 8 C 4 8, 4 34, 32 34"}
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="4 2"
        />
      </svg>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Status Badges & Operation Helpers
   ══════════════════════════════════════════════════════ */
function OperationBadge({ type, theme = 'dark' }) {
  const confDark = {
    ll_insert:   { label: 'INSERT',    color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)', border: 'rgba(52, 211, 153, 0.3)' },
    ll_traverse: { label: 'TRAVERSE',  color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.3)' },
    ll_delete:   { label: 'DELETE',    color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.3)' },
    ll_update:   { label: 'LINK / SET',color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.3)' },
    ll_init:     { label: 'INIT',      color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', border: 'rgba(192, 132, 252, 0.3)' },
  };
  const confLight = {
    ll_insert:   { label: 'INSERT',    color: '#047857', bg: 'rgba(52, 211, 153, 0.14)', border: 'rgba(4, 120, 87, 0.3)' },
    ll_traverse: { label: 'TRAVERSE',  color: '#0e7490', bg: 'rgba(56, 189, 248, 0.14)', border: 'rgba(14, 116, 144, 0.3)' },
    ll_delete:   { label: 'DELETE',    color: '#b91c1c', bg: 'rgba(248, 113, 113, 0.14)', border: 'rgba(185, 28, 28, 0.3)' },
    ll_update:   { label: 'LINK / SET',color: '#a16207', bg: 'rgba(251, 191, 36, 0.16)', border: 'rgba(161, 98, 7, 0.3)' },
    ll_init:     { label: 'INIT',      color: '#7e22ce', bg: 'rgba(192, 132, 252, 0.14)', border: 'rgba(126, 34, 206, 0.3)' },
  };
  const conf = (theme === 'light' ? confLight : confDark)[type]
    || (theme === 'light'
      ? { label: 'SNAPSHOT', color: '#475569', bg: 'rgba(148, 163, 184, 0.16)', border: 'rgba(71, 85, 105, 0.3)' }
      : { label: 'SNAPSHOT', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.3)' });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 8px', borderRadius: 6,
      background: conf.bg, border: `1px solid ${conf.border}`,
      fontSize: 10, fontWeight: 800, color: conf.color,
      letterSpacing: '.06em',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: conf.color, boxShadow: `0 0 6px ${conf.color}`,
      }} />
      {conf.label}
    </div>
  );
}

function getTypeColor(type, theme = 'dark') {
  if (theme === 'light') {
    switch (type) {
      case 'll_insert':   return '#047857';
      case 'll_delete':   return '#b91c1c';
      case 'll_traverse': return '#0e7490';
      case 'll_init':     return '#7e22ce';
      default:            return '#a16207';
    }
  }
  switch (type) {
    case 'll_insert':   return '#34d399';
    case 'll_delete':   return '#f87171';
    case 'll_traverse': return '#38bdf8';
    case 'll_init':     return '#c084fc';
    default:            return '#fbbf24';
  }
}

function getTypeIcon(type) {
  switch (type) {
    case 'll_insert':   return '＋';
    case 'll_delete':   return '✕';
    case 'll_traverse': return '➜';
    case 'll_init':     return '◈';
    default:            return '⟳';
  }
}

function getNodeColors(isActive, type, theme = 'dark') {
  if (isActive) {
    const c = getTypeColor(type, theme);
    return {
      border:   c,
      headerBg: `${c}26`,
      dataBg:   `${c}18`,
      nextBg:   `${c}12`,
      val:      theme === 'light' ? '#0f172a' : '#ffffff',
      label:    c,
      ptr:      c,
      glow:     `${c}66`,
      shadow:   `${c}33`,
    };
  }
  const pal = PALETTE[theme] || PALETTE.dark;
  return {
    border:   pal.inactiveBorder,
    headerBg: pal.inactiveHeaderBg,
    dataBg:   theme === 'light' ? '#fbfcfd' : 'rgba(255,255,255,0.02)',
    nextBg:   theme === 'light' ? '#f6f8fa' : 'rgba(255,255,255,0.01)',
    val:      pal.inactiveVal,
    label:    pal.inactiveLabel,
    ptr:      pal.inactivePtr,
    glow:     'transparent',
    shadow:   'transparent',
  };
}

/* ══════════════════════════════════════════════════════
   Empty State Visual
   ══════════════════════════════════════════════════════ */
function EmptyHint({ isDoubly, circular = false, theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 32px', gap: 18,
      color: pal.textMuted, textAlign: 'center', maxWidth: 460, margin: '40px auto 0',
      background: pal.emptyBg,
      backdropFilter: 'blur(12px)',
      borderRadius: 16,
      border: `1px solid ${pal.emptyBorder}`,
    }}>
      <div style={{
        fontSize: 36, width: 76, height: 76, borderRadius: 20,
        background: theme === 'light'
          ? 'linear-gradient(135deg, rgba(14, 116, 144, 0.12), rgba(126, 34, 206, 0.12))'
          : 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(139, 92, 246, 0.15))',
        border: `1px solid ${pal.inactiveBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: theme === 'light' ? '0 8px 24px rgba(15,23,42,0.08)' : '0 8px 30px rgba(0,0,0,0.4)',
      }}>
        {circular ? '↻' : isDoubly ? '⇄' : '⛓'}
      </div>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: pal.text, margin: '0 0 6px' }}>
          {circular ? 'Circular Linked List Visualizer' : isDoubly ? 'Doubly Linked List Visualizer' : 'Linked List Visualizer'}
        </h3>
        <p style={{ fontSize: 13, color: pal.textMuted, margin: 0, lineHeight: 1.6 }}>
          Run your code with a <code style={{ color: theme === 'light' ? '#0e7490' : '#38bdf8', background: theme === 'light' ? 'rgba(14,116,144,0.1)' : 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: 4 }}>Node</code> class to see the live pointer chain animate step-by-step.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['head = Node(10)', 'head.next = Node(20)', 'cur = head.next'].map(snippet => (
          <span key={snippet} style={{
            padding: '4px 10px', borderRadius: 6,
            background: pal.codeChipBg,
            border: `1px solid ${pal.codeChipBorder}`,
            fontSize: 11, color: pal.codeChipText,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {snippet}
          </span>
        ))}
      </div>
    </div>
  );
}
