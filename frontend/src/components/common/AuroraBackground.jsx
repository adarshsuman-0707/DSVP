/* ── Shared decorative backdrop: animated aurora glow + dot grid ──
   Pure CSS/SVG, no images, no extra deps. Used behind dark hero /
   auth sections to give the app a designed, "real product" feel
   instead of a flat gradient. ── */
export default function AuroraBackground({ variant = 'hero' }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* dot grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, #000 40%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, #000 40%, transparent 100%)',
      }} />

      {/* rotating aurora conic glow */}
      <div className="aurora-spin" style={{
        position: 'absolute', top: '-60%', left: '50%', width: '140%', aspectRatio: '1',
        transform: 'translateX(-50%)',
        background: 'conic-gradient(from 0deg, transparent 0%, rgba(46,116,181,.18) 15%, transparent 30%, rgba(76,175,80,.14) 50%, transparent 65%, rgba(139,92,246,.14) 82%, transparent 100%)',
        borderRadius: '50%',
        filter: 'blur(40px)',
      }} />

      {/* fine noise-like grain via repeating gradient (cheap texture) */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.035, mixBlendMode: 'overlay',
        backgroundImage: 'repeating-linear-gradient(0deg, #fff 0px, transparent 1px, transparent 2px)',
      }} />

      {variant === 'hero' && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, transparent 60%, rgba(15,41,66,.6) 100%)',
        }} />
      )}

      <style>{`
        @keyframes auroraSpin { to { transform: translateX(-50%) rotate(360deg); } }
        .aurora-spin { animation: auroraSpin 40s linear infinite; }
      `}</style>
    </div>
  );
}
