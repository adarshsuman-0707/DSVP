import { useEffect, useRef, useState } from 'react';

/**
 * ArrayVisualizer
 * ───────────────
 * Renders the current array state from a trace event as animated cells.
 *
 * Props (all come from the trace event object):
 *   arrayState  : number[]    — full snapshot of the array
 *   activeIndex : number|null — primary highlighted index (write/read/swap)
 *   secondIndex : number|null — second highlighted index (swap)
 *   type        : string      — 'init'|'write'|'read'|'swap'|'append'|'read'
 *   description : string      — human-readable label for this step
 *   step        : number      — current step number
 *   totalSteps  : number      — total steps
 *   userOutput  : string      — aggregated print() / printf() output
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
  /* track which cells just changed so we can flash them */
  const [flashSet, setFlashSet] = useState(new Set());
  const prevStateRef = useRef([]);

  // Resizable stdout height
  const [stdoutHeight, setStdoutHeight] = useState(120);
  const [isResizingStdout, setIsResizingStdout] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isResizingStdout) return;

    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;
      setStdoutHeight(Math.max(60, Math.min(400, newHeight)));
    };

    const handleMouseUp = () => setIsResizingStdout(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingStdout]);

  useEffect(() => {
    const prev = prevStateRef.current;
    const changed = new Set();
    arrayState.forEach((v, i) => {
      if (prev[i] !== v) changed.add(i);
    });
    if (activeIndex !== null) changed.add(activeIndex);
    if (secondIndex !== null) changed.add(secondIndex);
    setFlashSet(changed);
    prevStateRef.current = [...arrayState];

    const t = setTimeout(() => setFlashSet(new Set()), 420);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrayState, activeIndex, secondIndex]);

  const isEmpty = arrayState.length === 0;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0d1117',
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: 'hidden',
        userSelect: isResizingStdout ? 'none' : 'auto',
      }}
    >

      {/* ── header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,.07)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#8b949e',
            textTransform: 'uppercase', letterSpacing: '.06em',
          }}>Array</span>
          {arrayState.length > 0 && (
            <span style={{
              padding: '2px 8px', borderRadius: 999,
              background: 'rgba(46,116,181,.2)', color: '#60a5fa',
              fontSize: 11, fontWeight: 600,
            }}>size = {arrayState.length}</span>
          )}
        </div>

        {totalSteps > 0 && (
          <TypeBadge type={type} />
        )}
      </div>

      {/* ── main canvas ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 20px' }}>

        {isEmpty ? (
          <EmptyState />
        ) : (
          <>
            {/* pointer arrow row */}
            <PointerRow
              length={arrayState.length}
              activeIndex={activeIndex}
              secondIndex={secondIndex}
              type={type}
            />

            {/* cell row */}
            <div style={{
              display: 'flex', alignItems: 'stretch',
              gap: 0, flexWrap: 'nowrap',
              overflowX: 'auto', paddingBottom: 4,
            }}>
              {arrayState.map((val, i) => (
                <ArrayCell
                  key={i}
                  index={i}
                  value={val}
                  isActive={i === activeIndex}
                  isSecond={i === secondIndex}
                  isChanged={flashSet.has(i)}
                  type={type}
                  isFirst={i === 0}
                  isLast={i === arrayState.length - 1}
                />
              ))}
            </div>

            {/* index label row */}
            <IndexRow length={arrayState.length} activeIndex={activeIndex} secondIndex={secondIndex} />
          </>
        )}
      </div>

      {/* ── description bar ── */}
      {description && (
        <DescriptionBar description={description} step={step} totalSteps={totalSteps} type={type} />
      )}

      {/* ── user output console ── */}
      {userOutput && (
        <>
          {/* Horizontal Resize Handle */}
          <div
            onMouseDown={() => setIsResizingStdout(true)}
            style={{
              height: 4,
              cursor: 'row-resize',
              background: isResizingStdout ? 'rgba(76,175,80,.5)' : 'rgba(255,255,255,.07)',
              transition: isResizingStdout ? 'none' : 'background 150ms ease',
              position: 'relative',
              flexShrink: 0,
              zIndex: 10,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: 40,
                height: 20,
                background: isResizingStdout ? 'rgba(76,175,80,.3)' : 'transparent',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                color: '#8b949e',
              }}
            >
              ⋯
            </div>
          </div>
          <OutputConsole output={userOutput} height={stdoutHeight} />
        </>
      )}
    </div>
  );
}

