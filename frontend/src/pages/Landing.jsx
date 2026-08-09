import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/* ── tiny inline helpers ── */
const S = {
  /* layout */
  page: { fontFamily: "'Inter', system-ui, sans-serif", overflowX: 'hidden' },

  /* ── NAV ── */
  nav: {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 5%', height: 64,
    background: 'rgba(15,41,66,.88)', backdropFilter: 'blur(14px)',
    borderBottom: '1px solid rgba(255,255,255,.08)',
  },
  navLogo: { display: 'flex', alignItems: 'center', gap: 10 },
  logoMark: {
    width: 34, height: 34, borderRadius: 8,
    background: 'linear-gradient(135deg,#2E74B5,#4CAF50)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, fontWeight: 800, color: '#fff',
  },
  logoText: { fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-.02em' },
  navLinks: { display: 'flex', alignItems: 'center', gap: 8 },
  navLink: {
    padding: '7px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500,
    color: 'rgba(255,255,255,.8)', textDecoration: 'none',
    transition: 'all 150ms',
  },
  btnOutline: {
    padding: '7px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
    color: '#fff', border: '1.5px solid rgba(255,255,255,.35)',
    background: 'transparent', cursor: 'pointer', textDecoration: 'none',
    transition: 'all 150ms',
  },
  btnPrimary: {
    padding: '8px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600,
    color: '#fff', border: 'none',
    background: 'linear-gradient(135deg,#2E74B5,#1F4E79)',
    cursor: 'pointer', textDecoration: 'none',
    boxShadow: '0 4px 14px rgba(46,116,181,.45)',
    transition: 'all 150ms',
  },

  /* ── HERO ── */
  hero: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', textAlign: 'center',
    padding: '120px 5% 80px',
    background: 'linear-gradient(135deg, #0f2942 0%, #1F4E79 50%, #1a3d5c 100%)',
    position: 'relative', overflow: 'hidden',
  },
  heroBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: 'rgba(46,116,181,.25)', border: '1px solid rgba(46,116,181,.5)',
    borderRadius: 999, padding: '5px 14px', fontSize: 12, fontWeight: 600,
    color: '#93c5fd', marginBottom: 28, letterSpacing: '.04em', textTransform: 'uppercase',
  },
  heroBadgeDot: {
    width: 6, height: 6, borderRadius: '50%', background: '#4CAF50',
    boxShadow: '0 0 6px #4CAF50',
  },
  heroTitle: {
    fontSize: 'clamp(2.4rem, 6vw, 4.2rem)', fontWeight: 800, lineHeight: 1.1,
    color: '#fff', marginBottom: 22, maxWidth: 800,
  },
  heroGradText: {
    background: 'linear-gradient(90deg,#60a5fa,#4CAF50)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  heroSub: {
    fontSize: 'clamp(1rem, 2.2vw, 1.2rem)', color: 'rgba(255,255,255,.7)',
    maxWidth: 600, marginBottom: 44, lineHeight: 1.7,
  },
  heroCta: { display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' },
  ctaPrimary: {
    padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700,
    color: '#fff', border: 'none',
    background: 'linear-gradient(135deg,#2E74B5,#1F4E79)',
    cursor: 'pointer', textDecoration: 'none',
    boxShadow: '0 6px 20px rgba(46,116,181,.5)',
    transition: 'transform 150ms, box-shadow 150ms',
  },
  ctaSecondary: {
    padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700,
    color: '#fff', textDecoration: 'none',
    border: '1.5px solid rgba(255,255,255,.3)',
    background: 'rgba(255,255,255,.08)',
    cursor: 'pointer', transition: 'all 150ms',
  },
};

/* ── STATS ── */
const stats = [
  { value: '12+', label: 'Data Structures' },
  { value: '5',   label: 'Languages' },
  { value: '∞',   label: 'Step-through traces' },
  { value: '100%', label: 'Visual learning' },
];

/* ── FEATURES ── */
const features = [
  {
    icon: '⚡',
    title: 'Live Execution Traces',
    desc: 'Write code, hit Run, and watch every pointer move, every value swap, every node insert — step by step.',
    color: '#2E74B5',
  },
  {
    icon: '🎯',
    title: 'Split-Screen Focus',
    desc: 'Editor and visualization always side-by-side. No tab switching. No lost context. Pure flow.',
    color: '#4CAF50',
  },
  {
    icon: '🎛',
    title: 'Playback Control',
    desc: 'Scrub to any trace step. Play at 0.5x–4x speed. Rewind and replay until it clicks.',
    color: '#F2A93B',
  },
  {
    icon: '🌐',
    title: 'Multi-Language',
    desc: 'Same visualization, any language. Python, C++, Java, C, C# — pick what you know.',
    color: '#E15759',
  },
  {
    icon: '📦',
    title: 'Rich Module Library',
    desc: 'Arrays, linked lists, stacks, queues, trees, graphs — structured modules with curated examples.',
    color: '#8b5cf6',
  },
  {
    icon: '🔒',
    title: 'Progressive Premium',
    desc: 'Advanced modules are always visible. Upgrade when you\'re ready — no hidden paywalls.',
    color: '#F2A93B',
  },
];

