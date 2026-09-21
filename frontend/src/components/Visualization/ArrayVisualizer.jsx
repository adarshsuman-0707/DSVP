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
  name         = null, // optional: variable name, shown when multiple arrays coexist
  locals       = null, // { varName: value, ... } — every live local at this step, used to
                        // surface ALL loop pointers (not just the current op's 1-2 indices)
  theme        = 'dark',
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
  const pal      = PALETTE[theme] || PALETTE.dark;
  const opColors = getOpColors(theme);
  const opColor  = opColors[type] || opColors.highlight;

  // Every integer local variable that currently points inside this array —
  // not just the 1-2 indices touched by the current operation — so a loop
  // running two, three, or more pointers (i, j, k, left, right, slow, fast…)
  // all stay visible with their live values, not just the last op's pair.
  const pointers = derivePointers(locals, arrayState.length, name);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: pal.bg, fontFamily: "'Inter', system-ui, sans-serif",
        overflow: 'hidden', userSelect: isResizingStdout ? 'none' : 'auto',
      }}
    >
      {/* ── header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', borderBottom: `1px solid ${pal.hairline}`,
        flexShrink: 0, gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: pal.textMuted,
            textTransform: 'uppercase', letterSpacing: '.06em',
          }}>Array</span>
          {name && (
            <span style={{
              padding: '2px 8px', borderRadius: 999,
              background: pal.tagPurpleBg, color: pal.tagPurpleText,
              fontSize: 11, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
            }}>{name}</span>
          )}
          {arrayState.length > 0 && (
            <span style={{
              padding: '2px 8px', borderRadius: 999,
              background: pal.tagBlueBg, color: pal.tagBlueText,
              fontSize: 11, fontWeight: 600,
            }}>size = {arrayState.length}</span>
          )}
          {totalSteps > 0 && <TypeBadge type={type} theme={theme} />}
        </div>

        {/* View toggle */}
        <div style={{
          display: 'flex', borderRadius: 8,
          border: `1px solid ${pal.panelBorder}`,
          overflow: 'hidden', flexShrink: 0,
        }}>
          {['bars', 'cells'].map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              padding: '4px 12px', fontSize: 11, fontWeight: 600,
              border: 'none', cursor: 'pointer',
              background: viewMode === m ? pal.tagBlueBg : 'transparent',
              color: viewMode === m ? pal.tagBlueText : pal.textMuted,
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
          <EmptyState theme={theme} />
        ) : viewMode === 'bars' ? (
          <BarView
            arrayState={arrayState}
            activeIndex={activeIndex}
            secondIndex={secondIndex}
            flashSet={flashSet}
            type={type}
            maxVal={maxVal}
            pointers={pointers}
            theme={theme}
          />
        ) : (
          <CellView
            arrayState={arrayState}
            activeIndex={activeIndex}
            secondIndex={secondIndex}
            flashSet={flashSet}
            type={type}
            pointers={pointers}
            theme={theme}
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
            fontSize: 13, color: pal.text, flex: 1,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{description}</span>
          {totalSteps > 0 && (
            <span style={{ fontSize: 11, color: pal.textMuted, flexShrink: 0, fontWeight: 600 }}>
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
              background: isResizingStdout ? 'rgba(76,175,80,.5)' : pal.hairline,
              transition: isResizingStdout ? 'none' : 'background 150ms',
            }}
          />
          <OutputConsole output={userOutput} height={stdoutHeight} theme={theme} />
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   BAR VIEW — vertical bar chart, animated heights
   All rows (pointer, bars, index) in ONE scrollable div
   ══════════════════════════════════════════════════════ */
function BarView({ arrayState, activeIndex, secondIndex, flashSet, type, maxVal, pointers = [], theme = 'dark' }) {
  const BAR_W = 52;   // fixed width per bar — always consistent, user scrolls for large arrays
  const GAP   = 4;
  const MAX_H = 200;
  const pal = PALETTE[theme] || PALETTE.dark;
  const opColors = getOpColors(theme);

  const pointersByIndex = groupPointersByIndex(pointers);
  // Rows stacked tall enough for the deepest column's pointer stack, plus
  // room for the op-driven i/j fallback when no loop locals are tracked yet.
  const maxStack = Math.max(1, ...arrayState.map((_, i) => pointersByIndex.get(i)?.length || 0));
  const rowH = pointers.length > 0 ? maxStack * 22 + 8 : 28;

  return (
    // Single horizontally-scrollable container — all rows scroll together
    <div style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: 4 }}>
      <div style={{
        display: 'inline-flex', flexDirection: 'column', gap: 0,
        minWidth: 'max-content',   // prevents collapsing
      }}>

        {/* ── Pointer label row — every live loop variable pointing into
             this array, stacked when more than one lands on the same cell ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', height: rowH, gap: GAP, marginBottom: 4 }}>
          {arrayState.map((_, i) => {
            const here = pointersByIndex.get(i);
            if (here && here.length > 0) {
              return (
                <div key={i} style={{
                  width: BAR_W, flexShrink: 0,
                  display: 'flex', flexDirection: 'column-reverse',
                  alignItems: 'center', justifyContent: 'flex-start', gap: 1,
                }}>
                  <span style={{ fontSize: 13, color: here[0].color, lineHeight: 1 }}>▼</span>
                  {here.map(p => (
                    <span key={p.name} style={{
                      fontSize: 10, fontWeight: 800, color: p.color, letterSpacing: '.02em',
                      lineHeight: 1.3, whiteSpace: 'nowrap',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>{p.name}={p.index}</span>
                  ))}
                </div>
              );
            }
            // Fallback to the classic op-driven i/j labels when the
            // instrumenter hasn't reported any loop locals for this step.
            const isA = i === activeIndex, isB = i === secondIndex;
            if (pointers.length === 0 && (isA || isB)) {
              const col = isA ? (opColors[type]?.main || '#60a5fa') : '#F2A93B';
              const lbl = type === 'swap'    ? (isA ? 'i' : 'j')
                        : type === 'compare' ? (isA ? 'j' : 'k')
                        : 'i';
              return (
                <div key={i} style={{
                  width: BAR_W, flexShrink: 0,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'flex-end',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: col, letterSpacing: '.04em', lineHeight: 1.2 }}>{lbl}</span>
                  <span style={{ fontSize: 13, color: col, lineHeight: 1 }}>▼</span>
                </div>
              );
            }
            return <div key={i} style={{ width: BAR_W, flexShrink: 0 }} />;
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
            const colors  = getCellColor(isA, isB, type, theme);

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
              color: i === activeIndex || i === secondIndex ? pal.textMuted : pal.textFaint,
              borderTop: `1px solid ${
                i === activeIndex ? (opColors[type]?.main || '#2E74B5')
                : i === secondIndex ? '#F2A93B'
                : pal.hairline
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
function CellView({ arrayState, activeIndex, secondIndex, flashSet, type, pointers = [], theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const opColors = getOpColors(theme);
  const pointersByIndex = groupPointersByIndex(pointers);
  const maxStack = Math.max(1, ...arrayState.map((_, i) => pointersByIndex.get(i)?.length || 0));
  const rowH = pointers.length > 0 ? maxStack * 22 + 8 : 28;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Pointer row — every live loop variable pointing into this array */}
      <div style={{ display: 'flex', alignItems: 'flex-end', height: rowH }}>
        {arrayState.map((_, i) => {
          const here = pointersByIndex.get(i);
          if (here && here.length > 0) {
            return (
              <div key={i} style={{
                minWidth: 56, display: 'flex', flexDirection: 'column-reverse',
                alignItems: 'center', justifyContent: 'flex-start', gap: 1,
              }}>
                <span style={{ fontSize: 13, color: here[0].color, lineHeight: 1 }}>▼</span>
                {here.map(p => (
                  <span key={p.name} style={{
                    fontSize: 10, fontWeight: 800, color: p.color, whiteSpace: 'nowrap',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>{p.name}={p.index}</span>
                ))}
              </div>
            );
          }
          const isA = i === activeIndex, isB = i === secondIndex;
          if (pointers.length === 0 && (isA || isB)) {
            const col = isA ? opColors[type]?.main || '#60a5fa' : '#F2A93B';
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
          }
          return <div key={i} style={{ minWidth: 56 }} />;
        })}
      </div>

      {/* Cell row */}
      <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'nowrap', overflowX: 'auto' }}>
        {arrayState.map((val, i) => {
          const isA     = i === activeIndex;
          const isB     = i === secondIndex;
          const isFlash = flashSet.has(i);
          const colors  = getCellColor(isA, isB, type, theme);

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
            color: i === activeIndex || i === secondIndex ? pal.textMuted : pal.textFaint,
            transition: 'color 300ms',
          }}>{i}</div>
        ))}
      </div>
    </div>
  );
}

