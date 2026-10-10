import { Link } from 'react-router-dom';
import Logo from './Logo';

/* Public site footer. Every link points at a route or section that exists
   today — features that aren't built yet (docs, FAQ, help center) are left
   out on purpose rather than linked to dead pages.

   Contact is optional: set VITE_SUPPORT_EMAIL in the frontend .env to show it. */
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL;

const COLUMNS = [
  {
    title: 'Explore',
    links: [
      { to: '/', label: 'Home' },
      { to: '/workspace', label: 'Code Visualizer' },
      { to: '/dashboard', label: 'Learning Modules' },
      { to: '/pricing', label: 'Plans & Pricing' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { to: '/dashboard', label: 'Arrays' },
      { to: '/dashboard', label: 'Linked Lists' },
      { to: '/dashboard', label: 'Stacks & Queues' },
      { to: '/dashboard', label: 'Trees & Graphs' },
      { to: '/dashboard', label: 'Hashing' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { to: '/#features', label: 'Features' },
      { to: '/#how-it-works', label: 'How It Works' },
      { to: '/#features', label: 'Python, Java, C, C++, C#' },
    ],
  },
  {
    title: 'Information',
    links: [
      { to: '/#features', label: 'About DSVP' },
      { to: '/privacy', label: 'Privacy Policy' },
      { to: '/terms', label: 'Terms of Service' },
      ...(SUPPORT_EMAIL ? [{ href: `mailto:${SUPPORT_EMAIL}`, label: 'Contact' }] : []),
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="dsvp-footer" aria-label="Site footer">
      <div className="dsvp-footer-inner">
        <div className="dsvp-footer-grid">
          <div className="dsvp-footer-brand">
            <Link to="/" className="dsvp-footer-logo" aria-label="DSVP home">
              <Logo size={40} />
              <span>DSVP</span>
            </Link>
            <p className="dsvp-footer-fullname">Data Structure Visualization Platform</p>
            <p className="dsvp-footer-desc">
              Understand algorithms by watching them execute. Explore data structures,
              trace program execution, and build stronger programming fundamentals
              through interactive visual learning.
            </p>
            <p className="dsvp-footer-tagline">Practice concepts. Trace execution. Master algorithms.</p>
            <Link to="/register" className="dsvp-footer-cta">Create free account →</Link>
          </div>

          {COLUMNS.map(col => (
            <nav key={col.title} aria-label={col.title} className="dsvp-footer-col">
              <h3>{col.title}</h3>
              <ul>
                {col.links.map(l => (
                  <li key={l.label}>
                    {l.href
                      ? <a href={l.href}>{l.label}</a>
                      : <Link to={l.to}>{l.label}</Link>}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="dsvp-footer-bar">
          <p>© {new Date().getFullYear()} DSVP — Data Structure Visualization Platform. All rights reserved.</p>
          <div>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/cookies">Cookies &amp; Storage</Link>
          </div>
        </div>
      </div>

      <style>{`
        .dsvp-footer { background:#0B1929; color:#A8B8CC; font-family:'Inter',system-ui,sans-serif;
          border-top:1px solid rgba(148,163,184,.16); }
        .dsvp-footer-inner { max-width:1180px; margin:0 auto; padding:56px 5% 28px; }
        .dsvp-footer-grid { display:grid; grid-template-columns:minmax(0,1.6fr) repeat(4,minmax(0,1fr)); gap:36px; }
        .dsvp-footer-logo { display:inline-flex; align-items:center; gap:12px; text-decoration:none;
          font-size:20px; font-weight:700; color:#F1F5F9; letter-spacing:-.01em; }
        .dsvp-footer-fullname { margin:14px 0 6px; font-size:13px; font-weight:600; color:#2DD4BF; }
        .dsvp-footer-desc { margin:0 0 14px; font-size:13.5px; line-height:1.65; max-width:340px; }
        .dsvp-footer-tagline { margin:0 0 16px; font-size:13px; color:#F1F5F9; font-weight:500; }
        .dsvp-footer-cta { display:inline-block; padding:8px 16px; border-radius:8px; font-size:13px; font-weight:600;
          color:#fff; background:#3B82F6; text-decoration:none; transition:background 150ms; }
        .dsvp-footer-cta:hover { background:#2563EB; }
        .dsvp-footer-col h3 { margin:0 0 14px; font-size:13px; font-weight:700; color:#F1F5F9;
          letter-spacing:.02em; }
        .dsvp-footer-col ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
        .dsvp-footer a { overflow-wrap:anywhere; }
        .dsvp-footer-col a { color:#A8B8CC; text-decoration:none; font-size:13.5px; transition:color 150ms; }
        .dsvp-footer-col a:hover { color:#2DD4BF; }
        .dsvp-footer a:focus-visible { outline:2px solid #2DD4BF; outline-offset:3px; border-radius:4px; }
        .dsvp-footer-bar { margin-top:44px; padding-top:20px; border-top:1px solid rgba(148,163,184,.16);
          display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
        .dsvp-footer-bar p { margin:0; font-size:12.5px; }
        .dsvp-footer-bar div { display:flex; gap:18px; flex-wrap:wrap; }
        .dsvp-footer-bar a { color:#A8B8CC; font-size:12.5px; text-decoration:none; }
        .dsvp-footer-bar a:hover { color:#2DD4BF; }
        @media (max-width:1000px) {
          .dsvp-footer-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .dsvp-footer-brand { grid-column:1 / -1; }
        }
        @media (max-width:520px) {
          .dsvp-footer-grid { grid-template-columns:1fr; gap:28px; }
          .dsvp-footer-bar { flex-direction:column; align-items:flex-start; }
        }
      `}</style>
    </footer>
  );
}
