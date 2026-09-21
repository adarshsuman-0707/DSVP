import { useEffect, useRef, useState, useMemo } from 'react';

/**
 * QueueVisualizer — FIFO Visualizer
 * ─────────────────────────────────────────────────────────────
 * Dedicated Queue data structure visualizer, sibling to StackVisualizer.
 * Reuses the same dark "screen" panel visual language, JetBrains Mono
 * font, animation step handling (step/totalSteps) and stdout console
 * drawer — but lays items out horizontally as a FIFO with a clearly
 * labeled FRONT (dequeue end) and REAR (enqueue end) instead of a
 * vertical LIFO stack.
 */

/* ── Theme Palette ── */
const PALETTE = {
  dark: {
    panelBg: '#090d16',
    panelBgImage: 'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.12) 0%, transparent 70%), radial-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
    headerBg: 'rgba(15, 23, 42, 0.78)',
    headerBorder: '1px solid rgba(255, 255, 255, 0.08)',
    badgeBg: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25))',
    badgeBorder: '1px solid rgba(129, 140, 248, 0.35)',
    textPrimary: '#e2e8f0',
    textMuted: '#94a3b8',
    textFaint: '#64748b',
    chipBg: 'rgba(255,255,255,0.05)',
    chipBorder: '1px solid rgba(255,255,255,0.1)',
    chipText: '#94a3b8',
    sizePillBg: 'rgba(56, 189, 248, 0.1)',
    sizePillBorder: '1px solid rgba(56, 189, 248, 0.25)',
    sizePillText: '#38bdf8',
    frontPillBg: 'rgba(16, 185, 129, 0.12)',
    frontPillBorder: '1px solid rgba(16, 185, 129, 0.3)',
    frontPillText: '#34d399',
    emptyBadgeBg: 'rgba(239, 68, 68, 0.12)',
    emptyBadgeBorder: '1px solid rgba(239, 68, 68, 0.25)',
    emptyBadgeText: '#f87171',
    stepBg: 'rgba(255,255,255,0.05)',
    stepBorder: '1px solid rgba(255,255,255,0.07)',
    stepText: '#94a3b8',
    zoomText: '#cbd5e1',
    zoomResetText: '#64748b',
    bannerBg: 'rgba(15, 23, 42, 0.72)',
    bannerShadow: '0 4px 20px rgba(0,0,0,0.25)',
    bannerTagBg: 'rgba(255,255,255,0.06)',
    bannerTagText: '#94a3b8',
    stdoutDividerIdle: 'rgba(255,255,255,0.08)',
    stdoutBg: '#040711',
    stdoutBorder: '1px solid rgba(255,255,255,.07)',
    stdoutHeaderText: '#64748b',
    stdoutHeaderBorder: '1px solid rgba(255,255,255,.04)',
    stdoutText: '#f8fafc',
    pipeFrontText: '#f43f5e',
    pipeRearText: '#10b981',
    pipeContainerBg: 'rgba(15, 23, 42, 0.65)',
    pipeContainerBorder: '1.5px solid rgba(255, 255, 255, 0.08)',
    pipeContainerShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
    cellIdleBg: 'rgba(30, 41, 59, 0.75)',
    cellIdleBorder: '1px solid rgba(255, 255, 255, 0.1)',
    cellIdleShadow: '0 2px 8px rgba(0,0,0,0.25)',
    valueTextIdle: '#ffffff',
    addrText: '#818cf8',
    arrowColor: 'rgba(255,255,255,0.2)',
    metricsBg: 'rgba(255,255,255,0.03)',
    metricsBorder: '1px solid rgba(255,255,255,0.07)',
    metricsText: '#94a3b8',
    emptyText: '#64748b',
  },
  light: {
    panelBg: '#f6f8fa',
    panelBgImage: 'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.08) 0%, transparent 70%), radial-gradient(rgba(15, 23, 42, 0.035) 1px, transparent 1px)',
    headerBg: 'rgba(255, 255, 255, 0.85)',
    headerBorder: '1px solid #d0d7de',
    badgeBg: 'linear-gradient(135deg, rgba(99, 102, 241, 0.14), rgba(168, 85, 247, 0.14))',
    badgeBorder: '1px solid rgba(99, 102, 241, 0.3)',
    textPrimary: '#1e293b',
    textMuted: '#64748b',
    textFaint: '#64748b',
    chipBg: 'rgba(15, 23, 42, 0.04)',
    chipBorder: '1px solid #d0d7de',
    chipText: '#475569',
    sizePillBg: 'rgba(2, 132, 199, 0.08)',
    sizePillBorder: '1px solid rgba(2, 132, 199, 0.25)',
    sizePillText: '#0284c7',
    frontPillBg: 'rgba(5, 150, 105, 0.1)',
    frontPillBorder: '1px solid rgba(5, 150, 105, 0.3)',
    frontPillText: '#059669',
    emptyBadgeBg: 'rgba(220, 38, 38, 0.08)',
    emptyBadgeBorder: '1px solid rgba(220, 38, 38, 0.25)',
    emptyBadgeText: '#dc2626',
    stepBg: 'rgba(15, 23, 42, 0.04)',
    stepBorder: '1px solid #e2e8f0',
    stepText: '#475569',
    zoomText: '#1e293b',
    zoomResetText: '#64748b',
    bannerBg: '#ffffff',
    bannerShadow: '0 4px 14px rgba(15,23,42,0.08)',
    bannerTagBg: 'rgba(15, 23, 42, 0.05)',
    bannerTagText: '#475569',
    stdoutDividerIdle: '#d0d7de',
    stdoutBg: '#ffffff',
    stdoutBorder: '1px solid #d0d7de',
    stdoutHeaderText: '#64748b',
    stdoutHeaderBorder: '1px solid #e2e8f0',
    stdoutText: '#1e293b',
    pipeFrontText: '#e11d48',
    pipeRearText: '#059669',
    pipeContainerBg: '#ffffff',
    pipeContainerBorder: '1.5px solid #d0d7de',
    pipeContainerShadow: '0 6px 20px rgba(15, 23, 42, 0.08)',
    cellIdleBg: '#f6f8fa',
    cellIdleBorder: '1px solid #d0d7de',
    cellIdleShadow: '0 2px 6px rgba(15,23,42,0.06)',
    valueTextIdle: '#0f172a',
    addrText: '#6366f1',
    arrowColor: 'rgba(15,23,42,0.25)',
    metricsBg: 'rgba(15, 23, 42, 0.03)',
    metricsBorder: '1px solid #e2e8f0',
    metricsText: '#475569',
    emptyText: '#64748b',
  },
};

