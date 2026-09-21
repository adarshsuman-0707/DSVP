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

const OP_META_DARK = {
  write2d: { color: '#10b981', border: 'rgba(16,185,129,0.5)', bg: 'rgba(16,185,129,0.14)', label: 'WRITE', icon: '✎' },
  read2d:  { color: '#06b6d4', border: 'rgba(6,182,212,0.5)',  bg: 'rgba(6,182,212,0.14)',  label: 'READ',  icon: '👁' },
  init2d:  { color: '#a855f7', border: 'rgba(168,85,247,0.5)', bg: 'rgba(168,85,247,0.14)', label: 'INIT',  icon: '⚡' },
  highlight: { color: '#f59e0b', border: 'rgba(245,158,11,0.5)', bg: 'rgba(245,158,11,0.14)', label: 'ACTIVE', icon: '🔍' },
};

// Same hues, darkened text/border and lighter fills so they hold contrast on white.
const OP_META_LIGHT = {
  write2d: { color: '#047857', border: 'rgba(4,120,87,0.4)',   bg: 'rgba(16,185,129,0.12)', label: 'WRITE', icon: '✎' },
  read2d:  { color: '#0e7490', border: 'rgba(14,116,144,0.4)', bg: 'rgba(6,182,212,0.12)',  label: 'READ',  icon: '👁' },
  init2d:  { color: '#7e22ce', border: 'rgba(126,34,206,0.4)', bg: 'rgba(168,85,247,0.12)', label: 'INIT',  icon: '⚡' },
  highlight: { color: '#b45309', border: 'rgba(180,83,9,0.4)', bg: 'rgba(245,158,11,0.12)', label: 'ACTIVE', icon: '🔍' },
};

const PALETTE = {
  dark: {
    bg: '#0d1117', text: '#e6edf3', textMuted: '#8b949e', textFaint: '#475569',
    hairline: 'rgba(255,255,255,.07)', panelBorder: 'rgba(255,255,255,.1)',
    cellBg: 'rgba(30, 41, 59, 0.8)', cellBorder: 'rgba(255, 255, 255, 0.1)',
    zoomBg: 'rgba(255,255,255,0.05)', zoomBorder: 'rgba(255,255,255,0.1)', zoomText: '#94a3b8',
    descBg: 'rgba(15, 23, 42, 0.72)', activeText: '#fff', flashBorder: 'rgba(255,255,255,0.35)',
    emptyIconBg: 'rgba(255,255,255,0.03)', emptyIconBorder: 'rgba(255,255,255,0.1)',
    consolePre: '#f8fafc',
  },
  light: {
    bg: '#ffffff', text: '#1e293b', textMuted: '#64748b', textFaint: '#94a3b8',
    hairline: '#e2e8f0', panelBorder: '#d0d7de',
    cellBg: '#f6f8fa', cellBorder: '#d0d7de',
    zoomBg: '#f6f8fa', zoomBorder: '#d0d7de', zoomText: '#475569',
    descBg: '#f6f8fa', activeText: '#0f172a', flashBorder: '#94a3b8',
    emptyIconBg: '#f6f8fa', emptyIconBorder: '#d0d7de',
    consolePre: '#1e293b',
  },
};

