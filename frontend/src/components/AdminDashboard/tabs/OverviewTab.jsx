import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import { getAdminDashboard, getAdminAnalytics } from '../../../services/api';
import { Card, Spinner, ErrorBanner, EmptyState, fmtDate, fmtRupee, Avatar, Badge } from '../ui';
import { useTheme } from '../../../context/ThemeContext';

const PIE_COLORS = ['#4CAF50', '#E15759', '#F2A93B'];

function StatCard({ icon, label, value, sub }) {
  const { T } = useTheme();
  return (
    <Card style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {label}
        </span>
        <span style={{
          width: 28, height: 28, borderRadius: 8, background: T.cardAlt,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, color: T.textSecondary, flexShrink: 0,
        }}>{icon}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: T.text, lineHeight: 1, marginBottom: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.textMuted }}>{sub}</div>}
    </Card>
  );
}

function SectionCard({ title, children }) {
  const { T } = useTheme();
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.divider}` }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {title}
        </h3>
      </div>
      <div style={{ padding: '6px 20px' }}>{children}</div>
    </Card>
  );
}

function Row({ label, value, badge }) {
  const { T } = useTheme();
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '11px 0', borderBottom: `1px solid ${T.divider}`,
    }}>
      <span style={{ fontSize: 13, color: T.textSecondary }}>{label}</span>
      {badge ? badge : <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{value}</span>}
    </div>
  );
}

export default function OverviewTab() {
  const { T } = useTheme();
  const [data,      setData]      = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  function load() {
    setLoading(true);
    setError('');
    Promise.all([getAdminDashboard(), getAdminAnalytics(7)])
      .then(([d, a]) => { setData(d.data); setAnalytics(a.data); })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  if (loading) return <Spinner />;

  const axisTick = { fontSize: 10, fill: T.textMuted };
  const gridStroke = T.divider;
  const tooltipStyle = { borderRadius: 10, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 12 };

  if (error) {
    return (
      <div style={{ padding: '32px 32px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text, marginBottom: 4 }}>Overview</h1>
          <p style={{ fontSize: 14, color: T.textSecondary }}>Platform health at a glance.</p>
        </div>
        <ErrorBanner message={error} />
        <button onClick={load} style={{
          padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.border}`,
          background: T.cardAlt, color: T.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>Retry</button>
      </div>
    );
  }

  const revenueTrend = data?.revenueTrend || [];
  const revenueValues = revenueTrend.map(d => Number(d.revenue) || 0);
  const revenueTotal = revenueValues.reduce((s, v) => s + v, 0);
  const half = Math.floor(revenueValues.length / 2) || 1;
  const firstHalf = revenueValues.slice(0, half).reduce((s, v) => s + v, 0);
  const secondHalf = revenueValues.slice(half).reduce((s, v) => s + v, 0);
  const revenueTrendPct = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : (secondHalf > 0 ? 100 : 0);

  const totalUsers = data?.kpis.totalUsers ?? 0;
  const activeUsers = data?.kpis.activeUsers ?? 0;
  const premiumUsers = data?.kpis.premiumUsers ?? 0;
  const activePct = totalUsers > 0 ? ((activeUsers / totalUsers) * 100).toFixed(1) : '0.0';
  const premiumPct = totalUsers > 0 ? ((premiumUsers / totalUsers) * 100).toFixed(1) : '0.0';

  return (
    <div style={{ padding: '32px 32px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text, marginBottom: 4 }}>Overview</h1>
        <p style={{ fontSize: 14, color: T.textSecondary }}>Platform health at a glance.</p>
      </div>

      {data && (
        <>
          {/* Primary KPI row */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, marginBottom: 24,
          }} className="ov-kpi-grid">
            <StatCard icon="👥" label="Total Users" value={totalUsers}
              sub={`+${data.kpis.newUsersToday ?? 0} today`} />
            <StatCard icon="🟢" label="Active Users" value={activeUsers}
              sub={`${activePct}% of users`} />
            <StatCard icon="⭐" label="Premium Users" value={premiumUsers}
              sub={`${premiumPct}% of users`} />
            <StatCard icon="💰" label="Total Revenue" value={fmtRupee(data.kpis.totalRevenue)}
              sub="from successful payments" />
          </div>

          {/* Revenue trend */}
          <Card style={{ padding: '22px 24px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 2 }}>Revenue</h3>
                <p style={{ fontSize: 11, color: T.textMuted }}>Last 7 days</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.text, lineHeight: 1 }}>{fmtRupee(revenueTotal)}</div>
                {revenueTrend.length > 1 && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: revenueTrendPct >= 0 ? T.success : T.danger, marginTop: 4 }}>
                    {revenueTrendPct >= 0 ? '+' : ''}{revenueTrendPct.toFixed(1)}% vs previous period
                  </div>
                )}
              </div>
            </div>
            {revenueTrend.length === 0 ? (
              <EmptyState icon="📈" title="No revenue data yet" subtitle="Revenue will appear here once payments come in." />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={revenueTrend} margin={{ left: -20, top: 8 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.accent} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={T.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="day" tick={axisTick} axisLine={{ stroke: gridStroke }} tickLine={false}
                    tickFormatter={v => new Date(v).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} />
                  <YAxis tick={axisTick} axisLine={false} tickLine={false}
                    tickFormatter={v => `₹${v}`} />
                  <Tooltip contentStyle={tooltipStyle}
                    labelFormatter={v => new Date(v).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}
                    formatter={v => [fmtRupee(v), 'Revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke={T.accent} strokeWidth={2.5}
                    fill="url(#revenueFill)" dot={{ r: 3, fill: T.accent, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Secondary overview: activity / payments / engagement */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18, marginBottom: 24,
          }} className="ov-secondary-grid">
            <SectionCard title="User Activity">
              <Row label="Today's Activity" value={data.kpis.todayActivity ?? 0} />
              <Row label="New Users" value={data.kpis.newUsersToday ?? 0} />
              <Row label="Active Users" value={activeUsers} />
            </SectionCard>

            <SectionCard title="Payments">
              <Row label="Total Payments" value={data.kpis.totalPayments ?? 0} />
              <Row label="Successful" badge={<Badge variant="success">{data.kpis.successfulPayments ?? 0}</Badge>} />
              <Row label="Pending" badge={<Badge variant="pending">{data.kpis.pendingPayments ?? 0}</Badge>} />
              <Row label="Revenue" value={fmtRupee(data.kpis.totalRevenue)} />
            </SectionCard>

            <SectionCard title="Engagement">
              <Row label="Conversion" value={`${data.kpis.conversionRate}%`} />
              <Row label="Open Feedback" value={data.kpis.openFeedback ?? 0} />
              <Row label="Premium Users" value={premiumUsers} />
            </SectionCard>
          </div>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 380px', gap: 22, marginBottom: 24 }} className="ov-charts-grid">

            {/* Runs per day */}
            <Card style={{ padding: '20px 22px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 2 }}>Code Runs (7 days)</h3>
              <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 16 }}>Daily execution trace count</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={analytics?.runsByDay || []} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="day" tick={axisTick}
                    tickFormatter={v => new Date(v).toLocaleDateString('en-IN',{month:'short',day:'numeric'})} />
                  <YAxis tick={axisTick} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="runs" stroke={T.accent} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Module popularity */}
            <Card style={{ padding: '20px 22px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 2 }}>Module Popularity</h3>
              <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 16 }}>Attempts per module</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.modulePopularity || []} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="Name" tick={axisTick} />
                  <YAxis tick={axisTick} />
                  <Tooltip contentStyle={tooltipStyle}
                    cursor={{ fill: T.hoverBg }} />
                  <Bar dataKey="Attempts" fill={T.accent} radius={[5,5,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Execution status pie */}
            <Card style={{ padding: '20px 22px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 2 }}>Execution Status</h3>
              <p style={{ fontSize: 11, color: T.textMuted, marginBottom: 16 }}>Success vs errors (all-time)</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={analytics?.errorRate || []} dataKey="count" nameKey="Status"
                    cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) =>
                      `${name} ${(percent*100).toFixed(0)}%`}>
                    {(analytics?.errorRate || []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Bottom row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }} className="ov-bottom-grid">

            {/* Recent sign-ups */}
            <Card>
              <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.divider}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Recent Sign-ups</h3>
              </div>
              <div>
                {(data.recentSignups || []).map((u, i) => (
                  <div key={u.UserId} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px',
                    borderBottom: i < data.recentSignups.length-1 ? `1px solid ${T.divider}` : 'none',
                  }}>
                    <Avatar name={u.FullName} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.FullName}</div>
                      <div style={{ fontSize: 11, color: T.textMuted }}>{u.Email}</div>
                    </div>
                    <Badge variant={u.Role === 'admin' ? 'admin' : 'user'}>{u.Role || 'user'}</Badge>
                    <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>{fmtDate(u.CreatedAt)}</span>
                  </div>
                ))}
                {(!data.recentSignups || data.recentSignups.length === 0) && (
                  <EmptyState icon="👥" title="No sign-ups yet" />
                )}
              </div>
            </Card>

            {/* Recent code runs */}
            <Card>
              <div style={{ padding: '18px 20px', borderBottom: `1px solid ${T.divider}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Recent Code Runs</h3>
              </div>
              <div>
                {(data.recentTraces || []).map((t, i) => (
                  <div key={t.TraceId} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px',
                    borderBottom: i < data.recentTraces.length-1 ? `1px solid ${T.divider}` : 'none',
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      background: t.Status === 'success' ? (T.mode === 'dark' ? 'rgba(76,175,80,.16)' : '#F0FDF4') : (T.mode === 'dark' ? 'rgba(225,87,89,.16)' : '#fef2f2'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>{t.Status === 'success' ? '▶' : '⚠'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t.FullName}</div>
                      <div style={{ fontSize: 11, color: T.textMuted }}>{t.Language}</div>
                    </div>
                    <Badge variant={t.Status === 'success' ? 'success' : 'failed'}>{t.Status}</Badge>
                    <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>{fmtDate(t.CreatedAt)}</span>
                  </div>
                ))}
                {(!data.recentTraces || data.recentTraces.length === 0) && (
                  <EmptyState icon="▶" title="No runs yet" />
                )}
              </div>
            </Card>
          </div>

          <style>{`
            @media (max-width: 1100px) {
              .ov-charts-grid { grid-template-columns: 1fr 1fr !important; }
            }
            @media (max-width: 900px) {
              .ov-kpi-grid { grid-template-columns: repeat(2,1fr) !important; }
              .ov-secondary-grid { grid-template-columns: 1fr !important; }
              .ov-charts-grid { grid-template-columns: 1fr !important; }
              .ov-bottom-grid { grid-template-columns: 1fr !important; }
            }
            @media (max-width: 560px) {
              .ov-kpi-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
