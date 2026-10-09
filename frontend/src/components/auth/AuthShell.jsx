import { Link } from 'react-router-dom';
import AlgoVisual from './AlgoVisual';
import { BrandMark, IconArrowLeft } from './authUi';
import './auth.css';

/**
 * Two-column authentication layout.
 *   left  — brand, one message, one algorithm visualization (hidden ≤ 920px)
 *   right — the form (children), with the brand repeated for small screens
 */
export default function AuthShell({ headline, sub, children }) {
  return (
    <div className="auth-page">
      <aside className="auth-story">
        {/* quiet node / edge geometry, purely decorative */}
        <svg className="auth-story-paths" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g fill="none" stroke="rgba(148,178,214,.22)" strokeWidth="1">
            <path d="M620 80 L720 190 L640 310" />
            <path d="M720 190 L790 120" />
            <path d="M90 760 L190 840 L300 770" />
            <path d="M190 840 L170 900" />
          </g>
          <g fill="#0B1929" stroke="rgba(148,178,214,.4)" strokeWidth="1">
            <circle cx="620" cy="80"  r="5" /><circle cx="720" cy="190" r="5" />
            <circle cx="640" cy="310" r="5" /><circle cx="790" cy="120" r="5" />
            <circle cx="90"  cy="760" r="5" /><circle cx="190" cy="840" r="5" />
            <circle cx="300" cy="770" r="5" />
          </g>
        </svg>

        <Link to="/" className="auth-brand" aria-label="DSVP home">
          <BrandMark /><span className="auth-brand-word">DSVP</span>
        </Link>

        <div>
          <div className="auth-story-copy" style={{ marginBottom: 32 }}>
            <h2>{headline}</h2>
            <p>{sub}</p>
          </div>
          <AlgoVisual />
        </div>

        <div className="auth-story-foot" aria-label="Supported languages">
          <span>Python</span><span>Java</span><span>C++</span><span>C</span><span>C#</span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-panel">
          <Link to="/" className="auth-brand auth-mobile-brand" aria-label="DSVP home">
            <BrandMark /><span className="auth-brand-word">DSVP</span>
          </Link>
          {children}
          <div style={{ textAlign: 'center' }}>
            <Link to="/" className="auth-home"><IconArrowLeft width={14} height={14} />Back to home</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
