/**
 * ExecutionHistoryPanel
 * ─────────────────────
 * Shows a scrollable log of all execution events (line, call, return, array ops)
 * so users can see what has happened even when lines disappear from view.
 */
export default function ExecutionHistoryPanel({ events = [], currentStep = 0 }) {
  const historyRef = useRef(null);

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
        background: '#0d1117',
        borderTop: '1px solid rgba(255,255,255,.07)',
      }}>
        <div style={{
          padding: '8px 12px',
          fontSize: 10,
          fontWeight: 700,
          color: '#8b949e',
          textTransform: 'uppercase',
          letterSpacing: '.06em',
          borderBottom: '1px solid rgba(255,255,255,.05)',
        }}>
          Execution Log
        </div>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#555',
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
      background: '#0d1117',
      borderTop: '1px solid rgba(255,255,255,.07)',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        fontSize: 10,
        fontWeight: 700,
        color: '#8b949e',
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        borderBottom: '1px solid rgba(255,255,255,.05)',
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
          />
        ))}
      </div>
    </div>
  );
}

function HistoryItem({ event, step, isCurrent }) {
  const { type, description, func, line, sourceLine } = event;

  // Determine icon and color based on event type
  let icon = '●';
  let color = '#8b949e';
  let bgColor = 'transparent';

  switch (type) {
    case 'call':
      icon = '→';
      color = '#60a5fa';
      break;
    case 'return':
      icon = '←';
      color = '#f472b6';
      break;
    case 'line':
      icon = '┃';
      color = '#a3e635';
      break;
    case 'write':
      icon = '✎';
      color = '#60a5fa';
      break;
    case 'read':
      icon = '◎';
      color = '#86efac';
      break;
    case 'swap':
      icon = '⇄';
      color = '#fcd34d';
      break;
    case 'compare':
      icon = '?';
      color = '#f0abfc';
      break;
    case 'init':
      icon = '◈';
      color = '#c4b5fd';
      break;
    default:
      icon = '●';
      color = '#8b949e';
  }

  if (isCurrent) {
    bgColor = 'rgba(76,175,80,.12)';
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
        color: '#555',
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
        color: isCurrent ? '#e6edf3' : '#8b949e',
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