/* ── Operation Color & Icon Registry ──
   Light variants keep each semantic color's hue but darken/desaturate it
   and reduce fill opacity so it stays legible on a white background. */
const OP_META = {
  dark: {
    enqueue:   { color: '#10b981', border: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.14)', label: 'ENQUEUE', icon: '📥' },
    append:    { color: '#10b981', border: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.14)', label: 'ENQUEUE', icon: '📥' },
    write:     { color: '#10b981', border: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.14)', label: 'ENQUEUE', icon: '📥' },
    dequeue:   { color: '#f43f5e', border: 'rgba(244,63,94,0.5)',   bg: 'rgba(244,63,94,0.14)',  label: 'DEQUEUE', icon: '📤' },
    peek:      { color: '#06b6d4', border: 'rgba(6,182,212,0.5)',   bg: 'rgba(6,182,212,0.14)',  label: 'PEEK',    icon: '👁' },
    read:      { color: '#06b6d4', border: 'rgba(6,182,212,0.5)',   bg: 'rgba(6,182,212,0.14)',  label: 'PEEK',    icon: '👁' },
    init:      { color: '#a855f7', border: 'rgba(168,85,247,0.5)',  bg: 'rgba(168,85,247,0.14)', label: 'INIT',    icon: '⚡' },
    highlight: { color: '#f59e0b', border: 'rgba(245,158,11,0.5)',  bg: 'rgba(245,158,11,0.14)', label: 'ACTIVE',  icon: '🔍' },
    compare:   { color: '#eab308', border: 'rgba(234,179,8,0.5)',   bg: 'rgba(234,179,8,0.14)',  label: 'COMP',    icon: '⚖' },
  },
  light: {
    enqueue:   { color: '#059669', border: 'rgba(5,150,105,0.45)',  bg: 'rgba(5,150,105,0.1)',   label: 'ENQUEUE', icon: '📥' },
    append:    { color: '#059669', border: 'rgba(5,150,105,0.45)',  bg: 'rgba(5,150,105,0.1)',   label: 'ENQUEUE', icon: '📥' },
    write:     { color: '#059669', border: 'rgba(5,150,105,0.45)',  bg: 'rgba(5,150,105,0.1)',   label: 'ENQUEUE', icon: '📥' },
    dequeue:   { color: '#e11d48', border: 'rgba(225,29,72,0.4)',   bg: 'rgba(225,29,72,0.08)',  label: 'DEQUEUE', icon: '📤' },
    peek:      { color: '#0891b2', border: 'rgba(8,145,178,0.4)',   bg: 'rgba(8,145,178,0.08)',  label: 'PEEK',    icon: '👁' },
    read:      { color: '#0891b2', border: 'rgba(8,145,178,0.4)',   bg: 'rgba(8,145,178,0.08)',  label: 'PEEK',    icon: '👁' },
    init:      { color: '#9333ea', border: 'rgba(147,51,234,0.4)',  bg: 'rgba(147,51,234,0.08)', label: 'INIT',    icon: '⚡' },
    highlight: { color: '#d97706', border: 'rgba(217,119,6,0.4)',   bg: 'rgba(217,119,6,0.08)',  label: 'ACTIVE',  icon: '🔍' },
    compare:   { color: '#ca8a04', border: 'rgba(202,138,4,0.4)',   bg: 'rgba(202,138,4,0.08)',  label: 'COMP',    icon: '⚖' },
  },
};