function getOpMeta(type, theme = 'dark') {
  const map = theme === 'light' ? OP_META_LIGHT : OP_META_DARK;
  return map[type] || map.highlight;
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
  theme       = 'dark',
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
  const opMeta = getOpMeta(type, theme);
  const pal = PALETTE[theme] || PALETTE.dark;
  const rows = grid2dState.length;
  const cols = grid2dState[0]?.length ?? 0;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: pal.bg, fontFamily: "'Inter', system-ui, sans-serif",
        overflow: 'hidden',
      }}
    >
      {/* ── header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', borderBottom: `1px solid ${pal.hairline}`,
        flexShrink: 0, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: pal.textMuted,
            textTransform: 'uppercase', letterSpacing: '.06em',
          }}>2D Array</span>

          {!isEmpty && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 9px', borderRadius: 999,
              background: theme === 'light' ? 'rgba(56, 189, 248, 0.14)' : 'rgba(56, 189, 248, 0.1)',
              border: `1px solid ${theme === 'light' ? 'rgba(14,116,144,0.35)' : 'rgba(56, 189, 248, 0.25)'}`,
              fontSize: 11, fontWeight: 600, color: theme === 'light' ? '#0e7490' : '#38bdf8',
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
              fontSize: 10.5, fontWeight: 600, color: pal.zoomText,
              fontFamily: "'JetBrains Mono', monospace",
              padding: '2px 7px', borderRadius: 4,
              background: pal.zoomBg, border: `1px solid ${pal.zoomBorder}`,
            }}>{step}/{totalSteps}</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setZoom(z => Math.max(0.6, +(z - 0.1).toFixed(1)))}
            style={zoomBtnStyle(pal)} title="Zoom out">−</button>
          <span style={{ fontSize: 10.5, color: pal.zoomText, padding: '0 4px', fontFamily: "'JetBrains Mono', monospace" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={() => setZoom(z => Math.min(1.6, +(z + 0.1).toFixed(1)))}
            style={zoomBtnStyle(pal)} title="Zoom in">+</button>
        </div>
      </div>

      {/* ── description banner ── */}
      {description && (
        <div style={{
          margin: '12px 20px 0', padding: '8px 16px', borderRadius: 10,
          background: pal.descBg, border: `1px solid ${opMeta.border}`,
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
          <EmptyHint theme={theme} />
        ) : (
          <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 180ms ease-out' }}>
            {/* column index header */}
            <div style={{ display: 'flex', marginLeft: 34, marginBottom: 4 }}>
              {Array.from({ length: cols }).map((_, c) => (
                <div key={c} style={{
                  width: 52, textAlign: 'center', fontSize: 10, fontWeight: 700,
                  color: c === activeCol ? (theme === 'light' ? '#0e7490' : '#38bdf8') : pal.textFaint,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>{c}</div>
              ))}
            </div>

            {grid2dState.map((row, r) => (
              <div key={r} style={{ display: 'flex', alignItems: 'center' }}>
                {/* row index */}
                <div style={{
                  width: 30, textAlign: 'right', marginRight: 4, fontSize: 10, fontWeight: 700,
                  color: r === activeRow ? (theme === 'light' ? '#0e7490' : '#38bdf8') : pal.textFaint,
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
                        background: isActive || isFlashing ? opMeta.bg : pal.cellBg,
                        border: isActive
                          ? `2px solid ${opMeta.color}`
                          : isFlashing
                            ? `2px solid ${pal.flashBorder}`
                            : `1px solid ${pal.cellBorder}`,
                        boxShadow: isActive ? `0 0 16px ${opMeta.color}55` : 'none',
                        fontSize: 14, fontWeight: 700,
                        color: isActive ? pal.activeText : pal.text,
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
          borderTop: `1px solid ${pal.hairline}`, flexShrink: 0,
          maxHeight: 140, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '6px 16px', fontSize: 10, fontWeight: 700, color: pal.textMuted,
            textTransform: 'uppercase', letterSpacing: '.08em',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
            Program Output
          </div>
          <pre style={{
            flex: 1, overflow: 'auto', margin: 0, padding: '0 16px 10px',
            fontSize: 12, color: pal.consolePre, fontFamily: "'JetBrains Mono', Consolas, monospace",
            lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>{userOutput}</pre>
        </div>
      )}
    </div>
  );
}

const zoomBtnStyle = (pal) => ({
  background: pal.zoomBg, border: `1px solid ${pal.zoomBorder}`,
  color: pal.zoomText, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
});

function EmptyHint({ theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      color: pal.textFaint, textAlign: 'center', padding: 16,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: pal.emptyIconBg, border: `1.5px dashed ${pal.emptyIconBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
      }}>▦</div>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: pal.textMuted, lineHeight: 1.6 }}>
        No 2D array yet<br />
        <span style={{ fontSize: 11.5, color: pal.textFaint }}>Declare an int[][] / char[][] grid and run your code</span>
      </p>
    </div>
  );
}
