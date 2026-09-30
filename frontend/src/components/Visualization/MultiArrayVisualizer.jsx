import { useEffect, useRef, useState } from 'react';
import ArrayVisualizer from './ArrayVisualizer';

/**
 * MultiArrayVisualizer
 * ────────────────────
 * If the user's code declares more than one array-typed variable
 * (arr1, arr2, ... — possibly different sizes), each one gets its own
 * live panel instead of the newest one silently overwriting the last.
 * Falls back to a single, full-size ArrayVisualizer when there's 0 or 1
 * tracked array, so existing single-array code looks and behaves exactly
 * as before — this only changes anything once a second array shows up.
 *
 * Panels are stacked vertically with a drag handle between each pair so
 * the user can resize how much height each array gets.
 */
export default function MultiArrayVisualizer({
  arrays        = [],       // [{ name, state, activeIndex, secondIndex, type }, ...]
  activeArrayVar = null,    // which array's op this event/step belongs to
  description   = '',
  step          = 0,
  totalSteps    = 0,
  userOutput    = '',
  // legacy single-array props — used when arrays.length <= 1
  arrayState    = [],
  activeIndex   = null,
  secondIndex   = null,
  type          = 'highlight',
  locals        = null,     // { varName: value, ... } — every live local at this step
  theme         = 'dark',
}) {
  if (arrays.length <= 1) {
    return (
      <ArrayVisualizer
        arrayState={arrays.length === 1 ? arrays[0].state : arrayState}
        activeIndex={arrays.length === 1 ? arrays[0].activeIndex : activeIndex}
        secondIndex={arrays.length === 1 ? arrays[0].secondIndex : secondIndex}
        type={type}
        description={description}
        step={step}
        totalSteps={totalSteps}
        userOutput={userOutput}
        locals={locals}
        theme={theme}
      />
    );
  }

  const pal = PALETTE[theme] || PALETTE.dark;

  return (
    <ResizableStack theme={theme} panelCount={arrays.length} panelKeys={arrays.map(a => a.name)}>
      {arrays.map((arr, i) => (
        <div key={arr.name} style={{ height: '100%', minHeight: 0 }}>
          <div
            style={{
              height: '100%',
              outline: arr.name === activeArrayVar ? `2px solid ${pal.outline}` : 'none',
              outlineOffset: -2,
              transition: 'outline 150ms',
            }}
          >
            <ArrayVisualizer
              name={arr.name}
              arrayState={arr.state}
              activeIndex={arr.activeIndex}
              secondIndex={arr.secondIndex}
              type={arr.name === activeArrayVar ? type : 'highlight'}
              description={arr.name === activeArrayVar ? description : ''}
              step={step}
              totalSteps={totalSteps}
              userOutput={i === arrays.length - 1 ? userOutput : ''}
              locals={locals}
              theme={theme}
            />
          </div>
        </div>
      ))}
    </ResizableStack>
  );
}

/* ── ResizableStack ───────────────────────────────────────────────────
   Vertically stacks its children, each getting an equal share of height
   by default, with a drag handle between adjacent panels that lets the
   user redistribute height between just that pair. Ratios are tracked
   in state (not DOM measurement) so resizing stays stable across steps
   as array contents change. ─────────────────────────────────────────── */
function ResizableStack({ children, theme = 'dark', panelCount, panelKeys }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const containerRef = useRef(null);
  const dragRef = useRef(null); // { index, startY, startRatios, containerH }
  const [ratios, setRatios] = useState(() => Array(panelCount).fill(1 / panelCount));
  const [dragging, setDragging] = useState(false);
  const keysSig = panelKeys.join('|');

  // Re-init ratios (equal split) only when the *set* of panels changes —
  // not on every re-render, so a manual resize survives step navigation.
  const prevSigRef = useRef(keysSig);
  useEffect(() => {
    if (prevSigRef.current !== keysSig) {
      prevSigRef.current = keysSig;
      setRatios(Array(panelCount).fill(1 / panelCount));
    }
  }, [keysSig, panelCount]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d || !containerRef.current) return;
      const deltaRatio = (e.clientY - d.startY) / d.containerH;
      const MIN = 0.08; // never collapse a panel below ~8% of stack height
      let a = d.startRatios[d.index] + deltaRatio;
      let b = d.startRatios[d.index + 1] - deltaRatio;
      if (a < MIN) { b -= (MIN - a); a = MIN; }
      if (b < MIN) { a -= (MIN - b); b = MIN; }
      const next = [...d.startRatios];
      next[d.index] = a;
      next[d.index + 1] = b;
      setRatios(next);
    };
    const onUp = () => setDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const startDrag = (index) => (e) => {
    if (!containerRef.current) return;
    dragRef.current = {
      index,
      startY: e.clientY,
      startRatios: ratios,
      containerH: containerRef.current.getBoundingClientRect().height,
    };
    setDragging(true);
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column', height: '100%',
        background: pal.bg, overflow: 'hidden',
        userSelect: dragging ? 'none' : 'auto',
      }}
    >
      {children.map((child, i) => (
        <div key={panelKeys[i]} style={{ display: 'flex', flexDirection: 'column', flex: `${ratios[i]} 1 0`, minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0 }}>{child}</div>
          {i < children.length - 1 && (
            <div
              onMouseDown={startDrag(i)}
              title="Drag to resize"
              style={{
                height: 6, flexShrink: 0, cursor: 'row-resize',
                background: dragging && dragRef.current?.index === i ? pal.outline : pal.hairline,
                transition: dragging ? 'none' : 'background 150ms',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const PALETTE = {
  dark:  { bg: '#0d1117', hairline: 'rgba(255,255,255,.09)', outline: 'rgba(96,165,250,.5)' },
  light: { bg: '#ffffff', hairline: '#e2e8f0',               outline: '#2563eb' },
};
