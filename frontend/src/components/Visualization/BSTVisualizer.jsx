import { useMemo, useState, useRef } from 'react';

/**
 * BSTVisualizer
 * ──────────────
 * Renders a binary (search) tree from a `treeState` snapshot:
 *   [{ id, val, leftId, rightId, isRoot }, ...]
 * Layout: root centered at top, each node's children spread below it
 * (left down-left, right down-right) via a classic in-order-index x
 * layout + depth-based y layout, connected by SVG lines. Styling
 * mirrors LinkedListVisualizer / StackVisualizer (dark panel, JetBrains
 * Mono labels, step counter, stdout drawer).
 */

const NODE_W = 56;
const NODE_H = 56;
const LEVEL_GAP = 60;
const H_GAP = 24;

function getTypeIcon(type) {
  switch (type) {
    case 'bst_init':      return '🌱';
    case 'bst_insert':    return '➕';
    case 'bst_delete':    return '🗑';
    case 'bst_traverse':  return '👁';
    case 'bst_update':    return '🔗';
    default:               return '🌳';
  }
}

/* Light variants darken each hue for AA contrast on white; default falls
   back to text-primary rather than the dark theme's near-white #e2e8f0. */
function getTypeColor(type, theme = 'dark') {
  if (theme === 'light') {
    switch (type) {
      case 'bst_insert':   return '#059669';
      case 'bst_delete':   return '#dc2626';
      case 'bst_traverse': return '#0284c7';
      case 'bst_update':   return '#4f46e5';
      default:              return '#1e293b';
    }
  }
  switch (type) {
    case 'bst_insert':   return '#34d399';
    case 'bst_delete':   return '#f87171';
    case 'bst_traverse': return '#38bdf8';
    case 'bst_update':   return '#818cf8';
    default:              return '#e2e8f0';
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
    nodeIdleBg: 'rgba(30, 41, 59, 0.85)',
    nodeIdleBorder: '1.5px solid rgba(148,163,184,0.35)',
    nodeRootBg: 'rgba(245, 158, 11, 0.18)',
    nodeRootBorder: '2px solid rgba(245,158,11,0.5)',
    nodeIdleText: '#e2e8f0',
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
    edgeStroke: 'rgba(100,116,139,0.4)',
    nodeIdleBg: '#ffffff',
    nodeIdleBorder: '1.5px solid #d0d7de',
    nodeRootBg: 'rgba(217, 119, 6, 0.12)',
    nodeRootBorder: '2px solid rgba(217,119,6,0.45)',
    nodeIdleText: '#1e293b',
  },
};

/**
 * Build {id -> {x,y,depth}} positions.
 *
 * A parent's x is the average of its children's x (or exactly its single
 * child's x when only one is present) — NOT raw in-order rank. Raw in-order
 * rank only centers a parent over its children when both subtrees happen to
 * have equal leaf counts; for any unbalanced shape (a node with only one
 * child, or subtrees of different sizes — the overwhelmingly common case in
 * a real BST) it drifts the parent sideways, producing crooked, needlessly
 * long edges. Leaves still get sequential slots left-to-right (same idea as
 * before), but internal nodes are now genuinely centered over their
 * children, which is what makes edges look straight and short.
 */
function layoutTree(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const root = nodes.find(n => n.isRoot) || nodes[0] || null;
  const positions = new Map();
  if (!root) return { positions, width: 0, height: 0 };

  let leafCounter = 0;
  const seen = new Set();

  // Returns this node's x (or null if the id is empty/invalid/cyclic).
  function assign(nodeId, depth) {
    if (nodeId === null || nodeId === undefined || nodeId === -1) return null;
    if (seen.has(nodeId)) return null; // defend against malformed/cyclic data
    const node = byId.get(nodeId);
    if (!node) return null;
    seen.add(nodeId);

    const leftX  = assign(node.leftId, depth + 1);
    const rightX = assign(node.rightId, depth + 1);

    let x;
    if (leftX !== null && rightX !== null) x = (leftX + rightX) / 2;
    else if (leftX !== null)  x = leftX;
    else if (rightX !== null) x = rightX;
    else x = leafCounter++;

    positions.set(nodeId, { x, depth, node });
    return x;
  }
  assign(root.id, 0);

  const maxX = Math.max(0, ...Array.from(positions.values()).map(p => p.x));
  const width = (maxX + 1) * (NODE_W + H_GAP);
  const maxDepth = Math.max(0, ...Array.from(positions.values()).map(p => p.depth));
  const height = (maxDepth + 1) * (NODE_H + LEVEL_GAP);

  return { positions, width, height, root };
}

