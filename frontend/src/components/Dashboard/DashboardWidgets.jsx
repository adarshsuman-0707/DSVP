import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

/* ════════════════════════════════════════════════════════════
   Shared visual tokens (kept consistent with the rest of DSVP —
   no new theme system, just reused var(--*) tokens + accents)
   ════════════════════════════════════════════════════════════ */
export const CARD = {
  background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 16,
  boxShadow: '0 1px 4px rgba(0,0,0,.05)', overflow: 'hidden',
};

export function Card({ title, subtitle, icon, right, children, style }) {
  return (
    <div style={{ ...CARD, ...style }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid #f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {icon && (
            <span style={{
              width: 30, height: 30, borderRadius: 8, background: '#EFF6FF',
              border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 14, flexShrink: 0,
            }}>{icon}</span>
          )}
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>{title}</h2>
            {subtitle && <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, marginBottom: 0 }}>{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  );
}

/* ── Rich stat tile with hover + optional trend ── */
export function RichStat({ icon, label, value, accent = '#2E74B5', sub }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: '1 1 150px', minWidth: 150, background: '#fff',
        border: `1.5px solid ${hover ? accent + '55' : '#e2e8f0'}`, borderRadius: 14,
        padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6,
        boxShadow: hover ? `0 6px 18px ${accent}22` : '0 1px 4px rgba(0,0,0,.04)',
        transform: hover ? 'translateY(-2px)' : 'none',
        transition: 'all 180ms ease', cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 7, background: `${accent}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
        }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Activity Heatmap — GitHub/LeetCode style, built from real
   CreatedAt timestamps in the user's saved-code history.
   ════════════════════════════════════════════════════════════ */
const DAY_MS = 86400000;
function toKey(d) { return d.toISOString().slice(0, 10); }

export function ActivityHeatmap({ history }) {
  const { weeks, monthLabels, maxCount } = useMemo(() => {
    const counts = {};
    history.forEach(h => {
      if (!h.CreatedAt) return;
      const k = toKey(new Date(h.CreatedAt));
      counts[k] = (counts[k] || 0) + 1;
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const totalDays = 371; // ~53 weeks
    const start = new Date(today.getTime() - (totalDays - 1) * DAY_MS);
    // align start to a Sunday
    start.setDate(start.getDate() - start.getDay());

    const days = [];
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
      days.push({ date: new Date(d), key: toKey(d), count: counts[toKey(d)] || 0 });
    }

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    const monthLabels = [];
    let lastMonth = -1;
    weeks.forEach((w, i) => {
      const m = w[0].date.getMonth();
      if (m !== lastMonth) { monthLabels.push({ index: i, label: w[0].date.toLocaleDateString('en-US', { month: 'short' }) }); lastMonth = m; }
    });

    const maxCount = Math.max(1, ...Object.values(counts));
    return { weeks, monthLabels, maxCount };
  }, [history]);

  function intensity(count) {
    if (count === 0) return '#161b22'.replace('#161b22', '#eef2f6');
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
              <div key={i} style={{ width: 10, fontSize: 9.5, color: '#94a3b8', flexShrink: 0 }}>
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
                    border: '1px solid rgba(0,0,0,.04)',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
          <span>Less</span>
          {['#eef2f6', '#bbf7d0', '#86efac', '#4ade80', '#16a34a'].map(c => (
            <span key={c} style={{ width: 10, height: 10, borderRadius: 2.5, background: c, border: '1px solid rgba(0,0,0,.04)' }} />
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

export function LanguageDonut({ history }) {
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
    return <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>No language data yet — save a snippet to see your distribution.</p>;
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
            <Tooltip formatter={(v, n) => [`${v} snippet${v === 1 ? '' : 's'}`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1e293b' }}>{top.name}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{top.pct}%</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 140, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map(d => (
          <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: '#374151', flex: 1 }}>{d.name}</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1e293b' }}>{d.pct}%</span>
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

export function TopicProgress({ history }) {
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
    return <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>Practice a module to start building your topic progress.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {rows.map(r => (
        <div key={r.name}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#374151' }}>{r.name}</span>
            <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{r.count} snippet{r.count === 1 ? '' : 's'}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
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
export function Achievements({ stats }) {
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
            background: b.unlocked ? 'linear-gradient(135deg,#EFF6FF,#F5F3FF)' : '#f8fafc',
            border: `1.5px solid ${b.unlocked ? '#c7d2fe' : '#e2e8f0'}`,
            opacity: b.unlocked ? 1 : 0.55,
            transition: 'transform 150ms',
            cursor: 'default',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
        >
          <div style={{ fontSize: 24, marginBottom: 6, filter: b.unlocked ? 'none' : 'grayscale(1)' }}>{b.unlocked ? b.icon : '🔒'}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: b.unlocked ? '#1e293b' : '#94a3b8' }}>{b.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Daily coding goal — real "snippets saved today" vs a fixed goal
   ════════════════════════════════════════════════════════════ */
export function DailyGoal({ todayCount, goal = 5 }) {
  const pct = Math.min(100, Math.round((todayCount / goal) * 100));
  const done = todayCount >= goal;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{todayCount} / {goal}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: done ? '#15803d' : '#2E74B5' }}>{pct}%</span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 999,
          background: done ? 'linear-gradient(90deg,#4CAF50,#22c55e)' : 'linear-gradient(90deg,#2E74B5,#3B82C4)',
          transition: 'width 700ms cubic-bezier(.16,1,.3,1)',
        }} />
      </div>
      <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
        {done ? '🎉 Goal complete — great consistency today!' : `Keep going! ${goal - todayCount} more snippet${goal - todayCount === 1 ? '' : 's'} to complete today's goal.`}
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Summary strip — compact totals
   ════════════════════════════════════════════════════════════ */
export function SummaryStrip({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px,1fr))', gap: 12 }}>
      {items.map(it => (
        <div key={it.label} style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 10, background: '#f8fafc', border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{it.value}</div>
          <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2, textTransform: 'uppercase', letterSpacing: '.03em' }}>{it.label}</div>
        </div>
      ))}
    </div>
  );
}
