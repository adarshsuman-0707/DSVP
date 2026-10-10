import { useState } from 'react';
import { Link } from 'react-router-dom';

/* Static, public landing-page sections. Everything here is hard-coded on
   purpose — the landing page makes no API calls. Module slugs match
   database/02_seed.sql; coin/plan numbers match Pricing.jsx, Coins.jsx and
   coinModel.js. Update here if those change. */

const wsLink = slug => `/workspace?module=${slug}`;

function Section({ id, tint, tag, tagBg = '#EFF6FF', tagColor = '#2E74B5', title, desc, children }) {
  return (
    <section id={id} style={{ padding: '90px 5%', background: tint ? '#f8fafc' : '#fff' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <span style={{
          display: 'inline-block', background: tagBg, color: tagColor, borderRadius: 999,
          padding: '4px 14px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '.06em', marginBottom: 16,
        }}>{tag}</span>
        <h2 style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 800, color: '#1e293b', margin: '0 0 14px' }}>{title}</h2>
        {desc && <p style={{ color: '#64748b', maxWidth: 560, margin: '0 auto', fontSize: 16, lineHeight: 1.7 }}>{desc}</p>}
      </div>
      {children}
    </section>
  );
}
export { Section };

/* ── Module cards ── */
const B = '#2E74B5', G = '#4CAF50';
const GLYPHS = {
  array: <><rect x="2" y="10" width="7" height="8" rx="1.5" /><rect x="10.5" y="10" width="7" height="8" rx="1.5" /><rect x="19" y="10" width="7" height="8" rx="1.5" stroke={G} /></>,
  list: <><rect x="1" y="10" width="7" height="8" rx="1.5" /><rect x="10.5" y="10" width="7" height="8" rx="1.5" /><rect x="20" y="10" width="7" height="8" rx="1.5" stroke={G} /><path d="M8 14h2.5M17.5 14H20" /></>,
  stack: <><rect x="7" y="3" width="14" height="6" rx="1.5" stroke={G} /><rect x="7" y="11" width="14" height="6" rx="1.5" /><rect x="7" y="19" width="14" height="6" rx="1.5" /></>,
  queue: <><rect x="2" y="9" width="7" height="10" rx="1.5" /><rect x="10.5" y="9" width="7" height="10" rx="1.5" /><rect x="19" y="9" width="7" height="10" rx="1.5" stroke={G} /><path d="M3 24h22" /></>,
  tree: <><circle cx="14" cy="6" r="3" stroke={G} /><circle cx="7" cy="20" r="3" /><circle cx="21" cy="20" r="3" /><path d="M12.3 8.5 8.5 17.5M15.7 8.5l3.8 9" /></>,
  graph: <><circle cx="6" cy="8" r="3" /><circle cx="22" cy="8" r="3" stroke={G} /><circle cx="14" cy="22" r="3" /><path d="M9 8h10M7.5 10.7 12.5 19.5M20.5 10.7 15.5 19.5" /></>,
  sort: <><path d="M5 24V16M11 24V8M17 24V12M23 24V4" strokeWidth="3.5" strokeLinecap="round" /></>,
  hash: <><rect x="3" y="3" width="22" height="5" rx="1.5" /><rect x="3" y="11.5" width="22" height="5" rx="1.5" stroke={G} /><rect x="3" y="20" width="22" height="5" rx="1.5" /></>,
};

const MODULES = [
  { g: 'array', name: 'Arrays', slug: 'array', desc: 'Insert, delete, search and traverse — watch indices and values change.' },
  { g: 'list', name: 'Linked Lists', slug: 'linked-list', desc: 'Follow pointers node by node in singly and doubly linked lists.' },
  { g: 'stack', name: 'Stacks', slug: 'stack', desc: 'Push and pop on a vertical stack to see LIFO in action.' },
  { g: 'queue', name: 'Queues', slug: 'queue', desc: 'Enqueue and dequeue to understand FIFO ordering.' },
  { g: 'tree', name: 'Binary Search Trees', slug: 'bst', desc: 'Insert, search and delete while the tree reshapes itself.' },
  { g: 'graph', name: 'Graphs', slug: 'graph', desc: 'Traverse graphs with BFS and DFS, step by step.' },
  { g: 'sort', name: 'Sorting', slug: 'sorting', desc: 'Bubble, insertion, selection, merge and quick sort animated.' },
  { g: 'hash', name: 'Hashing', slug: 'hashing', desc: 'See how hash tables place keys and handle collisions.' },
];