/* ── Multi-pointer helpers ─────────────────────────────────────────────
   `locals` is the full set of live variables at this step (from the trace
   event). Any integer whose value falls inside the array's valid index
   range is treated as a pointer into it — covers i/j/k, left/right,
   slow/fast, or whatever names the user's own code uses, with no limit
   on how many can be shown at once. ─────────────────────────────────── */
const POINTER_COLORS = ['#60a5fa', '#F2A93B', '#e879f9', '#4CAF50', '#fb7185', '#38bdf8', '#facc15', '#a78bfa'];

// Python's instrumenter reports every local as a repr() STRING (e.g. "5"),
// while Java's reports raw JSON numbers — accept both, reject anything that
// isn't a clean integer (lists, objects, "Node(5)", etc.).
function asIndexValue(v) {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return parseInt(v, 10);
  return null;
}

function derivePointers(locals, length, arrayName) {
  if (!locals || typeof locals !== 'object' || length === 0) return [];
  const entries = Object.keys(locals)
    .filter(k => k !== arrayName)
    .map(k => ({ name: k, index: asIndexValue(locals[k]) }))
    .filter(p => p.index !== null && p.index >= 0 && p.index < length)
    .sort((a, b) => a.name.localeCompare(b.name)); // stable order → stable colors across steps
  return entries.map((p, i) => ({ ...p, color: POINTER_COLORS[i % POINTER_COLORS.length] }));
}

