import { useEffect, useRef, useState, useMemo } from 'react';

/**
 * StackVisualizer — LIFO Visualizer
 * ─────────────────────────────────────────────────────────────
 * Complete, dedicated Stack data structure visualizer.
 * Supports:
 *  - Vertical Cylinder / Bucket View (classic LIFO physics)
 *  - Horizontal Linear Tape View
 *  - Push (drop-in), Pop, Peek, Search / Read operations
 *  - TOP pointer with animated bounce indicator
 *  - Address / index toggle (0x hex addresses)
 *  - Capacity metrics, depth ticks, glassmorphism aesthetics
 *  - Resizable stdout console drawer
 */

/* ── Operation Color & Icon Registry ── */
const OP_META = {
  push:      { color: '#10b981', border: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.14)', label: 'PUSH',  icon: '📥' },
  append:    { color: '#10b981', border: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.14)', label: 'PUSH',  icon: '📥' },
  write:     { color: '#10b981', border: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.14)', label: 'PUSH',  icon: '📥' },
  pop:       { color: '#f43f5e', border: 'rgba(244,63,94,0.5)',   bg: 'rgba(244,63,94,0.14)',  label: 'POP',   icon: '📤' },
  peek:      { color: '#06b6d4', border: 'rgba(6,182,212,0.5)',   bg: 'rgba(6,182,212,0.14)',  label: 'PEEK',  icon: '👁' },
  read:      { color: '#06b6d4', border: 'rgba(6,182,212,0.5)',   bg: 'rgba(6,182,212,0.14)',  label: 'PEEK',  icon: '👁' },
  init:      { color: '#a855f7', border: 'rgba(168,85,247,0.5)',  bg: 'rgba(168,85,247,0.14)', label: 'INIT',  icon: '⚡' },
  highlight: { color: '#f59e0b', border: 'rgba(245,158,11,0.5)',  bg: 'rgba(245,158,11,0.14)', label: 'ACTIVE',icon: '🔍' },
  compare:   { color: '#eab308', border: 'rgba(234,179,8,0.5)',   bg: 'rgba(234,179,8,0.14)',  label: 'COMP',  icon: '⚖' },
};

function getOpMeta(type) {
  const normalized = (type || 'highlight').toLowerCase();
  if (normalized.includes('push') || normalized.includes('append')) return OP_META.push;
  if (normalized.includes('pop')) return OP_META.pop;
  if (normalized.includes('peek') || normalized.includes('read')) return OP_META.peek;
  if (normalized.includes('init')) return OP_META.init;
  return OP_META[normalized] || OP_META.highlight;
}

