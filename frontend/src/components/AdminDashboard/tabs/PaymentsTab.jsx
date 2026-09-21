import { useEffect, useState, useCallback } from 'react';
import { getAdminPayments, getAdminPaymentDetail, refundPayment } from '../../../services/api';
import {
  PageHeader, Card, Btn, Badge, THead, TRow, TD, Avatar,
  SearchBar, FilterChips, Pagination, Spinner, ErrorBanner, EmptyState,
  Modal, Input, FormField, fmtDate, fmtDateTime, fmtRupee, SkeletonRows,
} from '../ui';
import { useTheme } from '../../../context/ThemeContext';

const STATUS_FILTERS = [
  { value: 'all',                 label: 'All' },
  { value: 'created',             label: 'Created' },
  { value: 'pending',             label: 'Pending' },
  { value: 'success',             label: 'Success' },
  { value: 'failed',              label: 'Failed' },
  { value: 'refunded',            label: 'Refunded' },
  { value: 'partially_refunded',  label: 'Partial refund' },
];

const PAGE_SIZE_DEFAULT = 20;

export default function PaymentsTab() {
  const { T } = useTheme();
  const [rows,     setRows]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [status,   setStatus]   = useState('all');
  const [search,   setSearch]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const [detail,   setDetail]   = useState(null);   // { payment, verificationStatus, webhookStatus }
  const [detailLoading, setDetailLoading] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  const successRows = rows.filter(r => r.Status === 'success');
  const totalAmt    = successRows.reduce((s, r) => s + Number(r.Amount || 0), 0);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminPayments({ page, pageSize, status: status !== 'all' ? status : undefined, search })
      .then(r => { setRows(r.data.data || []); setTotal(r.data.totalRecords || 0); })
      .catch(() => setError('Failed to load payments.'))
      .finally(() => setLoading(false));
  }, [page, pageSize, status, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status, search]);

  async function openDetail(p) {
    setDetailLoading(true);
    setRefundAmount(''); setRefundReason('');
    try {
      const r = await getAdminPaymentDetail(p.PaymentId);
      setDetail(r.data);
    } catch { setError('Failed to load payment detail.'); }
    setDetailLoading(false);
  }

  async function handleRefund() {
    if (!detail) return;
    setRefunding(true);
    try {
      await refundPayment(detail.payment.PaymentId, {
        amount: refundAmount ? Number(refundAmount) : undefined,
        reason: refundReason || undefined,
      });
      setDetail(null);
      load();
    } catch (e) {
      setError(e.response?.data?.message || 'Refund failed.');
    } finally { setRefunding(false); }
  }

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
            background: T.card, border: `1.5px solid ${T.cardBorder}`, borderRadius: 14,
            padding: '18px 20px', boxShadow: T.shadow,
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: k.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, marginBottom: 10 }}>{k.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color, lineHeight: 1, marginBottom: 4 }}>{k.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.mode === 'dark' ? T.text : '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search user, email, payment id…" />
        <FilterChips options={STATUS_FILTERS} value={status} onChange={setStatus} />
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['Payment ID', 'User', 'Plan', 'Amount', 'Method', 'Status', 'Date', 'Actions']} />
            {loading ? <SkeletonRows cols={8} /> : (
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8}>
                    <EmptyState icon="💳" title="No payments found"
                      subtitle="Payments will appear here once users purchase premium access." />
                  </td></tr>
                ) : rows.map(p => (
                  <TRow key={p.PaymentId}>
                    <TD><code style={{ fontSize: 11, color: T.mode === 'dark' ? T.text : '#64748b' }}>#{p.PaymentId}</code></TD>
                    <TD>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={p.FullName} size={30} />
                        <div>
                          <div style={{ fontWeight: 600, color: T.mode === 'dark' ? T.text : '#1e293b', fontSize: 13 }}>{p.FullName}</div>
                          <div style={{ fontSize: 11, color: T.mode === 'dark' ? T.textSecondary : '#94a3b8' }}>{p.Email}</div>
                        </div>
                      </div>
                    </TD>
                    <TD><span style={{ fontWeight: 600, color: T.mode === 'dark' ? T.text : '#1e293b' }}>{p.PlanName}</span></TD>
                    <TD><span style={{ fontWeight: 700, color: '#4CAF50' }}>{fmtRupee(p.Amount)} <span style={{ fontSize: 10, fontWeight: 400, color: T.mode === 'dark' ? T.textSecondary : '#94a3b8' }}>{p.Currency}</span></span></TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#64748b', textTransform: 'capitalize' }}>{p.PaymentMethod || '—'}</TD>
                    <TD><Badge variant={p.Status}>{p.Status.replace('_', ' ')}</Badge></TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(p.CreatedAt)}</TD>
                    <TD><Btn size="sm" variant="ghost" onClick={() => openDetail(p)}>View</Btn></TD>
                  </TRow>
                ))}
              </tbody>
            )}
          </table>
        </div>
        <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} onPageSizeChange={setPageSize} />
      </Card>

      {/* Payment detail modal */}
      <Modal open={!!detail || detailLoading} onClose={() => setDetail(null)} title="Payment Detail" width={520}>
        {detailLoading ? <Spinner /> : detail && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20, padding: 16,
              background: T.cardAlt, borderRadius: 10, border: `1px solid ${T.border}` }}>
              {[
                ['User', `${detail.payment.FullName} (${detail.payment.Email})`],
                ['Order ID', detail.payment.ProviderOrderId || '—'],
                ['Payment ID', detail.payment.ProviderPaymentId || '—'],
                ['Amount', `${fmtRupee(detail.payment.Amount)} ${detail.payment.Currency}`],
                ['Status', detail.payment.Status],
                ['Method', detail.payment.PaymentMethod || '—'],
                ['Created', fmtDateTime(detail.payment.CreatedAt)],
                ['Verification', detail.verificationStatus],
                ['Webhook', detail.webhookStatus ? `${detail.webhookStatus.EventType} @ ${fmtDateTime(detail.webhookStatus.ProcessedAt)}` : 'Not received'],
                ['Failure reason', detail.payment.FailureReason || '—'],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, wordBreak: 'break-word' }}>{v}</div>
                </div>
              ))}
            </div>

            {detail.payment.Status === 'success' && (
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 10 }}>Issue a refund</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <FormField label={`Amount (blank = full ${fmtRupee(detail.payment.Amount)})`}>
                    <Input type="number" value={refundAmount} onChange={setRefundAmount} placeholder={String(detail.payment.Amount)} />
                  </FormField>
                  <FormField label="Reason (optional)">
                    <Input value={refundReason} onChange={setRefundReason} placeholder="Customer request" />
                  </FormField>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Btn variant="danger" disabled={refunding} onClick={handleRefund}>
                    {refunding ? 'Processing…' : 'Refund'}
                  </Btn>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Btn variant="ghost" onClick={() => setDetail(null)}>Close</Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
