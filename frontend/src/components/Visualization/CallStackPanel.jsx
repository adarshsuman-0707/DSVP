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
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#0d1117', borderLeft: '1px solid rgba(255,255,255,.07)',
      fontFamily: "'Inter', system-ui, sans-serif", overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '5px 16px', background: '#161b22',
        borderBottom: '1px solid rgba(255,255,255,.06)',
        fontSize: 10, fontWeight: 700, color: '#8b949e',
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
          <EmptyHint text="Run your code to see the call stack" />
        ) : (
          callStack.map((fn, idx) => {
            const isTop        = idx === callStack.length - 1;
            const isReturning  = returningFrame === fn && isTop;
            const isModule     = fn === '<module>';
            return (
              <div
                key={`${fn}-${idx}`}
                style={{
                  padding: '8px 12px', borderRadius: 8,
                  fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: isTop ? 700 : 500,
                  color: isReturning ? '#ffb4a2' : (isTop ? '#86efac' : '#c9d1d9'),
                  background: isReturning
                    ? 'rgba(248,113,113,.12)'
                    : isTop
                      ? 'rgba(76,175,80,.14)'
                      : 'rgba(255,255,255,.03)',
                  border: `1px solid ${
                    isReturning ? 'rgba(248,113,113,.4)'
                    : isTop ? 'rgba(76,175,80,.4)'
                    : 'rgba(255,255,255,.08)'
                  }`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 180ms ease',
                }}
              >
                <span>{isModule ? '⌂ <module>' : `ƒ ${fn}()`}</span>
                {isReturning && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#ffb4a2', letterSpacing: '.04em' }}>
                    RETURNING ↩
                  </span>
                )}
                {isTop && !isReturning && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#86efac', letterSpacing: '.04em' }}>
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
        borderTop: '1px solid rgba(255,255,255,.06)',
        borderBottom: '1px solid rgba(255,255,255,.06)',
        background: '#10151c',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
          {currentLine != null ? `Line ${currentLine}` : 'Line'}
        </div>
        <code style={{
          display: 'block', fontSize: 12.5, color: '#e6edf3',
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
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
          Variables {currentFunc && currentFunc !== '<module>' ? `· ${currentFunc}()` : ''}
        </div>

        {!locals || Object.keys(locals).length === 0 ? (
          <EmptyHint text="No local variables yet" />
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
                    background: isChanged ? 'rgba(76,175,80,.14)' : 'rgba(255,255,255,.02)',
                    border: `1px solid ${isChanged ? 'rgba(76,175,80,.4)' : 'rgba(255,255,255,.06)'}`,
                    transition: 'all 200ms ease',
                  }}
                >
                  <span style={{
                    fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace",
                    color: isChanged ? '#86efac' : '#8b949e', fontWeight: isChanged ? 700 : 500,
                  }}>
                    {name}
                  </span>
                  <span style={{
                    fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace",
                    color: isChanged ? '#e6edf3' : '#c9d1d9',
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
          borderTop: '1px solid rgba(255,255,255,.06)',
          fontSize: 11.5, color: '#8b949e', lineHeight: 1.5,
        }}>
          {description}
        </div>
      )}
    </div>
  );
}

function EmptyHint({ text }) {
  return (
    <div style={{
      fontSize: 12, color: '#5c6470', fontStyle: 'italic',
      padding: '10px 4px',
    }}>
      {text}
    </div>
  );
}
