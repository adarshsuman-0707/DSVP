import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

/**
 * LinkedListVisualizer — v2 (Fixed Edition)
 * ──────────────────────────────────────────
 * FIX-1 ▸ Stable SVG marker IDs via SharedArrowDefs — eliminates flicker
 * FIX-2 ▸ Clear address labeling: "Addr: 0xXXX" on node header + arrow annotations
 * FIX-3 ▸ Cycle detection + Bezier arc overlay for backward/cycle pointers
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
export default function LinkedListVisualizer({
  linkedListState = [],
  activeNodeId    = -1,
  type            = 'll_snap',
  description     = '',
  step            = 0,
  totalSteps      = 0,
  userOutput      = '',
}) {
  const [flashSet, setFlashSet]           = useState(new Set());
  const prevStateRef                       = useRef([]);
  const [stdoutH, setStdoutH]             = useState(110);
  const [resizing, setResizing]           = useState(false);
  const [zoom, setZoom]                   = useState(1);
  const [layoutMode, setLayoutMode]       = useState('wrap'); // 'wrap' | 'horizontal'
  const [showAddresses, setShowAddresses] = useState(true);
  const containerRef                       = useRef(null);

  // Detect Doubly Linked List
  const isDoubly = useMemo(() => {
    return linkedListState.some(
      n => n.prevId !== undefined && n.prevId !== null && n.prevId !== -1
    );
  }, [linkedListState]);

  // Generate deterministic hex memory addresses
  const addrMap = useMemo(() => {
    const map = new Map();
    linkedListState.forEach((node, idx) => {
      const hash = typeof node.id === 'number' && node.id < 1000
        ? (0x100 + node.id * 0x30)
        : (0x100 + ((Math.abs(Number(node.id) || idx)) % 0x8FF));
      map.set(node.id, '0x' + hash.toString(16).toUpperCase().padStart(3, '0'));
    });
    return map;
  }, [linkedListState]);

  const headNode = useMemo(() => {
    return linkedListState.find(n => n.isHead) || linkedListState[0] || null;
  }, [linkedListState]);

  const tailNode = useMemo(() => {
    if (linkedListState.length === 0) return null;
    return linkedListState.find(n => n.nextId === null || n.nextId === -1 || n.nextId === undefined) ||
           linkedListState[linkedListState.length - 1];
  }, [linkedListState]);

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

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: '#090d16',
        backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(30, 58, 138, 0.15) 0%, transparent 70%), radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
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
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
        flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        {/* Left: Module Badge & Live Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(139, 92, 246, 0.2))',
            border: '1px solid rgba(96, 165, 250, 0.3)',
          }}>
            <span style={{ fontSize: 13 }}>{isDoubly ? '⇄' : '⛓'}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#e2e8f0',
              textTransform: 'uppercase', letterSpacing: '.06em',
            }}>
              {isDoubly ? 'Doubly Linked List' : 'Linked List'}
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
            {linkedListState.length} {linkedListState.length === 1 ? 'Node' : 'Nodes'}
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

          {/* Active Operation pill */}
          <OperationBadge type={type} />
        </div>

        {/* Right: View & Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Memory addresses toggle */}
          <button
            onClick={() => setShowAddresses(v => !v)}
            title="Toggle Memory Addresses (0x...)"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 8px', borderRadius: 6,
              background: showAddresses ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showAddresses ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255,255,255,0.1)'}`,
              color: showAddresses ? '#a5b4fc' : '#94a3b8',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 150ms',
            }}
          >
            <span>0x</span>
            <span>Addr</span>
          </button>

          {/* Layout Mode Toggle */}
          <button
            onClick={() => setLayoutMode(m => m === 'wrap' ? 'horizontal' : 'wrap')}
            title={layoutMode === 'wrap' ? 'Switch to Continuous Horizontal Line' : 'Switch to Snake Row Wrap'}
            style={{
              padding: '4px 8px', borderRadius: 6,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {layoutMode === 'wrap' ? '⤾ Wrap' : '→ Line'}
          </button>

          {/* Zoom controls */}
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, overflow: 'hidden',
          }}>
            <button
              onClick={() => setZoom(z => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))}
              disabled={zoom <= 0.6}
              title="Zoom out"
              style={{
                padding: '3px 8px', background: 'none', border: 'none',
                color: zoom <= 0.6 ? '#475569' : '#cbd5e1', fontSize: 13, cursor: zoom <= 0.6 ? 'default' : 'pointer',
              }}
            >−</button>
            <span
              onClick={() => setZoom(1)}
              title="Reset Zoom to 100%"
              style={{
                padding: '0 5px', fontSize: 11, fontWeight: 600,
                color: zoom === 1 ? '#64748b' : '#38bdf8', cursor: 'pointer',
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
                color: zoom >= 1.5 ? '#475569' : '#cbd5e1', fontSize: 13, cursor: zoom >= 1.5 ? 'default' : 'pointer',
              }}
            >+</button>
          </div>

          {/* Step indicator */}
          {step > 0 && (
            <div style={{
              fontSize: 11, fontWeight: 700, color: '#94a3b8',
              letterSpacing: '.04em', minWidth: 65, textAlign: 'right',
            }}>
              Step <span style={{ color: '#f1f5f9' }}>{step}</span>
              {totalSteps > 0 && <span style={{ opacity: 0.6 }}>/{totalSteps}</span>}
            </div>
          )}
        </div>
      </header>

      {/* ── FLOATING STEP ACTION BANNER ── */}
      {description && (
        <div style={{
          margin: '12px 20px 0',
          padding: '8px 16px',
          borderRadius: 10,
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>{getTypeIcon(type)}</span>
            <span style={{
              fontSize: 12.5, fontWeight: 600,
              color: getTypeColor(type), letterSpacing: '.01em',
            }}>
              {description}
            </span>
          </div>

          {activeNodeId !== -1 && activeNodeId !== null && addrMap.has(activeNodeId) && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#94a3b8',
              fontFamily: "'JetBrains Mono', monospace",
              padding: '2px 8px', borderRadius: 4,
              background: 'rgba(255,255,255,0.06)',
            }}>
              Active: {addrMap.get(activeNodeId)}
            </span>
          )}
        </div>
      )}

      {/* ── MAIN INTERACTIVE CANVAS ── */}
      <main style={{
        flex: 1, minHeight: 0, overflow: 'auto',
        padding: isDoubly ? '48px 32px 32px' : '36px 32px 32px',
        display: 'flex', alignItems: 'flex-start',
      }}>
        <div style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          transition: 'transform 180ms ease-out',
          minWidth: 'fit-content',
        }}>
          {empty ? (
            <EmptyHint isDoubly={isDoubly} />
          ) : (
            <NodeChain
              nodes={linkedListState}
              activeNodeId={activeNodeId}
              flashSet={flashSet}
              type={type}
              isDoubly={isDoubly}
              layoutMode={layoutMode}
              showAddresses={showAddresses}
              addrMap={addrMap}
            />
          )}
        </div>
      </main>

      {/* ── STDOUT TERMINAL DRAWER ── */}
      {userOutput && (
        <>
          <div
            onMouseDown={() => setResizing(true)}
            title="Drag to resize terminal output"
            style={{
              height: 5, cursor: 'row-resize', flexShrink: 0,
              background: resizing ? 'rgba(56, 189, 248, 0.7)' : 'rgba(255,255,255,0.08)',
              transition: resizing ? 'none' : 'background 150ms',
            }}
          />
          <section style={{
            height: stdoutH, flexShrink: 0,
            background: '#040711',
            borderTop: '1px solid rgba(255,255,255,.07)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '6px 16px', fontSize: 10, fontWeight: 700,
              color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em',
              borderBottom: '1px solid rgba(255,255,255,.04)', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
              Program Output
            </div>
            <pre style={{
              flex: 1, overflow: 'auto', margin: 0,
              padding: '10px 16px', fontSize: 12, color: '#f8fafc',
              fontFamily: "'JetBrains Mono', Consolas, monospace",
              lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{userOutput}</pre>
          </section>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   NodeChain Layout Engine + FIX-3 Cycle Detection
   ══════════════════════════════════════════════════════ */
const ROW_SIZE = 5;

function NodeChain({
  nodes,
  activeNodeId,
  flashSet,
  type,
  isDoubly,
  layoutMode,
  showAddresses,
  addrMap,
}) {
  const containerRef = useRef(null);
  // nodeId -> DOM element (the node card div)
  const nodeElRefs = useRef(new Map());
  const [arcData, setArcData] = useState([]);

  const rows = useMemo(() => {
    if (layoutMode === 'horizontal') return [nodes];
    const r = [];
    for (let i = 0; i < nodes.length; i += ROW_SIZE) {
      r.push(nodes.slice(i, i + ROW_SIZE));
    }
    return r;
  }, [nodes, layoutMode]);

  /* FIX-3: Build node-index map for cycle detection */
  const indexMap = useMemo(() => {
    const m = new Map();
    nodes.forEach((n, i) => m.set(n.id, i));
    return m;
  }, [nodes]);

  /* FIX-3: Identify backward/cycle edges */
  const cycleEdges = useMemo(() => {
    const edges = [];
    nodes.forEach((n, i) => {
      // next pointer going to an earlier or same node = cycle
      if (n.nextId != null && n.nextId !== -1 && n.nextId !== undefined) {
        const ti = indexMap.get(n.nextId);
        if (ti !== undefined && ti <= i) {
          edges.push({ fromId: n.id, toId: n.nextId, fromIdx: i, toIdx: ti, pointerType: 'next' });
        }
      }
      // For DLL: prev pointer going to a later node = unusual/cycle
      if (n.prevId != null && n.prevId !== -1 && n.prevId !== undefined) {
        const ti = indexMap.get(n.prevId);
        if (ti !== undefined && ti > i) {
          edges.push({ fromId: n.id, toId: n.prevId, fromIdx: i, toIdx: ti, pointerType: 'prev' });
        }
      }
    });
    return edges;
  }, [nodes, indexMap]);

  /* FIX-3: Register node element ref callback */
  const registerNodeRef = useCallback((nodeId, el) => {
    if (el) {
      nodeElRefs.current.set(nodeId, el);
    } else {
      nodeElRefs.current.delete(nodeId);
    }
  }, []);

  /* FIX-3: Measure DOM positions after render to compute arc coordinates */
  useEffect(() => {
    if (cycleEdges.length === 0) {
      setArcData([]);
      return;
    }
    const raf = requestAnimationFrame(() => {
      const containerEl = containerRef.current;
      if (!containerEl) return;
      const containerRect = containerEl.getBoundingClientRect();
      const arcs = [];

      for (const edge of cycleEdges) {
        const fromEl = nodeElRefs.current.get(edge.fromId);
        const toEl   = nodeElRefs.current.get(edge.toId);
        if (!fromEl || !toEl) continue;

        const fRect = fromEl.getBoundingClientRect();
        const tRect = toEl.getBoundingClientRect();

        // exit from right-center of source, enter left-center of target
        arcs.push({
          ...edge,
          fx: fRect.right  - containerRect.left,
          fy: fRect.top    - containerRect.top + fRect.height / 2,
          tx: tRect.left   - containerRect.left,
          ty: tRect.top    - containerRect.top + tRect.height / 2,
          arcFloor: Math.max(fRect.bottom, tRect.bottom) - containerRect.top + 72,
        });
      }
      setArcData(arcs);
    });
    return () => cancelAnimationFrame(raf);
  }, [cycleEdges, nodes, layoutMode]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column',
        gap: isDoubly ? 64 : 52, padding: '10px 0',
        position: 'relative', // needed for absolute arc overlay
      }}
    >
      {/* FIX-3: Cycle arc SVG overlay */}
      {arcData.length > 0 && (
        <CycleArcOverlay arcs={arcData} />
      )}

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
                const isHead     = Boolean(node.isHead || globalIdx === 0);
                const isLast     = globalIdx === nodes.length - 1;
                const hasArrow   = colIdx < display.length - 1;
                const isRowEnd   = colIdx === display.length - 1;
                const hasWrap    = !isLast && isRowEnd && layoutMode === 'wrap';

                // Is this node the SOURCE of a cycle edge? (suppress the normal arrow at row-end)
                const isCycleSource = cycleEdges.some(e => e.fromId === node.id && e.pointerType === 'next');

                // Target address for the connector arrow (FIX-2)
                const nextNode = hasArrow ? display[colIdx + 1] : null;
                const arrowTargetAddr = nextNode ? (addrMap.get(nextNode.id) || null) : null;

                return (
                  <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', position: 'relative',
                    }}>
                      {/* Active Cursor Pointer indicator */}
                      {isActive && (
                        <div
                          className="bounce-pointer"
                          style={{
                            position: 'absolute',
                            top: isDoubly ? -38 : -32,
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', zIndex: 10,
                          }}
                        >
                          <span style={{
                            padding: '2px 8px', borderRadius: 4,
                            background: getTypeColor(type), color: '#090d16',
                            fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
                            boxShadow: `0 2px 10px ${getTypeColor(type)}88`,
                          }}>
                            POINTER
                          </span>
                          <span style={{
                            fontSize: 11, color: getTypeColor(type),
                            lineHeight: 1, marginTop: -1,
                          }}>▼</span>
                        </div>
                      )}

                      {/* Head Tag above Node */}
                      {isHead && !isActive && (
                        <div style={{
                          marginBottom: 6,
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: '2px 8px', borderRadius: 4,
                          background: 'rgba(245, 158, 11, 0.15)',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          color: '#f59e0b', fontSize: 9.5, fontWeight: 800,
                          letterSpacing: '.08em', textTransform: 'uppercase',
                        }}>
                          <span>👑</span> HEAD
                        </div>
                      )}

                      {/* FIX-3: Ref registration wrapper for cycle arc measurement */}
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
                        />
                      </div>

                      {/* Cycle badge on source node (instead of NULL) */}
                      {isLast && isCycleSource ? (
                        <div style={{
                          marginTop: 8, display: 'flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 4,
                          background: 'rgba(249, 115, 22, 0.12)',
                          border: '1px dashed rgba(249, 115, 22, 0.5)',
                          color: '#fb923c', fontSize: 10, fontWeight: 700,
                          fontFamily: "'JetBrains Mono', monospace",
                        }}>
                          <span>↩</span> CYCLE
                        </div>
                      ) : isLast && (
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
                          />
                        : <SinglyHArrow
                            isActive={isActive}
                            type={type}
                            isReversed={!isEven && layoutMode === 'wrap'}
                            targetAddr={showAddresses ? arrowTargetAddr : null}
                          />
                    )}

                    {/* Corner Curve for wrapped snake row */}
                    {hasWrap && (
                      <SnakeRowTurn fromRight={isEven} color={isActive ? getTypeColor(type) : 'rgba(255,255,255,0.2)'} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   FIX-3: Cycle Arc Overlay — Bezier arcs below nodes
   ══════════════════════════════════════════════════════ */
function CycleArcOverlay({ arcs }) {
  if (!arcs.length) return null;

  // SVG needs to be tall enough to contain all arcs going below
  const maxBottom = Math.max(...arcs.map(a => a.arcFloor)) + 30;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: maxBottom,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 4,
      }}
      aria-hidden="true"
    >
      {arcs.map((arc, i) => {
        const { fx, fy, tx, ty, arcFloor, pointerType } = arc;
        // Cubic bezier: both control points dive to arcFloor
        const path = `M ${fx} ${fy} C ${fx} ${arcFloor}, ${tx} ${arcFloor}, ${tx} ${ty}`;
        const midX = (fx + tx) / 2;
        const labelY = arcFloor + 14;
        const color = pointerType === 'prev' ? '#818cf8' : '#f97316';
        const label = pointerType === 'prev' ? '← PREV CYCLE' : '↩ NEXT CYCLE';

        return (
          <g key={i}>
            {/* Glow shadow */}
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth="5"
              opacity="0.15"
            />
            {/* Main arc line */}
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeDasharray="6 3"
              markerEnd="url(#ll-cycle)"
              className="cycle-arc-flowing"
              opacity="0.9"
            />
            {/* Cycle label badge */}
            <rect
              x={midX - 38}
              y={labelY - 9}
              width={76}
              height={16}
              rx={4}
              fill="rgba(249,115,22,0.12)"
              stroke={color}
              strokeWidth="0.8"
              opacity="0.9"
            />
            <text
              x={midX}
              y={labelY + 3}
              textAnchor="middle"
              fill={color}
              fontSize="8.5"
              fontWeight="700"
              fontFamily="'JetBrains Mono', monospace"
              letterSpacing="0.04em"
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ══════════════════════════════════════════════════════
   NodeCard — FIX-2: Clear Address Display
   ══════════════════════════════════════════════════════ */
function NodeCard({
  node,
  index,
  isActive,
  isFlashing,
  type,
  isDoubly,
  showAddresses,
  addrMap,
}) {
  const nodeAddr = addrMap.get(node.id) || '0x???';
  const nextAddr = node.nextId != null && node.nextId !== -1 ? addrMap.get(node.nextId) : null;
  const prevAddr = node.prevId != null && node.prevId !== -1 ? addrMap.get(node.prevId) : null;

  const colors = getNodeColors(isActive, type);

  return (
    <div
      className={isActive ? 'pulse-active' : ''}
      style={{
        display: 'flex', flexDirection: 'column',
        borderRadius: 12,
        background: 'linear-gradient(160deg, #131b2e 0%, #0d121f 100%)',
        border: `2px solid ${colors.border}`,
        boxShadow: isActive
          ? `0 0 0 4px ${colors.glow}, 0 8px 32px ${colors.shadow}`
          : isFlashing
            ? '0 0 0 3px rgba(255,255,255,0.25), 0 4px 20px rgba(255,255,255,0.1)'
            : '0 4px 16px rgba(0,0,0,0.4)',
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
        background: isActive ? colors.headerBg : 'rgba(255, 255, 255, 0.04)',
        borderBottom: `1px solid ${colors.border}`,
        fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {/* FIX-2: Own address — clearly labeled "Addr:" */}
        {showAddresses ? (
          <span style={{
            display: 'flex', alignItems: 'center', gap: 3,
            color: isActive ? '#f8fafc' : '#94a3b8',
          }}>
            <span style={{ color: isActive ? colors.label : '#475569', fontSize: 8.5 }}>Addr</span>
            <span style={{
              background: isActive ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.3)',
              padding: '1px 5px', borderRadius: 3,
              color: isActive ? '#f8fafc' : '#64748b',
            }}>
              {nodeAddr}
            </span>
          </span>
        ) : (
          <span style={{ color: colors.label }}>node</span>
        )}
        {/* Index badge */}
        <span style={{
          background: isActive ? `${colors.label}22` : 'rgba(255,255,255,0.06)',
          border: `1px solid ${isActive ? colors.label + '44' : 'rgba(255,255,255,0.1)'}`,
          color: isActive ? colors.label : '#475569',
          padding: '0px 5px', borderRadius: 3, fontSize: 9,
        }}>
          [{index}]
        </span>
      </div>

      {/* Compartments Row */}
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* PREV Compartment (Doubly only) */}
        {isDoubly && (
          <>
            <div style={{
              padding: '10px 8px', minWidth: 46,
              background: isActive ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.04)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: '#c4b5fd', letterSpacing: '.06em' }}>
                PREV
              </span>
              {/* FIX-2: ← prefix to indicate direction */}
              <span style={{
                fontSize: 9.5, fontWeight: 700,
                color: prevAddr ? '#a78bfa' : '#475569',
                fontFamily: "'JetBrains Mono', monospace",
                textAlign: 'center',
              }}>
                {prevAddr ? (
                  <><span style={{ opacity: 0.6 }}>←</span>{prevAddr}</>
                ) : (
                  <span style={{ color: '#475569' }}>null</span>
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
            {String(node.val)}
          </span>
        </div>

        <div style={{ width: 1, background: colors.border, opacity: 0.5 }} />

        {/* NEXT Compartment */}
        <div style={{
          padding: '10px 8px', minWidth: 50,
          background: colors.nextBg,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: colors.label, letterSpacing: '.06em' }}>
            NEXT
          </span>
          {/* FIX-2: → prefix to indicate direction */}
          <span style={{
            fontSize: 9.5, fontWeight: 700,
            color: nextAddr ? colors.ptr : '#ef4444',
            fontFamily: "'JetBrains Mono', monospace",
            textAlign: 'center',
          }}>
            {nextAddr ? (
              <><span style={{ opacity: 0.6 }}>→</span>{nextAddr}</>
            ) : (
              <span style={{ color: '#ef4444' }}>null</span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   FIX-1 + FIX-2: Connector Arrows — stable IDs, address labels
   ══════════════════════════════════════════════════════ */

// Singly forward/reverse arrow with optional address annotation
function SinglyHArrow({ isActive, type, isReversed = false, targetAddr = null }) {
  const markerId    = getFwdMarkerId(isActive, type);
  const strokeColor = isActive ? getTypeColor(type) : 'rgba(148, 163, 184, 0.4)';
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
            fill={isActive ? strokeColor : '#475569'}
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
function DoublyHArrow({ isActive, type, _isReversed = false, targetAddr = null, prevAddr = null }) {
  const nextMarkerId = isActive ? 'url(#ll-next-h-active)' : 'url(#ll-next-h)';
  const prevMarkerId = isActive ? 'url(#ll-prev-h-active)' : 'url(#ll-prev-h)';
  const nextColor    = isActive ? getTypeColor(type) : '#38bdf8';
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
          color: '#475569',
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: 'center',
        }}>
          {prevAddr || '—'}
        </span>
      )}

      {/* Prev Arrow (Violet) — right to left */}
      <svg width={svgW} height="12" viewBox={`0 0 ${svgW} 12`}>
        <line
          x1="40" y1="6" x2="6" y2="6"
          stroke={prevColor} strokeWidth="2"
          className={isActive ? 'arrow-flowing' : ''}
          markerEnd={prevMarkerId}
        />
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
          color: isActive ? nextColor : '#475569',
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
function OperationBadge({ type }) {
  const conf = {
    ll_insert:   { label: 'INSERT',    color: '#34d399', bg: 'rgba(52, 211, 153, 0.15)', border: 'rgba(52, 211, 153, 0.3)' },
    ll_traverse: { label: 'TRAVERSE',  color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.3)' },
    ll_delete:   { label: 'DELETE',    color: '#f87171', bg: 'rgba(248, 113, 113, 0.15)', border: 'rgba(248, 113, 113, 0.3)' },
    ll_update:   { label: 'LINK / SET',color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.15)', border: 'rgba(251, 191, 36, 0.3)' },
    ll_init:     { label: 'INIT',      color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', border: 'rgba(192, 132, 252, 0.3)' },
  }[type] || { label: 'SNAPSHOT', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.3)' };

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

function getTypeColor(type) {
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

function getNodeColors(isActive, type) {
  if (isActive) {
    const c = getTypeColor(type);
    return {
      border:   c,
      headerBg: `${c}26`,
      dataBg:   `${c}18`,
      nextBg:   `${c}12`,
      val:      '#ffffff',
      label:    c,
      ptr:      c,
      glow:     `${c}66`,
      shadow:   `${c}33`,
    };
  }
  return {
    border:   'rgba(255,255,255,0.12)',
    headerBg: 'rgba(255,255,255,0.03)',
    dataBg:   'rgba(255,255,255,0.02)',
    nextBg:   'rgba(255,255,255,0.01)',
    val:      '#f1f5f9',
    label:    '#64748b',
    ptr:      '#94a3b8',
    glow:     'transparent',
    shadow:   'transparent',
  };
}

/* ══════════════════════════════════════════════════════
   Empty State Visual
   ══════════════════════════════════════════════════════ */
function EmptyHint({ isDoubly }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 32px', gap: 18,
      color: '#94a3b8', textAlign: 'center', maxWidth: 460, margin: '40px auto 0',
      background: 'rgba(15, 23, 42, 0.4)',
      backdropFilter: 'blur(12px)',
      borderRadius: 16,
      border: '1px solid rgba(255, 255, 255, 0.07)',
    }}>
      <div style={{
        fontSize: 36, width: 76, height: 76, borderRadius: 20,
        background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(139, 92, 246, 0.15))',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
      }}>
        {isDoubly ? '⇄' : '⛓'}
      </div>
      <div>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px' }}>
          {isDoubly ? 'Doubly Linked List Visualizer' : 'Linked List Visualizer'}
        </h3>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0, lineHeight: 1.6 }}>
          Run your code with a <code style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '2px 6px', borderRadius: 4 }}>Node</code> class to see the live pointer chain animate step-by-step.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['head = Node(10)', 'head.next = Node(20)', 'cur = head.next'].map(snippet => (
          <span key={snippet} style={{
            padding: '4px 10px', borderRadius: 6,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: 11, color: '#cbd5e1',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {snippet}
          </span>
        ))}
      </div>
    </div>
  );
}