export function ExploreSection() {
  return (
    <Section id="modules" tag="Modules" title="Explore Data Structures & Algorithms"
      desc="Choose a concept, explore its structure, and understand how it works through visualization.">
      <div className="ls-grid" style={{ maxWidth: 1100, margin: '0 auto' }}>
        {MODULES.map(m => (
          <Link key={m.slug} to={wsLink(m.slug)} className="ls-card">
            <span className="ls-glyph">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke={B} strokeWidth="1.8" aria-hidden="true">{GLYPHS[m.g]}</svg>
            </span>
            <h3>{m.name}</h3>
            <p>{m.desc}</p>
            <span className="ls-link">Explore module →</span>
          </Link>
        ))}
      </div>
      <p style={{ textAlign: 'center', marginTop: 32 }}>
        <Link to="/dashboard" className="ls-textlink">View all modules →</Link>
      </p>
    </Section>
  );
}

/* ── Languages ── */
const LANGS = [
  { n: 'Python', e: '.py' }, { n: 'Java', e: '.java' }, { n: 'C', e: '.c' },
  { n: 'C++', e: '.cpp' }, { n: 'C#', e: '.cs' },
];

export function LanguagesSection() {
  return (
    <Section id="languages" tint tag="Languages" tagBg="#FEF2F2" tagColor="#E15759"
      title="One Platform. Multiple Languages."
      desc="Learn programming concepts and understand execution through visual feedback.">
      <ul className="ls-langs">
        {LANGS.map(l => (
          <li key={l.n}><strong>{l.n}</strong><span>{l.e}</span></li>
        ))}
      </ul>
    </Section>
  );
}

/* ── Learning roadmap ── */
const STAGES = [
  { n: 1, title: 'Fundamentals', items: [{ l: 'Arrays', s: 'array' }, { l: '2D Arrays', s: '2d-array' }] },
  { n: 2, title: 'Core Data Structures', items: [{ l: 'Linked Lists', s: 'linked-list' }, { l: 'Stacks', s: 'stack' }, { l: 'Queues', s: 'queue' }] },
  { n: 3, title: 'Trees & Graphs', items: [{ l: 'Binary Trees', s: 'binary-tree' }, { l: 'Binary Search Trees', s: 'bst' }, { l: 'Graph traversal', s: 'graph' }] },
  { n: 4, title: 'Algorithms & Beyond', items: [{ l: 'Sorting', s: 'sorting' }, { l: 'Hashing', s: 'hashing' }, { l: 'Dynamic Programming', s: 'dynamic-programming' }] },
];

export function RoadmapSection() {
  return (
    <Section id="roadmap" tag="Roadmap" tagBg="#F0FDF4" tagColor="#4CAF50"
      title="Your Path to Mastering DSA"
      desc="Build your understanding step by step, from fundamental operations to advanced algorithms.">
      <ol className="ls-roadmap">
        {STAGES.map(st => (
          <li key={st.n}>
            <div className="ls-stage-n">Stage {st.n}</div>
            <h3>{st.title}</h3>
            <ul>
              {st.items.map(i => <li key={i.s}><Link to={wsLink(i.s)}>{i.l}</Link></li>)}
            </ul>
          </li>
        ))}
      </ol>
      <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', marginTop: 24 }}>
        Some modules need a paid plan — see below. Your own progress is tracked on your profile after you sign in.
      </p>
    </Section>
  );
}

/* ── Why DSVP ── */
const WHY = [
  ['Step-by-step execution traces', 'Your code runs once on the server; the recorded trace is replayed one operation at a time.'],
  ['Editor and visualization side by side', 'Edit code on one side, watch the structure change on the other — no tab switching.'],
  ['Playback controls', 'Play, pause, step forward and back, and change speed until the idea clicks.'],
  ['Pointers and call stack', 'Follow node pointers in lists and trees, and see the call stack while recursion runs.'],
  ['Progress and reports', 'Review your activity and topic progress on your profile, and export reports.'],
];

