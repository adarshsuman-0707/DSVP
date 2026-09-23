import { useCallback, useEffect, useState } from 'react';
import AppShell from '../components/common/AppShell';
import { PageHeader, ErrorBanner, useToasts, ToastStack } from '../components/AdminDashboard/ui';
import ReportSummaryCards from '../components/Reports/ReportSummaryCards';
import ReportTypeSelector from '../components/Reports/ReportTypeSelector';
import ReportFilters from '../components/Reports/ReportFilters';
import ReportPreview from '../components/Reports/ReportPreview';
import ExportButtons from '../components/Reports/ExportButtons';
import ReportHistory from '../components/Reports/ReportHistory';
import { USER_REPORT_TYPES, REPORT_COLUMNS } from '../components/Reports/reportTypes';
import { getMyReportSummary, getMyReportData, exportMyReport, getMyReportHistory } from '../services/api';

export default function UserReportCenter() {
  const { toasts, push } = useToasts();

  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');

  const [type, setType] = useState('learning');
  const [filters, setFilters] = useState({});
  const [applied, setApplied] = useState(false);
  const [data, setData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState('');

  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    getMyReportSummary().then(r => setSummary(r.data)).catch(() => setSummaryError('Unable to load your summary right now.'));
    loadHistory();
  }, []);

  function loadHistory() {
    setHistoryLoading(true);
    getMyReportHistory()
      .then(r => setHistory(Array.isArray(r.data) ? r.data : (r.data?.history || r.data?.records || [])))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }

  const fetchData = useCallback((activeType, activeFilters) => {
    setDataLoading(true); setDataError('');
    getMyReportData({ type: activeType, ...activeFilters })
      .then(r => { setData(r.data); setApplied(true); })
      .catch(() => { setDataError('Unable to load report data.'); setData(null); })
      .finally(() => setDataLoading(false));
  }, []);

  useEffect(() => { fetchData(type, filters); }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleApply(f) { setFilters(f); fetchData(type, f); }
  function handleReset() { setFilters({}); fetchData(type, {}); }

  const columns = (data?.columns?.length ? data.columns : REPORT_COLUMNS[type].map(c => ({ key: c, label: c })));
  const records = data?.records || [];

  async function handleHistoryDownload(row) {
    const rType = row.ReportType ?? row.reportType ?? type;
    const format = (row.Format ?? row.format ?? 'excel').toLowerCase();
    const ext = format === 'excel' ? 'xlsx' : format;
    try {
      const res = await exportMyReport({ type: rType, format });
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
    { icon: '📘', label: 'Learning Progress', value: `${summary.learning?.overallProgressPct ?? 0}%`, color: '#2E74B5', bg: '#EFF6FF' },
    { icon: '⚙',  label: 'Code Activity',     value: summary.execution?.total ?? 0,                    color: '#4CAF50', bg: '#F0FDF4' },
    { icon: '💾', label: 'Saved Snippets',    value: summary.snippets?.total ?? 0,                     color: '#8b5cf6', bg: '#F5F3FF' },
    { icon: '👤', label: 'Account Activity',  value: summary.account?.plan ?? '—',                     color: '#F2A93B', bg: '#FFF7ED' },
  ] : [];

  return (
    <AppShell>
      <div style={{ padding: '32px 32px', fontFamily: "'Inter', system-ui, sans-serif" }}>
        <PageHeader title="My Reports" subtitle="Track your learning progress, code activity and account history." />

        <ErrorBanner message={summaryError} />
        {summary && <ReportSummaryCards cards={cards} />}

        <div style={{ marginBottom: 12 }}>
          <ReportTypeSelector types={USER_REPORT_TYPES} value={type} onChange={setType} />
        </div>

        <ReportFilters type={type} onApply={handleApply} onReset={handleReset}
          resultCount={data?.total ?? records.length} loaded={applied} />

        <ErrorBanner message={dataError} />

        <ReportPreview
          title={data?.label || USER_REPORT_TYPES.find(t => t.value === type)?.label || 'Report'}
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
          exportFn={exportMyReport}
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
