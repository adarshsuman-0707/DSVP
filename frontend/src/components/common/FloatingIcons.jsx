/* ── Ambient floating data-structure icons — pure CSS drift,
   purely decorative, adds life to auth pages without distracting
   from the form. Hidden on very small screens via CSS. ── */
const ICONS = [
  { icon: '🔗', top: '12%', left: '8%',  delay: '0s',   size: 26 },
  { icon: '🌳', top: '68%', left: '6%',  delay: '1.2s', size: 30 },
  { icon: '📊', top: '20%', left: '92%', delay: '0.6s', size: 24 },
  { icon: '🧮', top: '78%', left: '90%', delay: '1.8s', size: 26 },
  { icon: '⚡', top: '46%', left: '4%',  delay: '2.4s', size: 20 },
  { icon: '🧩', top: '52%', left: '94%', delay: '0.9s', size: 22 },
];

export default function FloatingIcons() {
  return (
    <div className="floating-icons" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {ICONS.map((it, i) => (
        <span
          key={i}
          style={{
            position: 'absolute', top: it.top, left: it.left,
            fontSize: it.size, opacity: 0.16, filter: 'grayscale(0.2)',
            animation: `iconDrift 7s ease-in-out ${it.delay} infinite`,
          }}
        >{it.icon}</span>
      ))}
      <style>{`
        @keyframes iconDrift {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-18px) rotate(8deg); }
        }
        @media (max-width: 640px) {
          .floating-icons { display: none; }
        }
      `}</style>
    </div>
  );
}