export function WhySection() {
  return (
    <Section id="why" tint tag="Why DSVP" title="Built for understanding, not memorizing"
      desc="Everything on the platform exists to make execution visible.">
      <ul className="ls-why">
        {WHY.map(([t, d]) => (
          <li key={t}>
            <span className="ls-tick" aria-hidden="true">✓</span>
            <div><h3>{t}</h3><p>{d}</p></div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ── Plans & coins ── */
export function AccessSection() {
  return (
    <Section id="plans" tag="Plans & Coins" tagBg="#FFF7ED" tagColor="#F2A93B"
      title="Start free. Upgrade when you're ready."
      desc="Some modules are free; advanced ones need a Basic or Premium plan.">
      <div className="ls-plans">
        <div className="ls-plan"><h3>Free</h3><div className="ls-price">₹0</div><p>Access to the free modules and code execution.</p></div>
        <div className="ls-plan"><h3>Basic</h3><div className="ls-price">₹49<span> / month</span></div><p>Adds access to some premium modules.</p></div>
        <div className="ls-plan hl"><h3>Premium</h3><div className="ls-price">₹99<span> / month</span></div><p>Access to all premium modules and code/trace export.</p></div>
      </div>
      <div className="ls-coins">
        <h3>DSVP Coins</h3>
        <p>Buy any plan once to unlock coin earning. Then earn coins by learning:</p>
        <ul>
          <li><b>+5</b> daily login</li>
          <li><b>+50</b> 7-day login streak</li>
          <li><b>+10</b> first run of a new module</li>
          <li><b>+15</b> feedback (once a week)</li>
          <li><b>+50</b> every plan renewal</li>
        </ul>
        <p>Spend them on plan discounts (10 coins = ₹1 off, up to 40% of an order) or a temporary module unlock (300 coins).</p>
      </div>
      <p style={{ textAlign: 'center', marginTop: 28 }}>
        <Link to="/register" className="ls-textlink">Create a free account to see plans →</Link>
      </p>
    </Section>
  );
}

/* ── FAQ ── */
const FAQS = [
  ['What is DSVP?', 'DSVP (Data Structure Visualization Platform) lets you write code and watch it run: your data structure is animated step by step as the program executes.'],
  ['How does the visualization work?', 'When you press Run, the backend executes your code and records a step-by-step trace. The visualization then plays that trace back in sync with your code.'],
  ['Which programming languages are supported?', 'Python, Java, C, C++ and C#.'],
  ['Can I explore modules without an account?', 'The interactive demo on this page works without one. The modules and the workspace need a free account.'],
  ['Can I pause and step through execution?', 'Yes. You can play, pause, scrub to any step, step backward and forward, and change playback speed.'],
  ['How can I track my progress?', 'After signing in, your profile shows your activity and topic progress, and the Reports page lets you generate and export reports.'],
  ['What is the difference between free and premium modules?', 'Each module requires a Free, Basic or Premium plan. Free modules are open to every account; the rest unlock with a plan, or temporarily with DSVP Coins.'],
];

export function FaqSection() {
  const [open, setOpen] = useState(0);
  return (
    <Section id="faq" tint tag="FAQ" title="Frequently Asked Questions">
      <div className="ls-faq">
        {FAQS.map(([q, a], i) => {
          const isOpen = open === i;
          return (
            <div key={q} className={`ls-faq-item${isOpen ? ' open' : ''}`}>
              <h3>
                <button aria-expanded={isOpen} aria-controls={`faq-a-${i}`} id={`faq-q-${i}`}
                  onClick={() => setOpen(isOpen ? -1 : i)}>
                  {q}<span aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </button>
              </h3>
              <div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className="ls-faq-a">
                <div><p>{a}</p></div>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

export function LandingSectionStyles() {
  return (
    <style>{`
      .ls-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:20px; }
      .ls-card { display:flex; flex-direction:column; background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:24px;
        box-shadow:0 2px 8px rgba(0,0,0,.05); text-decoration:none; transition:transform 180ms, box-shadow 180ms, border-color 180ms; }
      .ls-card:hover { transform:translateY(-4px); border-color:#bfdbfe; box-shadow:0 14px 30px rgba(46,116,181,.14); }
      .ls-card:focus-visible, .ls-textlink:focus-visible, .ls-roadmap a:focus-visible, .ls-faq button:focus-visible { outline:2px solid #2E74B5; outline-offset:3px; }
      .ls-glyph { width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center; margin-bottom:16px;
        background:linear-gradient(135deg,#2E74B522,#2E74B50a); border:1px solid #2E74B533; }
      .ls-card h3 { margin:0 0 8px; font-size:16px; font-weight:700; color:#1e293b; }
      .ls-card p { margin:0 0 16px; font-size:14px; line-height:1.6; color:#64748b; flex:1; }
      .ls-link, .ls-textlink { font-size:13.5px; font-weight:600; color:#2E74B5; text-decoration:none; }
      .ls-textlink:hover { text-decoration:underline; }

      .ls-langs { list-style:none; margin:0 auto; padding:0; display:flex; flex-wrap:wrap; justify-content:center; gap:14px; max-width:760px; }
      .ls-langs li { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px 26px; text-align:center;
        box-shadow:0 2px 8px rgba(0,0,0,.05); min-width:110px; }
      .ls-langs strong { display:block; font-size:16px; color:#1e293b; }
      .ls-langs span { font-size:12px; color:#94a3b8; font-family:Consolas,monospace; }

      .ls-roadmap { list-style:none; margin:0 auto; padding:0; max-width:1100px; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:20px; counter-reset:none; }
      .ls-roadmap > li { position:relative; background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:24px; box-shadow:0 2px 8px rgba(0,0,0,.05); }
      .ls-roadmap > li:not(:last-child)::after { content:''; position:absolute; top:34px; right:-20px; width:20px; border-top:2px dashed #cbd5e1; }
      .ls-stage-n { font-size:12px; font-weight:800; color:#4CAF50; letter-spacing:.08em; text-transform:uppercase; margin-bottom:8px; }
      .ls-roadmap h3 { margin:0 0 14px; font-size:16px; color:#1e293b; }
      .ls-roadmap ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }
      .ls-roadmap a { font-size:14px; color:#2E74B5; text-decoration:none; }
      .ls-roadmap a:hover { text-decoration:underline; }

      .ls-why { list-style:none; margin:0 auto; padding:0; max-width:900px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px 32px; }
      .ls-why li { display:flex; gap:14px; align-items:flex-start; }
      .ls-tick { flex:none; width:26px; height:26px; border-radius:50%; background:#F0FDF4; color:#4CAF50; border:1px solid #bbf7d0;
        display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800; margin-top:2px; }
      .ls-why h3 { margin:0 0 4px; font-size:15.5px; color:#1e293b; }
      .ls-why p { margin:0; font-size:14px; line-height:1.6; color:#64748b; }

      .ls-plans { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:20px; max-width:900px; margin:0 auto 24px; }
      .ls-plan { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:24px; box-shadow:0 2px 8px rgba(0,0,0,.05); }
      .ls-plan.hl { border-color:#2E74B5; box-shadow:0 8px 24px rgba(46,116,181,.16); }
      .ls-plan h3 { margin:0 0 6px; font-size:16px; color:#1e293b; }
      .ls-price { font-size:28px; font-weight:800; color:#1F4E79; margin-bottom:8px; }
      .ls-price span { font-size:13px; font-weight:500; color:#64748b; }
      .ls-plan p { margin:0; font-size:14px; line-height:1.6; color:#64748b; }
      .ls-coins { max-width:900px; margin:0 auto; background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:24px 28px; box-shadow:0 2px 8px rgba(0,0,0,.05); }
      .ls-coins h3 { margin:0 0 8px; font-size:16px; color:#1e293b; }
      .ls-coins p { margin:0 0 12px; font-size:14px; line-height:1.6; color:#64748b; }
      .ls-coins ul { list-style:none; margin:0 0 12px; padding:0; display:flex; flex-wrap:wrap; gap:10px; }
      .ls-coins li { font-size:13px; color:#374151; background:#f8fafc; border:1px solid #e2e8f0; border-radius:999px; padding:5px 12px; }
      .ls-coins li b { color:#4CAF50; }

      .ls-faq { max-width:760px; margin:0 auto; display:flex; flex-direction:column; gap:12px; }
      .ls-faq-item { background:#fff; border:1px solid #e2e8f0; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,.04); }
      .ls-faq-item.open { border-color:#bfdbfe; }
      .ls-faq h3 { margin:0; }
      .ls-faq button { width:100%; display:flex; justify-content:space-between; align-items:center; gap:16px; text-align:left; background:none; border:none;
        padding:16px 20px; font:inherit; font-size:15px; font-weight:600; color:#1e293b; cursor:pointer; border-radius:12px; }
      .ls-faq button span { color:#2E74B5; font-size:20px; line-height:1; }
      .ls-faq-a { display:grid; grid-template-rows:0fr; transition:grid-template-rows 220ms ease; }
      .ls-faq-item.open .ls-faq-a { grid-template-rows:1fr; }
      .ls-faq-a > div { overflow:hidden; }
      .ls-faq-a p { margin:0; padding:0 20px 18px; font-size:14.5px; line-height:1.7; color:#64748b; }

      @media (max-width:960px) {
        .ls-roadmap { grid-template-columns:repeat(2,minmax(0,1fr)); }
        .ls-roadmap > li::after { display:none; }
      }
      @media (max-width:640px) {
        .ls-roadmap, .ls-why, .ls-plans { grid-template-columns:minmax(0,1fr); }
      }
      @media (prefers-reduced-motion: reduce) { .ls-card, .ls-faq-a { transition:none; } .ls-card:hover { transform:none; } }
    `}</style>
  );
}