export default function StackVisualizer({
  stackState  = [],
  arrayState  = [],
  activeIndex = null,
  type        = 'highlight',
  description = '',
  step        = 0,
  totalSteps  = 0,
  userOutput  = '',
}) {
  // Use stackState if provided, fallback to arrayState (stack implemented on array)
  const items = useMemo(() => {
    if (Array.isArray(stackState) && stackState.length > 0) return stackState;
    if (Array.isArray(arrayState)) return arrayState;
    return [];
  }, [stackState, arrayState]);

  const [viewMode, setViewMode]           = useState('vertical'); // 'vertical' | 'horizontal'
  const [showAddresses, setShowAddresses] = useState(false);
  const [zoom, setZoom]                   = useState(1);
  const [stdoutH, setStdoutH]             = useState(110);
  const [resizing, setResizing]           = useState(false);
  const [flashSet, setFlashSet]           = useState(new Set());
  const prevStateRef                      = useRef([]);
  const containerRef                      = useRef(null);

  const topIndex = items.length > 0 ? items.length - 1 : null;
  const topValue = topIndex !== null ? items[topIndex] : null;

  /* ── Mutation & Flash Detection ── */
  useEffect(() => {
    const prev = prevStateRef.current;
    const changed = new Set();
    items.forEach((val, idx) => {
      if (prev[idx] !== val) changed.add(idx);
    });
    if (activeIndex !== null && activeIndex >= 0) changed.add(activeIndex);
    if (topIndex !== null && (prev.length !== items.length)) changed.add(topIndex);

    setFlashSet(changed);
    prevStateRef.current = [...items];
    const t = setTimeout(() => setFlashSet(new Set()), 600);
    return () => clearTimeout(t);
  }, [items, activeIndex, topIndex]);

  /* ── Stdout drawer resize ── */
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setStdoutH(Math.max(50, Math.min(360, rect.bottom - e.clientY)));
    };
    const onUp = () => setResizing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  const opMeta = getOpMeta(type);
  const isEmpty = items.length === 0;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#090d16',
        backgroundImage:
          'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.12) 0%, transparent 70%), radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
        backgroundSize: '100% 100%, 20px 20px',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        overflow: 'hidden',
        userSelect: resizing ? 'none' : 'auto',
        position: 'relative',
      }}
    >
      {/* ── TOP HEADER & CONTROL BAR ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 18px',
          background: 'rgba(15, 23, 42, 0.78)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          flexShrink: 0,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Left: Module Badge & Live Metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25))',
              border: '1px solid rgba(129, 140, 248, 0.35)',
            }}
          >
            <span style={{ fontSize: 14 }}>📚</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#e2e8f0',
                textTransform: 'uppercase',
                letterSpacing: '.06em',
              }}
            >
              Stack (LIFO)
            </span>
          </div>

          {/* Size Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 9px',
              borderRadius: 999,
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              fontSize: 11,
              fontWeight: 600,
              color: '#38bdf8',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 6px #38bdf8' }} />
            {items.length} {items.length === 1 ? 'Item' : 'Items'}
          </div>

          {/* Top Value Pill */}
          {topIndex !== null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontSize: 11,
                fontWeight: 600,
                color: '#34d399',
              }}
            >
              <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 700 }}>TOP</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>[{String(topValue)}]</span>
            </div>
          )}

          {/* Empty Status Badge */}
          {isEmpty && (
            <div
              style={{
                padding: '2px 8px',
                borderRadius: 6,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                fontSize: 10.5,
                fontWeight: 600,
                color: '#f87171',
              }}
            >
              EMPTY
            </div>
          )}

          {/* Operation Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 9px',
              borderRadius: 6,
              background: opMeta.bg,
              border: `1px solid ${opMeta.border}`,
              fontSize: 11,
              fontWeight: 700,
              color: opMeta.color,
              letterSpacing: '.03em',
            }}
          >
            <span>{opMeta.icon}</span>
            <span>{opMeta.label}</span>
          </div>

          {/* Step counter */}
          {totalSteps > 0 && (
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: '#94a3b8',
                fontFamily: "'JetBrains Mono', monospace",
                padding: '2px 7px',
                borderRadius: 4,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {step}/{totalSteps}
            </div>
          )}
        </div>

        {/* Right: View & Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Memory addresses toggle */}
          <button
            onClick={() => setShowAddresses((v) => !v)}
            title="Toggle Memory Addresses (0x...)"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 8px',
              borderRadius: 6,
              background: showAddresses ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showAddresses ? 'rgba(99, 102, 241, 0.45)' : 'rgba(255,255,255,0.1)'}`,
              color: showAddresses ? '#a5b4fc' : '#94a3b8',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            <span>0x</span>
            <span>Addr</span>
          </button>

          {/* View Mode Toggle: Vertical Tube vs Horizontal Tape */}
          <button
            onClick={() => setViewMode((m) => (m === 'vertical' ? 'horizontal' : 'vertical'))}
            title={viewMode === 'vertical' ? 'Switch to Horizontal Tape View' : 'Switch to Vertical Cylinder View'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span>{viewMode === 'vertical' ? '⤿ Vertical' : '→ Horizontal'}</span>
          </button>

          {/* Zoom controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(1)))}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: 12,
              }}
              title="Zoom out"
            >
              −
            </button>
            <span
              style={{
                fontSize: 10.5,
                color: '#cbd5e1',
                padding: '0 4px',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: 12,
              }}
              title="Zoom in"
            >
              +
            </button>
            <button
              onClick={() => setZoom(1)}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                padding: '4px 6px',
                cursor: 'pointer',
                fontSize: 10,
              }}
              title="Reset zoom"
            >
              ↺
            </button>
          </div>
        </div>
      </header>

      {/* ── DESCRIPTION BANNER ── */}
      {description && (
        <div
          style={{
            margin: '12px 20px 0',
            padding: '8px 16px',
            borderRadius: 10,
            background: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${opMeta.border}`,
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>{opMeta.icon}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: opMeta.color, letterSpacing: '.01em' }}>
              {description}
            </span>
          </div>
          {topIndex !== null && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#94a3b8',
                fontFamily: "'JetBrains Mono', monospace",
                padding: '2px 8px',
                borderRadius: 4,
                background: 'rgba(255,255,255,0.06)',
              }}
            >
              TOP at index [{topIndex}]
            </span>
          )}
        </div>
      )}

      {/* ── MAIN CANVAS ── */}
      <main
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: '28px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 180ms ease-out',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 'fit-content',
          }}
        >
          {viewMode === 'vertical' ? (
            <VerticalStackBucket
              items={items}
              topIndex={topIndex}
              activeIndex={activeIndex}
              flashSet={flashSet}
              type={type}
              showAddresses={showAddresses}
            />
          ) : (
            <HorizontalStackTape
              items={items}
              topIndex={topIndex}
              activeIndex={activeIndex}
              flashSet={flashSet}
              type={type}
              showAddresses={showAddresses}
            />
          )}
        </div>
      </main>

      {/* ── STDOUT CONSOLE DRAWER ── */}
      {userOutput && (
        <>
          <div
            onMouseDown={() => setResizing(true)}
            title="Drag to resize terminal output"
            style={{
              height: 5,
              cursor: 'row-resize',
              flexShrink: 0,
              background: resizing ? 'rgba(56, 189, 248, 0.7)' : 'rgba(255,255,255,0.08)',
              transition: resizing ? 'none' : 'background 150ms',
            }}
          />
          <section
            style={{
              height: stdoutH,
              flexShrink: 0,
              background: '#040711',
              borderTop: '1px solid rgba(255,255,255,.07)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '6px 16px',
                fontSize: 10,
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                borderBottom: '1px solid rgba(255,255,255,.04)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
              Program Output
            </div>
            <pre
              style={{
                flex: 1,
                overflow: 'auto',
                margin: 0,
                padding: '10px 16px',
                fontSize: 12,
                color: '#f8fafc',
                fontFamily: "'JetBrains Mono', Consolas, monospace",
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {userOutput}
            </pre>
          </section>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   VIEW 1: Vertical Cylinder / Bucket (LIFO Container)
   ══════════════════════════════════════════════════════ */
function VerticalStackBucket({ items, topIndex, activeIndex, flashSet, type, showAddresses }) {
  const opMeta = getOpMeta(type);
  const isEmpty = items.length === 0;

  // Render items from top (N-1) down to bottom (0)
  const reversedItems = useMemo(() => {
    return items.map((val, idx) => ({ val, idx })).reverse();
  }, [items]);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 28, position: 'relative' }}>
      {/* Left side: TOP indicator with animated pointer */}
      <div style={{ width: 110, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingTop: 18 }}>
        {!isEmpty && (
          <div
            className="stack-pointer-bounce-h"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'rgba(16, 185, 129, 0.18)',
              border: '1.5px solid rgba(16, 185, 129, 0.65)',
              boxShadow: '0 0 14px rgba(16, 185, 129, 0.35)',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: '#34d399', letterSpacing: '.06em' }}>TOP</span>
            <span style={{ fontSize: 14, color: '#34d399' }}>➔</span>
          </div>
        )}
      </div>

      {/* Center: The Stack Cylinder Bucket */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Entry Gate (Open top with dashed drop guides) */}
        <div
          style={{
            width: 220,
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0 12px 6px',
            borderBottom: '1.5px dashed rgba(99, 102, 241, 0.3)',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 9.5, color: '#6366f1', fontWeight: 700, letterSpacing: '.06em' }}>
            ▲ PUSH / POP GATE
          </span>
          <span style={{ fontSize: 9.5, color: '#64748b', fontFamily: "'JetBrains Mono', monospace" }}>
            LIFO Order
          </span>
        </div>

        {/* Bucket Container */}
        <div
          style={{
            width: 220,
            minHeight: 280,
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.35) 0%, rgba(15, 23, 42, 0.75) 100%)',
            borderLeft: '2.5px solid rgba(129, 140, 248, 0.45)',
            borderRight: '2.5px solid rgba(129, 140, 248, 0.45)',
            borderBottom: '4px solid #6366f1',
            borderRadius: '0 0 10px 10px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5), inset 0 -4px 12px rgba(99, 102, 241, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: '12px 10px 10px',
            gap: 8,
            position: 'relative',
          }}
        >
          {isEmpty ? (
            <div
              style={{
                height: 240,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                color: '#475569',
                textAlign: 'center',
                padding: 16,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1.5px dashed rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                📥
              </div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: '#64748b', lineHeight: 1.5 }}>
                Stack is empty<br />
                <span style={{ fontSize: 11, color: '#475569' }}>Items push from top</span>
              </p>
            </div>
          ) : (
            reversedItems.map(({ val, idx }) => {
              const isTop = idx === topIndex;
              const isActive = idx === activeIndex || flashSet.has(idx);
              const hexAddr = '0x' + (0x100 + idx * 0x20).toString(16).toUpperCase();

              return (
                <div
                  key={idx}
                  className={isTop ? 'stack-item-drop stack-top-pulse' : ''}
                  style={{
                    height: 46,
                    borderRadius: 8,
                    background: isActive
                      ? opMeta.bg
                      : isTop
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(6, 182, 212, 0.2))'
                      : 'rgba(30, 41, 59, 0.8)',
                    border: isActive
                      ? `2px solid ${opMeta.color}`
                      : isTop
                      ? '2px solid #34d399'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: isActive
                      ? `0 0 16px ${opMeta.color}44`
                      : isTop
                      ? '0 4px 14px rgba(16, 185, 129, 0.3)'
                      : '0 2px 6px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 12px',
                    transition: 'all 240ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                >
                  {/* Left: Index badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: isTop ? '#34d399' : '#64748b',
                        fontFamily: "'JetBrains Mono', monospace",
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: 'rgba(0,0,0,0.3)',
                      }}
                    >
                      [{idx}]
                    </span>
                    {showAddresses && (
                      <span
                        style={{
                          fontSize: 9.5,
                          color: '#818cf8',
                          fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {hexAddr}
                      </span>
                    )}
                  </div>

                  {/* Center: Payload Value */}
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: isActive ? '#ffffff' : isTop ? '#ecfdf5' : '#f1f5f9',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: '.02em',
                    }}
                  >
                    {String(val)}
                  </span>

                  {/* Right: Tag */}
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: isTop ? '#10b981' : idx === 0 ? '#6366f1' : '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '.05em',
                    }}
                  >
                    {isTop ? 'TOP' : idx === 0 ? 'BASE' : ''}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Metallic Base Plate */}
        <div
          style={{
            width: 240,
            height: 10,
            background: 'linear-gradient(90deg, #334155 0%, #6366f1 50%, #334155 100%)',
            borderRadius: '0 0 8px 8px',
            boxShadow: '0 6px 16px rgba(99, 102, 241, 0.35)',
            marginTop: 1,
          }}
        />
        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginTop: 6, letterSpacing: '.04em' }}>
          STACK BASE (Index 0)
        </span>
      </div>

      {/* Right side: Depth Scale */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 280, gap: 14, paddingBottom: 16 }}>
        {items.length > 0 && (
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              fontSize: 10.5,
              color: '#94a3b8',
              lineHeight: 1.6,
            }}
          >
            <div><strong>Capacity:</strong> {items.length}</div>
            <div><strong>Access:</strong> O(1) Top</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   VIEW 2: Horizontal Stack Tape (Linear Layout)
   ══════════════════════════════════════════════════════ */
