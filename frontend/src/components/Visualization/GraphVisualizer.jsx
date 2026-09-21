import { useMemo, useState, useRef } from 'react';

/**
 * GraphVisualizer
 * ────────────────
 * Renders a graph from a `graphState` snapshot:
 *   nodes: [{id}, ...]
 *   edges: [{from, to}, ...]
 *   visited: [id, ...]   — nodes already processed by BFS/DFS
 *   frontier: [id, ...]  — nodes currently queued/stacked, not yet visited
 *   activeId              — node currently being expanded
 *
 * Layout: deterministic — nodes placed evenly around a circle keyed by
 * node id (sorted), so the same graph always renders the same way run to
 * run (no physics simulation to tune without a browser this session).
 * Styling mirrors BSTVisualizer / LinkedListVisualizer (dark panel,
 * JetBrains Mono, step counter, stdout drawer).
 */

const NODE_R = 26;

function getTypeIcon(type) {
  switch (type) {
    case 'graph_init': return '🕸';
    case 'graph_build': return '➕';
    case 'graph_step': return '👣';
    default: return '🔗';
  }
}

function getTypeColor(type, theme = 'dark') {
  if (theme === 'light') {
    switch (type) {
      case 'graph_init': return '#7c3aed';
      case 'graph_build': return '#16a34a';
      case 'graph_step': return '#0284c7';
      default: return '#1e293b';
    }
  }
  switch (type) {
    case 'graph_init': return '#a78bfa';
    case 'graph_build': return '#4ade80';
    case 'graph_step': return '#38bdf8';
    default: return '#e2e8f0';
  }
}

/* ── Theme Palette ── */
const PALETTE = {
  dark: {
    panelBg: '#090d16',
    panelBgImage: 'radial-gradient(circle at 50% 0%, rgba(30, 58, 138, 0.15) 0%, transparent 70%), radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
    headerBg: 'rgba(15, 23, 42, 0.75)',
    headerBorder: '1px solid rgba(255,255,255,.08)',
    badgeBg: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(139, 92, 246, 0.2))',
    badgeBorder: '1px solid rgba(96, 165, 250, 0.3)',
    textPrimary: '#e2e8f0',
    sizePillBg: 'rgba(56, 189, 248, 0.1)',
    sizePillBorder: '1px solid rgba(56, 189, 248, 0.25)',
    sizePillText: '#38bdf8',
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
    frontierText: '#f59e0b',
    stdoutBg: '#040711',
    stdoutBorder: '1px solid rgba(255,255,255,.07)',
    stdoutHeaderText: '#64748b',
    stdoutText: '#c9d1d9',
    emptyBorder: '1.5px dashed rgba(148,163,184,0.25)',
    emptyText: '#64748b',
    emptyHeading: '#94a3b8',
    edgeStroke: 'rgba(148,163,184,0.45)',
    arrowFill: 'rgba(148,163,184,0.6)',
    nodeIdleBg: 'rgba(30, 41, 59, 0.85)',
    nodeIdleBorder: '1.5px solid rgba(148,163,184,0.35)',
    nodeIdleText: '#e2e8f0',
    visitedBg: 'rgba(52, 211, 153, 0.18)',
    visitedBorder: '2px solid rgba(52, 211, 153, 0.55)',
    visitedText: '#34d399',
    frontierBg: 'rgba(245, 158, 11, 0.18)',
    frontierBorder: '2px solid rgba(245, 158, 11, 0.55)',
    frontierNodeText: '#f59e0b',
    activeText: '#0b1220',
  },
  light: {
    panelBg: '#f6f8fa',
    panelBgImage: 'radial-gradient(circle at 50% 0%, rgba(37, 99, 235, 0.08) 0%, transparent 70%), radial-gradient(rgba(15, 23, 42, 0.035) 1px, transparent 1px)',
    headerBg: 'rgba(255, 255, 255, 0.85)',
    headerBorder: '1px solid #d0d7de',
    badgeBg: 'linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(139, 92, 246, 0.12))',
    badgeBorder: '1px solid rgba(59, 130, 246, 0.3)',
    textPrimary: '#1e293b',
    sizePillBg: 'rgba(2, 132, 199, 0.08)',
    sizePillBorder: '1px solid rgba(2, 132, 199, 0.25)',
    sizePillText: '#0284c7',
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
    frontierText: '#d97706',
    stdoutBg: '#ffffff',
    stdoutBorder: '1px solid #d0d7de',
    stdoutHeaderText: '#64748b',
    stdoutText: '#1e293b',
    emptyBorder: '1.5px dashed #d0d7de',
    emptyText: '#64748b',
    emptyHeading: '#475569',
    edgeStroke: 'rgba(100,116,139,0.4)',
    arrowFill: 'rgba(100,116,139,0.55)',
    nodeIdleBg: '#ffffff',
    nodeIdleBorder: '1.5px solid #d0d7de',
    nodeIdleText: '#1e293b',
    visitedBg: 'rgba(5, 150, 105, 0.1)',
    visitedBorder: '2px solid rgba(5, 150, 105, 0.45)',
    visitedText: '#059669',
    frontierBg: 'rgba(217, 119, 6, 0.1)',
    frontierBorder: '2px solid rgba(217, 119, 6, 0.45)',
    frontierNodeText: '#d97706',
    activeText: '#0b1220',
  },
};

