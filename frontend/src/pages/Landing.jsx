import { Link } from 'react-router-dom';
import { useRef, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useGsapContext, gsap } from '../hooks/useGsap';
import AuroraBackground from '../components/common/AuroraBackground';
import HeroCodeVisual from '../components/common/HeroCodeVisual';

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
    position: 'relative', padding: '7px 16px', borderRadius: 8, fontSize: 14, fontWeight: 500,
    color: 'rgba(255,255,255,.8)', textDecoration: 'none',
    transition: 'color 150ms',
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
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    padding: '120px 5% 70px',
    background: 'linear-gradient(135deg, #0a1c30 0%, #1F4E79 55%, #163a5e 100%)',
    position: 'relative', overflow: 'hidden',
  },
  heroBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: 'rgba(46,116,181,.25)', border: '1px solid rgba(46,116,181,.5)',
    borderRadius: 999, padding: '5px 14px', fontSize: 12, fontWeight: 600,
    color: '#93c5fd', marginBottom: 26, letterSpacing: '.04em', textTransform: 'uppercase',
  },
  heroBadgeDot: {
    width: 6, height: 6, borderRadius: '50%', background: '#4CAF50',
    boxShadow: '0 0 6px #4CAF50',
  },
  heroTitle: {
    fontSize: 'clamp(2.2rem, 4.6vw, 3.6rem)', fontWeight: 800, lineHeight: 1.12,
    color: '#fff', marginBottom: 20, letterSpacing: '-.02em',
  },
  heroGradText: {
    background: 'linear-gradient(90deg,#60a5fa,#4CAF50)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  heroSub: {
    fontSize: 'clamp(1rem, 1.6vw, 1.15rem)', color: 'rgba(255,255,255,.68)',
    maxWidth: 520, marginBottom: 38, lineHeight: 1.7,
  },
  heroCta: { display: 'flex', gap: 14, flexWrap: 'wrap' },
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
  const rootRef = useRef(null);
  const navRef = useRef(null);
  const blob1Ref = useRef(null);
  const blob2Ref = useRef(null);
  const statRefs = useRef([]);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useGsapContext(() => {
    /* ── Hero entrance timeline ── */
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.nav-anim', { y: -24, opacity: 0, duration: 0.6, stagger: 0.06 })
      .from('.hero-badge', { y: 16, opacity: 0, duration: 0.55 }, '-=0.2')
      .from('.hero-title-word', { y: 40, opacity: 0, duration: 0.75, stagger: 0.08 }, '-=0.25')
      .from('.hero-sub', { y: 20, opacity: 0, duration: 0.6 }, '-=0.35')
      .from('.hero-cta > *', { y: 16, opacity: 0, duration: 0.5, stagger: 0.1 }, '-=0.3')
      .from('.hero-stat', { y: 24, opacity: 0, duration: 0.55, stagger: 0.08 }, '-=0.25')
      .from('.hero-visual', { x: 40, opacity: 0, scale: 0.96, duration: 0.8 }, '-=0.9');

    /* ── Animated stat counters ── */
    statRefs.current.forEach(el => {
      if (!el) return;
      const raw = el.dataset.value;
      const numeric = parseFloat(raw.replace(/[^\d.]/g, ''));
      if (Number.isNaN(numeric)) return; // skip "∞" / "100%"-style non-numeric handled below
      const suffix = raw.replace(/[\d.]/g, '');
      const counter = { val: 0 };
      gsap.to(counter, {
        val: numeric, duration: 1.6, delay: 1.1, ease: 'power2.out',
        onUpdate: () => { el.textContent = Math.round(counter.val) + suffix; },
      });
    });

    /* ── Floating blob parallax on mouse move ── */
    const xTo1 = gsap.quickTo(blob1Ref.current, 'x', { duration: 1.1, ease: 'power3.out' });
    const yTo1 = gsap.quickTo(blob1Ref.current, 'y', { duration: 1.1, ease: 'power3.out' });
    const xTo2 = gsap.quickTo(blob2Ref.current, 'x', { duration: 1.4, ease: 'power3.out' });
    const yTo2 = gsap.quickTo(blob2Ref.current, 'y', { duration: 1.4, ease: 'power3.out' });
    function onMove(e) {
      const nx = (e.clientX / window.innerWidth - 0.5);
      const ny = (e.clientY / window.innerHeight - 0.5);
      xTo1(nx * 60); yTo1(ny * 60);
      xTo2(nx * -40); yTo2(ny * -40);
    }
    window.addEventListener('mousemove', onMove);

    /* ── Scroll reveals ── */
    gsap.utils.toArray('.feature-card').forEach((card, i) => {
      gsap.from(card, {
        y: 50, opacity: 0, duration: 0.7, ease: 'power3.out',
        delay: (i % 3) * 0.08,
        scrollTrigger: { trigger: card, start: 'top 88%' },
      });
    });

    gsap.utils.toArray('.step-card').forEach((card, i) => {
      gsap.from(card, {
        y: 40, opacity: 0, duration: 0.65, ease: 'power3.out',
        delay: i * 0.1,
        scrollTrigger: { trigger: card, start: 'top 90%' },
      });
    });

    gsap.from('.section-tag, .section-title, .section-desc', {
      y: 24, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out',
      scrollTrigger: { trigger: '#features', start: 'top 80%' },
    });

    gsap.from('.cta-banner *', {
      y: 24, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out',
      scrollTrigger: { trigger: '.cta-banner', start: 'top 85%' },
    });

    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div style={S.page} ref={rootRef}>
      {/* ── NAVBAR ── */}
      <nav ref={navRef} style={{
        ...S.nav,
        height: scrolled ? 56 : 64,
        background: scrolled ? 'rgba(10,25,41,.96)' : 'rgba(15,41,66,.88)',
        boxShadow: scrolled ? '0 8px 24px rgba(0,0,0,.25)' : 'none',
        transition: 'height 220ms ease, background 220ms ease, box-shadow 220ms ease',
      }}>
        <div style={S.navLogo} className="nav-anim">
          <div style={S.logoMark}>D</div>
          <span style={S.logoText}>DSVP</span>
        </div>
        <div style={S.navLinks} className="nav-links-desktop">
          <a href="#features" style={S.navLink} className="nav-anim nav-link-underline">Features</a>
          <a href="#how-it-works" style={S.navLink} className="nav-anim nav-link-underline">How it works</a>
          {user ? (
            <Link to="/dashboard" style={S.btnPrimary} className="nav-anim">Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/login"    style={S.btnOutline} className="nav-anim">Log in</Link>
              <Link to="/register" style={S.btnPrimary} className="nav-anim">Get started</Link>
            </>
          )}
        </div>

        {/* hamburger — mobile/tablet only */}
        <button
          className="nav-anim nav-burger"
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          style={{
            display: 'none', width: 38, height: 38, borderRadius: 8,
            border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.06)',
            cursor: 'pointer', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <span style={{
            width: 18, height: 2, background: '#fff', borderRadius: 2, transition: 'transform 200ms, opacity 200ms',
            transform: menuOpen ? 'translateY(6px) rotate(45deg)' : 'none',
          }} />
          <span style={{
            width: 18, height: 2, background: '#fff', borderRadius: 2, transition: 'opacity 200ms',
            opacity: menuOpen ? 0 : 1,
          }} />
          <span style={{
            width: 18, height: 2, background: '#fff', borderRadius: 2, transition: 'transform 200ms',
            transform: menuOpen ? 'translateY(-6px) rotate(-45deg)' : 'none',
          }} />
        </button>
      </nav>

      {/* mobile menu drawer */}
      <div className="nav-mobile-drawer" style={{
        position: 'fixed', top: scrolled ? 56 : 64, left: 0, right: 0, zIndex: 99,
        background: 'rgba(10,25,41,.98)', backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,255,255,.08)',
        display: 'flex', flexDirection: 'column', gap: 4, padding: menuOpen ? '14px 5% 20px' : '0 5%',
        maxHeight: menuOpen ? 320 : 0, overflow: 'hidden', opacity: menuOpen ? 1 : 0,
        transition: 'max-height 260ms ease, padding 260ms ease, opacity 200ms ease',
      }}>
        <a href="#features" onClick={() => setMenuOpen(false)} style={{ ...S.navLink, padding: '12px 8px' }}>Features</a>
        <a href="#how-it-works" onClick={() => setMenuOpen(false)} style={{ ...S.navLink, padding: '12px 8px' }}>How it works</a>
        <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          {user ? (
            <Link to="/dashboard" onClick={() => setMenuOpen(false)} style={{ ...S.btnPrimary, flex: 1, textAlign: 'center' }}>Go to Dashboard</Link>
          ) : (
            <>
              <Link to="/login" onClick={() => setMenuOpen(false)} style={{ ...S.btnOutline, flex: 1, textAlign: 'center' }}>Log in</Link>
              <Link to="/register" onClick={() => setMenuOpen(false)} style={{ ...S.btnPrimary, flex: 1, textAlign: 'center' }}>Get started</Link>
            </>
          )}
        </div>
      </div>

      {/* ── HERO ── */}
      <section style={S.hero}>
        <AuroraBackground variant="hero" />
        {/* decorative blobs — parallax on mouse move */}
        <div ref={blob1Ref} style={{
          position: 'absolute', top: '-20%', right: '-10%',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(46,116,181,.25) 0%, transparent 70%)',
          pointerEvents: 'none', willChange: 'transform',
        }} />
        <div ref={blob2Ref} style={{
          position: 'absolute', bottom: '-15%', left: '-8%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(76,175,80,.15) 0%, transparent 70%)',
          pointerEvents: 'none', willChange: 'transform',
        }} />

        <div style={{
          position: 'relative', width: '100%', maxWidth: 1180, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)',
          gap: 56, alignItems: 'center',
        }} className="hero-grid">
          {/* left: copy */}
          <div>
            <div style={S.heroBadge} className="hero-badge">
              <span style={S.heroBadgeDot} />
              Visual · Interactive · Multi-language
            </div>

            <h1 style={S.heroTitle}>
              <span className="hero-title-word" style={{ display: 'inline-block' }}>See</span>{' '}
              <span className="hero-title-word" style={{ display: 'inline-block' }}>your</span>{' '}
              <span className="hero-title-word" style={{ display: 'inline-block' }}>code</span>{' '}
              <span className="hero-title-word" style={{ ...S.heroGradText, display: 'inline-block' }}>think</span>{' '}
              <span className="hero-title-word" style={{ display: 'inline-block' }}>in</span>{' '}
              <span className="hero-title-word" style={{ display: 'inline-block' }}>real</span>{' '}
              <span className="hero-title-word" style={{ display: 'inline-block' }}>time</span>
            </h1>

            <p style={S.heroSub} className="hero-sub">
              DSVP turns your algorithms into living, step-by-step animations.
              Write once, visualize instantly — in Python, C++, Java, C, or C#.
            </p>

            <div style={S.heroCta} className="hero-cta">
              <Link
                to="/register"
                style={S.ctaPrimary}
                onMouseEnter={e => gsap.to(e.currentTarget, { y: -3, scale: 1.03, boxShadow: '0 10px 28px rgba(46,116,181,.6)', duration: 0.25 })}
                onMouseLeave={e => gsap.to(e.currentTarget, { y: 0, scale: 1, boxShadow: '0 6px 20px rgba(46,116,181,.5)', duration: 0.25 })}
              >Start for free →</Link>
              <Link
                to="/login"
                style={S.ctaSecondary}
                onMouseEnter={e => gsap.to(e.currentTarget, { y: -3, scale: 1.03, background: 'rgba(255,255,255,.14)', duration: 0.25 })}
                onMouseLeave={e => gsap.to(e.currentTarget, { y: 0, scale: 1, background: 'rgba(255,255,255,.08)', duration: 0.25 })}
              >I have an account</Link>
            </div>

            {/* stats row */}
            <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap', marginTop: 56 }}>
              {stats.map((s, i) => (
                <div key={s.label} className="hero-stat">
                  <div
                    ref={el => statRefs.current[i] = el}
                    data-value={s.value}
                    style={{ fontSize: 30, fontWeight: 800, color: '#fff' }}
                  >{s.value}</div>
                  <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* right: live product visual */}
          <div className="hero-visual" style={{ display: 'flex', justifyContent: 'center' }}>
            <HeroCodeVisual />
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" style={{
        padding: '100px 5%', background: '#fff',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <span className="section-tag" style={{
            display: 'inline-block', background: '#EFF6FF', color: '#2E74B5',
            borderRadius: 999, padding: '4px 14px', fontSize: 12,
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
            marginBottom: 16,
          }}>Features</span>
          <h2 className="section-title" style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: '#1e293b', marginBottom: 14 }}>
            Everything you need to master DSA
          </h2>
          <p className="section-desc" style={{ color: '#64748b', maxWidth: 520, margin: '0 auto', fontSize: 16, lineHeight: 1.7 }}>
            Built around one idea: the fastest way to understand a data structure is to watch it move.
          </p>
        </div>

        <div className="features-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 24, maxWidth: 1100, margin: '0 auto',
        }}>
          {features.map(f => (
            <div key={f.title} className="feature-card" style={{
              position: 'relative', background: '#fff', border: '1px solid #e2e8f0',
              borderRadius: 16, padding: '28px 28px', overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,.05)',
              transition: 'transform 200ms, box-shadow 200ms, border-color 200ms',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-6px) scale(1.015)';
                e.currentTarget.style.boxShadow = `0 20px 40px ${f.color}22, 0 4px 10px rgba(0,0,0,.06)`;
                e.currentTarget.style.borderColor = `${f.color}55`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.05)';
                e.currentTarget.style.borderColor = '#e2e8f0';
              }}
            >
              {/* gradient top accent */}
              <span style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${f.color}, ${f.color}00)`,
              }} />
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: `linear-gradient(135deg, ${f.color}22, ${f.color}0a)`,
                border: `1px solid ${f.color}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, marginBottom: 18, boxShadow: `0 4px 14px ${f.color}22`,
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

        <div className="steps-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 0, maxWidth: 980, margin: '0 auto', position: 'relative',
        }}>
          {steps.map((step, i) => (
            <div key={step.n} className="step-card" style={{
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
      <section className="cta-banner" style={{
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
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px) scale(1.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; }}
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

      <style>{`
        .nav-link-underline { position: relative; }
        .nav-link-underline::after {
          content: ''; position: absolute; left: 16px; right: 16px; bottom: 4px;
          height: 2px; border-radius: 2px;
          background: linear-gradient(90deg,#60a5fa,#4CAF50);
          transform: scaleX(0); transform-origin: left;
          transition: transform 220ms ease;
        }
        .nav-link-underline:hover { color: #fff !important; }
        .nav-link-underline:hover::after { transform: scaleX(1); }

        @media (max-width: 860px) {
          .hero-grid { grid-template-columns: 1fr !important; text-align: center; }
          .hero-cta { justify-content: center; }
          .hero-stat { flex: 1 1 40%; }
          .hero-visual { margin-top: 20px; }
        }

        /* ── Nav: hamburger takes over below 768px ── */
        @media (max-width: 768px) {
          .nav-links-desktop { display: none !important; }
          .nav-burger { display: flex !important; }
        }
        @media (min-width: 769px) {
          .nav-mobile-drawer { display: none !important; }
        }

        /* ── General fluid spacing across breakpoints ── */
        @media (max-width: 640px) {
          #features, #how-it-works, .cta-banner { padding-left: 6% !important; padding-right: 6% !important; }
        }
        @media (max-width: 480px) {
          .hero-stat { flex: 1 1 100%; text-align: left; }
        }
        @media (max-width: 620px) {
          .features-grid { grid-template-columns: 1fr !important; }
          .steps-grid { grid-template-columns: 1fr !important; }
          .step-card { border-right: none !important; border-bottom: 1px dashed #cbd5e1; }
          .step-card:last-child { border-bottom: none; }
        }

        /* ── Large-desktop / ultra-wide: cap content width, don't let it stretch thin ── */
        @media (min-width: 1600px) {
          .hero-grid { max-width: 1320px !important; }
        }
      `}</style>
    </div>
  );
}