function HorizontalStackTape({ items, topIndex, activeIndex, flashSet, type, showAddresses }) {
  const opMeta = getOpMeta(type);
  const isEmpty = items.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {/* Tape Boundary Headers */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: Math.max(items.length * 90 + 40, 320),
          padding: '0 10px',
        }}
      >
        <span style={{ fontSize: 10.5, color: '#6366f1', fontWeight: 700, letterSpacing: '.05em' }}>
          ◀ BOTTOM (Index 0)
        </span>
        <span style={{ fontSize: 10.5, color: '#10b981', fontWeight: 700, letterSpacing: '.05em' }}>
          TOP (Index {topIndex !== null ? topIndex : 0}) ▶
        </span>
      </div>

      {/* Horizontal Tape Cells */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '16px 20px',
          borderRadius: 14,
          background: 'rgba(15, 23, 42, 0.65)',
          border: '1.5px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
          minWidth: 320,
          overflowX: 'auto',
        }}
      >
        {isEmpty ? (
          <div style={{ color: '#64748b', fontSize: 12, padding: '16px 32px', textAlign: 'center', width: '100%' }}>
            Stack is empty
          </div>
        ) : (
          items.map((val, idx) => {
            const isTop = idx === topIndex;
            const isActive = idx === activeIndex || flashSet.has(idx);
            const hexAddr = '0x' + (0x100 + idx * 0x20).toString(16).toUpperCase();

            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  className={isTop ? 'stack-top-pulse' : ''}
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 10,
                    background: isActive
                      ? opMeta.bg
                      : isTop
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 182, 212, 0.2))'
                      : 'rgba(30, 41, 59, 0.75)',
                    border: isActive
                      ? `2px solid ${opMeta.color}`
                      : isTop
                      ? '2px solid #34d399'
                      : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: isActive
                      ? `0 0 16px ${opMeta.color}55`
                      : isTop
                      ? '0 4px 16px rgba(16, 185, 129, 0.35)'
                      : '0 2px 8px rgba(0,0,0,0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    position: 'relative',
                    transition: 'all 200ms ease',
                  }}
                >
                  {/* Index badge */}
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      color: isTop ? '#34d399' : '#94a3b8',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    [{idx}]
                  </span>

                  {/* Value */}
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: '#ffffff',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {String(val)}
                  </span>

                  {/* Address or Role */}
                  {showAddresses ? (
                    <span style={{ fontSize: 9, color: '#818cf8', fontFamily: "'JetBrains Mono', monospace" }}>
                      {hexAddr}
                    </span>
                  ) : isTop ? (
                    <span style={{ fontSize: 8.5, fontWeight: 800, color: '#10b981', letterSpacing: '.06em' }}>
                      TOP
                    </span>
                  ) : null}
                </div>

                {/* Arrow between cells */}
                {idx < items.length - 1 && (
                  <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>➔</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
