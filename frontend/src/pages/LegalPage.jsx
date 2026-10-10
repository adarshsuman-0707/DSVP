import { Link } from 'react-router-dom';
import Logo from '../components/common/Logo';
import SiteFooter from '../components/common/SiteFooter';
import { LEGAL, LAST_UPDATED } from '../content/legal';

/* Public legal page — content lives in src/content/legal.js. */
export default function LegalPage({ doc }) {
  const page = LEGAL[doc];
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#0B1929', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ height: 68, display: 'flex', alignItems: 'center', padding: '0 5%', borderBottom: '1px solid rgba(148,163,184,.16)' }}>
        <Link to="/" aria-label="DSVP home" style={{ display: 'inline-flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: '#F1F5F9', fontWeight: 700, fontSize: 18 }}>
          <Logo size={38} /> DSVP
        </Link>
      </header>
      <main style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '48px 5% 64px', boxSizing: 'border-box', color: '#A8B8CC' }}>
        <h1 style={{ color: '#F1F5F9', fontSize: 'clamp(1.7rem,4vw,2.2rem)', margin: '0 0 6px' }}>{page.title}</h1>
        <p style={{ fontSize: 13, margin: '0 0 32px' }}>Last updated: {LAST_UPDATED}</p>
        {page.sections.map(s => (
          <section key={s.h} style={{ marginBottom: 28 }}>
            <h2 style={{ color: '#F1F5F9', fontSize: 17, margin: '0 0 10px' }}>{s.h}</h2>
            {s.p.map((t, i) => <p key={i} style={{ fontSize: 14.5, lineHeight: 1.7, margin: '0 0 10px' }}>{t}</p>)}
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
