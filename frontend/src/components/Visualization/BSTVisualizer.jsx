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
const LEVEL_GAP = 90;
const H_GAP = 64;

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

function getTypeColor(type) {
  switch (type) {
    case 'bst_insert':   return '#34d399';
    case 'bst_delete':   return '#f87171';
    case 'bst_traverse': return '#38bdf8';
    case 'bst_update':   return '#818cf8';
    default:              return '#e2e8f0';
  }
}

/** Build {id -> {x,y,depth}} positions via in-order index for x, depth for y. */
function layoutTree(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const root = nodes.find(n => n.isRoot) || nodes[0] || null;
  const positions = new Map();
  if (!root) return { positions, width: 0, height: 0 };

  let counter = 0;
  const seen = new Set();

  function inorder(nodeId, depth) {
    if (nodeId === null || nodeId === undefined || nodeId === -1) return;
    if (seen.has(nodeId)) return; // defend against malformed/cyclic data
    const node = byId.get(nodeId);
    if (!node) return;
    seen.add(nodeId);
    inorder(node.leftId, depth + 1);
    const x = counter++;
    positions.set(nodeId, { x, depth, node });
    inorder(node.rightId, depth + 1);
  }
  inorder(root.id, 0);

  const width = Math.max(1, counter) * (NODE_W + H_GAP);
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
}) {
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
        background: '#090d16',
        backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(30, 58, 138, 0.15) 0%, transparent 70%), radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
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
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
        flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(139, 92, 246, 0.2))',
            border: '1px solid rgba(96, 165, 250, 0.3)',
          }}>
            <span style={{ fontSize: 13 }}>🌳</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#e2e8f0',
              textTransform: 'uppercase', letterSpacing: '.06em',
            }}>
              Binary Search Tree
            </span>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 999,
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            fontSize: 11, fontWeight: 600, color: '#38bdf8',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 6px #38bdf8' }} />
            {treeState.length} {treeState.length === 1 ? 'Node' : 'Nodes'}
          </div>

          {root && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6,
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              fontSize: 11, fontWeight: 600, color: '#f59e0b',
            }}>
              <span style={{ fontSize: 9, opacity: 0.8 }}>ROOT</span>
              <span>[{root.val}]</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, overflow: 'hidden',
          }}>
            <button
              onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
              disabled={zoom <= 0.5}
              title="Zoom out"
              style={{
                padding: '3px 8px', background: 'none', border: 'none',
                color: zoom <= 0.5 ? '#475569' : '#cbd5e1', fontSize: 13, cursor: zoom <= 0.5 ? 'default' : 'pointer',
              }}
            >−</button>
            <span
              onClick={() => setZoom(1)}
              title="Reset zoom"
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
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>{getTypeIcon(type)}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: getTypeColor(type), letterSpacing: '.01em' }}>
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
            <EmptyHint />
          ) : (
            <TreeCanvas
              treeState={treeState}
              positions={positions}
              width={width}
              height={height}
              activeNodeId={activeNodeId}
              type={type}
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
            }}>
              Program Output
            </div>
            <pre style={{
              flex: 1, overflow: 'auto', margin: 0,
              padding: '0 16px 10px',
              fontFamily: "'JetBrains Mono', Consolas, monospace",
              fontSize: 12.5, color: '#c9d1d9', whiteSpace: 'pre-wrap',
            }}>{userOutput}</pre>
          </section>
        </>
      )}
    </div>
  );
}

function EmptyHint() {
  return (
    <div style={{
      padding: '48px 60px', textAlign: 'center',
      border: '1.5px dashed rgba(148,163,184,0.25)', borderRadius: 16,
      color: '#64748b',
    }}>
      <div style={{ fontSize: 32, marginBottom: 10 }}>🌳</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>
        No tree yet
      </div>
      <div style={{ fontSize: 12, marginTop: 6, maxWidth: 320 }}>
        Write normal BST code with a class that has <code>left</code>/<code>right</code>
        {' '}fields — DSVP auto-detects it and visualizes every insert/search/traversal here.
      </div>
    </div>
  );
}

function TreeCanvas({ treeState, positions, width, height, activeNodeId, type }) {
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
            stroke="rgba(148,163,184,0.45)"
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
              color: isActive ? '#0b1220' : '#e2e8f0',
              background: isActive
                ? 'linear-gradient(135deg,#38bdf8,#818cf8)'
                : n.isRoot
                  ? 'rgba(245, 158, 11, 0.18)'
                  : 'rgba(30, 41, 59, 0.85)',
              border: isActive
                ? '2px solid #7dd3fc'
                : n.isRoot
                  ? '2px solid rgba(245,158,11,0.5)'
                  : '1.5px solid rgba(148,163,184,0.35)',
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
