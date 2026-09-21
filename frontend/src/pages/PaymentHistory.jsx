import { useEffect, useState, useCallback } from 'react';
import AppShell from '../components/common/AppShell';
import { getMyPayments } from '../services/api';
import { useTheme } from '../context/ThemeContext';
import {
  PageHeader, Card, Badge, THead, TRow, TD,
  Pagination, ErrorBanner, EmptyState, Spinner,
  fmtDate, fmtRupee,
} from '../components/AdminDashboard/ui';

export default function PaymentHistory() {
  const { T } = useTheme();
  const [rows,     setRows]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    getMyPayments({ page, pageSize })
      .then(r => { setRows(r.data.data || []); setTotal(r.data.totalRecords || 0); })
      .catch(() => setError('Failed to load payment history.'))
      .finally(() => setLoading(false));
  }, [page, pageSize]);

  useEffect(() => { load(); }, [load]);

  return (
    <AppShell>
      <div style={{ padding: '32px 32px' }}>
        <PageHeader title="Payment History" subtitle={`${total} transactions`} />
        <ErrorBanner message={error} />

        <Card>
          {loading ? <Spinner /> : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <THead cols={['Plan', 'Amount', 'Status', 'Method', 'Payment ID', 'Date']} />
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={6}>
                        <EmptyState icon="💳" title="No payments yet"
                          subtitle="Your purchases will appear here." />
                      </td></tr>
                    ) : rows.map(p => (
                      <TRow key={p.PaymentId}>
                        <TD style={{ fontWeight: 600, color: T.text }}>{p.PlanName}</TD>
                        <TD style={{ fontWeight: 700, color: T.mode === 'dark' ? '#4ade80' : '#4CAF50' }}>{fmtRupee(p.Amount)} <span style={{ fontSize: 10, fontWeight: 400, color: T.textSecondary }}>{p.Currency}</span></TD>
                        <TD><Badge variant={p.Status}>{p.Status.replace('_', ' ')}</Badge></TD>
                        <TD style={{ color: T.textSecondary, textTransform: 'capitalize' }}>{p.PaymentMethod || '—'}</TD>
                        <TD>
                          {p.ProviderPaymentId ? (
                            <code style={{ fontSize: 11, color: T.textSecondary }}>{p.ProviderPaymentId.slice(-12)}</code>
                          ) : <span style={{ color: T.textMuted }}>—</span>}
                        </TD>
                        <TD style={{ color: T.textSecondary, whiteSpace: 'nowrap' }}>{fmtDate(p.CreatedAt)}</TD>
                      </TRow>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} onPageSizeChange={setPageSize} />
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
