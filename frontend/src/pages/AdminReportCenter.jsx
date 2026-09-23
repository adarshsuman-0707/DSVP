import { useCallback, useEffect, useState } from 'react';
import AppShell from '../components/common/AppShell';
import { PageHeader, ErrorBanner, useToasts, ToastStack, FormField, Input, Select, Btn } from '../components/AdminDashboard/ui';
import { useTheme } from '../context/ThemeContext';
import ReportSummaryCards from '../components/Reports/ReportSummaryCards';
import ReportTypeSelector from '../components/Reports/ReportTypeSelector';
import ReportFilters from '../components/Reports/ReportFilters';
import ReportPreview from '../components/Reports/ReportPreview';
import ExportButtons from '../components/Reports/ExportButtons';
import ReportHistory from '../components/Reports/ReportHistory';
import { ADMIN_REPORT_TYPES, REPORT_COLUMNS } from '../components/Reports/reportTypes';
import { getAdminReportSummary, getAdminReportData, exportAdminReport, getAdminReportHistory } from '../services/api';

export default function AdminReportCenter() {
  const { T } = useTheme();
  const { toasts, push } = useToasts();

  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');

  const [type, setType] = useState('users');
  const [filters, setFilters] = useState({});
  const [moreOpen, setMoreOpen] = useState(false);
  const [userFilter, setUserFilter] = useState('');
  const [plan, setPlan] = useState('all');
  const [role, setRole] = useState('all');
  const [paymentStatus, setPaymentStatus] = useState('all');

  const [data, setData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    getAdminReportSummary().then(r => setSummary(r.data)).catch(() => setSummaryError('Unable to load platform summary right now.'));
    loadHistory();
  }, []);

  function loadHistory() {
    setHistoryLoading(true);
    getAdminReportHistory()
      .then(r => setHistory(Array.isArray(r.data) ? r.data : (r.data?.history || r.data?.records || [])))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }

  const fetchData = useCallback((activeType, activeFilters) => {
    setDataLoading(true); setDataError('');
    getAdminReportData({ type: activeType, ...activeFilters })
      .then(r => setData(r.data))
      .catch(() => { setDataError('Unable to load report data.'); setData(null); })
      .finally(() => setDataLoading(false));
  }, []);

  useEffect(() => { fetchData(type, filters); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  function extraFilters() {
    return {
      user: userFilter || undefined,
      plan: plan !== 'all' ? plan : undefined,
      role: role !== 'all' ? role : undefined,
      paymentStatus: paymentStatus !== 'all' ? paymentStatus : undefined,
    };
  }

  function handleApply(f) {
    const merged = { ...f, ...extraFilters() };
    setFilters(merged);
    fetchData(type, merged);
  }
  function handleReset() {
    setUserFilter(''); setPlan('all'); setRole('all'); setPaymentStatus('all');
    setFilters({});
    fetchData(type, {});
  }

  const columns = (data?.columns?.length ? data.columns : REPORT_COLUMNS[type].map(c => ({ key: c, label: c })));
  const records = data?.records || [];

  async function handleHistoryDownload(row) {
    const rType = row.ReportType ?? row.reportType ?? type;
    const format = (row.Format ?? row.format ?? 'excel').toLowerCase();
    const ext = format === 'excel' ? 'xlsx' : format;
    try {
      const res = await exportAdminReport({ type: rType, format });
      const blob = res.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${rType}-report.${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      push('error', 'Unable to generate the report. Try again.');
    }
  }

  const cards = summary ? [
    { icon: '👥', label: 'Total Users',        value: summary.totalUsers ?? 0,        color: '#2E74B5', bg: '#EFF6FF' },
    { icon: '🟢', label: 'Active Users',       value: summary.activeUsers ?? 0,       color: '#4CAF50', bg: '#F0FDF4' },
    { icon: '⭐', label: 'Premium Users',      value: summary.premiumUsers ?? 0,      color: '#8b5cf6', bg: '#F5F3FF' },
    { icon: '💰', label: 'Total Revenue',      value: `₹${Number(summary.totalRevenue ?? 0).toLocaleString('en-IN')}`, color: '#4CAF50', bg: '#F0FDF4' },
    { icon: '⚙',  label: 'Total Executions',   value: summary.totalExecutions ?? 0,   color: '#F2A93B', bg: '#FFF7ED' },
    { icon: '📘', label: 'Modules Completed',  value: summary.modulesCompleted ?? 0,  color: '#2E74B5', bg: '#EFF6FF' },
    { icon: '📝', label: 'Pending Feedback',   value: summary.pendingFeedback ?? 0,   color: '#E15759', bg: '#FFF1F2' },
    { icon: '🛡',  label: 'Audit Events',       value: summary.auditEvents ?? 0,       color: '#64748b', bg: '#F1F5F9' },
  ] : [];

  return (
    <AppShell>
      <div style={{ padding: '32px 32px', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <PageHeader title="Admin Report Center" subtitle="Monitor users, learning activity, payments and platform operations." />

        <ErrorBanner message={summaryError} />
        {summary && <ReportSummaryCards cards={cards} />}

        <div style={{ marginBottom: 12 }}>
          <ReportTypeSelector types={ADMIN_REPORT_TYPES} value={type} onChange={setType} />
        </div>

        <ReportFilters type={type} onApply={handleApply} onReset={handleReset}
          resultCount={data?.total ?? records.length} loaded={!!data} />

        {/* More Filters — collapsed by default so the panel isn't overloaded */}
        <div style={{ marginBottom: 20 }}>
          <button onClick={() => setMoreOpen(o => !o)} style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
            fontWeight: 600, color: T.accent, padding: '4px 0', marginBottom: moreOpen ? 10 : 0,
          }}>
            More Filters {moreOpen ? '▴' : '▾'}
          </button>
          {moreOpen && (
            <div style={{
              background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 14,
              padding: '16px 20px', display: 'grid', gap: 14,
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            }}>
              <FormField label="User (search)">
                <Input value={userFilter} onChange={setUserFilter} placeholder="Name or email" />
              </FormField>
              <FormField label="Plan">
                <Select value={plan} onChange={setPlan}>
                  <option value="all">All Plans</option>
                  <option value="free">Free</option>
                  <option value="basic">Basic</option>
                  <option value="premium">Premium</option>
                </Select>
              </FormField>
              <FormField label="Role">
                <Select value={role} onChange={setRole}>
                  <option value="all">All Roles</option>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </Select>
              </FormField>
              <FormField label="Payment Status">
                <Select value={paymentStatus} onChange={setPaymentStatus}>
                  <option value="all">All</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                  <option value="pending">Pending</option>
                  <option value="refunded">Refunded</option>
                </Select>
              </FormField>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <Btn variant="primary" onClick={() => handleApply(filters)}>Apply</Btn>
              </div>
            </div>
          )}
        </div>

        <ErrorBanner message={dataError} />

        <ReportPreview
          title={data?.label || ADMIN_REPORT_TYPES.find(t => t.value === type)?.label || 'Report'}
          summary={[
            { label: 'Total Records', value: data?.total ?? records.length },
            { label: 'Generated', value: data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—' },
          ]}
          columns={columns}
          records={records}
          loading={dataLoading}
          onResetFilters={handleReset}
        />

        <ExportButtons
          exportFn={exportAdminReport}
          reportType={type}
          filters={filters}
          pushToast={push}
          disabled={dataLoading}
        />

        <ReportHistory rows={history} loading={historyLoading} onDownload={handleHistoryDownload} />
      </div>
      <ToastStack toasts={toasts} />
    </AppShell>
  );
}
