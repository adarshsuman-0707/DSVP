import { useEffect, useState, useCallback } from 'react';
import { getAdminPayments } from '../../../services/api';
import {
  PageHeader, Card, Badge, THead, TRow, TD, Avatar,
  FilterChips, Pagination, Spinner, ErrorBanner, EmptyState,
  fmtDate, fmtRupee,
} from '../ui';

const STATUS_FILTERS = [
  { value: 'all',      label: 'All' },
  { value: 'success',  label: 'Success' },
  { value: 'pending',  label: 'Pending' },
  { value: 'failed',   label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

const PAGE_SIZE = 20;

export default function PaymentsTab() {
  const [rows,    setRows]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [status,  setStatus]  = useState('all');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // summary totals
  const successRows = rows.filter(r => r.Status === 'success');
  const totalAmt    = successRows.reduce((s, r) => s + Number(r.Amount || 0), 0);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminPayments({ page, pageSize: PAGE_SIZE, status })
      .then(r => { setRows(r.data.payments || []); setTotal(r.data.total || 0); })
      .catch(() => setError('Failed to load payments.'))
      .finally(() => setLoading(false));
  }, [page, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status]);

  return (
    <div style={{ padding: '32px 32px' }}>
      <PageHeader title="Payments" subtitle={`${total} transactions`} />

      <ErrorBanner message={error} />

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Shown Revenue', value: fmtRupee(totalAmt), icon: '💰', color: '#4CAF50', bg: '#F0FDF4' },
          { label: 'Transactions',  value: total,               icon: '📋', color: '#2E74B5', bg: '#EFF6FF' },
          { label: 'Success',       value: rows.filter(r=>r.Status==='success').length,  icon: '✓', color: '#4CAF50', bg: '#F0FDF4' },
          { label: 'Failed',        value: rows.filter(r=>r.Status==='failed').length,   icon: '✗', color: '#E15759', bg: '#FFF1F2' },
        ].map(k => (
          <div key={k.label} style={{
            background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14,
            padding: '18px 20px', boxShadow: '0 1px 3px rgba(0,0,0,.05)',
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: k.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, marginBottom: 10 }}>{k.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color, lineHeight: 1, marginBottom: 4 }}>{k.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        <FilterChips options={STATUS_FILTERS} value={status} onChange={setStatus} />
      </div>

      <Card>
        {loading ? <Spinner /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <THead cols={['User', 'Plan', 'Amount', 'Provider', 'Status', 'Payment ID', 'Date']} />
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={7}>
                      <EmptyState icon="💳" title="No payments found"
                        subtitle="Payments will appear here once users purchase premium access." />
                    </td></tr>
                  ) : rows.map(p => (
                    <TRow key={p.PaymentId}>
                      <TD>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={p.FullName} size={30} />
                          <div>
                            <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{p.FullName}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.Email}</div>
                          </div>
                        </div>
                      </TD>
                      <TD><span style={{ fontWeight: 600, color: '#1e293b' }}>{p.PlanName}</span></TD>
                      <TD><span style={{ fontWeight: 700, color: '#4CAF50' }}>{fmtRupee(p.Amount)} <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8' }}>{p.Currency}</span></span></TD>
                      <TD><Badge variant="default">{p.Provider}</Badge></TD>
                      <TD><Badge variant={p.Status}>{p.Status}</Badge></TD>
                      <TD>
                        {p.ProviderPaymentId ? (
                          <code style={{ fontSize: 11, color: '#64748b', background: '#f8fafc',
                            padding: '2px 6px', borderRadius: 4, letterSpacing: '.02em' }}>
                            {p.ProviderPaymentId.slice(-12)}
                          </code>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </TD>
                      <TD style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(p.CreatedAt)}</TD>
                    </TRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
