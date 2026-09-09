import { useEffect, useRef, useState } from 'react';

/**
 * LinkedListVisualizer
 * ─────────────────────
 * Renders a singly linked list as animated node boxes with arrows.
 *
 * Props:
 *   linkedListState : [{id, val, nextId, isHead}, ...]
 *   activeNodeId    : number  — highlighted node (-1 = none)
 *   type            : string  — ll_snap | ll_init | ll_insert | ll_delete | ll_traverse
 *   description     : string
 *   step            : number
 *   totalSteps      : number
 *   userOutput      : string
 */
export default function LinkedListVisualizer({
  linkedListState = [],
  activeNodeId    = -1,
  type            = 'll_snap',
  description     = '',
  step            = 0,
  totalSteps      = 0,
  userOutput      = '',
}) {
  // Flash set: node ids that just changed
  const [flashSet, setFlashSet]   = useState(new Set());
  const prevStateRef              = useRef([]);
  const [stdoutH, setStdoutH]     = useState(120);
  const [resizing, setResizing]   = useState(false);
  const containerRef              = useRef(null);

  /* ── flash detection ── */
  useEffect(() => {
    const prev    = prevStateRef.current;
    const prevMap = new Map(prev.map(n => [n.id, n]));
    const changed = new Set();

    linkedListState.forEach(n => {
      const p = prevMap.get(n.id);
      if (!p || p.val !== n.val || p.nextId !== n.nextId) changed.add(n.id);
    });
    if (activeNodeId !== -1) changed.add(activeNodeId);

    setFlashSet(changed);
    prevStateRef.current = linkedListState;
    const t = setTimeout(() => setFlashSet(new Set()), 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedListState, activeNodeId]);

  /* ── stdout panel resize ── */
  useEffect(() => {
    if (!resizing) return;
    const onMove = e => {
      if (!containerRef.current) return;
      const r   = containerRef.current.getBoundingClientRect();
      const nh  = r.bottom - e.clientY;
      setStdoutH(Math.max(50, Math.min(360, nh)));
    };
    const onUp = () => setResizing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',  onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',  onUp);
    };
  }, [resizing]);

  const empty = linkedListState.length === 0;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: '#0d1117', fontFamily: "'Inter', system-ui, sans-serif",
        overflow: 'hidden', userSelect: resizing ? 'none' : 'auto',
      }}
    >
      {/* ── header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,.07)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#8b949e',
            textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Linked List
          </span>
          {linkedListState.length > 0 && (
            <span style={{
              padding: '2px 8px', borderRadius: 999,
              background: 'rgba(46,116,181,.2)', color: '#60a5fa',
              fontSize: 11, fontWeight: 600,
            }}>{linkedListState.length} node{linkedListState.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        {step > 0 && (
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Step {step}{totalSteps > 0 ? ` / ${totalSteps}` : ''}
          </span>
        )}
      </div>

      {/* ── description bar ── */}
      {description && (
        <div style={{
          padding: '8px 20px', background: 'rgba(255,255,255,.03)',
          borderBottom: '1px solid rgba(255,255,255,.05)',
          fontSize: 12, color: getTypeColor(type), fontWeight: 500,
          flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>{getTypeIcon(type)}</span>
          {description}
        </div>
      )}

      {/* ── main canvas ── */}
      <div style={{
        flex: 1, minHeight: 0, overflowX: 'auto', overflowY: 'auto',
        padding: '40px 28px',
        display: 'flex', alignItems: 'flex-start',
      }}>
        {empty ? (
          <EmptyHint />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            {/* Render in rows of up to 6 nodes, wrapping with back-arrows */}
            <NodeChain
              nodes={linkedListState}
              activeNodeId={activeNodeId}
              flashSet={flashSet}
              type={type}
            />
          </div>
        )}
      </div>

      {/* ── stdout panel ── */}
      {userOutput && (
        <>
          <div
            onMouseDown={() => setResizing(true)}
            style={{
              height: 4, cursor: 'row-resize', flexShrink: 0,
              background: resizing ? 'rgba(76,175,80,.5)' : 'rgba(255,255,255,.07)',
            }}
          />
          <div style={{
            height: stdoutH, flexShrink: 0, background: '#010409',
            borderTop: '1px solid rgba(255,255,255,.06)',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '5px 14px', fontSize: 10, fontWeight: 700,
              color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.06em',
              borderBottom: '1px solid rgba(255,255,255,.04)', flexShrink: 0,
            }}>Output</div>
            <pre style={{
              flex: 1, overflow: 'auto', margin: 0,
              padding: '10px 14px', fontSize: 12,
              color: '#e6edf3', fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{userOutput}</pre>
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   NodeChain — renders the list with row-wrapping
   ══════════════════════════════════════════════════════ */
const ROW_SIZE = 6; // max nodes per row

function NodeChain({ nodes, activeNodeId, flashSet, type }) {
  // Split into rows
  const rows = [];
  for (let i = 0; i < nodes.length; i += ROW_SIZE) {
    rows.push(nodes.slice(i, i + ROW_SIZE));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
      {rows.map((row, rowIdx) => {
        const isLastRow  = rowIdx === rows.length - 1;
        const isEvenRow  = rowIdx % 2 === 0;
        // Even rows go left→right, odd rows go right→left (snake layout)
        const displayRow = isEvenRow ? row : [...row].reverse();
        const firstGlobal = rowIdx * ROW_SIZE;

        return (
          <div key={rowIdx} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {/* Node row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>

              {displayRow.map((node, colIdx) => {
                const globalIdx   = isEvenRow
                  ? firstGlobal + colIdx
                  : firstGlobal + (row.length - 1 - colIdx);
                const isActive    = node.id === activeNodeId;
                const isFlashing  = flashSet.has(node.id);
                const isHead      = node.isHead;
                const isLast      = globalIdx === nodes.length - 1;

                // Is there a next node in THIS row after this one?
                const hasArrowRight = colIdx < displayRow.length - 1;
                // Is there a continuation arrow to next row?
                const isRowEnd  = colIdx === displayRow.length - 1;
                const hasMore   = !isLast && isRowEnd;

                return (
                  <div key={node.id} style={{ display: 'flex', alignItems: 'center' }}>
                    {/* HEAD label + node box */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {/* HEAD badge */}
                      {isHead && (
                        <div style={{
                          marginBottom: 6,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        }}>
                          <span style={{
                            fontSize: 10, fontWeight: 800, color: '#f59e0b',
                            textTransform: 'uppercase', letterSpacing: '.06em',
                            padding: '2px 8px', borderRadius: 4,
                            background: 'rgba(245,158,11,.15)',
                            border: '1px solid rgba(245,158,11,.3)',
                          }}>HEAD</span>
                          <span style={{ fontSize: 12, color: '#f59e0b' }}>↓</span>
                        </div>
                      )}

                      {/* Node box */}
                      <NodeBox
                        node={node}
                        isActive={isActive}
                        isFlashing={isFlashing}
                        type={type}
                      />

                      {/* NULL terminal */}
                      {isLast && (
                        <div style={{
                          marginTop: 6, fontSize: 10, fontWeight: 700,
                          color: '#6b7280', fontFamily: 'monospace',
                          letterSpacing: '.04em',
                        }}>↓ null</div>
                      )}
                    </div>

                    {/* Horizontal arrow to next node */}
                    {hasArrowRight && (
                      <HArrow color={isActive ? getTypeColor(type) : 'rgba(255,255,255,.2)'} />
                    )}

                    {/* Row-continuation arrow (down or up) */}
                    {hasMore && !isLast && (
                      <CornerArrow direction={isEvenRow ? 'down-right' : 'down-left'} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Row connector arrow (between rows) */}
            {!isLastRow && (
              <RowConnector
                fromRight={isEvenRow}
                nodeCount={row.length}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   NodeBox — single node rendered as data|next box
   ══════════════════════════════════════════════════════ */
function NodeBox({ node, isActive, isFlashing, type }) {
  const colors = getNodeColors(isActive, type);

  return (
    <div style={{
      display: 'flex',
      border: `2px solid ${colors.border}`,
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: isActive
        ? `0 0 0 3px ${colors.glow}, 0 4px 20px ${colors.shadow}`
        : isFlashing
        ? `0 0 0 2px rgba(255,255,255,.15)`
        : 'none',
      transform: isFlashing ? 'translateY(-3px) scale(1.04)' : 'none',
      transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
      minWidth: 100,
    }}>
      {/* Data compartment */}
      <div style={{
        padding: '10px 14px',
        background: colors.dataBg,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 3, minWidth: 60,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: colors.label,
          textTransform: 'uppercase', letterSpacing: '.05em',
        }}>data</span>
        <span style={{
          fontSize: 18, fontWeight: 800, color: colors.val,
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: 1,
        }}>{String(node.val)}</span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: colors.border, flexShrink: 0 }} />

      {/* Next pointer compartment */}
      <div style={{
        padding: '10px 10px',
        background: colors.nextBg,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 3, minWidth: 40,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: colors.label,
          textTransform: 'uppercase', letterSpacing: '.05em',
        }}>next</span>
        <span style={{
          fontSize: 13, color: node.nextId !== -1 ? colors.ptr : '#4b5563',
          fontFamily: 'monospace', fontWeight: 700,
        }}>
          {node.nextId !== -1 ? '→' : 'null'}
        </span>
      </div>
    </div>
  );
}

/* ── Arrow components ── */
function HArrow({ color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '0 4px', flexShrink: 0,
    }}>
      <svg width="32" height="20" viewBox="0 0 32 20">
        <line x1="0" y1="10" x2="26" y2="10"
          stroke={color} strokeWidth="2" strokeDasharray="none" />
        <polygon points="26,6 32,10 26,14" fill={color} />
      </svg>
    </div>
  );
}

function CornerArrow({ direction }) {
  return (
    <div style={{
      width: 28, height: 28,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,.2)', fontSize: 18,
    }}>
      {direction === 'down-right' ? '↘' : '↙'}
    </div>
  );
}

function RowConnector({ fromRight, nodeCount }) {
  const W = nodeCount * 142; // approximate total width
  return (
    <div style={{
      height: 28,
      display: 'flex', alignItems: 'center',
      justifyContent: fromRight ? 'flex-end' : 'flex-start',
      paddingRight: fromRight ? 16 : 0,
      paddingLeft: fromRight ? 0 : 16,
    }}>
      <span style={{ fontSize: 18, color: 'rgba(255,255,255,.2)' }}>
        {fromRight ? '↙' : '↘'}
      </span>
    </div>
  );
}

/* ── Empty state ── */
function EmptyHint() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 32px', gap: 16,
      color: '#8b949e', textAlign: 'center', width: '100%',
    }}>
      <div style={{
        fontSize: 40, width: 72, height: 72, borderRadius: 16,
        background: 'rgba(255,255,255,.04)',
        border: '1.5px solid rgba(255,255,255,.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>⛓</div>
      <div>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#e6edf3', margin: '0 0 6px' }}>
          Linked List Visualizer
        </p>
        <p style={{ fontSize: 13, color: '#8b949e', margin: 0, lineHeight: 1.6, maxWidth: 320 }}>
          Write your code with a custom Node class (any field named{' '}
          <code style={{ color: '#7ee787', background: 'rgba(255,255,255,.06)',
            padding: '1px 5px', borderRadius: 3 }}>data</code> or{' '}
          <code style={{ color: '#7ee787', background: 'rgba(255,255,255,.06)',
            padding: '1px 5px', borderRadius: 3 }}>val</code> and{' '}
          <code style={{ color: '#7ee787', background: 'rgba(255,255,255,.06)',
            padding: '1px 5px', borderRadius: 3 }}>next</code>), then hit{' '}
          <span style={{
            color: '#86efac', background: 'rgba(76,175,80,.15)',
            padding: '1px 8px', borderRadius: 3, fontFamily: 'monospace',
            fontWeight: 700,
          }}>▶ Run</span>.
        </p>
      </div>
      {/* Hint snippets */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
        {['class Node { int data; Node next; }',
          'head.next = new Node(20)',
          'cur = cur.next'].map(h => (
          <span key={h} style={{
            padding: '5px 10px', borderRadius: 6,
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.08)',
            fontSize: 11, color: '#8b949e',
            fontFamily: "'JetBrains Mono', monospace",
          }}>{h}</span>
        ))}
      </div>
    </div>
  );
}

/* ── Color / icon helpers ── */
function getTypeColor(type) {
  switch (type) {
    case 'll_insert':   return '#4CAF50';
    case 'll_delete':   return '#E15759';
    case 'll_traverse': return '#2E74B5';
    case 'll_init':     return '#8b5cf6';
    default:            return '#F2A93B';
  }
}

function getTypeIcon(type) {
  switch (type) {
    case 'll_insert':   return '＋';
    case 'll_delete':   return '−';
    case 'll_traverse': return '→';
    case 'll_init':     return '◈';
    default:            return '↺';
  }
}

function getNodeColors(isActive, type) {
  if (isActive) {
    const c = getTypeColor(type);
    const map = {
      '#4CAF50': { dataBg: 'rgba(76,175,80,.18)',   nextBg: 'rgba(76,175,80,.1)',   border: '#4CAF50', val: '#86efac', label: '#6ee7b7', ptr: '#86efac', glow: 'rgba(76,175,80,.4)',   shadow: 'rgba(76,175,80,.2)' },
      '#E15759': { dataBg: 'rgba(225,87,89,.18)',    nextBg: 'rgba(225,87,89,.1)',   border: '#E15759', val: '#fca5a5', label: '#fca5a5', ptr: '#fca5a5', glow: 'rgba(225,87,89,.4)',   shadow: 'rgba(225,87,89,.2)' },
      '#2E74B5': { dataBg: 'rgba(46,116,181,.22)',   nextBg: 'rgba(46,116,181,.1)',  border: '#2E74B5', val: '#93c5fd', label: '#7dd3fc', ptr: '#93c5fd', glow: 'rgba(46,116,181,.45)', shadow: 'rgba(46,116,181,.2)' },
      '#8b5cf6': { dataBg: 'rgba(139,92,246,.22)',   nextBg: 'rgba(139,92,246,.1)',  border: '#8b5cf6', val: '#c4b5fd', label: '#c4b5fd', ptr: '#c4b5fd', glow: 'rgba(139,92,246,.4)',  shadow: 'rgba(139,92,246,.2)' },
      '#F2A93B': { dataBg: 'rgba(242,169,59,.22)',   nextBg: 'rgba(242,169,59,.1)',  border: '#F2A93B', val: '#fcd34d', label: '#fde68a', ptr: '#fcd34d', glow: 'rgba(242,169,59,.4)',  shadow: 'rgba(242,169,59,.2)' },
    };
    return map[c] || map['#F2A93B'];
  }
  return {
    dataBg:  'rgba(255,255,255,.04)',
    nextBg:  'rgba(255,255,255,.02)',
    border:  'rgba(255,255,255,.14)',
    val:     '#e6edf3',
    label:   '#6b7280',
    ptr:     '#8b949e',
    glow:    'transparent',
    shadow:  'transparent',
  };
}
