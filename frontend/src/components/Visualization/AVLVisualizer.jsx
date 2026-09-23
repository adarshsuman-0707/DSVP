import { useMemo, useState, useRef } from 'react';
import { colors as tokens, balanceFactorColor, balanceFactorLabel } from '../../theme/dsvpColors';

/**
 * AVLVisualizer
 * ──────────────
 * Renders an AVL tree from a `treeState` snapshot already enriched by
 * traceGeneratorService.js's buildAVLEvt:
 *   [{ id, val, leftId, rightId, isRoot,
 *      height, leftHeight, rightHeight, balanceFactor, balanceStatus }, ...]
 *
 * Height and balance factor are computed *structurally* by the backend
 * normalizer from the actual left/right shape of the snapshot — never from
 * a user "height" field or method name — so this component just renders
 * whatever the user's program actually produced, including an invalid
 * (out-of-spec) AVL state if their implementation has a bug. This is a
 * debugger, not an auto-corrector (see spec: "do not hide user bugs").
 *
 * A rotation step arrives as `type: 'ROTATE_LEFT' | 'ROTATE_RIGHT'` with a
 * `rotation: { pivot, newRoot }` payload — rendered as an educational
 * overlay banner on top of the normal step banner.
 */

const NODE_W = 64;
const NODE_H = 64;
const LEVEL_GAP = 68;
const H_GAP = 26;

function getTypeIcon(type) {
  switch (type) {
    case 'ROTATE_LEFT':
    case 'ROTATE_RIGHT': return '🔄';
    default:              return '🌳';
  }
}

function getTypeColor(type, theme = 'dark') {
  if (theme === 'light') {
    switch (type) {
      case 'ROTATE_LEFT':
      case 'ROTATE_RIGHT': return '#b45309';
      default:              return '#1e293b';
    }
  }
  switch (type) {
    case 'ROTATE_LEFT':
    case 'ROTATE_RIGHT': return '#fbbf24';
    default:              return '#e2e8f0';
  }
}

