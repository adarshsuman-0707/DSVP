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
    textFainter: '#475569',
    chipBg: 'rgba(255,255,255,0.05)',
    chipBorder: '1px solid rgba(255,255,255,0.1)',
    chipText: '#94a3b8',
    sizePillBg: 'rgba(56, 189, 248, 0.1)',
    sizePillBorder: '1px solid rgba(56, 189, 248, 0.25)',
    sizePillText: '#38bdf8',
    topPillBg: 'rgba(16, 185, 129, 0.12)',
    topPillBorder: '1px solid rgba(16, 185, 129, 0.3)',
    topPillText: '#34d399',
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
    bucketGateText: '#6366f1',
    bucketGateBorder: '1.5px dashed rgba(99, 102, 241, 0.3)',
    bucketGateSubText: '#64748b',
    bucketBg: 'linear-gradient(180deg, rgba(30, 41, 59, 0.35) 0%, rgba(15, 23, 42, 0.75) 100%)',
    bucketBorderSide: '2.5px solid rgba(129, 140, 248, 0.45)',
    bucketBorderBottom: '4px solid #6366f1',
    bucketShadow: '0 12px 36px rgba(0, 0, 0, 0.5), inset 0 -4px 12px rgba(99, 102, 241, 0.2)',
    emptyIconBg: 'rgba(255,255,255,0.03)',
    emptyIconBorder: '1.5px dashed rgba(255,255,255,0.1)',
    emptyText: '#64748b',
    emptySubText: '#475569',
    cellIdleBg: 'rgba(30, 41, 59, 0.8)',
    cellIdleBorder: '1px solid rgba(255, 255, 255, 0.1)',
    cellIdleShadow: '0 2px 6px rgba(0,0,0,0.3)',
    indexBadgeIdleText: '#64748b',
    indexBadgeBg: 'rgba(0,0,0,0.3)',
    addrText: '#818cf8',
    valueTextIdle: '#f1f5f9',
    baseText: '#64748b',
    metricsBg: 'rgba(255,255,255,0.03)',
    metricsBorder: '1px solid rgba(255,255,255,0.07)',
    metricsText: '#94a3b8',
    tapeHeaderBottom: '#6366f1',
    tapeContainerBg: 'rgba(15, 23, 42, 0.65)',
    tapeContainerBorder: '1.5px solid rgba(255, 255, 255, 0.08)',
    tapeContainerShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
    tapeCellIdleBg: 'rgba(30, 41, 59, 0.75)',
    tapeArrowColor: 'rgba(255,255,255,0.2)',
    valueTextTape: '#ffffff',
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
    textFainter: '#94a3b8',
    chipBg: 'rgba(15, 23, 42, 0.04)',
    chipBorder: '1px solid #d0d7de',
    chipText: '#475569',
    sizePillBg: 'rgba(2, 132, 199, 0.08)',
    sizePillBorder: '1px solid rgba(2, 132, 199, 0.25)',
    sizePillText: '#0284c7',
    topPillBg: 'rgba(5, 150, 105, 0.1)',
    topPillBorder: '1px solid rgba(5, 150, 105, 0.3)',
    topPillText: '#059669',
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
    bucketGateText: '#4f46e5',
    bucketGateBorder: '1.5px dashed rgba(79, 70, 229, 0.35)',
    bucketGateSubText: '#64748b',
    bucketBg: 'linear-gradient(180deg, rgba(226, 232, 240, 0.5) 0%, rgba(241, 245, 249, 0.9) 100%)',
    bucketBorderSide: '2.5px solid rgba(99, 102, 241, 0.4)',
    bucketBorderBottom: '4px solid #4f46e5',
    bucketShadow: '0 10px 24px rgba(15, 23, 42, 0.1), inset 0 -4px 10px rgba(99, 102, 241, 0.1)',
    emptyIconBg: 'rgba(15, 23, 42, 0.03)',
    emptyIconBorder: '1.5px dashed #d0d7de',
    emptyText: '#64748b',
    emptySubText: '#94a3b8',
    cellIdleBg: '#ffffff',
    cellIdleBorder: '1px solid #d0d7de',
    cellIdleShadow: '0 2px 6px rgba(15,23,42,0.06)',
    indexBadgeIdleText: '#64748b',
    indexBadgeBg: 'rgba(15,23,42,0.06)',
    addrText: '#6366f1',
    valueTextIdle: '#1e293b',
    baseText: '#64748b',
    metricsBg: 'rgba(15, 23, 42, 0.03)',
    metricsBorder: '1px solid #e2e8f0',
    metricsText: '#475569',
    tapeHeaderBottom: '#4f46e5',
    tapeContainerBg: '#ffffff',
    tapeContainerBorder: '1.5px solid #d0d7de',
    tapeContainerShadow: '0 6px 20px rgba(15, 23, 42, 0.08)',
    tapeCellIdleBg: '#f6f8fa',
    tapeArrowColor: 'rgba(15,23,42,0.25)',
    valueTextTape: '#0f172a',
  },
};

/* ── Operation Color & Icon Registry ──
   Light variants keep the same semantic color per op but darken it a touch
   and drop fill opacity so text/borders stay legible on a white background. */
