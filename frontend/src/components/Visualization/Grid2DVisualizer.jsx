import { useEffect, useRef, useState } from 'react';

/**
 * Grid2DVisualizer — 2D Array / Matrix visualizer
 * ────────────────────────────────────────────────
 * Renders a live grid of cells with row/col highlighting, driven by
 * grid2dState/activeRow/activeCol events (init2d/read2d/write2d ops from
 * DSVPArray2DInt/DSVPArray2DChar). Mirrors ArrayVisualizer's visual
 * language (dark canvas, JetBrains Mono values, flash-on-change) so
 * switching between 1D and 2D array modules feels consistent.
 */

const OP_META = {
  write2d: { color: '#10b981', border: 'rgba(16,185,129,0.5)', bg: 'rgba(16,185,129,0.14)', label: 'WRITE', icon: '✎' },
  read2d:  { color: '#06b6d4', border: 'rgba(6,182,212,0.5)',  bg: 'rgba(6,182,212,0.14)',  label: 'READ',  icon: '👁' },
  init2d:  { color: '#a855f7', border: 'rgba(168,85,247,0.5)', bg: 'rgba(168,85,247,0.14)', label: 'INIT',  icon: '⚡' },
  highlight: { color: '#f59e0b', border: 'rgba(245,158,11,0.5)', bg: 'rgba(245,158,11,0.14)', label: 'ACTIVE', icon: '🔍' },
};

function getOpMeta(type) {
  return OP_META[type] || OP_META.highlight;
}

export default function Grid2DVisualizer({
  grid2dState = [],
  activeRow   = null,
  activeCol   = null,
  type        = 'highlight',
  description = '',
  step        = 0,
  totalSteps  = 0,
  userOutput  = '',
}) {
  const [flashCell, setFlashCell] = useState(null);
  const [zoom, setZoom]           = useState(1);
  const prevGridRef               = useRef([]);
  const containerRef              = useRef(null);

  /* ── flash detection: any cell whose value changed, or the active cell ── */
  useEffect(() => {
    const prev = prevGridRef.current;
    let changed = null;
    for (let r = 0; r < grid2dState.length; r++) {
      for (let c = 0; c < (grid2dState[r]?.length || 0); c++) {
        if (prev[r]?.[c] !== grid2dState[r][c]) changed = `${r}-${c}`;
      }
    }
    if (activeRow !== null && activeCol !== null) changed = `${activeRow}-${activeCol}`;
    setFlashCell(changed);
    prevGridRef.current = grid2dState.map(row => [...row]);
    const t = setTimeout(() => setFlashCell(null), 480);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid2dState, activeRow, activeCol]);

  const isEmpty = grid2dState.length === 0 || grid2dState[0]?.length === 0;
  const opMeta = getOpMeta(type);
  const rows = grid2dState.length;
  const cols = grid2dState[0]?.length ?? 0;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: '#0d1117', fontFamily: "'Inter', system-ui, sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* ── header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,.07)',
        flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#8b949e',
            textTransform: 'uppercase', letterSpacing: '.06em',
          }}>2D Array</span>

          {!isEmpty && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 999,
              background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)',
              fontSize: 11, fontWeight: 600, color: '#38bdf8',
            }}>
              {rows} × {cols}
            </span>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 6,
            background: opMeta.bg, border: `1px solid ${opMeta.border}`,
            fontSize: 11, fontWeight: 700, color: opMeta.color, letterSpacing: '.03em',
          }}>
            <span>{opMeta.icon}</span><span>{opMeta.label}</span>
          </div>

          {totalSteps > 0 && (
            <span style={{
              fontSize: 10.5, fontWeight: 600, color: '#94a3b8',
              fontFamily: "'JetBrains Mono', monospace",
              padding: '2px 7px', borderRadius: 4,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)',
            }}>{step}/{totalSteps}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setZoom(z => Math.max(0.6, +(z - 0.1).toFixed(1)))}
            style={zoomBtnStyle} title="Zoom out">−</button>
          <span style={{ fontSize: 10.5, color: '#cbd5e1', padding: '0 4px', fontFamily: "'JetBrains Mono', monospace" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(1.6, +(z + 0.1).toFixed(1)))}
            style={zoomBtnStyle} title="Zoom in">+</button>
        </div>
      </div>

      {/* ── description banner ── */}
      {description && (
        <div style={{
          margin: '12px 20px 0', padding: '8px 16px', borderRadius: 10,
          background: 'rgba(15, 23, 42, 0.72)', border: `1px solid ${opMeta.border}`,
          fontSize: 12.5, fontWeight: 600, color: opMeta.color, flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 14 }}>{opMeta.icon}</span>{description}
        </div>
      )}

      {/* ── grid canvas ── */}
      <div style={{
        flex: 1, minHeight: 0, overflow: 'auto',
        padding: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isEmpty ? (
          <EmptyHint />
        ) : (
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 180ms ease-out' }}>
            {/* column index header */}
            <div style={{ display: 'flex', marginLeft: 34, marginBottom: 4 }}>
              {Array.from({ length: cols }).map((_, c) => (
                <div key={c} style={{
                  width: 52, textAlign: 'center', fontSize: 10, fontWeight: 700,
                  color: c === activeCol ? '#38bdf8' : '#475569',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{c}</div>
              ))}
            </div>

            {grid2dState.map((row, r) => (
              <div key={r} style={{ display: 'flex', alignItems: 'center' }}>
                {/* row index */}
                <div style={{
                  width: 30, textAlign: 'right', marginRight: 4, fontSize: 10, fontWeight: 700,
                  color: r === activeRow ? '#38bdf8' : '#475569',
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{r}</div>

                {row.map((val, c) => {
                  const isActive = r === activeRow && c === activeCol;
                  const isFlashing = flashCell === `${r}-${c}`;
                  return (
                    <div
                      key={c}
                      style={{
                        width: 52, height: 44, margin: 2, borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isActive || isFlashing ? opMeta.bg : 'rgba(30, 41, 59, 0.8)',
                        border: isActive
                          ? `2px solid ${opMeta.color}`
                          : isFlashing
                            ? '2px solid rgba(255,255,255,0.35)'
                            : '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: isActive ? `0 0 16px ${opMeta.color}55` : 'none',
                        fontSize: 14, fontWeight: 700,
                        color: isActive ? '#fff' : '#e6edf3',
                        fontFamily: "'JetBrains Mono', monospace",
                        transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                        transform: isFlashing ? 'scale(1.08)' : 'scale(1)',
                      }}
                    >
                      {String(val)}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── program output ── */}
      {userOutput && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,.07)', flexShrink: 0,
          maxHeight: 140, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '6px 16px', fontSize: 10, fontWeight: 700, color: '#64748b',
            textTransform: 'uppercase', letterSpacing: '.08em',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            Program Output
          </div>
          <pre style={{
            flex: 1, overflow: 'auto', margin: 0, padding: '0 16px 10px',
            fontSize: 12, color: '#f8fafc', fontFamily: "'JetBrains Mono', Consolas, monospace",
            lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{userOutput}</pre>
        </div>
      )}
    </div>
  );
}

const zoomBtnStyle = {
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#94a3b8', padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
};

function EmptyHint() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      color: '#475569', textAlign: 'center', padding: 16,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'rgba(255,255,255,0.03)', border: '1.5px dashed rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
      }}>▦</div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#64748b', lineHeight: 1.6 }}>
        No 2D array yet<br />
        <span style={{ fontSize: 11.5, color: '#475569' }}>Declare an int[][] / char[][] grid and run your code</span>
      </p>
    </div>
  );
}