/* ── Theme Palette (mirrors BSTVisualizer, plus balance-status hues) ── */
const PALETTE = {
  dark: {
    panelBg: tokens.canvas,
    panelBgImage: 'radial-gradient(circle at 50% 0%, rgba(30, 58, 138, 0.15) 0%, transparent 70%), radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
    headerBg: 'rgba(17, 24, 39, 0.85)',
    headerBorder: `1px solid ${tokens.border}`,
    badgeBg: 'linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(139, 92, 246, 0.2))',
    badgeBorder: '1px solid rgba(96, 165, 250, 0.3)',
    textPrimary: tokens.text.primary,
    textMuted: tokens.text.muted,
    textFaint: tokens.text.disabled,
    sizePillBg: 'rgba(56, 189, 248, 0.1)',
    sizePillBorder: '1px solid rgba(56, 189, 248, 0.25)',
    sizePillText: tokens.status.info,
    rootPillBg: 'rgba(217, 119, 6, 0.15)',
    rootPillBorder: `1px solid ${tokens.node.rotationPivot.border}55`,
    rootPillText: tokens.node.rotationPivot.border,
    chipBg: 'rgba(255,255,255,0.05)',
    chipBorder: `1px solid ${tokens.border}`,
    chipActiveBg: 'rgba(56, 189, 248, 0.18)',
    chipActiveBorder: '1px solid rgba(56, 189, 248, 0.4)',
    zoomDisabled: tokens.edge.default,
    zoomEnabled: tokens.text.secondary,
    zoomResetIdle: tokens.text.disabled,
    zoomResetActive: tokens.status.info,
    stepText: tokens.text.muted,
    stepValue: tokens.text.primary,
    bannerBg: 'rgba(17, 24, 39, 0.8)',
    bannerBorder: `1px solid ${tokens.border}`,
    bannerShadow: '0 4px 20px rgba(0,0,0,0.3)',
    rotationBannerBg: 'linear-gradient(135deg, rgba(217, 119, 6, 0.18), rgba(217, 119, 6, 0.08))',
    rotationBannerBorder: `1px solid ${tokens.node.rotationPivot.border}59`,
    stdoutBg: tokens.editorBg,
    stdoutBorder: `1px solid ${tokens.border}`,
    stdoutHeaderText: tokens.text.disabled,
    stdoutText: tokens.text.code,
    emptyBorder: `1.5px dashed ${tokens.border}`,
    emptyText: tokens.text.disabled,
    emptyHeading: tokens.text.muted,
    edgeStroke: tokens.edge.default,
    rotationEdgeStroke: tokens.edge.rotation,
    nodeIdleBg: tokens.node.default.bg,
    nodeIdleBorder: `1.5px solid ${tokens.node.default.border}`,
    nodeRootBg: 'rgba(217, 119, 6, 0.18)',
    nodeRootBorder: `2px solid ${tokens.node.rotationPivot.border}80`,
    nodeIdleText: tokens.node.default.text,
    balanced: tokens.balance.zero,
    heavy: tokens.balance.one,
    unbalanced: tokens.balance.invalid,
    badgeText: '#0b1220',
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
    chipActiveBg: 'rgba(2, 132, 199, 0.12)',
    chipActiveBorder: '1px solid rgba(2, 132, 199, 0.4)',
    zoomDisabled: '#cbd5e1',
    zoomEnabled: '#1e293b',
    zoomResetIdle: '#64748b',
    zoomResetActive: '#0284c7',
    stepText: '#475569',
    stepValue: '#1e293b',
    bannerBg: '#ffffff',
    bannerBorder: '1px solid #e2e8f0',
    bannerShadow: '0 4px 14px rgba(15,23,42,0.08)',
    rotationBannerBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.06))',
    rotationBannerBorder: '1px solid rgba(217, 119, 6, 0.3)',
    stdoutBg: '#ffffff',
    stdoutBorder: '1px solid #d0d7de',
    stdoutHeaderText: '#64748b',
    stdoutText: '#1e293b',
    emptyBorder: '1.5px dashed #d0d7de',
    emptyText: '#64748b',
    emptyHeading: '#475569',
    edgeStroke: 'rgba(100,116,139,0.4)',
    rotationEdgeStroke: 'rgba(217,119,6,0.85)',
    nodeIdleBg: '#ffffff',
    nodeIdleBorder: '1.5px solid #d0d7de',
    nodeRootBg: 'rgba(217, 119, 6, 0.12)',
    nodeRootBorder: '2px solid rgba(217,119,6,0.45)',
    nodeIdleText: '#1e293b',
    balanced: '#059669',
    heavy: '#0284c7',
    unbalanced: '#dc2626',
    badgeText: '#ffffff',
  },
};

function balanceColor(node, pal, theme) {
  if (theme !== 'dark' || node?.balanceFactor === undefined) {
    switch (node?.balanceStatus) {
      case 'BALANCED': return pal.balanced;
      case 'LEFT_HEAVY':
      case 'RIGHT_HEAVY': return pal.heavy;
      case 'UNBALANCED': return pal.unbalanced;
      default: return pal.textMuted;
    }
  }
  return balanceFactorColor(node.balanceFactor);
}

