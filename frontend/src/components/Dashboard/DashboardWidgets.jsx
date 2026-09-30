import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { THEMES } from '../../context/ThemeContext';

/* ════════════════════════════════════════════════════════════
   All widgets accept an optional `T` theme-token prop (from
   useTheme()). Falls back to the dark theme so nothing breaks
   if a caller forgets to pass it.
   ════════════════════════════════════════════════════════════ */
const DEFAULT_T = THEMES.dark;

/* one-time global entrance-animation keyframes (cheap: opacity+transform only) */
let ENTRANCE_STYLES_INJECTED = false;
function ensureEntranceStyles() {
  if (ENTRANCE_STYLES_INJECTED || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes dsvp-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes dsvp-pulse-soft { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
  `;
  document.head.appendChild(style);
  ENTRANCE_STYLES_INJECTED = true;
}

/* count-up animation for numeric stat values (GPU-cheap: rAF, no re-render storms) */
export function CountUp({ value, duration = 700 }) {
  const [display, setDisplay] = useState(0);
  const isNumeric = typeof value === 'number' && Number.isFinite(value);
  useEffect(() => {
    if (!isNumeric) return;
    let raf;
    const start = performance.now();
    const from = 0;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, isNumeric]);
  return <>{isNumeric ? display : value}</>;
}

export function Card({ title, subtitle, icon, right, children, style, T = DEFAULT_T, delay = 0 }) {
  ensureEntranceStyles();
  return (
    <div style={{
      background: T.card, border: `1.5px solid ${T.cardBorder}`, borderRadius: 16,
      boxShadow: T.shadow, overflow: 'hidden', transition: 'border-color 200ms, background 200ms',
      animation: `dsvp-fade-up 480ms ease both`, animationDelay: `${delay}ms`,
      ...style,
    }}>
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${T.divider}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {icon && (
            <span style={{
              width: 30, height: 30, borderRadius: 8, background: T.chipBg,
              border: `1px solid ${T.chipBorder}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 14, flexShrink: 0,
            }}>{icon}</span>
          )}
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 12, color: T.textMuted, marginTop: 2, marginBottom: 0 }}>{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  );
}