function groupPointersByIndex(pointers) {
  const map = new Map();
  for (const p of pointers) {
    if (!map.has(p.index)) map.set(p.index, []);
    map.get(p.index).push(p);
  }
  return map;
}

/* ── Theme palette (self-contained — no cross-file imports) ────────────── */
const PALETTE = {
  dark: {
    bg: '#0d1117', text: '#e6edf3', textMuted: '#8b949e', textFaint: 'rgba(255,255,255,.2)',
    hairline: 'rgba(255,255,255,.07)', panelBorder: 'rgba(255,255,255,.1)',
    cellBg: 'rgba(255,255,255,.04)', cellBorder: 'rgba(255,255,255,.12)',
    consoleBg: '#010409', tagPurpleBg: 'rgba(168,85,247,.18)', tagPurpleText: '#c4b5fd',
    tagBlueBg: 'rgba(46,116,181,.18)', tagBlueText: '#60a5fa',
  },
  light: {
    bg: '#ffffff', text: '#1e293b', textMuted: '#64748b', textFaint: '#cbd5e1',
    hairline: '#e2e8f0', panelBorder: '#d0d7de',
    cellBg: '#f6f8fa', cellBorder: '#d0d7de',
    consoleBg: '#f6f8fa', tagPurpleBg: 'rgba(168,85,247,.14)', tagPurpleText: '#7e22ce',
    tagBlueBg: 'rgba(46,116,181,.14)', tagBlueText: '#1d4ed8',
  },
};

/* ── Color maps ───────────────────────────────────────────────────────── */
// Dark values kept exactly as before; light values reduce fill opacity and
// darken the text/border so each semantic hue stays legible on a white panel.
const OP_COLORS_DARK = {
  write:   { bg: 'rgba(46,116,181,.35)',   border: '#2E74B5', text: '#93c5fd', glow: 'rgba(46,116,181,.55)',   shadow: 'rgba(46,116,181,.35)',  descBg: 'rgba(46,116,181,.1)',  icon: '#60a5fa', main: '#2E74B5' },
  read:    { bg: 'rgba(76,175,80,.25)',    border: '#4CAF50', text: '#86efac', glow: 'rgba(76,175,80,.55)',    shadow: 'rgba(76,175,80,.25)',   descBg: 'rgba(76,175,80,.08)',  icon: '#86efac', main: '#4CAF50' },
  swap:    { bg: 'rgba(242,169,59,.3)',    border: '#F2A93B', text: '#fcd34d', glow: 'rgba(242,169,59,.55)',   shadow: 'rgba(242,169,59,.25)',  descBg: 'rgba(242,169,59,.1)',  icon: '#fcd34d', main: '#F2A93B' },
  compare: { bg: 'rgba(232,121,249,.25)',  border: '#e879f9', text: '#f0abfc', glow: 'rgba(232,121,249,.5)',   shadow: 'rgba(232,121,249,.2)',  descBg: 'rgba(232,121,249,.08)',icon: '#f0abfc', main: '#e879f9' },
  append:  { bg: 'rgba(76,175,80,.25)',    border: '#4CAF50', text: '#86efac', glow: 'rgba(76,175,80,.55)',    shadow: 'rgba(76,175,80,.25)',   descBg: 'rgba(76,175,80,.08)',  icon: '#86efac', main: '#4CAF50' },
  init:    { bg: 'rgba(139,92,246,.25)',   border: '#8b5cf6', text: '#c4b5fd', glow: 'rgba(139,92,246,.45)',   shadow: 'rgba(139,92,246,.2)',   descBg: 'rgba(139,92,246,.1)',  icon: '#c4b5fd', main: '#8b5cf6' },
  highlight:{ bg:'rgba(255,255,255,.06)', border: 'rgba(255,255,255,.14)', text: '#e6edf3', glow: 'transparent', shadow: 'transparent', descBg: 'rgba(255,255,255,.04)', icon: '#8b949e', main: '#8b949e' },
};