/** Same centered-over-children layout as BSTVisualizer. */
function layoutTree(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const root = nodes.find(n => n.isRoot) || nodes[0] || null;
  const positions = new Map();
  if (!root) return { positions, width: 0, height: 0 };

  let leafCounter = 0;
  const seen = new Set();

  function assign(nodeId, depth) {
    if (nodeId === null || nodeId === undefined || nodeId === -1) return null;
    if (seen.has(nodeId)) return null;
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

export default function AVLVisualizer({
  treeState       = [],
  activeNodeId    = -1,
  type            = 'avl_snap',
  description     = '',
  rotation        = null,
  step            = 0,
  totalSteps      = 0,
  userOutput      = '',
  theme           = 'dark',
}) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const [stdoutH, setStdoutH] = useState(110);
  const [resizing, setResizing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showHeight, setShowHeight] = useState(true);
  const [showBalance, setShowBalance] = useState(true);
  const containerRef = useRef(null);

  const { positions, width, height, root } = useMemo(() => layoutTree(treeState), [treeState]);

  const empty = treeState.length === 0;
  const isRotation = type === 'ROTATE_LEFT' || type === 'ROTATE_RIGHT';
  const unbalancedNodes = treeState.filter(n => n.balanceStatus === 'UNBALANCED');

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
            <span style={{ fontSize: 13 }}>⚖️</span>
            <span style={{
              fontSize: 11, fontWeight: 700, color: pal.textPrimary,
              textTransform: 'uppercase', letterSpacing: '.06em',
            }}>
              AVL Tree
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
              {root.height !== undefined && <span style={{ opacity: 0.7 }}>H:{root.height}</span>}
            </div>
          )}

          {unbalancedNodes.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6,
              background: 'rgba(248, 113, 113, 0.14)',
              border: '1px solid rgba(248,113,113,0.4)',
              fontSize: 11, fontWeight: 700, color: pal.unbalanced,
            }}>
              ⚠ AVL VIOLATION ({unbalancedNodes.length})
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Toggle: Show Height */}
          <button
            onClick={() => setShowHeight(v => !v)}
            title="Toggle height display"
            style={{
              padding: '3px 9px', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
              cursor: 'pointer',
              background: showHeight ? pal.chipActiveBg : pal.chipBg,
              border: showHeight ? pal.chipActiveBorder : pal.chipBorder,
              color: showHeight ? pal.sizePillText : pal.textMuted,
            }}
          >H</button>
          {/* Toggle: Show Balance Factor */}
          <button
            onClick={() => setShowBalance(v => !v)}
            title="Toggle balance factor display"
            style={{
              padding: '3px 9px', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
              cursor: 'pointer',
              background: showBalance ? pal.chipActiveBg : pal.chipBg,
              border: showBalance ? pal.chipActiveBorder : pal.chipBorder,
              color: showBalance ? pal.sizePillText : pal.textMuted,
            }}
          >BF</button>

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

      {/* ── ROTATION EDUCATIONAL OVERLAY ── */}
      {isRotation && (
        <div style={{
          margin: '12px 20px 0',
          padding: '10px 16px',
          borderRadius: 10,
          background: pal.rotationBannerBg,
          border: pal.rotationBannerBorder,
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 18 }}>🔄</span>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: getTypeColor(type, theme) }}>
              {type === 'ROTATE_LEFT' ? 'LEFT ROTATION' : 'RIGHT ROTATION'}
              {rotation?.pivot !== undefined && (
                <span style={{ fontWeight: 500, opacity: 0.85 }}> — pivot node {
                  treeState.find(n => n.id === rotation.pivot)?.val ?? rotation.pivot
                }</span>
              )}
            </div>
            <div style={{ fontSize: 11.5, color: pal.textMuted, marginTop: 2 }}>{description}</div>
          </div>
        </div>
      )}

      {/* ── FLOATING STEP ACTION BANNER (non-rotation steps) ── */}
      {!isRotation && description && (
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
              rotation={rotation}
              showHeight={showHeight}
              showBalance={showBalance}
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
      <div style={{ fontSize: 32, marginBottom: 10 }}>⚖️</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: pal.emptyHeading }}>
        No tree yet
      </div>
      <div style={{ fontSize: 12, marginTop: 6, maxWidth: 320 }}>
        Write any AVL implementation with a class that has <code>left</code>/<code>right</code>
        {' '}fields (any names you like) — DSVP auto-detects it and derives height,
        balance factor and rotations from the actual runtime tree shape.
      </div>
    </div>
  );
}