const OP_META = {
  dark: {
    push:      { color: '#10b981', border: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.14)', label: 'PUSH',  icon: '📥' },
    append:    { color: '#10b981', border: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.14)', label: 'PUSH',  icon: '📥' },
    write:     { color: '#10b981', border: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.14)', label: 'PUSH',  icon: '📥' },
    pop:       { color: '#f43f5e', border: 'rgba(244,63,94,0.5)',   bg: 'rgba(244,63,94,0.14)',  label: 'POP',   icon: '📤' },
    peek:      { color: '#06b6d4', border: 'rgba(6,182,212,0.5)',   bg: 'rgba(6,182,212,0.14)',  label: 'PEEK',  icon: '👁' },
    read:      { color: '#06b6d4', border: 'rgba(6,182,212,0.5)',   bg: 'rgba(6,182,212,0.14)',  label: 'PEEK',  icon: '👁' },
    init:      { color: '#a855f7', border: 'rgba(168,85,247,0.5)',  bg: 'rgba(168,85,247,0.14)', label: 'INIT',  icon: '⚡' },
    highlight: { color: '#f59e0b', border: 'rgba(245,158,11,0.5)',  bg: 'rgba(245,158,11,0.14)', label: 'ACTIVE',icon: '🔍' },
    compare:   { color: '#eab308', border: 'rgba(234,179,8,0.5)',   bg: 'rgba(234,179,8,0.14)',  label: 'COMP',  icon: '⚖' },
  },
  light: {
    push:      { color: '#059669', border: 'rgba(5,150,105,0.45)',  bg: 'rgba(5,150,105,0.1)',  label: 'PUSH',  icon: '📥' },
    append:    { color: '#059669', border: 'rgba(5,150,105,0.45)',  bg: 'rgba(5,150,105,0.1)',  label: 'PUSH',  icon: '📥' },
    write:     { color: '#059669', border: 'rgba(5,150,105,0.45)',  bg: 'rgba(5,150,105,0.1)',  label: 'PUSH',  icon: '📥' },
    pop:       { color: '#e11d48', border: 'rgba(225,29,72,0.4)',   bg: 'rgba(225,29,72,0.08)', label: 'POP',   icon: '📤' },
    peek:      { color: '#0891b2', border: 'rgba(8,145,178,0.4)',   bg: 'rgba(8,145,178,0.08)', label: 'PEEK',  icon: '👁' },
    read:      { color: '#0891b2', border: 'rgba(8,145,178,0.4)',   bg: 'rgba(8,145,178,0.08)', label: 'PEEK',  icon: '👁' },
    init:      { color: '#9333ea', border: 'rgba(147,51,234,0.4)',  bg: 'rgba(147,51,234,0.08)',label: 'INIT',  icon: '⚡' },
    highlight: { color: '#d97706', border: 'rgba(217,119,6,0.4)',   bg: 'rgba(217,119,6,0.08)', label: 'ACTIVE',icon: '🔍' },
    compare:   { color: '#ca8a04', border: 'rgba(202,138,4,0.4)',   bg: 'rgba(202,138,4,0.08)', label: 'COMP',  icon: '⚖' },
  },
};