/** Deterministic circular layout keyed by sorted node id. */
function layoutGraph(nodes) {
  const ids = nodes.map(n => n.id);
  const n = ids.length;
  const positions = new Map();
  const radius = Math.max(90, n * 26);
  const size = radius * 2 + NODE_R * 2 + 40;
  const cx = size / 2, cy = size / 2;

  ids.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2;
    positions.set(id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });

  return { positions, size };
}

export default function GraphVisualizer({
  graphNodes    = [],
  graphEdges    = [],
  graphVisited  = [],
  graphFrontier = [],
  activeNodeId  = null,
  type          = 'graph_init',
  description   = '',
  step          = 0,
  totalSteps    = 0,
  userOutput    = '',
  theme         = 'dark',
}) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const [stdoutH, setStdoutH] = useState(110);
  const [resizing, setResizing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef(null);

  const { positions, size } = useMemo(() => layoutGraph(graphNodes), [graphNodes]);
  const visitedSet = useMemo(() => new Set(graphVisited), [graphVisited]);
  const frontierSet = useMemo(() => new Set(graphFrontier), [graphFrontier]);

  const empty = graphNodes.length === 0;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: pal.panelBg,
        backgroundImage: pal.panelBgImage,
        backgroundSize: '100% 100%, 20px 20px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        overflow: 'hidden', userSelect: resizing ? 'none' : 'auto',
        position: 'relative',
      }}
    >
      {/* ── TOP CONTROL & STATS BAR ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 18px',
        background: pal.headerBg,
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: pal.headerBorder,
        flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 8,
            background: pal.badgeBg,
            border: pal.badgeBorder,
          }}>
            <span style={{ fontSize: 13 }}>🕸</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: pal.textPrimary,
              textTransform: 'uppercase', letterSpacing: '.06em',
            }}>
              Graph
            </span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 999,
            background: pal.sizePillBg,
            border: pal.sizePillBorder,
            fontSize: 11, fontWeight: 600, color: pal.sizePillText,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: pal.sizePillText, boxShadow: `0 0 6px ${pal.sizePillText}` }} />
            {graphNodes.length} {graphNodes.length === 1 ? 'Node' : 'Nodes'}
          </div>

          <Legend label="Visited" color={pal.visitedText} />
          <Legend label="Frontier" color={pal.frontierText} />
          <Legend label="Active" color={pal.sizePillText} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: pal.chipBg,
            border: pal.chipBorder,
            borderRadius: 6, overflow: 'hidden',
          }}>
            <button
              onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
              disabled={zoom <= 0.5}
              title="Zoom out"
              style={{
                padding: '3px 8px', background: 'none', border: 'none',
                color: zoom <= 0.5 ? pal.zoomDisabled : pal.zoomEnabled, fontSize: 13, cursor: zoom <= 0.5 ? 'default' : 'pointer',
              }}
            >−</button>
            <span
              onClick={() => setZoom(1)}
              title="Reset zoom"
              style={{
                padding: '0 5px', fontSize: 11, fontWeight: 600,
                color: zoom === 1 ? pal.zoomResetIdle : pal.zoomResetActive, cursor: 'pointer',
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
                color: zoom >= 1.5 ? pal.zoomDisabled : pal.zoomEnabled, fontSize: 13, cursor: zoom >= 1.5 ? 'default' : 'pointer',
              }}
            >+</button>
          </div>

          {step > 0 && (
            <div style={{
              fontSize: 11, fontWeight: 700, color: pal.stepText,
              letterSpacing: '.04em', minWidth: 65, textAlign: 'right',
            }}>
              Step <span style={{ color: pal.stepValue }}>{step}</span>
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
          background: pal.bannerBg,
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: pal.bannerBorder,
          boxShadow: pal.bannerShadow,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>{getTypeIcon(type)}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: getTypeColor(type, theme), letterSpacing: '.01em' }}>
              {description}
            </span>
          </div>
          {graphFrontier.length > 0 && (
            <div style={{ fontSize: 11, color: pal.frontierText, fontFamily: "'JetBrains Mono', monospace" }}>
              frontier: [{graphFrontier.join(', ')}]
            </div>
          )}
        </div>
      )}

      {/* ── MAIN INTERACTIVE CANVAS ── */}
      <main style={{
        flex: 1, minHeight: 0, overflow: 'auto',
        padding: '36px 32px 32px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      }}>
        <div style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          transition: 'transform 180ms ease-out',
        }}>
          {empty ? (
            <EmptyHint theme={theme} />
          ) : (
            <GraphCanvas
              nodes={graphNodes}
              edges={graphEdges}
              positions={positions}
              size={size}
              activeId={activeNodeId}
              visitedSet={visitedSet}
              frontierSet={frontierSet}
              theme={theme}
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
              background: resizing ? 'rgba(56, 189, 248, 0.7)' : (theme === 'light' ? '#d0d7de' : 'rgba(255,255,255,0.08)'),
              transition: resizing ? 'none' : 'background 150ms',
            }}
          />
          <section style={{
            height: stdoutH, flexShrink: 0,
            background: pal.stdoutBg,
            borderTop: pal.stdoutBorder,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '6px 16px', fontSize: 10, fontWeight: 700,
              color: pal.stdoutHeaderText, textTransform: 'uppercase', letterSpacing: '.08em',
            }}>
              Program Output
            </div>
            <pre style={{
              flex: 1, overflow: 'auto', margin: 0,
              padding: '0 16px 10px',
              fontFamily: "'JetBrains Mono', Consolas, monospace",
              fontSize: 12.5, color: pal.stdoutText, whiteSpace: 'pre-wrap',
            }}>{userOutput}</pre>
          </section>
        </>
      )}
    </div>
  );
}

