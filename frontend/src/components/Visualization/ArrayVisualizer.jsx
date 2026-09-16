import { useEffect, useRef, useState } from 'react';

/**
 * ArrayVisualizer — Enhanced
 * ─────────────────────────
 * Dual-mode: bar-chart view + cell-box view (toggle)
 * Smooth CSS animations, glow effects, pointer labels,
 * dynamic description, resizable stdout panel.
 */
export default function ArrayVisualizer({
  arrayState   = [],
  activeIndex  = null,
  secondIndex  = null,
  type         = 'highlight',
  description  = '',
  step         = 0,
  totalSteps   = 0,
  userOutput   = '',
}) {
  const [flashSet, setFlashSet]           = useState(new Set());
  const [viewMode, setViewMode]           = useState('bars'); // 'bars' | 'cells'
  const [stdoutHeight, setStdoutHeight]   = useState(120);
  const [isResizingStdout, setResizing]   = useState(false);
  const prevStateRef                      = useRef([]);
  const containerRef                      = useRef(null);

  /* ── flash detection ── */
  useEffect(() => {
    const prev    = prevStateRef.current;
    const changed = new Set();
    arrayState.forEach((v, i) => { if (prev[i] !== v) changed.add(i); });
    if (activeIndex !== null) changed.add(activeIndex);
    if (secondIndex !== null) changed.add(secondIndex);
    setFlashSet(changed);
    prevStateRef.current = [...arrayState];
    const t = setTimeout(() => setFlashSet(new Set()), 480);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrayState, activeIndex, secondIndex]);

  /* ── stdout resize ── */
  useEffect(() => {
    if (!isResizingStdout) return;
    const onMove = e => {
      if (!containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setStdoutHeight(Math.max(60, Math.min(400, r.bottom - e.clientY)));
    };
    const onUp = () => setResizing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [isResizingStdout]);

  const isEmpty  = arrayState.length === 0;
  const maxVal   = Math.max(...arrayState.map(Math.abs), 1);
  const opColor  = OP_COLORS[type] || OP_COLORS.highlight;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: '#0d1117', fontFamily: "'Inter', system-ui, sans-serif",
        overflow: 'hidden', userSelect: isResizingStdout ? 'none' : 'auto',
      }}
    >
      {/* ── header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,.07)',
        flexShrink: 0, gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#8b949e',
            textTransform: 'uppercase', letterSpacing: '.06em',
          }}>Array</span>
          {arrayState.length > 0 && (
            <span style={{
              padding: '2px 8px', borderRadius: 999,
              background: 'rgba(46,116,181,.18)', color: '#60a5fa',
              fontSize: 11, fontWeight: 600,
            }}>size = {arrayState.length}</span>
          )}
          {totalSteps > 0 && <TypeBadge type={type} />}
        </div>

        {/* View toggle */}
        <div style={{
          display: 'flex', borderRadius: 8,
          border: '1px solid rgba(255,255,255,.1)',
          overflow: 'hidden', flexShrink: 0,
        }}>
          {['bars', 'cells'].map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: '4px 12px', fontSize: 11, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: viewMode === m ? 'rgba(46,116,181,.35)' : 'transparent',
              color: viewMode === m ? '#93c5fd' : '#6b7280',
              transition: 'background 200ms, color 200ms',
            }}>
              {m === 'bars' ? '▦ Bars' : '▤ Cells'}
            </button>
          ))}
        </div>
      </div>

      {/* ── main canvas ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px 12px' }}>
        {isEmpty ? (
          <EmptyState />
        ) : viewMode === 'bars' ? (
          <BarView
            arrayState={arrayState}
            activeIndex={activeIndex}
            secondIndex={secondIndex}
            flashSet={flashSet}
            type={type}
            maxVal={maxVal}
          />
        ) : (
          <CellView
            arrayState={arrayState}
            activeIndex={activeIndex}
            secondIndex={secondIndex}
            flashSet={flashSet}
            type={type}
          />
        )}
      </div>

      {/* ── description bar ── */}
      {description && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 20px',
          background: opColor.descBg,
          borderTop: `1px solid ${opColor.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 16, color: opColor.icon, lineHeight: 1, flexShrink: 0 }}>
            {OP_ICON[type] || '●'}
          </span>
          <span style={{
            fontSize: 13, color: '#e6edf3', flex: 1,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{description}</span>
          {totalSteps > 0 && (
            <span style={{ fontSize: 11, color: '#8b949e', flexShrink: 0, fontWeight: 600 }}>
              {step} / {totalSteps}
            </span>
          )}
        </div>
      )}

      {/* ── stdout ── */}
      {userOutput && (
        <>
          <div
            onMouseDown={() => setResizing(true)}
            style={{
              height: 4, cursor: 'row-resize', flexShrink: 0,
              background: isResizingStdout ? 'rgba(76,175,80,.5)' : 'rgba(255,255,255,.07)',
              transition: isResizingStdout ? 'none' : 'background 150ms',
            }}
          />
          <OutputConsole output={userOutput} height={stdoutHeight} />
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   BAR VIEW — vertical bar chart, animated heights
   All rows (pointer, bars, index) in ONE scrollable div
   ══════════════════════════════════════════════════════ */
function BarView({ arrayState, activeIndex, secondIndex, flashSet, type, maxVal }) {
  const BAR_W = 52;   // fixed width per bar — always consistent, user scrolls for large arrays
  const GAP   = 4;
  const MAX_H = 200;

  return (
    // Single horizontally-scrollable container — all rows scroll together
    <div style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: 4 }}>
      <div style={{
        display: 'inline-flex', flexDirection: 'column', gap: 0,
        minWidth: 'max-content',   // prevents collapsing
      }}>

        {/* ── Pointer label row ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', height: 28, gap: GAP, marginBottom: 4 }}>
          {arrayState.map((_, i) => {
            const isA = i === activeIndex, isB = i === secondIndex;
            const col = isA ? (OP_COLORS[type]?.main || '#60a5fa') : '#F2A93B';
            const lbl = type === 'swap'    ? (isA ? 'i' : isB ? 'j' : '')
                      : type === 'compare' ? (isA ? 'j' : isB ? 'k' : '')
                      : isA ? 'i' : '';
            return (
              <div key={i} style={{
                width: BAR_W, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-end',
              }}>
                {(isA || isB) && (
                  <>
                    <span style={{ fontSize: 10, fontWeight: 800, color: col, letterSpacing: '.04em', lineHeight: 1.2 }}>{lbl}</span>
                    <span style={{ fontSize: 13, color: col, lineHeight: 1 }}>▼</span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Bars row ── */}
        <div style={{
          display: 'flex', alignItems: 'flex-end',
          gap: GAP, height: MAX_H + 4,
        }}>
          {arrayState.map((val, i) => {
            const isA     = i === activeIndex;
            const isB     = i === secondIndex;
            const isFlash = flashSet.has(i);
            const pct     = Math.max(0.04, Math.abs(val) / maxVal);
            const barH    = Math.round(pct * MAX_H);
            const colors  = getCellColor(isA, isB, type);

            return (
              <div key={i} style={{
                width: BAR_W, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-end', gap: 3,
              }}>
                {/* Value label */}
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: colors.text,
                  fontFamily: "'JetBrains Mono', monospace",
                  transition: 'color 300ms',
                  opacity: isA || isB ? 1 : 0.65,
                  lineHeight: 1,
                }}>{val}</span>

                {/* Bar */}
                <div style={{
                  width: '100%', height: barH,
                  background: colors.bg,
                  border: `2px solid ${colors.border}`,
                  borderRadius: '4px 4px 0 0',
                  boxShadow: isA
                    ? `0 0 0 2px ${colors.glow}, 0 -4px 16px ${colors.shadow}`
                    : isB ? `0 0 0 2px ${colors.glow}` : 'none',
                  transform: isFlash ? 'scaleY(1.07)' : 'scaleY(1)',
                  transformOrigin: 'bottom',
                  transition: 'height 350ms cubic-bezier(.34,1.56,.64,1), background 300ms, border-color 300ms, box-shadow 300ms, transform 220ms',
                }} />
              </div>
            );
          })}
        </div>

        {/* ── Index label row ── */}
        <div style={{ display: 'flex', gap: GAP, marginTop: 3 }}>
          {arrayState.map((_, i) => (
            <div key={i} style={{
              width: BAR_W, flexShrink: 0,
              textAlign: 'center', fontSize: 11, fontWeight: 600,
              color: i === activeIndex || i === secondIndex ? '#8b949e' : 'rgba(255,255,255,.2)',
              borderTop: `1px solid ${
                i === activeIndex ? (OP_COLORS[type]?.main || '#2E74B5')
                : i === secondIndex ? '#F2A93B'
                : 'rgba(255,255,255,.08)'
              }`,
              paddingTop: 4,
              transition: 'color 300ms, border-color 300ms',
            }}>{i}</div>
          ))}
        </div>

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   CELL VIEW — classic horizontal boxes
   ══════════════════════════════════════════════════════ */
function CellView({ arrayState, activeIndex, secondIndex, flashSet, type }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Pointer row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', height: 28 }}>
        {arrayState.map((_, i) => {
          const isA = i === activeIndex, isB = i === secondIndex;
          if (!isA && !isB) return <div key={i} style={{ minWidth: 56 }} />;
          const col = isA ? OP_COLORS[type]?.main || '#60a5fa' : '#F2A93B';
          const lbl = type === 'swap'    ? (isA ? 'i' : 'j')
                    : type === 'compare' ? (isA ? 'j' : 'k')
                    : 'i';
          return (
            <div key={i} style={{
              minWidth: 56, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-end',
            }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: col }}>{lbl}</span>
              <span style={{ fontSize: 13, color: col, lineHeight: 1 }}>▼</span>
            </div>
          );
        })}
      </div>

      {/* Cell row */}
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'nowrap', overflowX: 'auto' }}>
        {arrayState.map((val, i) => {
          const isA     = i === activeIndex;
          const isB     = i === secondIndex;
          const isFlash = flashSet.has(i);
          const colors  = getCellColor(isA, isB, type);

          const displayVal = val === null || val === undefined || val === ''
            ? <span style={{ opacity: 0.4, fontStyle: 'italic' }}>null</span>
            : String(val);

          return (
            <div key={i} style={{
              minWidth: 56, height: 56, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700,
              background: colors.bg,
              color: colors.text,
              border: `2px solid ${colors.border}`,
              borderLeft: i === 0 ? `2px solid ${colors.border}` : 'none',
              borderRadius: i === 0 ? '8px 0 0 8px' : i === arrayState.length - 1 ? '0 8px 8px 0' : '0',
              boxShadow: isA
                ? `0 0 0 3px ${colors.glow}, 0 6px 20px ${colors.shadow}`
                : isB ? `0 0 0 2px ${colors.glow}` : 'none',
              transform: isFlash ? 'translateY(-5px) scale(1.08)' : 'none',
              transition: 'background 300ms, border-color 300ms, color 300ms, transform 250ms cubic-bezier(.34,1.56,.64,1), box-shadow 300ms',
              zIndex: isFlash ? 2 : 1, position: 'relative',
              cursor: 'default',
            }}>{displayVal}</div>
          );
        })}
      </div>

      {/* Index row */}
      <div style={{ display: 'flex' }}>
        {arrayState.map((_, i) => (
          <div key={i} style={{
            minWidth: 56, textAlign: 'center', fontSize: 11,
            fontWeight: i === activeIndex || i === secondIndex ? 700 : 400,
            color: i === activeIndex || i === secondIndex ? '#8b949e' : 'rgba(255,255,255,.2)',
            transition: 'color 300ms',
          }}>{i}</div>
        ))}
      </div>
    </div>
  );
}

/* ── Color maps ───────────────────────────────────────────────────────── */
const OP_COLORS = {
  write:   { bg: 'rgba(46,116,181,.35)',   border: '#2E74B5', text: '#93c5fd', glow: 'rgba(46,116,181,.55)',   shadow: 'rgba(46,116,181,.35)',  descBg: 'rgba(46,116,181,.1)',  icon: '#60a5fa', main: '#2E74B5' },
  read:    { bg: 'rgba(76,175,80,.25)',    border: '#4CAF50', text: '#86efac', glow: 'rgba(76,175,80,.55)',    shadow: 'rgba(76,175,80,.25)',   descBg: 'rgba(76,175,80,.08)',  icon: '#86efac', main: '#4CAF50' },
  swap:    { bg: 'rgba(242,169,59,.3)',    border: '#F2A93B', text: '#fcd34d', glow: 'rgba(242,169,59,.55)',   shadow: 'rgba(242,169,59,.25)',  descBg: 'rgba(242,169,59,.1)',  icon: '#fcd34d', main: '#F2A93B' },
  compare: { bg: 'rgba(232,121,249,.25)',  border: '#e879f9', text: '#f0abfc', glow: 'rgba(232,121,249,.5)',   shadow: 'rgba(232,121,249,.2)',  descBg: 'rgba(232,121,249,.08)',icon: '#f0abfc', main: '#e879f9' },
  append:  { bg: 'rgba(76,175,80,.25)',    border: '#4CAF50', text: '#86efac', glow: 'rgba(76,175,80,.55)',    shadow: 'rgba(76,175,80,.25)',   descBg: 'rgba(76,175,80,.08)',  icon: '#86efac', main: '#4CAF50' },
  init:    { bg: 'rgba(139,92,246,.25)',   border: '#8b5cf6', text: '#c4b5fd', glow: 'rgba(139,92,246,.45)',   shadow: 'rgba(139,92,246,.2)',   descBg: 'rgba(139,92,246,.1)',  icon: '#c4b5fd', main: '#8b5cf6' },
  highlight:{ bg:'rgba(255,255,255,.06)', border: 'rgba(255,255,255,.14)', text: '#e6edf3', glow: 'transparent', shadow: 'transparent', descBg: 'rgba(255,255,255,.04)', icon: '#8b949e', main: '#8b949e' },
};

const OP_ICON = {
  write: '✎', read: '◎', swap: '⇄', compare: '≷', append: '+', init: '◈', highlight: '●',
};

function getCellColor(isA, isB, type) {
  if (isA) return OP_COLORS[type] || OP_COLORS.highlight;
  if (isB) return OP_COLORS.swap;
  return { bg: 'rgba(255,255,255,.04)', border: 'rgba(255,255,255,.12)', text: '#e6edf3', glow: 'transparent', shadow: 'transparent' };
}

/* ── TypeBadge ──────────────────────────────────────────────────────── */
function TypeBadge({ type }) {
  const c = OP_COLORS[type] || OP_COLORS.highlight;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 999, fontSize: 10, fontWeight: 700,
      color: c.icon, background: c.descBg,
      letterSpacing: '.06em', fontFamily: "'JetBrains Mono', monospace",
      border: `1px solid ${c.border}`,
    }}>
      {OP_ICON[type] || '●'} {type.toUpperCase()}
    </span>
  );
}

/* ── OutputConsole ────────────────────────────────────────────────────── */
function OutputConsole({ output, height }) {
  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,.07)',
      flexShrink: 0, height, overflowY: 'auto',
      background: '#010409',
    }}>
      <div style={{
        padding: '5px 20px 4px', fontSize: 10, fontWeight: 700,
        color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.06em',
        borderBottom: '1px solid rgba(255,255,255,.05)',
      }}>stdout</div>
      <pre style={{
        margin: 0, padding: '8px 20px',
        fontSize: 12, color: '#a3e635',
        fontFamily: "'JetBrains Mono', monospace",
        lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}>{output}</pre>
    </div>
  );
}

/* ── EmptyState ───────────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 220, gap: 14,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'rgba(46,116,181,.08)',
        border: '1.5px solid rgba(46,116,181,.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28,
      }}>▦</div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: '#e6edf3', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
          Array Visualizer
        </p>
        <p style={{ color: '#8b949e', fontSize: 13, lineHeight: 1.65, maxWidth: 300, margin: 0 }}>
          Write your code and hit{' '}
          <span style={{
            display: 'inline-block', padding: '1px 8px', borderRadius: 4,
            background: 'rgba(76,175,80,.15)', color: '#86efac',
            fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
          }}>▶ Run</span>{' '}
          to see step-by-step animation.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['int[] arr = {1,2,3}', 'arr[i] = v', 'swap(arr,i,j)'].map(h => (
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