function getOpMeta(type, theme = 'dark') {
  const table = OP_META[theme] || OP_META.dark;
  const normalized = (type || 'highlight').toLowerCase();
  if (normalized.includes('enqueue') || normalized.includes('append')) return table.enqueue;
  if (normalized.includes('dequeue') || normalized.includes('delete') || normalized.includes('pop')) return table.dequeue;
  if (normalized.includes('peek') || normalized.includes('read') || normalized.includes('front')) return table.peek;
  if (normalized.includes('init')) return table.init;
  return table[normalized] || table.highlight;
}

export default function QueueVisualizer({
  queueState  = [],
  arrayState  = [],
  activeIndex = null,
  type        = 'highlight',
  description = '',
  step        = 0,
  totalSteps  = 0,
  userOutput  = '',
  theme       = 'dark',
}) {
  const pal = PALETTE[theme] || PALETTE.dark;
  // Use queueState if provided, fallback to arrayState (queue implemented on array)
  const items = useMemo(() => {
    if (Array.isArray(queueState) && queueState.length > 0) return queueState;
    if (Array.isArray(arrayState)) return arrayState;
    return [];
  }, [queueState, arrayState]);

  const [showAddresses, setShowAddresses] = useState(false);
  const [zoom, setZoom]                   = useState(1);
  const [stdoutH, setStdoutH]             = useState(110);
  const [resizing, setResizing]           = useState(false);
  const [flashSet, setFlashSet]           = useState(new Set());
  const prevStateRef                      = useRef([]);
  const containerRef                      = useRef(null);

  const frontIndex = items.length > 0 ? 0 : null;
  const rearIndex  = items.length > 0 ? items.length - 1 : null;
  const frontValue = frontIndex !== null ? items[frontIndex] : null;

  /* ── Mutation & Flash Detection ── */
  useEffect(() => {
    const prev = prevStateRef.current;
    const changed = new Set();
    items.forEach((val, idx) => {
      if (prev[idx] !== val) changed.add(idx);
    });
    if (activeIndex !== null && activeIndex >= 0) changed.add(activeIndex);
    if (rearIndex !== null && (prev.length !== items.length)) changed.add(rearIndex);

    setFlashSet(changed);
    prevStateRef.current = [...items];
    const t = setTimeout(() => setFlashSet(new Set()), 600);
    return () => clearTimeout(t);
  }, [items, activeIndex, rearIndex]);

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

  const opMeta = getOpMeta(type, theme);
  const isEmpty = items.length === 0;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: pal.panelBg,
        backgroundImage: pal.panelBgImage,
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
          background: pal.headerBg,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: pal.headerBorder,
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
              background: pal.badgeBg,
              border: pal.badgeBorder,
            }}
          >
            <span style={{ fontSize: 14 }}>🚦</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: pal.textPrimary,
                textTransform: 'uppercase',
                letterSpacing: '.06em',
              }}
            >
              Queue (FIFO)
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
              background: pal.sizePillBg,
              border: pal.sizePillBorder,
              fontSize: 11,
              fontWeight: 600,
              color: pal.sizePillText,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: pal.sizePillText, boxShadow: `0 0 6px ${pal.sizePillText}` }} />
            {items.length} {items.length === 1 ? 'Item' : 'Items'}
          </div>

          {/* Front Value Pill */}
          {frontIndex !== null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 6,
                background: pal.frontPillBg,
                border: pal.frontPillBorder,
                fontSize: 11,
                fontWeight: 600,
                color: pal.frontPillText,
              }}
            >
              <span style={{ fontSize: 9, opacity: 0.85, fontWeight: 700 }}>FRONT</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>[{String(frontValue)}]</span>
            </div>
          )}

          {/* Empty Status Badge */}
          {isEmpty && (
            <div
              style={{
                padding: '2px 8px',
                borderRadius: 6,
                background: pal.emptyBadgeBg,
                border: pal.emptyBadgeBorder,
                fontSize: 10.5,
                fontWeight: 600,
                color: pal.emptyBadgeText,
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
                color: pal.stepText,
                fontFamily: "'JetBrains Mono', monospace",
                padding: '2px 7px',
                borderRadius: 4,
                background: pal.stepBg,
                border: pal.stepBorder,
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
              background: showAddresses ? (theme === 'light' ? 'rgba(99, 102, 241, 0.16)' : 'rgba(99, 102, 241, 0.25)') : pal.chipBg,
              border: `1px solid ${showAddresses ? (theme === 'light' ? 'rgba(79, 70, 229, 0.4)' : 'rgba(99, 102, 241, 0.45)') : (theme === 'light' ? '#d0d7de' : 'rgba(255,255,255,0.1)')}`,
              color: showAddresses ? (theme === 'light' ? '#4f46e5' : '#a5b4fc') : pal.chipText,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            <span>0x</span>
            <span>Addr</span>
          </button>

          {/* Zoom controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: pal.chipBg,
              border: pal.chipBorder,
              borderRadius: 6,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(1)))}
              style={{
                background: 'none',
                border: 'none',
                color: pal.chipText,
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
                color: pal.zoomText,
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
                color: pal.chipText,
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
                color: pal.zoomResetText,
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
            background: pal.bannerBg,
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${opMeta.border}`,
            boxShadow: pal.bannerShadow,
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
          {frontIndex !== null && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: pal.bannerTagText,
                fontFamily: "'JetBrains Mono', monospace",
                padding: '2px 8px',
                borderRadius: 4,
                background: pal.bannerTagBg,
              }}
            >
              FRONT [{frontIndex}] · REAR [{rearIndex}]
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
          <HorizontalQueuePipe
            items={items}
            frontIndex={frontIndex}
            rearIndex={rearIndex}
            activeIndex={activeIndex}
            flashSet={flashSet}
            type={type}
            showAddresses={showAddresses}
            theme={theme}
          />
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
              background: resizing ? 'rgba(56, 189, 248, 0.7)' : pal.stdoutDividerIdle,
              transition: resizing ? 'none' : 'background 150ms',
            }}
          />
          <section
            style={{
              height: stdoutH,
              flexShrink: 0,
              background: pal.stdoutBg,
              borderTop: pal.stdoutBorder,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '6px 16px',
                fontSize: 10,
                fontWeight: 700,
                color: pal.stdoutHeaderText,
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                borderBottom: pal.stdoutHeaderBorder,
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
                color: pal.stdoutText,
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
   Horizontal FIFO Pipe — items flow FRONT (dequeue) ➔ ... ➔ REAR (enqueue)
   ══════════════════════════════════════════════════════ */
function HorizontalQueuePipe({ items, frontIndex, rearIndex, activeIndex, flashSet, type, showAddresses, theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const opMeta = getOpMeta(type, theme);
  const isEmpty = items.length === 0;
  const frontStrong = theme === 'light' ? '#e11d48' : '#f43f5e';
  const rearStrong = theme === 'light' ? '#059669' : '#34d399';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {/* Pipe Boundary Headers */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: Math.max(items.length * 90 + 40, 340),
          padding: '0 10px',
        }}
      >
        <span style={{ fontSize: 10.5, color: pal.pipeFrontText, fontWeight: 700, letterSpacing: '.05em' }}>
          ◀ FRONT (Dequeue)
        </span>
        <span style={{ fontSize: 10.5, color: pal.pipeRearText, fontWeight: 700, letterSpacing: '.05em' }}>
          REAR (Enqueue) ▶
        </span>
      </div>

      {/* Horizontal Pipe Cells */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '16px 20px',
          borderRadius: 14,
          background: pal.pipeContainerBg,
          border: pal.pipeContainerBorder,
          boxShadow: pal.pipeContainerShadow,
          minWidth: 340,
          overflowX: 'auto',
        }}
      >
        {isEmpty ? (
          <div style={{ color: pal.emptyText, fontSize: 12, padding: '16px 32px', textAlign: 'center', width: '100%' }}>
            Queue is empty
          </div>
        ) : (
          items.map((val, idx) => {
            const isFront = idx === frontIndex;
            const isRear  = idx === rearIndex;
            const isActive = idx === activeIndex || flashSet.has(idx);
            const hexAddr = '0x' + (0x100 + idx * 0x20).toString(16).toUpperCase();

            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  className={isFront ? 'stack-top-pulse' : ''}
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 10,
                    background: isActive
                      ? opMeta.bg
                      : isFront
                      ? (theme === 'light' ? 'linear-gradient(135deg, rgba(225, 29, 72, 0.14), rgba(8, 145, 178, 0.12))' : 'linear-gradient(135deg, rgba(244, 63, 94, 0.22), rgba(6, 182, 212, 0.18))')
                      : isRear
                      ? (theme === 'light' ? 'linear-gradient(135deg, rgba(5, 150, 105, 0.14), rgba(8, 145, 178, 0.1))' : 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.16))')
                      : pal.cellIdleBg,
                    border: isActive
                      ? `2px solid ${opMeta.color}`
                      : isFront
                      ? `2px solid ${frontStrong}`
                      : isRear
                      ? `2px solid ${rearStrong}`
                      : pal.cellIdleBorder,
                    boxShadow: isActive
                      ? `0 0 16px ${opMeta.color}55`
                      : isFront
                      ? (theme === 'light' ? '0 4px 12px rgba(225, 29, 72, 0.18)' : '0 4px 16px rgba(244, 63, 94, 0.3)')
                      : isRear
                      ? (theme === 'light' ? '0 4px 12px rgba(5, 150, 105, 0.18)' : '0 4px 16px rgba(16, 185, 129, 0.3)')
                      : pal.cellIdleShadow,
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
                      color: isFront ? frontStrong : isRear ? rearStrong : pal.textMuted,
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
                      color: pal.valueTextIdle,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {String(val)}
                  </span>

                  {/* Address or Role */}
                  {showAddresses ? (
                    <span style={{ fontSize: 9, color: pal.addrText, fontFamily: "'JetBrains Mono', monospace" }}>
                      {hexAddr}
                    </span>
                  ) : isFront ? (
                    <span style={{ fontSize: 8.5, fontWeight: 800, color: frontStrong, letterSpacing: '.06em' }}>
                      FRONT
                    </span>
                  ) : isRear ? (
                    <span style={{ fontSize: 8.5, fontWeight: 800, color: rearStrong, letterSpacing: '.06em' }}>
                      REAR
                    </span>
                  ) : null}
                </div>

                {/* Arrow between cells — direction of flow toward front */}
                {idx < items.length - 1 && (
                  <span style={{ color: pal.arrowColor, fontSize: 13 }}>➔</span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Metrics footer */}
      {items.length > 0 && (
        <div
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            background: pal.metricsBg,
            border: pal.metricsBorder,
            fontSize: 10.5,
            color: pal.metricsText,
            lineHeight: 1.6,
          }}
        >
          <strong>Size:</strong> {items.length} &nbsp;·&nbsp; <strong>Access:</strong> O(1) Front/Rear
        </div>
      )}
    </div>
  );
}