function Legend({ label, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 6,
      background: `${color}1f`,
      border: `1px solid ${color}55`,
      fontSize: 10.5, fontWeight: 600, color,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label}
    </div>
  );
}

function EmptyHint({ theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  return (
    <div style={{
      padding: '48px 60px', textAlign: 'center',
      border: pal.emptyBorder, borderRadius: 16,
      color: pal.emptyText,
    }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>🕸</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: pal.emptyHeading }}>
        No graph yet
      </div>
      <div style={{ fontSize: 12, marginTop: 6, maxWidth: 340 }}>
        Write a normal adjacency-list graph (a <code>dict</code>/<code>Map</code> of node → neighbor
        list) and run a BFS or DFS over it — DSVP auto-detects the graph and
        visited/frontier state and animates the traversal here.
      </div>
    </div>
  );
}

function GraphCanvas({ nodes, edges, positions, size, activeId, visitedSet, frontierSet, theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  // De-dupe edges: an undirected adjacency dict (u:[v], v:[u]) produces both
  // directions — collapse (a,b)/(b,a) pairs into one undirected line, but
  // keep a genuinely one-directional edge as an arrow.
  const seen = new Set();
  const drawEdges = [];
  for (const e of edges) {
    const p1 = positions.get(e.from), p2 = positions.get(e.to);
    if (!p1 || !p2) continue;
    const fwdKey = `${e.from}->${e.to}`;
    const revKey = `${e.to}->${e.from}`;
    if (seen.has(fwdKey)) continue;
    const reciprocal = edges.some(o => o.from === e.to && o.to === e.from);
    seen.add(fwdKey);
    if (reciprocal) seen.add(revKey);
    drawEdges.push({ from: p1, to: p2, key: fwdKey, directed: !reciprocal });
  }

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      >
        <defs>
          <marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill={pal.arrowFill} />
          </marker>
        </defs>
        {drawEdges.map(e => {
          // Shorten the line so it stops at the node's circle edge, not center.
          const dx = e.to.x - e.from.x, dy = e.to.y - e.from.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const ux = dx / dist, uy = dy / dist;
          const x1 = e.from.x + ux * NODE_R, y1 = e.from.y + uy * NODE_R;
          const x2 = e.to.x - ux * NODE_R, y2 = e.to.y - uy * NODE_R;
          return (
            <line
              key={e.key}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={pal.edgeStroke}
              strokeWidth={2}
              markerEnd={e.directed ? 'url(#graph-arrow)' : undefined}
            />
          );
        })}
      </svg>

      {nodes.map(n => {
        const p = positions.get(n.id);
        if (!p) return null;
        const isActive = n.id === activeId;
        const isVisited = visitedSet.has(n.id);
        const isFrontier = frontierSet.has(n.id);

        let bg = pal.nodeIdleBg;
        let border = pal.nodeIdleBorder;
        let color = pal.nodeIdleText;
        let shadow = 'none';

        if (isVisited) {
          bg = pal.visitedBg;
          border = pal.visitedBorder;
          color = pal.visitedText;
        }
        if (isFrontier) {
          bg = pal.frontierBg;
          border = pal.frontierBorder;
          color = pal.frontierNodeText;
        }
        if (isActive) {
          bg = 'linear-gradient(135deg,#38bdf8,#818cf8)';
          border = '2px solid #7dd3fc';
          color = pal.activeText;
          shadow = '0 0 18px rgba(56,189,248,0.6)';
        }

        return (
          <div
            key={n.id}
            style={{
              position: 'absolute', left: p.x - NODE_R, top: p.y - NODE_R,
              width: NODE_R * 2, height: NODE_R * 2, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700,
              color, background: bg, border, boxShadow: shadow,
              transition: 'all 180ms ease',
            }}
            title={`Node(${n.id})`}
          >
            {n.id}
          </div>
        );
      })}
    </div>
  );
}