/* ── Rich stat tile with hover + optional trend ── */
export function RichStat({ icon, label, value, accent = '#2E74B5', sub, T = DEFAULT_T, delay = 0, onClick }) {
  ensureEntranceStyles();
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        flex: '1 1 150px', minWidth: 150, background: T.card,
        border: `1.5px solid ${hover ? accent + '77' : T.cardBorder}`, borderRadius: 14,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6,
        boxShadow: hover ? `0 8px 22px ${accent}33` : T.shadow,
        transform: hover ? 'translateY(-3px)' : 'none',
        transition: 'all 180ms ease', cursor: onClick ? 'pointer' : 'default',
        animation: `dsvp-fade-up 480ms ease both`, animationDelay: `${delay}ms`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 7, background: `${accent}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
          animation: icon === '🔥' ? 'dsvp-pulse-soft 2.4s ease-in-out infinite' : 'none',
        }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: T.text, lineHeight: 1.1 }}>
        <CountUp value={value} />
      </div>
      {sub && <div style={{ fontSize: 11, color: T.textMuted }}>{sub}</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Activity Heatmap — GitHub/LeetCode style, built from real
   CreatedAt timestamps in the user's saved-code history.
   ════════════════════════════════════════════════════════════ */
const DAY_MS = 86400000;
// Local-calendar-day key (UTC keys shift days for non-UTC users, e.g. IST).
const localKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function toKey(d) { return localKey(d); }

/**
 * Years that have at least one snippet, plus the current year (so the
 * dropdown always has something to select even for a brand-new account),
 * newest first — same ordering LeetCode's own year picker uses.
 */
export function activityYears(history) {
  const years = new Set([new Date().getFullYear()]);
  history.forEach(h => { if (h.CreatedAt) years.add(new Date(h.CreatedAt).getFullYear()); });
  return Array.from(years).sort((a, b) => b - a);
}

export function ActivityHeatmap({ history, T = DEFAULT_T, year }) {
  const { weeks, monthLabels, maxCount } = useMemo(() => {
    const counts = {};
    history.forEach(h => {
      if (!h.CreatedAt) return;
      const k = toKey(new Date(h.CreatedAt));
      counts[k] = (counts[k] || 0) + 1;
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start, end;
    if (year) {
      // Fixed Jan 1 → Dec 31 calendar-year grid, LeetCode/GitHub-year-picker
      // style, instead of a rolling "last 12 months" window. Cells past
      // today (only possible when `year` is the current year) just render
      // empty — same as GitHub's own current-year view.
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
    } else {
      // No year selected — rolling ~53-week window ending today (legacy
      // default, kept for any caller that doesn't pass `year`).
      const totalDays = 371;
      start = new Date(today.getTime() - (totalDays - 1) * DAY_MS);
      end = today;
    }
    // align start to a Sunday
    start.setDate(start.getDate() - start.getDay());

    const days = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push({ date: new Date(d), key: toKey(d), count: counts[toKey(d)] || 0 });
    }

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    const monthLabels = [];
    let lastMonth = -1;
    let lastIndex = -10;
    weeks.forEach((w, i) => {
      // Padding days before Jan 1 belong to last year's Dec — label the week by
      // its first in-year day so "Dec" doesn't collide with "Jan".
      const ref = (year ? w.find(d => d.date.getFullYear() === year) : w[0]) || w[0];
      const m = ref.date.getMonth();
      if (m !== lastMonth) {
        lastMonth = m;
        // a label is ~3 cells wide; skip it if it would overlap the previous one
        if (i - lastIndex >= 3) {
          monthLabels.push({ index: i, label: ref.date.toLocaleDateString('en-US', { month: 'short' }) });
          lastIndex = i;
        }
      }
    });

    const maxCount = Math.max(1, ...Object.values(counts));
    return { weeks, monthLabels, maxCount };
  }, [history, year]);

  function intensity(count) {
    if (count === 0) return T.heatEmpty;
    const ratio = count / maxCount;
    if (ratio > 0.75) return '#16a34a';
    if (ratio > 0.5) return '#4ade80';
    if (ratio > 0.25) return '#86efac';
    return '#bbf7d0';
  }

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
      <div style={{ minWidth: weeks.length * 13 + 20 }}>
        <div style={{ display: 'flex', gap: 3, marginBottom: 4, marginLeft: 2 }}>
          {weeks.map((_, i) => {
            const m = monthLabels.find(ml => ml.index === i);
            return (
              <div key={i} style={{ width: 10, fontSize: 9.5, color: T.textMuted, flexShrink: 0 }}>
                {m ? m.label : ''}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {week.map((day, di) => (
                <div
                  key={di}
                  title={`${day.count} snippet${day.count === 1 ? '' : 's'} on ${day.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                  style={{
                    width: 10, height: 10, borderRadius: 2.5,
                    background: intensity(day.count),
                    border: `1px solid ${T.mode === 'dark' ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)'}`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: T.textMuted }}>
          <span>Less</span>
          {[T.heatEmpty, '#bbf7d0', '#86efac', '#4ade80', '#16a34a'].map((c, i) => (
            <span key={i} style={{ width: 10, height: 10, borderRadius: 2.5, background: c, border: `1px solid ${T.mode === 'dark' ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.04)'}` }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Language Distribution donut — computed from real snippet langs
   ════════════════════════════════════════════════════════════ */
const LANG_COLORS = { Java: '#f89820', Python: '#3776ab', JavaScript: '#f0db4f', 'C++': '#00599c', C: '#5c6bc0', TypeScript: '#3178c6' };
const FALLBACK_COLORS = ['#2E74B5', '#8b5cf6', '#4CAF50', '#F2A93B', '#E15759', '#06b6d4'];

export function LanguageDonut({ history, T = DEFAULT_T }) {
  const data = useMemo(() => {
    const counts = {};
    history.forEach(h => { if (h.Language) counts[h.Language] = (counts[h.Language] || 0) + 1; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(counts)
      .map(([name, value], i) => ({
        name, value, pct: Math.round((value / total) * 100),
        color: LANG_COLORS[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [history]);

  if (data.length === 0) {
    return <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>No language data yet — save a snippet to see your distribution.</p>;
  }

  const top = data[0];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ width: 130, height: 130, position: 'relative', flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={62} paddingAngle={data.length > 1 ? 3 : 0} stroke="none">
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [`${v} snippet${v === 1 ? '' : 's'}`, n]} contentStyle={{ background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{top.name}</div>
          <div style={{ fontSize: 12, color: T.textMuted }}>{top.pct}%</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map(d => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: T.textSecondary, flex: 1 }}>{d.name}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{d.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   DSA topic practice level — derived from real per-module counts
   ════════════════════════════════════════════════════════════ */
const CATEGORY_MAP = {
  'array': 'Arrays',
  'linked-list': 'Linked List', 'doubly-linked-list': 'Linked List', 'circular-linked-list': 'Linked List',
  'stack': 'Stack', 'queue': 'Queue',
  'bst': 'Trees', 'avl-tree': 'Trees', 'red-black-tree': 'Trees', 'segment-tree': 'Trees', 'trie': 'Trees',
  'graph': 'Graphs', 'hashing': 'Hashing', 'heap': 'Heap', 'dynamic-programming': 'Dynamic Programming',
};
const CATEGORY_COLOR = {
  Arrays: '#2E74B5', 'Linked List': '#8b5cf6', Stack: '#4CAF50', Queue: '#06b6d4',
  Trees: '#F2A93B', Graphs: '#E15759', Hashing: '#ec4899', Heap: '#14b8a6', 'Dynamic Programming': '#6366f1',
};

export function TopicProgress({ history, T = DEFAULT_T }) {
  const rows = useMemo(() => {
    const counts = {};
    history.forEach(h => {
      const cat = CATEGORY_MAP[h.ModuleSlug] || h.ModuleSlug;
      if (!cat) return;
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, pct: Math.min(100, count * 20) }))
      .sort((a, b) => b.count - a.count);
  }, [history]);

  if (rows.length === 0) {
    return <p style={{ fontSize: 13, color: T.textMuted, margin: 0 }}>Practice a module to start building your topic progress.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map(r => (
        <div key={r.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: T.textSecondary }}>{r.name}</span>
            <span style={{ fontSize: 11.5, color: T.textMuted }}>{r.count} snippet{r.count === 1 ? '' : 's'}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: T.divider, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${r.pct}%`, borderRadius: 999,
              background: CATEGORY_COLOR[r.name] || '#2E74B5',
              transition: 'width 700ms cubic-bezier(.16,1,.3,1)',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Achievements — unlock thresholds computed from real stats
   ════════════════════════════════════════════════════════════ */
export function Achievements({ stats, T = DEFAULT_T }) {
  const badges = [
    { key: 'first', label: 'First Snippet', icon: '📄', unlocked: stats.total >= 1, desc: 'Save your first snippet' },
    { key: 'streak3', label: 'Streak Starter', icon: '🔥', unlocked: stats.currentStreak >= 3, desc: '3-day coding streak' },
    { key: 'solver', label: 'Problem Solver', icon: '🧩', unlocked: stats.total >= 10, desc: 'Save 10 snippets' },
    { key: 'explorer', label: 'Structure Explorer', icon: '🗺️', unlocked: stats.modules >= 5, desc: 'Practice 5 different modules' },
    { key: 'consistent', label: 'Consistent Coder', icon: '📅', unlocked: stats.longestStreak >= 7, desc: '7-day streak' },
    { key: 'polyglot', label: 'Polyglot', icon: '🌐', unlocked: stats.languageCount >= 2, desc: 'Use 2+ languages' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
      {badges.map(b => (
        <div
          key={b.key}
          title={b.unlocked ? `${b.label} — unlocked` : `Locked: ${b.desc}`}
          style={{
            padding: '14px 10px', borderRadius: 12, textAlign: 'center',
            background: b.unlocked
              ? (T.mode === 'dark' ? 'linear-gradient(135deg,rgba(59,130,196,.18),rgba(139,92,246,.18))' : 'linear-gradient(135deg,#EFF6FF,#F5F3FF)')
              : T.cardAlt,
            border: `1.5px solid ${b.unlocked ? (T.mode === 'dark' ? 'rgba(139,92,246,.4)' : '#c7d2fe') : T.cardBorder}`,
            boxShadow: b.unlocked && T.mode === 'dark' ? '0 0 14px rgba(139,92,246,.18)' : 'none',
            opacity: b.unlocked ? 1 : 0.55,
            transition: 'transform 150ms',
            cursor: 'default',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
        >
          <div style={{ fontSize: 24, marginBottom: 6, filter: b.unlocked ? 'none' : 'grayscale(1)' }}>{b.unlocked ? b.icon : '🔒'}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: b.unlocked ? T.text : T.textMuted }}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Daily coding goal — real "snippets saved today" vs a fixed goal
   ════════════════════════════════════════════════════════════ */
export function DailyGoal({ todayCount, goal = 5, T = DEFAULT_T, onStartPracticing }) {
  const target = Math.min(100, Math.round((todayCount / goal) * 100));
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPct(target));
    return () => cancelAnimationFrame(raf);
  }, [target]);
  const done = todayCount >= goal;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{todayCount} / {goal}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: done ? '#15803d' : T.accent }}>{pct}%</span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: T.divider, overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 999,
          background: done ? 'linear-gradient(90deg,#4CAF50,#22c55e)' : 'linear-gradient(90deg,#2E74B5,#3B82C4)',
          transition: 'width 700ms cubic-bezier(.16,1,.3,1)',
        }} />
      </div>
      <p style={{ fontSize: 12, color: T.textSecondary, margin: done ? 0 : '0 0 12px' }}>
        {done ? '🎉 Goal complete — great consistency today!' : `Keep going! ${goal - todayCount} more snippet${goal - todayCount === 1 ? '' : 's'} to complete today's goal.`}
      </p>
      {!done && onStartPracticing && (
        <button
          onClick={onStartPracticing}
          style={{
            border: 'none', background: 'linear-gradient(135deg,#2E74B5,#1F4E79)', color: '#fff',
            fontSize: 12.5, fontWeight: 700, padding: '8px 16px', borderRadius: 9, cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(46,116,181,.35)', transition: 'transform 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
        >Start Practicing →</button>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Streak-at-risk alert — only rendered by the caller when
   currentStreak > 0 AND nothing has been practiced today, so a
   real streak is about to break at midnight. Deliberately NOT the
   neutral `Card` wrapper — an urgent nudge needs to visually pop
   against the rest of the dashboard, not blend in.
   ════════════════════════════════════════════════════════════ */
export function StreakRiskAlert({ currentStreak, T = DEFAULT_T, onPractice }) {
  ensureEntranceStyles();
  return (
    <div style={{
      borderRadius: 16, padding: '18px 20px',
      background: T.mode === 'dark' ? 'linear-gradient(135deg,rgba(225,87,89,.16),rgba(242,169,59,.10))' : 'linear-gradient(135deg,#FEF2F2,#FFF7ED)',
      border: `1.5px solid ${T.mode === 'dark' ? 'rgba(225,87,89,.4)' : '#fecaca'}`,
      boxShadow: T.mode === 'dark' ? '0 0 18px rgba(225,87,89,.14)' : 'none',
      animation: 'dsvp-fade-up 480ms ease both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16, animation: 'dsvp-pulse-soft 1.8s ease-in-out infinite' }}>⚠️</span>
        <span style={{
          fontSize: 13, fontWeight: 800, letterSpacing: '.02em',
          color: T.mode === 'dark' ? '#f87171' : '#dc2626', textTransform: 'uppercase',
        }}>Your streak is at risk</span>
      </div>
      <p style={{ fontSize: 13, color: T.textSecondary, margin: '0 0 14px' }}>You haven't practiced today.</p>

      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Current streak</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>🔥 {currentStreak} day{currentStreak === 1 ? '' : 's'}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Today's requirement</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>1 activity</div>
        </div>
      </div>

      <button
        onClick={onPractice}
        style={{
          border: 'none', width: '100%', background: 'linear-gradient(135deg,#E15759,#dc2626)', color: '#fff',
          fontSize: 12.5, fontWeight: 700, padding: '10px 16px', borderRadius: 9, cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(225,87,89,.35)', transition: 'transform 150ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(2px)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
      >Practice for 10 minutes →</button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Streak calendar — full month grid of practice days, from real
   CreatedAt dates. Navigable month-by-month, LeetCode-style.
   ════════════════════════════════════════════════════════════ */
const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function keyOf(d) { return localKey(d); }

export function StreakCalendar({ history, currentStreak, longestStreak, T = DEFAULT_T, onAction }) {
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const practiced = useMemo(() => {
    const map = {};
    history.forEach(h => {
      if (!h.CreatedAt) return;
      const k = keyOf(new Date(h.CreatedAt));
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [history]);

  const weeks = useMemo(() => {
    const year = viewDate.getFullYear(), month = viewDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // 0 = Monday
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - startOffset);

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const key = keyOf(d);
      cells.push({
        date: d, key,
        inMonth: d.getMonth() === month,
        isToday: key === keyOf(today),
        count: practiced[key] || 0,
      });
    }
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    // trim trailing all-outside-month rows
    while (rows.length > 5 && rows[rows.length - 1].every(c => !c.inMonth)) rows.pop();
    return rows;
  }, [viewDate, practiced, today]);

  const monthLabel = viewDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return (
    <div>
      {/* streak summary row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, background: T.mode === 'dark' ? 'rgba(242,169,59,.15)' : '#FFF7ED',
            animation: 'dsvp-pulse-soft 2.4s ease-in-out infinite',
          }}>🔥</span>
          <div>
            <div style={{ fontSize: 10.5, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.03em' }}>Current Streak</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{currentStreak} day{currentStreak === 1 ? '' : 's'}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, background: T.mode === 'dark' ? 'rgba(59,130,196,.18)' : '#EFF6FF',
          }}>⚡</span>
          <div>
            <div style={{ fontSize: 10.5, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.03em' }}>Longest Streak</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{longestStreak} day{longestStreak === 1 ? '' : 's'}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 18 }} className="dsvp-streak-grid">
        {/* month grid */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              title="Previous month"
              style={{
                width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.border}`,
                background: T.cardAlt, color: T.textSecondary, cursor: 'pointer', fontSize: 13,
              }}
            >‹</button>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{monthLabel}</div>
            <button
              onClick={() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              title="Next month"
              style={{
                width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.border}`,
                background: T.cardAlt, color: T.textSecondary, cursor: 'pointer', fontSize: 13,
              }}
            >›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 6 }}>
            {WEEK_LABELS.map(l => (
              <div key={l} style={{ fontSize: 10.5, color: T.textMuted, textAlign: 'center' }}>{l}</div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {weeks.map((row, ri) => (
              <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                {row.map(c => {
                  const practicedDay = c.count > 0;
                  return (
                    <div
                      key={c.key}
                      title={`${c.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} — ${c.count} ${c.count === 1 ? 'activity' : 'activities'}`}
                      style={{
                        aspectRatio: '1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12.5, fontWeight: c.isToday ? 800 : 600,
                        color: practicedDay ? '#fff' : (c.inMonth ? T.text : T.textMuted),
                        opacity: c.inMonth ? 1 : 0.4,
                        background: practicedDay ? 'linear-gradient(135deg,#22c55e,#16a34a)' : T.cardAlt,
                        border: c.isToday ? `1.5px solid ${T.accent}` : `1px solid ${practicedDay ? 'transparent' : T.cardBorder}`,
                        boxShadow: practicedDay ? '0 0 10px rgba(34,197,94,.35)' : 'none',
                        animation: c.isToday ? 'dsvp-pulse-soft 2s ease-in-out infinite' : 'none',
                        transition: 'transform 120ms',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.12)'; }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
                    >{c.date.getDate()}</div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* motivational side panel */}
        <div style={{
          borderRadius: 14, padding: '20px 16px', textAlign: 'center',
          background: T.mode === 'dark' ? 'rgba(139,92,246,.08)' : '#F8FAFC',
          border: `1px solid ${T.mode === 'dark' ? 'rgba(139,92,246,.25)' : T.divider}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <span style={{
            width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, background: T.mode === 'dark' ? 'rgba(242,169,59,.15)' : '#FFF7ED',
            border: `1px solid ${T.mode === 'dark' ? 'rgba(242,169,59,.35)' : '#fed7aa'}`,
          }}>🏆</span>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.warning }}>Keep the momentum!</div>
          <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.5 }}>
            Consistency is the key to mastering DSA.
          </div>
          {onAction && (
            <button
              onClick={onAction}
              title="Keep practicing"
              style={{
                width: 34, height: 34, borderRadius: '50%', border: `1px solid ${T.chipBorder}`,
                background: T.chipBg, color: T.accent, fontSize: 15, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 6,
                transition: 'transform 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(3px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
            >→</button>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 560px) {
          .dsvp-streak-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Summary strip — compact totals
   ════════════════════════════════════════════════════════════ */
export function SummaryStrip({ items, T = DEFAULT_T }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: 12 }}>
      {items.map(it => (
        <div key={it.label} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 10, background: T.cardAlt, border: `1px solid ${T.divider}` }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{it.value}</div>
          <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '.03em' }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}
