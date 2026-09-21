/**
 * ExecutionHistoryPanel
 * ─────────────────────
 * Shows a scrollable log of all execution events (line, call, return, array ops)
 * so users can see what has happened even when lines disappear from view.
 */
const PALETTE = {
  dark: {
    bg: '#0d1117', border: 'rgba(255,255,255,.07)', borderSoft: 'rgba(255,255,255,.05)',
    text: '#e6edf3', textMuted: '#8b949e', textFaint: '#555', activeBg: 'rgba(76,175,80,.12)',
  },
  light: {
    bg: '#ffffff', border: '#d0d7de', borderSoft: '#e2e8f0',
    text: '#1e293b', textMuted: '#64748b', textFaint: '#94a3b8', activeBg: 'rgba(22,163,74,.10)',
  },
};

const TYPE_COLORS = {
  dark: {
    call: '#60a5fa', return: '#f472b6', line: '#a3e635', write: '#60a5fa',
    read: '#86efac', swap: '#fcd34d', compare: '#f0abfc', init: '#c4b5fd', default: '#8b949e',
  },
  light: {
    call: '#2563eb', return: '#be185d', line: '#4d7c0f', write: '#2563eb',
    read: '#15803d', swap: '#b45309', compare: '#a21caf', init: '#6d28d9', default: '#64748b',
  },
};

export default function ExecutionHistoryPanel({ events = [], currentStep = 0, theme = 'dark' }) {
  const historyRef = useRef(null);
  const c = PALETTE[theme] || PALETTE.dark;

  // Auto-scroll to current step
  useEffect(() => {
    if (historyRef.current) {
      const currentItem = historyRef.current.querySelector(`[data-step="${currentStep}"]`);
      if (currentItem) {
        currentItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [currentStep]);

  if (!events || events.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: c.bg,
        borderTop: `1px solid ${c.border}`,
      }}>
        <div style={{
          padding: '8px 12px',
          fontSize: 10,
          fontWeight: 700,
          color: c.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          borderBottom: `1px solid ${c.borderSoft}`,
        }}>
          Execution Log
        </div>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: c.textFaint,
          fontSize: 12,
        }}>
          No execution history
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: c.bg,
      borderTop: `1px solid ${c.border}`,
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        fontSize: 10,
        fontWeight: 700,
        color: c.textMuted,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        borderBottom: `1px solid ${c.borderSoft}`,
        flexShrink: 0,
      }}>
        Execution Log
      </div>

      {/* Scrollable list */}
      <div
        ref={historyRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 0',
        }}
      >
        {events.map((event, idx) => (
          <HistoryItem
            key={idx}
            event={event}
            step={idx + 1}
            isCurrent={idx + 1 === currentStep}
            theme={theme}
          />
        ))}
      </div>
    </div>
  );
}

function HistoryItem({ event, step, isCurrent, theme = 'dark' }) {
  const { type, description, func, line, sourceLine } = event;
  const c = PALETTE[theme] || PALETTE.dark;
  const types = TYPE_COLORS[theme] || TYPE_COLORS.dark;

  // Determine icon and color based on event type
  let icon = '●';
  let color = types.default;
  let bgColor = 'transparent';

  switch (type) {
    case 'call':
      icon = '→';
      color = types.call;
      break;
    case 'return':
      icon = '←';
      color = types.return;
      break;
    case 'line':
      icon = '┃';
      color = types.line;
      break;
    case 'write':
      icon = '✎';
      color = types.write;
      break;
    case 'read':
      icon = '◎';
      color = types.read;
      break;
    case 'swap':
      icon = '⇄';
      color = types.swap;
      break;
    case 'compare':
      icon = '?';
      color = types.compare;
      break;
    case 'init':
      icon = '◈';
      color = types.init;
      break;
    default:
      icon = '●';
      color = types.default;
  }

  if (isCurrent) {
    bgColor = c.activeBg;
  }

  // Build display text
  let displayText = '';
  if (type === 'line' && sourceLine) {
    displayText = `Line ${line}: ${sourceLine.trim()}`;
  } else if (type === 'call') {
    displayText = `Call ${func}`;
  } else if (type === 'return') {
    displayText = `Return from ${func}`;
  } else if (description) {
    displayText = description;
  } else {
    displayText = type;
  }

  return (
    <div
      data-step={step}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '6px 12px',
        background: bgColor,
        borderLeft: isCurrent ? `3px solid ${color}` : '3px solid transparent',
        transition: 'background 200ms ease, border-color 200ms ease',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', monospace",
        cursor: 'default',
      }}
    >
      {/* Step number */}
      <span style={{
        color: c.textFaint,
        fontSize: 10,
        fontWeight: 600,
        minWidth: 28,
        textAlign: 'right',
        flexShrink: 0,
      }}>
        {step}
      </span>

      {/* Icon */}
      <span style={{
        color,
        fontSize: 12,
        lineHeight: 1,
        flexShrink: 0,
        marginTop: 1,
      }}>
        {icon}
      </span>

      {/* Description */}
      <span style={{
        color: isCurrent ? c.text : c.textMuted,
        flex: 1,
        lineHeight: 1.4,
        wordBreak: 'break-word',
      }}>
        {displayText}
      </span>
    </div>
  );
}

// Add missing import
import { useRef, useEffect } from 'react';