function getOpMeta(type, theme = 'dark') {
  const table = OP_META[theme] || OP_META.dark;
  const normalized = (type || 'highlight').toLowerCase();
  if (normalized.includes('push') || normalized.includes('append')) return table.push;
  if (normalized.includes('pop')) return table.pop;
  if (normalized.includes('peek') || normalized.includes('read')) return table.peek;
  if (normalized.includes('init')) return table.init;
  return table[normalized] || table.highlight;
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
  theme       = 'dark',
}) {
  const pal = PALETTE[theme] || PALETTE.dark;
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
            <span style={{ fontSize: 14 }}>📚</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: pal.textPrimary,
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

          {/* Top Value Pill */}
          {topIndex !== null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 6,
                background: pal.topPillBg,
                border: pal.topPillBorder,
                fontSize: 11,
                fontWeight: 600,
                color: pal.topPillText,
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
              background: pal.chipBg,
              border: pal.chipBorder,
              color: pal.chipText,
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
          {topIndex !== null && (
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
              theme={theme}
            />
          ) : (
            <HorizontalStackTape
              items={items}
              topIndex={topIndex}
              activeIndex={activeIndex}
              flashSet={flashSet}
              type={type}
              showAddresses={showAddresses}
              theme={theme}
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
   VIEW 1: Vertical Cylinder / Bucket (LIFO Container)
   ══════════════════════════════════════════════════════ */
function VerticalStackBucket({ items, topIndex, activeIndex, flashSet, type, showAddresses, theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const opMeta = getOpMeta(type, theme);
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
            borderBottom: pal.bucketGateBorder,
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 9.5, color: pal.bucketGateText, fontWeight: 700, letterSpacing: '.06em' }}>
            ▲ PUSH / POP GATE
          </span>
          <span style={{ fontSize: 9.5, color: pal.bucketGateSubText, fontFamily: "'JetBrains Mono', monospace" }}>
            LIFO Order
          </span>
        </div>

        {/* Bucket Container */}
        <div
          style={{
            width: 220,
            minHeight: 280,
            background: pal.bucketBg,
            borderLeft: pal.bucketBorderSide,
            borderRight: pal.bucketBorderSide,
            borderBottom: pal.bucketBorderBottom,
            borderRadius: '0 0 10px 10px',
            boxShadow: pal.bucketShadow,
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
                color: pal.textFainter,
                textAlign: 'center',
                padding: 16,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: pal.emptyIconBg,
                  border: pal.emptyIconBorder,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                📥
              </div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: pal.emptyText, lineHeight: 1.5 }}>
                Stack is empty<br />
                <span style={{ fontSize: 11, color: pal.emptySubText }}>Items push from top</span>
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
                      ? (theme === 'light' ? 'linear-gradient(135deg, rgba(5, 150, 105, 0.16), rgba(8, 145, 178, 0.14))' : 'linear-gradient(135deg, rgba(16, 185, 129, 0.22), rgba(6, 182, 212, 0.2))')
                      : pal.cellIdleBg,
                    border: isActive
                      ? `2px solid ${opMeta.color}`
                      : isTop
                      ? (theme === 'light' ? '2px solid #059669' : '2px solid #34d399')
                      : pal.cellIdleBorder,
                    boxShadow: isActive
                      ? `0 0 16px ${opMeta.color}44`
                      : isTop
                      ? (theme === 'light' ? '0 4px 12px rgba(5, 150, 105, 0.18)' : '0 4px 14px rgba(16, 185, 129, 0.3)')
                      : pal.cellIdleShadow,
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
                        color: isTop ? (theme === 'light' ? '#059669' : '#34d399') : pal.indexBadgeIdleText,
                        fontFamily: "'JetBrains Mono', monospace",
                        padding: '1px 5px',
                        borderRadius: 4,
                        background: pal.indexBadgeBg,
                      }}
                    >
                      [{idx}]
                    </span>
                    {showAddresses && (
                      <span
                        style={{
                          fontSize: 9.5,
                          color: pal.addrText,
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
                      color: isActive ? (theme === 'light' ? '#0f172a' : '#ffffff') : isTop ? (theme === 'light' ? '#065f46' : '#ecfdf5') : pal.valueTextIdle,
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
                      color: isTop ? '#10b981' : idx === 0 ? pal.bucketGateText : pal.textFainter,
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
            background: theme === 'light' ? 'linear-gradient(90deg, #cbd5e1 0%, #4f46e5 50%, #cbd5e1 100%)' : 'linear-gradient(90deg, #334155 0%, #6366f1 50%, #334155 100%)',
            borderRadius: '0 0 8px 8px',
            boxShadow: '0 6px 16px rgba(99, 102, 241, 0.35)',
            marginTop: 1,
          }}
        />
        <span style={{ fontSize: 10, color: pal.baseText, fontWeight: 600, marginTop: 6, letterSpacing: '.04em' }}>
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
              background: pal.metricsBg,
              border: pal.metricsBorder,
              fontSize: 10.5,
              color: pal.metricsText,
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
function HorizontalStackTape({ items, topIndex, activeIndex, flashSet, type, showAddresses, theme = 'dark' }) {
  const pal = PALETTE[theme] || PALETTE.dark;
  const opMeta = getOpMeta(type, theme);
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
        <span style={{ fontSize: 10.5, color: pal.tapeHeaderBottom, fontWeight: 700, letterSpacing: '.05em' }}>
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
          background: pal.tapeContainerBg,
          border: pal.tapeContainerBorder,
          boxShadow: pal.tapeContainerShadow,
          minWidth: 320,
          overflowX: 'auto',
        }}
      >
        {isEmpty ? (
          <div style={{ color: pal.emptyText, fontSize: 12, padding: '16px 32px', textAlign: 'center', width: '100%' }}>
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
                      ? (theme === 'light' ? 'linear-gradient(135deg, rgba(5, 150, 105, 0.18), rgba(8, 145, 178, 0.14))' : 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 182, 212, 0.2))')
                      : pal.tapeCellIdleBg,
                    border: isActive
                      ? `2px solid ${opMeta.color}`
                      : isTop
                      ? (theme === 'light' ? '2px solid #059669' : '2px solid #34d399')
                      : pal.cellIdleBorder,
                    boxShadow: isActive
                      ? `0 0 16px ${opMeta.color}55`
                      : isTop
                      ? (theme === 'light' ? '0 4px 14px rgba(5, 150, 105, 0.22)' : '0 4px 16px rgba(16, 185, 129, 0.35)')
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
                      color: isTop ? (theme === 'light' ? '#059669' : '#34d399') : pal.textMuted,
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
                      color: pal.valueTextTape,
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
                  ) : isTop ? (
                    <span style={{ fontSize: 8.5, fontWeight: 800, color: '#10b981', letterSpacing: '.06em' }}>
                      TOP
                    </span>
                  ) : null}
                </div>

                {/* Arrow between cells */}
                {idx < items.length - 1 && (
                  <span style={{ color: pal.tapeArrowColor, fontSize: 13 }}>➔</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