/* ── Cell ─────────────────────────────────────────────────────────────── */
function ArrayCell({ index, value, isActive, isSecond, isChanged, type, isFirst, isLast }) {
  const cellColor = getCellColor(isActive, isSecond, type);
  
  // Handle null, undefined, and empty values
  const displayValue = value === null || value === undefined || value === '' 
    ? <span style={{ opacity: 0.4, fontStyle: 'italic' }}>null</span>
    : String(value);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minWidth: 56, flexShrink: 0,
    }}>
      <div style={{
        width: '100%', minWidth: 56, height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, fontWeight: 700,
        background: cellColor.bg,
        color: cellColor.text,
        border: `2px solid ${cellColor.border}`,
        borderRadius: isFirst ? '8px 0 0 8px' : isLast ? '0 8px 8px 0' : '0',
        borderLeft: isFirst ? `2px solid ${cellColor.border}` : 'none',
        transition: 'background 300ms ease, border-color 300ms ease, color 300ms ease, transform 200ms ease',
        transform: isChanged ? 'translateY(-4px) scale(1.06)' : 'none',
        boxShadow: isActive
          ? `0 0 0 3px ${cellColor.glow}, 0 6px 20px ${cellColor.shadow}`
          : isSecond
          ? `0 0 0 2px ${cellColor.glow}`
          : 'none',
        position: 'relative', cursor: 'default',
        zIndex: isChanged ? 2 : 1,
      }}>
        {displayValue}
      </div>
    </div>
  );
}

function getCellColor(isActive, isSecond, type) {
  if (isActive) {
    switch (type) {
      case 'write':  return { bg: 'rgba(46,116,181,.35)',  border: '#2E74B5', text: '#93c5fd', glow: 'rgba(46,116,181,.5)',  shadow: 'rgba(46,116,181,.3)'  };
      case 'read':   return { bg: 'rgba(76,175,80,.25)',   border: '#4CAF50', text: '#86efac', glow: 'rgba(76,175,80,.5)',   shadow: 'rgba(76,175,80,.25)'  };
      case 'swap':   return { bg: 'rgba(242,169,59,.3)',   border: '#F2A93B', text: '#fcd34d', glow: 'rgba(242,169,59,.5)',  shadow: 'rgba(242,169,59,.25)' };
      case 'compare':return { bg: 'rgba(232,121,249,.25)', border: '#e879f9', text: '#f0abfc', glow: 'rgba(232,121,249,.45)',shadow: 'rgba(232,121,249,.2)' };
      case 'append': return { bg: 'rgba(76,175,80,.25)',   border: '#4CAF50', text: '#86efac', glow: 'rgba(76,175,80,.5)',   shadow: 'rgba(76,175,80,.25)'  };
      case 'init':   return { bg: 'rgba(139,92,246,.25)',  border: '#8b5cf6', text: '#c4b5fd', glow: 'rgba(139,92,246,.4)', shadow: 'rgba(139,92,246,.2)'  };
      default:       return { bg: 'rgba(46,116,181,.35)',  border: '#2E74B5', text: '#93c5fd', glow: 'rgba(46,116,181,.5)',  shadow: 'rgba(46,116,181,.3)'  };
    }
  }
  if (isSecond) {
    return { bg: 'rgba(242,169,59,.3)', border: '#F2A93B', text: '#fcd34d', glow: 'rgba(242,169,59,.5)', shadow: 'rgba(242,169,59,.25)' };
  }
  return { bg: 'rgba(255,255,255,.04)', border: 'rgba(255,255,255,.12)', text: '#e6edf3', glow: 'transparent', shadow: 'transparent' };
}

