import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { getAdminDashboard, getAdminAnalytics } from '../../../services/api';
import { KpiCard, Card, Spinner, ErrorBanner, fmtDate, fmtRupee, Avatar, Badge } from '../ui';

const PIE_COLORS = ['#4CAF50', '#E15759', '#F2A93B'];

export default function OverviewTab() {
  const [data,      setData]      = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  useEffect(() => {
    Promise.all([getAdminDashboard(), getAdminAnalytics(7)])
      .then(([d, a]) => { setData(d.data); setAnalytics(a.data); })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: '32px 32px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>Overview</h1>
        <p style={{ fontSize: 14, color: '#64748b' }}>Platform health at a glance.</p>
      </div>

      <ErrorBanner message={error} />

      {data && (
        <>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 18, marginBottom: 32 }}>
            <KpiCard icon="👥" label="Total Users"    value={data.kpis.totalUsers}                          color="#2E74B5" bg="#EFF6FF" />
            <KpiCard icon="⭐" label="Premium Users"  value={data.kpis.premiumUsers}                        color="#F2A93B" bg="#FFF7ED" />
            <KpiCard icon="💰" label="Revenue"        value={fmtRupee(data.kpis.totalRevenue)}              color="#4CAF50" bg="#F0FDF4" />
            <KpiCard icon="📈" label="Conversion"     value={`${data.kpis.conversionRate}%`}                color="#E15759" bg="#FFF1F2" />
            <KpiCard icon="💬" label="Open Feedback"  value={data.kpis.openFeedback ?? 0}                   color="#8b5cf6" bg="#F5F3FF" />
          </div>

          {/* Charts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 380px', gap: 22, marginBottom: 32 }}>

            {/* Runs per day */}
            <Card style={{ padding: '20px 22px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>Code Runs (7 days)</h3>
              <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>Daily execution trace count</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={analytics?.runsByDay || []} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickFormatter={v => new Date(v).toLocaleDateString('en-IN',{month:'short',day:'numeric'})} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
                  <Line type="monotone" dataKey="runs" stroke="#2E74B5" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Module popularity */}
            <Card style={{ padding: '20px 22px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>Module Popularity</h3>
              <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>Attempts per module</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.modulePopularity || []} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="Name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                    cursor={{ fill: 'rgba(46,116,181,.08)' }} />
                  <Bar dataKey="Attempts" fill="#2E74B5" radius={[5,5,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Execution status pie */}
            <Card style={{ padding: '20px 22px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>Execution Status</h3>
              <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>Success vs errors (all-time)</p>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={analytics?.errorRate || []} dataKey="count" nameKey="Status"
                    cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) =>
                      `${name} ${(percent*100).toFixed(0)}%`}>
                    {(analytics?.errorRate || []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Bottom row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>

            {/* Recent sign-ups */}
            <Card>
              <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Recent Sign-ups</h3>
              </div>
              <div>
                {(data.recentSignups || []).map((u, i) => (
                  <div key={u.UserId} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px',
                    borderBottom: i < data.recentSignups.length-1 ? '1px solid #f8fafc' : 'none',
                  }}>
                    <Avatar name={u.FullName} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.FullName}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{u.Email}</div>
                    </div>
                    <Badge variant={u.Role === 'admin' ? 'admin' : 'user'}>{u.Role || 'user'}</Badge>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(u.CreatedAt)}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Recent code runs */}
            <Card>
              <div style={{ padding: '18px 20px', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Recent Code Runs</h3>
              </div>
              <div>
                {(data.recentTraces || []).map((t, i) => (
                  <div key={t.TraceId} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 20px',
                    borderBottom: i < data.recentTraces.length-1 ? '1px solid #f8fafc' : 'none',
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                      background: t.Status === 'success' ? '#F0FDF4' : '#fef2f2',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>{t.Status === 'success' ? '▶' : '⚠'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{t.FullName}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{t.Language}</div>
                    </div>
                    <Badge variant={t.Status === 'success' ? 'success' : 'failed'}>{t.Status}</Badge>
                    <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(t.CreatedAt)}</span>
                  </div>
                ))}
                {(!data.recentTraces || data.recentTraces.length === 0) && (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    No runs yet
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
