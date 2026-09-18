/* ── Hero product visual: a mock "editor + live trace" card ──
   Reuses the app's own animation vocabulary (pulse-active,
   arrow-flowing, node-enter — defined in index.css and used
   throughout the real Workspace) so the marketing page actually
   looks like the product, not a generic template. ── */
const nodes = [
  { label: 'head', value: 12 },
  { label: null, value: 47 },
  { label: null, value: 8 },
  { label: 'tail', value: 23 },
];

export default function HeroCodeVisual() {
  return (
    <div style={{
      width: '100%', maxWidth: 440, borderRadius: 18,
      background: 'linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03))',
      border: '1px solid rgba(255,255,255,.14)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      boxShadow: '0 30px 60px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08)',
      overflow: 'hidden',
    }}>
      {/* fake window chrome */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.08)',
        background: 'rgba(0,0,0,.15)',
      }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#E15759' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F2A93B' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4CAF50' }} />
        <span style={{
          marginLeft: 10, fontSize: 11.5, fontFamily: "'JetBrains Mono',monospace",
          color: 'rgba(255,255,255,.45)',
        }}>LinkedList.java — live trace</span>
      </div>

      {/* code lines (decorative) */}
      <div style={{ padding: '16px 18px 6px', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, lineHeight: 1.9 }}>
        <CodeLine indent={0}><Kw>Node</Kw> head = <Kw>new</Kw> Node(12);</CodeLine>
        <CodeLine indent={0} active>head.next = <Kw>new</Kw> Node(47);</CodeLine>
        <CodeLine indent={0}>cur = cur.next; <Cm>// step 3 of 6</Cm></CodeLine>
      </div>

      {/* live trace visualization */}
      <div style={{
        padding: '22px 20px 26px', display: 'flex', alignItems: 'center',
        gap: 6, overflowX: 'auto',
      }}>
        {nodes.map((n, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div className={i === 1 ? 'pulse-active node-enter' : 'node-enter'} style={{
              width: 54, borderRadius: 10, padding: '8px 0', textAlign: 'center',
              background: i === 1 ? 'rgba(56,189,248,.18)' : 'rgba(255,255,255,.06)',
              border: `1.5px solid ${i === 1 ? 'rgba(56,189,248,.7)' : 'rgba(255,255,255,.18)'}`,
              animationDelay: `${i * 120}ms`,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{n.value}</div>
              {n.label && (
                <div style={{ fontSize: 9, color: '#4ade80', fontWeight: 700, marginTop: 2, textTransform: 'uppercase' }}>{n.label}</div>
              )}
            </div>
            {i < nodes.length - 1 && (
              <svg width="26" height="14" viewBox="0 0 26 14" className="arrow-flowing" style={{ flexShrink: 0 }}>
                <line x1="0" y1="7" x2="20" y2="7" stroke="#4ade80" strokeWidth="2" />
                <polygon points="18,3 24,7 18,11" fill="#4ade80" />
              </svg>
            )}
          </div>
        ))}
      </div>

      {/* playback bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 18px 16px',
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff',
        }}>▶</span>
        <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
          <div style={{ width: '48%', height: '100%', background: 'linear-gradient(90deg,#2E74B5,#4CAF50)', borderRadius: 4 }} />
        </div>
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,.45)', fontFamily: "'JetBrains Mono',monospace" }}>3 / 6</span>
      </div>
    </div>
  );
}

function CodeLine({ children, active }) {
  return (
    <div style={{
      color: active ? '#e2e8f0' : 'rgba(226,232,240,.55)',
      background: active ? 'rgba(76,175,80,.12)' : 'transparent',
      borderLeft: active ? '2px solid #4CAF50' : '2px solid transparent',
      paddingLeft: 10, marginLeft: -2,
    }}>{children}</div>
  );
}
function Kw({ children }) { return <span style={{ color: '#60a5fa' }}>{children}</span>; }
function Cm({ children }) { return <span style={{ color: 'rgba(148,163,184,.7)' }}>{children}</span>; }