function TreeCanvas({ treeState, positions, width, height, activeNodeId, rotation, showHeight, showBalance, theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const edges = [];
  for (const n of treeState) {
    const p = positions.get(n.id);
    if (!p) continue;
    if (n.leftId !== null && n.leftId !== undefined && n.leftId !== -1) {
      const cp = positions.get(n.leftId);
      if (cp) edges.push({
        from: p, to: cp, key: `${n.id}-L-${n.leftId}`,
        isRotationEdge: rotation && ((rotation.pivot === n.id && rotation.newRoot === n.leftId) || (rotation.newRoot === n.id && rotation.pivot === n.leftId)),
      });
    }
    if (n.rightId !== null && n.rightId !== undefined && n.rightId !== -1) {
      const cp = positions.get(n.rightId);
      if (cp) edges.push({
        from: p, to: cp, key: `${n.id}-R-${n.rightId}`,
        isRotationEdge: rotation && ((rotation.pivot === n.id && rotation.newRoot === n.rightId) || (rotation.newRoot === n.id && rotation.pivot === n.rightId)),
      });
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
            stroke={e.isRotationEdge ? pal.rotationEdgeStroke : pal.edgeStroke}
            strokeWidth={e.isRotationEdge ? 3 : 2}
          />
        ))}
      </svg>

      {treeState.map(n => {
        const p = positions.get(n.id);
        if (!p) return null;
        const isActive = n.id === activeNodeId;
        const isRotationNewRoot = rotation && n.id === rotation.newRoot;
        const isRotationPivot = rotation && n.id === rotation.pivot;
        const bColor = balanceColor(n, pal, theme);
        const x = cx(p) - NODE_W / 2;
        const y = cy(p) - NODE_H / 2;

        const activeTok = theme === 'dark' ? tokens.node.active : null;
        const pivotTok = theme === 'dark' ? tokens.node.rotationPivot : null;
        const newRootTok = theme === 'dark' ? tokens.node.rotationRoot : null;

        return (
          <div
            key={n.id}
            title={`Node(${n.val}) height=${n.height} bf=${n.balanceFactor}${isRotationPivot ? ' — rotation pivot' : ''}${isRotationNewRoot ? ' — new subtree root' : ''}`}
            style={{
              position: 'absolute', left: x, top: y,
              width: NODE_W, height: NODE_H, borderRadius: '50%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'JetBrains Mono', monospace",
              color: isActive && activeTok ? activeTok.text
                : isRotationNewRoot && newRootTok ? newRootTok.text
                : isRotationPivot && pivotTok ? pivotTok.text
                : isActive ? '#0b1220' : pal.nodeIdleText,
              background: isActive && activeTok ? activeTok.bg
                : isActive ? 'linear-gradient(135deg,#38bdf8,#818cf8)'
                : isRotationNewRoot && newRootTok ? newRootTok.bg
                : isRotationPivot && pivotTok ? pivotTok.bg
                : n.isRoot ? pal.nodeRootBg
                : pal.nodeIdleBg,
              border: isActive && activeTok ? `2px solid ${activeTok.border}`
                : isRotationNewRoot && newRootTok ? `2.5px solid ${newRootTok.border}`
                : isRotationPivot && pivotTok ? `2.5px solid ${pivotTok.border}`
                : isActive ? '2px solid #7dd3fc'
                : n.isRoot ? pal.nodeRootBorder
                : `1.5px solid ${bColor}`,
              boxShadow: isActive
                ? `0 0 18px ${(activeTok?.border || '#38bdf8')}88`
                : isRotationPivot || isRotationNewRoot
                  ? `0 0 14px ${pal.rotationEdgeStroke}88`
                  : n.balanceStatus === 'UNBALANCED' ? `0 0 10px ${pal.unbalanced}55` : 'none',
              transition: 'all 220ms ease',
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>{n.val}</span>
            {(showHeight || showBalance) && (
              <span style={{ fontSize: 8.5, fontWeight: 600, marginTop: 2, opacity: 0.85, display: 'flex', gap: 4 }}>
                {showHeight && <span>H:{n.height}</span>}
                {showBalance && (
                  <span
                    title={balanceFactorLabel(n.balanceFactor)}
                    style={{ color: isActive ? (activeTok?.text || '#0b1220') : bColor }}
                  >
                    BF:{n.balanceFactor > 0 ? '+' : ''}{n.balanceFactor}
                  </span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