export default function BSTVisualizer({
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
  const [stdoutH, setStdoutH] = useState(110);
  const [resizing, setResizing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef(null);

  const { positions, width, height, root } = useMemo(() => layoutTree(treeState), [treeState]);

  const empty = treeState.length === 0;

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
            <span style={{ fontSize: 13 }}>🌳</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: pal.textPrimary,
              textTransform: 'uppercase', letterSpacing: '.06em',
            }}>
              Binary Search Tree
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
            {treeState.length} {treeState.length === 1 ? 'Node' : 'Nodes'}
          </div>

          {root && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6,
              background: pal.rootPillBg,
              border: pal.rootPillBorder,
              fontSize: 11, fontWeight: 600, color: pal.rootPillText,
            }}>
              <span style={{ fontSize: 9, opacity: 0.8 }}>ROOT</span>
              <span>[{root.val}]</span>
            </div>
          )}
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
            <TreeCanvas
              treeState={treeState}
              positions={positions}
              width={width}
              height={height}
              activeNodeId={activeNodeId}
              type={type}
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

function EmptyHint({ theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  return (
    <div style={{
      padding: '48px 60px', textAlign: 'center',
      border: pal.emptyBorder, borderRadius: 16,
      color: pal.emptyText,
    }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>🌳</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: pal.emptyHeading }}>
        No tree yet
      </div>
      <div style={{ fontSize: 12, marginTop: 6, maxWidth: 320 }}>
        Write normal BST code with a class that has <code>left</code>/<code>right</code>
        {' '}fields — DSVP auto-detects it and visualizes every insert/search/traversal here.
      </div>
    </div>
  );
}

function TreeCanvas({ treeState, positions, width, height, activeNodeId, type, theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const edges = [];
  for (const n of treeState) {
    const p = positions.get(n.id);
    if (!p) continue;
    if (n.leftId !== null && n.leftId !== undefined && n.leftId !== -1) {
      const cp = positions.get(n.leftId);
      if (cp) edges.push({ from: p, to: cp, key: `${n.id}-L-${n.leftId}` });
    }
    if (n.rightId !== null && n.rightId !== undefined && n.rightId !== -1) {
      const cp = positions.get(n.rightId);
      if (cp) edges.push({ from: p, to: cp, key: `${n.id}-R-${n.rightId}` });
    }
  }

  const cx = (p) => p.x * (NODE_W + H_GAP) + NODE_W / 2 + 20;
  const cy = (p) => p.depth * (NODE_H + LEVEL_GAP) + NODE_H / 2 + 20;

  return (
    <div style={{ position: 'relative', width: width + 40, height: height + 40 }}>
      <svg
        width={width + 40}
        height={height + 40}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      >
        {edges.map(e => (
          <line
            key={e.key}
            x1={cx(e.from)} y1={cy(e.from)}
            x2={cx(e.to)} y2={cy(e.to)}
            stroke={pal.edgeStroke}
            strokeWidth={2}
          />
        ))}
      </svg>

      {treeState.map(n => {
        const p = positions.get(n.id);
        if (!p) return null;
        const isActive = n.id === activeNodeId;
        const x = cx(p) - NODE_W / 2;
        const y = cy(p) - NODE_H / 2;
        return (
          <div
            key={n.id}
            style={{
              position: 'absolute', left: x, top: y,
              width: NODE_W, height: NODE_H, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700,
              color: isActive ? '#0b1220' : pal.nodeIdleText,
              background: isActive
                ? 'linear-gradient(135deg,#38bdf8,#818cf8)'
                : n.isRoot
                  ? pal.nodeRootBg
                  : pal.nodeIdleBg,
              border: isActive
                ? '2px solid #7dd3fc'
                : n.isRoot
                  ? pal.nodeRootBorder
                  : pal.nodeIdleBorder,
              boxShadow: isActive ? '0 0 18px rgba(56,189,248,0.55)' : 'none',
              transition: 'all 180ms ease',
            }}
            title={`Node(${n.val})`}
          >
            {n.val}
          </div>
        );
      })}
    </div>
  );
}