/* ── Pointer arrow row ────────────────────────────────────────────────── */
function PointerRow({ length, activeIndex, secondIndex, type }) {
  if (activeIndex === null && secondIndex === null) {
    return <div style={{ height: 28 }} />;
  }

  const CELL_W = 56;

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end',
      height: 28, position: 'relative',
      marginBottom: 4, overflowX: 'hidden',
    }}>
      {Array.from({ length }).map((_, i) => {
        const isA = i === activeIndex;
        const isB = i === secondIndex;
        if (!isA && !isB) return <div key={i} style={{ minWidth: CELL_W }} />;

        const color = type === 'swap'
          ? '#F2A93B'
          : type === 'compare'
          ? '#e879f9'
          : isA && type === 'write' ? '#2E74B5'
          : isA && type === 'read'  ? '#4CAF50'
          : '#2E74B5';

        const label = type === 'swap'
          ? (isA ? 'i' : 'j')
          : type === 'compare'
          ? (isA ? 'j' : 'k')
          : isA ? 'ptr' : '';

        return (
          <div key={i} style={{
            minWidth: CELL_W, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-end',
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '.04em', marginBottom: 1 }}>
              {label}
            </span>
            <span style={{ fontSize: 14, color, lineHeight: 1 }}>▼</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Index label row ──────────────────────────────────────────────────── */
function IndexRow({ length, activeIndex, secondIndex }) {
  return (
    <div style={{ display: 'flex', marginTop: 4 }}>
      {Array.from({ length }).map((_, i) => {
        const isActive = i === activeIndex || i === secondIndex;
        return (
          <div key={i} style={{
            minWidth: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: isActive ? 700 : 400,
            color: isActive ? '#8b949e' : 'rgba(255,255,255,.2)',
            transition: 'color 300ms',
          }}>
            {i}
          </div>
        );
      })}
    </div>
  );
}

/* ── Description bar ──────────────────────────────────────────────────── */
function DescriptionBar({ description, step, totalSteps, type }) {
  const colors = {
    init:      { bg: 'rgba(139,92,246,.12)', border: 'rgba(139,92,246,.3)', icon: '◈', iconColor: '#c4b5fd' },
    write:     { bg: 'rgba(46,116,181,.12)', border: 'rgba(46,116,181,.3)', icon: '✎', iconColor: '#60a5fa' },
    read:      { bg: 'rgba(76,175,80,.1)',   border: 'rgba(76,175,80,.3)',  icon: '◎', iconColor: '#86efac' },
    swap:      { bg: 'rgba(242,169,59,.12)', border: 'rgba(242,169,59,.3)', icon: '⇄', iconColor: '#fcd34d' },
    compare:   { bg: 'rgba(232,121,249,.1)', border: 'rgba(232,121,249,.3)',icon: '?', iconColor: '#f0abfc' },
    append:    { bg: 'rgba(76,175,80,.1)',   border: 'rgba(76,175,80,.3)',  icon: '+', iconColor: '#86efac' },
    highlight: { bg: 'rgba(255,255,255,.04)',border: 'rgba(255,255,255,.1)',icon: '●', iconColor: '#8b949e' },
  };
  const c = colors[type] || colors.highlight;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 20px',
      background: c.bg,
      borderTop: `1px solid ${c.border}`,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 16, color: c.iconColor, lineHeight: 1, flexShrink: 0 }}>{c.icon}</span>
      <span style={{ fontSize: 13, color: '#e6edf3', flex: 1, fontFamily: "'JetBrains Mono', monospace" }}>
        {description}
      </span>
      {totalSteps > 0 && (
        <span style={{ fontSize: 11, color: '#8b949e', flexShrink: 0, fontWeight: 600 }}>
          {step} / {totalSteps}
        </span>
      )}
    </div>
  );
}

/* ── Output console ───────────────────────────────────────────────────── */
function OutputConsole({ output, height }) {
  return (
    <div
      style={{
        borderTop: '1px solid rgba(255,255,255,.07)',
        flexShrink: 0,
        height: height || 120,
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          padding: '6px 20px 4px',
          fontSize: 10,
          fontWeight: 700,
          color: '#8b949e',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          borderBottom: '1px solid rgba(255,255,255,.05)',
        }}
      >
        stdout
      </div>
      <pre
        style={{
          margin: 0,
          padding: '8px 20px',
          fontSize: 12,
          color: '#a3e635',
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {output}
      </pre>
    </div>
  );
}

/* ── Type badge ───────────────────────────────────────────────────────── */
function TypeBadge({ type }) {
  const map = {
    init:      ['◈ INIT',    '#c4b5fd', 'rgba(139,92,246,.2)'],
    write:     ['✎ WRITE',   '#60a5fa', 'rgba(46,116,181,.2)'],
    read:      ['◎ READ',    '#86efac', 'rgba(76,175,80,.2)' ],
    swap:      ['⇄ SWAP',    '#fcd34d', 'rgba(242,169,59,.2)'],
    compare:   ['? CMP',     '#f0abfc', 'rgba(232,121,249,.2)'],
    append:    ['+ APPEND',  '#86efac', 'rgba(76,175,80,.2)' ],
    highlight: ['● HL',      '#8b949e', 'rgba(255,255,255,.08)'],
  };
  const [label, color, bg] = map[type] || map.highlight;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 999,
      fontSize: 10, fontWeight: 700,
      color, background: bg,
      letterSpacing: '.06em', fontFamily: "'JetBrains Mono', monospace",
    }}>{label}</span>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100%', minHeight: 200, gap: 12,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 14,
        background: 'rgba(255,255,255,.04)',
        border: '1.5px solid rgba(255,255,255,.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26,
      }}>▦</div>
      <p style={{ color: '#8b949e', fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
        Run your code to see the array visualization.<br />
        <span style={{ fontSize: 12, color: '#555' }}>Use the <code style={{ color: '#93c5fd' }}>Array()</code> helper in your code.</span>
      </p>
    </div>
  );
}