/* ── HOW IT WORKS ── */
const steps = [
  { n: '01', title: 'Pick a module', desc: 'Choose a data structure from the catalog — arrays, linked lists, trees, and more.' },
  { n: '02', title: 'Write your code', desc: 'Use the Monaco editor with full syntax highlighting in your preferred language.' },
  { n: '03', title: 'Hit Run', desc: 'The backend executes your code and generates a precise step-by-step trace.' },
  { n: '04', title: 'Watch & learn', desc: 'The visualization plays the trace in sync with your code. Scrub, pause, rewind.' },
];

export default function Landing() {
  const { user } = useAuth();

  return (
    <div style={S.page}>
      {/* ── NAVBAR ── */}
      <nav style={S.nav}>
        <div style={S.navLogo}>
          <div style={S.logoMark}>D</div>
          <span style={S.logoText}>DSVP</span>
        </div>
        <div style={S.navLinks}>
          <a href="#features" style={S.navLink}>Features</a>
          <a href="#how-it-works" style={S.navLink}>How it works</a>
          {user ? (
            <Link to="/dashboard" style={S.btnPrimary}>Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/login"    style={S.btnOutline}>Log in</Link>
              <Link to="/register" style={S.btnPrimary}>Get started</Link>
            </>
          )}
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={S.hero}>
        {/* decorative blobs */}
        <div style={{
          position: 'absolute', top: '-20%', right: '-10%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(46,116,181,.25) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-15%', left: '-8%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(76,175,80,.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={S.heroBadge}>
          <span style={S.heroBadgeDot} />
          Visual · Interactive · Multi-language
        </div>

        <h1 style={S.heroTitle}>
          See your code{' '}
          <span style={S.heroGradText}>think</span>
          {' '}in real time
        </h1>

        <p style={S.heroSub}>
          DSVP turns your algorithms into living, step-by-step animations.
          Write once, visualize instantly — in Python, C++, Java, C, or C#.
        </p>

        <div style={S.heroCta}>
          <Link to="/register" style={S.ctaPrimary}>Start for free →</Link>
          <Link to="/login"    style={S.ctaSecondary}>I have an account</Link>
        </div>

        {/* stats row */}
        <div style={{
          display: 'flex', gap: 48, flexWrap: 'wrap', justifyContent: 'center',
          marginTop: 64,
        }}>
          {stats.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>{s.value}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{
        padding: '100px 5%', background: '#fff',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <span style={{
            display: 'inline-block', background: '#EFF6FF', color: '#2E74B5',
            borderRadius: 999, padding: '4px 14px', fontSize: 12,
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
            marginBottom: 16,
          }}>Features</span>
          <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>
            Everything you need to master DSA
          </h2>
          <p style={{ color: '#64748b', maxWidth: 520, margin: '0 auto', fontSize: 16, lineHeight: 1.7 }}>
            Built around one idea: the fastest way to understand a data structure is to watch it move.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 24, maxWidth: 1100, margin: '0 auto',
        }}>
          {features.map(f => (
            <div key={f.title} style={{
              background: '#fff', border: '1px solid #e2e8f0',
              borderRadius: 16, padding: '28px 28px',
              boxShadow: '0 2px 8px rgba(0,0,0,.05)',
              transition: 'transform 200ms, box-shadow 200ms',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,.1)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.05)';
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: `${f.color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, marginBottom: 18,
              }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" style={{ padding: '100px 5%', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <span style={{
            display: 'inline-block', background: '#F0FDF4', color: '#4CAF50',
            borderRadius: 999, padding: '4px 14px', fontSize: 12,
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
            marginBottom: 16,
          }}>How it works</span>
          <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>
            From code to clarity in 4 steps
          </h2>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: 0, maxWidth: 980, margin: '0 auto', position: 'relative',
        }}>
          {steps.map((step, i) => (
            <div key={step.n} style={{
              padding: '36px 28px', position: 'relative',
              borderRight: i < steps.length - 1 ? '1px dashed #cbd5e1' : 'none',
            }}>
              <div style={{
                fontSize: 13, fontWeight: 800, color: '#2E74B5',
                letterSpacing: '.08em', marginBottom: 18,
              }}>{step.n}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>{step.title}</h3>
              <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65 }}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section style={{
        padding: '90px 5%', textAlign: 'center',
        background: 'linear-gradient(135deg,#0f2942,#1F4E79)',
      }}>
        <h2 style={{
          fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800,
          color: '#fff', marginBottom: 16,
        }}>Ready to visualize your first algorithm?</h2>
        <p style={{ color: 'rgba(255,255,255,.65)', fontSize: 17, marginBottom: 38 }}>
          Free to start. No credit card required.
        </p>
        <Link to="/register" style={{
          display: 'inline-block', padding: '16px 44px', borderRadius: 12,
          fontSize: 16, fontWeight: 700, color: '#fff',
          background: 'linear-gradient(135deg,#2E74B5,#4CAF50)',
          boxShadow: '0 8px 24px rgba(46,116,181,.45)',
          textDecoration: 'none', transition: 'transform 150ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          Create free account →
        </Link>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '32px 5%', background: '#0a1929',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'linear-gradient(135deg,#2E74B5,#4CAF50)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff',
          }}>D</div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,.6)' }}>
            DSVP — Data Structure Visualization Platform
          </span>
        </div>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>
          © {new Date().getFullYear()} DSVP. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
