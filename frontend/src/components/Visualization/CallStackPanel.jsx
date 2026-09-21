/**
 * CallStackPanel
 * ────────────────
 * Right-hand panel: shows the live call stack (bottom → top), the
 * function currently returning (fades out), the source line executing,
 * and the active frame's local variables — with just-changed variables
 * highlighted green for one step.
 *
 * Props (all come straight from a traceGenerator.js event):
 *   callStack      : string[]        e.g. ['<module>', 'findGCD']
 *   currentFunc    : string|null
 *   returningFrame : string|null     set only on the 'return' step
 *   currentLine    : number|null
 *   sourceLine     : string|null
 *   locals         : object|null     {varName: reprString}
 *   changedVars    : string[]
 *   type           : string          'call'|'line'|'return'|array-op types
 *   description    : string
 */
const PALETTE = {
  dark: {
    bg: '#0d1117', headerBg: '#161b22', lineBg: '#10151c',
    border: 'rgba(255,255,255,.07)', borderSoft: 'rgba(255,255,255,.06)',
    text: '#e6edf3', textMuted: '#8b949e', textFaint: '#5c6470', textDim: '#c9d1d9',
    frameBg: 'rgba(255,255,255,.03)', frameBorder: 'rgba(255,255,255,.08)',
    varBg: 'rgba(255,255,255,.02)', varBorder: 'rgba(255,255,255,.06)',
    activeText: '#86efac', activeBg: 'rgba(76,175,80,.14)', activeBorder: 'rgba(76,175,80,.4)',
    returnText: '#ffb4a2', returnBg: 'rgba(248,113,113,.12)', returnBorder: 'rgba(248,113,113,.4)',
  },
  light: {
    bg: '#ffffff', headerBg: '#f6f8fa', lineBg: '#f1f5f9',
    border: '#d0d7de', borderSoft: '#e2e8f0',
    text: '#1e293b', textMuted: '#64748b', textFaint: '#94a3b8', textDim: '#475569',
    frameBg: 'rgba(15,23,42,.03)', frameBorder: '#d0d7de',
    varBg: 'rgba(15,23,42,.02)', varBorder: '#e2e8f0',
    activeText: '#15803d', activeBg: 'rgba(22,163,74,.12)', activeBorder: 'rgba(22,163,74,.4)',
    returnText: '#be123c', returnBg: 'rgba(225,29,72,.10)', returnBorder: 'rgba(225,29,72,.35)',
  },
};

export default function CallStackPanel({
  callStack = [],
  currentFunc = null,
  returningFrame = null,
  currentLine = null,
  sourceLine = null,
  locals = null,
  changedVars = [],
  type = '',
  description = '',
  theme = 'dark',
}) {
  const c = PALETTE[theme] || PALETTE.dark;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: c.bg, borderLeft: `1px solid ${c.border}`,
      fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '5px 16px', background: c.headerBg,
        borderBottom: `1px solid ${c.borderSoft}`,
        fontSize: 10, fontWeight: 700, color: c.textMuted,
        textTransform: 'uppercase', letterSpacing: '.06em',
        flexShrink: 0,
      }}>
        Call Stack
      </div>

      {/* ── Stack frames ── */}
      <div style={{
        flexShrink: 0, padding: 12, display: 'flex', flexDirection: 'column-reverse',
        gap: 6, maxHeight: '45%', overflowY: 'auto',
      }}>
        {callStack.length === 0 ? (
          <EmptyHint text="Run your code to see the call stack" theme={theme} />
        ) : (
          callStack.map((frame, idx) => {
            // Extract function name from frame object
            const fnName = typeof frame === 'string' ? frame : (frame?.func || '?');
            const isTop        = idx === callStack.length - 1;
            const isReturning  = returningFrame?.func === fnName && isTop;
            const isModule     = fnName === '<module>';
            return (
              <div
                key={`${fnName}-${idx}`}
                style={{
                  padding: '8px 12px', borderRadius: 8,
                  fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: isTop ? 700 : 500,
                  color: isReturning ? c.returnText : (isTop ? c.activeText : c.textDim),
                  background: isReturning
                    ? c.returnBg
                    : isTop
                      ? c.activeBg
                      : c.frameBg,
                  border: `1px solid ${
                    isReturning ? c.returnBorder
                    : isTop ? c.activeBorder
                    : c.frameBorder
                  }`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 180ms ease',
                }}
              >
                <span>{isModule ? '⌂ <module>' : `ƒ ${fnName}()`}</span>
                {isReturning && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: c.returnText, letterSpacing: '.04em' }}>
                    RETURNING ↩
                  </span>
                )}
                {isTop && !isReturning && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: c.activeText, letterSpacing: '.04em' }}>
                    ● ACTIVE
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Current line ── */}
      <div style={{
        flexShrink: 0, padding: '10px 16px',
        borderTop: `1px solid ${c.borderSoft}`,
        borderBottom: `1px solid ${c.borderSoft}`,
        background: c.lineBg,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
          {currentLine != null ? `Line ${currentLine}` : 'Line'}
        </div>
        <code style={{
          display: 'block', fontSize: 12.5, color: c.text,
          fontFamily: "'JetBrains Mono', monospace",
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {sourceLine || description || '—'}
        </code>
      </div>

      {/* ── Live variables ── */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto', padding: 12,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          Variables {currentFunc && currentFunc !== '<module>' ? `· ${currentFunc}()` : ''}
        </div>

        {!locals || Object.keys(locals).length === 0 ? (
          <EmptyHint text="No local variables yet" theme={theme} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Object.entries(locals).map(([name, val]) => {
              const isChanged = changedVars.includes(name);
              return (
                <div
                  key={name}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', borderRadius: 6,
                    background: isChanged ? c.activeBg : c.varBg,
                    border: `1px solid ${isChanged ? c.activeBorder : c.varBorder}`,
                    transition: 'all 200ms ease',
                  }}
                >
                  <span style={{
                    fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace",
                    color: isChanged ? c.activeText : c.textMuted, fontWeight: isChanged ? 700 : 500,
                  }}>
                    {name}
                  </span>
                  <span style={{
                    fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace",
                    color: isChanged ? c.text : c.textDim,
                    maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {val}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Step description footer ── */}
      {description && (
        <div style={{
          flexShrink: 0, padding: '8px 16px',
          borderTop: `1px solid ${c.borderSoft}`,
          fontSize: 11.5, color: c.textMuted, lineHeight: 1.5,
        }}>
          {description}
        </div>
      )}
    </div>
  );
}

function EmptyHint({ text, theme = 'dark' }) {
  const c = PALETTE[theme] || PALETTE.dark;
  return (
    <div style={{
      fontSize: 12, color: c.textFaint, fontStyle: 'italic',
      padding: '10px 4px',
    }}>
      {text}
    </div>
  );
}