const OP_COLORS_LIGHT = {
  write:   { bg: 'rgba(46,116,181,.14)',  border: '#2E74B5', text: '#1d4ed8', glow: 'rgba(46,116,181,.35)',  shadow: 'rgba(46,116,181,.2)',  descBg: 'rgba(46,116,181,.08)',  icon: '#1d4ed8', main: '#2E74B5' },
  read:    { bg: 'rgba(76,175,80,.14)',   border: '#4CAF50', text: '#15803d', glow: 'rgba(76,175,80,.35)',   shadow: 'rgba(76,175,80,.16)',  descBg: 'rgba(76,175,80,.08)',   icon: '#15803d', main: '#4CAF50' },
  swap:    { bg: 'rgba(242,169,59,.18)',  border: '#c2790f', text: '#92400e', glow: 'rgba(242,169,59,.35)',  shadow: 'rgba(242,169,59,.18)', descBg: 'rgba(242,169,59,.1)',   icon: '#92400e', main: '#c2790f' },
  compare: { bg: 'rgba(232,121,249,.16)', border: '#a21caf', text: '#a21caf', glow: 'rgba(232,121,249,.3)',  shadow: 'rgba(232,121,249,.14)',descBg: 'rgba(232,121,249,.08)', icon: '#a21caf', main: '#a21caf' },
  append:  { bg: 'rgba(76,175,80,.14)',   border: '#4CAF50', text: '#15803d', glow: 'rgba(76,175,80,.35)',   shadow: 'rgba(76,175,80,.16)',  descBg: 'rgba(76,175,80,.08)',   icon: '#15803d', main: '#4CAF50' },
  init:    { bg: 'rgba(139,92,246,.14)',  border: '#7c3aed', text: '#6d28d9', glow: 'rgba(139,92,246,.3)',   shadow: 'rgba(139,92,246,.14)', descBg: 'rgba(139,92,246,.08)',  icon: '#6d28d9', main: '#7c3aed' },
  highlight:{ bg:'#f6f8fa', border: '#d0d7de', text: '#1e293b', glow: 'transparent', shadow: 'transparent', descBg: '#f6f8fa', icon: '#64748b', main: '#64748b' },
};

function getOpColors(theme) {
  return theme === 'light' ? OP_COLORS_LIGHT : OP_COLORS_DARK;
}

const OP_ICON = {
  write: '✎', read: '◎', swap: '⇄', compare: '≷', append: '+', init: '◈', highlight: '●',
};

function getCellColor(isA, isB, type, theme = 'dark') {
  const opColors = getOpColors(theme);
  if (isA) return opColors[type] || opColors.highlight;
  if (isB) return opColors.swap;
  const pal = PALETTE[theme] || PALETTE.dark;
  return { bg: pal.cellBg, border: pal.cellBorder, text: pal.text, glow: 'transparent', shadow: 'transparent' };
}

/* ── TypeBadge ──────────────────────────────────────────────────────── */
function TypeBadge({ type, theme = 'dark' }) {
  const opColors = getOpColors(theme);
  const c = opColors[type] || opColors.highlight;
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
function OutputConsole({ output, height, theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  return (
    <div style={{
      borderTop: `1px solid ${pal.hairline}`,
      flexShrink: 0, height, overflowY: 'auto',
      background: pal.consoleBg,
    }}>
      <div style={{
        padding: '5px 20px 4px', fontSize: 10, fontWeight: 700,
        color: pal.textMuted, textTransform: 'uppercase', letterSpacing: '.06em',
        borderBottom: `1px solid ${pal.hairline}`,
      }}>stdout</div>
      <pre style={{
        margin: 0, padding: '8px 20px',
        fontSize: 12, color: theme === 'light' ? '#166534' : '#a3e635',
        fontFamily: "'JetBrains Mono', monospace",
        lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}>{output}</pre>
    </div>
  );
}

/* ── EmptyState ───────────────────────────────────────────────────────── */
function EmptyState({ theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
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
        <p style={{ color: pal.text, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
          Array Visualizer
        </p>
        <p style={{ color: pal.textMuted, fontSize: 13, lineHeight: 1.65, maxWidth: 300, margin: 0 }}>
          Write your code and hit{' '}
          <span style={{
            display: 'inline-block', padding: '1px 8px', borderRadius: 4,
            background: 'rgba(76,175,80,.15)', color: theme === 'light' ? '#15803d' : '#86efac',
            fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
          }}>▶ Run</span>{' '}
          to see step-by-step animation.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['int[] arr = {1,2,3}', 'arr[i] = v', 'swap(arr,i,j)'].map(h => (
          <span key={h} style={{
            padding: '5px 10px', borderRadius: 6,
            background: pal.cellBg,
            border: `1px solid ${pal.panelBorder}`,
            fontSize: 11, color: pal.textMuted,
            fontFamily: "'JetBrains Mono', monospace",
          }}>{h}</span>
        ))}
      </div>
    </div>
  );
}
