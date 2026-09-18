import { useEffect, useState, useCallback } from 'react';
import { getAdminFeedback, updateFeedbackStatus, replyToFeedback } from '../../../services/api';
import {
  PageHeader, Card, Btn, Badge, THead, TRow, TD, Avatar,
  FilterChips, Pagination, Spinner, ErrorBanner, EmptyState,
  Modal, Textarea, fmtDate,
} from '../ui';

const STATUS_FILTERS = [
  { value: 'all',      label: 'All' },
  { value: 'open',     label: '🔵 Open' },
  { value: 'reviewed', label: '🟡 Reviewed' },
  { value: 'resolved', label: '🟢 Resolved' },
];

const NEXT_STATUS = { open: 'reviewed', reviewed: 'resolved', resolved: 'open' };
const BTN_LABEL   = { open: 'Mark Reviewed', reviewed: 'Mark Resolved', resolved: 'Re-open' };
const BTN_VARIANT = { open: 'accent', reviewed: 'success', resolved: 'ghost' };
const PAGE_SIZE = 15;

export default function FeedbackTab() {
  const [items,   setItems]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [status,  setStatus]  = useState('all');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [detail,  setDetail]  = useState(null);
  const [updating,setUpdating]= useState(null);   // id being updated
  const [replyText, setReplyText] = useState('');
  const [replying,  setReplying]  = useState(false);
  const [replyError, setReplyError] = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminFeedback({ page, pageSize: PAGE_SIZE, status })
      .then(r => { setItems(r.data.feedback || []); setTotal(r.data.total || 0); })
      .catch(() => setError('Failed to load feedback.'))
      .finally(() => setLoading(false));
  }, [page, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status]);

  async function advance(item) {
    const next = NEXT_STATUS[item.Status];
    setUpdating(item.FeedbackId);
    try {
      await updateFeedbackStatus(item.FeedbackId, next);
      setItems(prev => prev.map(x => x.FeedbackId === item.FeedbackId ? { ...x, Status: next } : x));
      if (detail?.FeedbackId === item.FeedbackId) setDetail(d => ({ ...d, Status: next }));
    } catch { setError('Failed to update status.'); }
    setUpdating(null);
  }

  function openDetail(item) {
    setDetail(item);
    setReplyText('');
    setReplyError('');
  }

  async function sendReply() {
    if (!replyText.trim()) { setReplyError('Reply cannot be empty.'); return; }
    setReplying(true);
    setReplyError('');
    try {
      await replyToFeedback(detail.FeedbackId, replyText.trim());
      const now = new Date().toISOString();
      setItems(prev => prev.map(x => x.FeedbackId === detail.FeedbackId
        ? { ...x, AdminReply: replyText.trim(), RespondedAt: now }
        : x));
      setDetail(d => ({ ...d, AdminReply: replyText.trim(), RespondedAt: now }));
      setReplyText('');
    } catch {
      setReplyError('Failed to send reply.');
    } finally {
      setReplying(false);
    }
  }

  return (
    <div style={{ padding: '32px 32px' }}>
      <PageHeader title="Feedback" subtitle={`${total} submissions`} />

      <ErrorBanner message={error} />

      {/* Status summary */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        {['open','reviewed','resolved'].map(s => {
          const count = items.filter(i => i.Status === s).length;
          const cfg = {
            open:     { icon: '💬', color: '#2E74B5', bg: '#EFF6FF' },
            reviewed: { icon: '👁', color: '#F2A93B', bg: '#FFF7ED' },
            resolved: { icon: '✓', color: '#4CAF50', bg: '#F0FDF4' },
          }[s];
          return (
            <div key={s} style={{
              background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12,
              padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,.04)',
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: cfg.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{cfg.icon}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'capitalize' }}>{s}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: 20 }}>
        <FilterChips options={STATUS_FILTERS} value={status} onChange={setStatus} />
      </div>

      <Card>
        {loading ? <Spinner /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <THead cols={['User', 'Subject', 'Status', 'Submitted', '']} />
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={5}>
                      <EmptyState icon="💬" title="No feedback yet"
                        subtitle="Feedback submitted by users will appear here." />
                    </td></tr>
                  ) : items.map(item => (
                    <TRow key={item.FeedbackId} onClick={() => openDetail(item)}>
                      <TD>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={item.FullName || 'Anonymous'} size={30} />
                          <div>
                            <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>{item.FullName || 'Anonymous'}</div>
                            {item.Email && <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.Email}</div>}
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{item.Subject}</span>
                        <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0', lineHeight: 1.4,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                          {item.Message}
                        </p>
                      </TD>
                      <TD><Badge variant={item.Status}>{item.Status}</Badge></TD>
                      <TD style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(item.CreatedAt)}</TD>
                      <TD onClick={e => e.stopPropagation()}>
                        <Btn size="sm" variant={BTN_VARIANT[item.Status] || 'ghost'}
                          disabled={updating === item.FeedbackId}
                          onClick={() => advance(item)}>
                          {updating === item.FeedbackId ? '…' : BTN_LABEL[item.Status]}
                        </Btn>
                      </TD>
                    </TRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
          </>
        )}
      </Card>

      {/* Feedback detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Feedback Detail" width={520}>
        {detail && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Avatar name={detail.FullName || 'Anonymous'} size={44} />
              <div>
                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: 15 }}>{detail.FullName || 'Anonymous'}</div>
                {detail.Email && <div style={{ fontSize: 12, color: '#64748b' }}>{detail.Email}</div>}
                <div style={{ marginTop: 4 }}><Badge variant={detail.Status}>{detail.Status}</Badge></div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>{fmtDate(detail.CreatedAt)}</span>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
                letterSpacing: '.05em', marginBottom: 6 }}>Subject</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{detail.Subject}</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
                letterSpacing: '.05em', marginBottom: 6 }}>Message</div>
              <div style={{
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
                padding: 16, fontSize: 14, color: '#374151', lineHeight: 1.7,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{detail.Message}</div>
            </div>

            {/* Existing admin reply, if any — the user sees this on their side too */}
            {detail.AdminReply && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
                  letterSpacing: '.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Your Reply</span>
                  {detail.RespondedAt && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· {fmtDate(detail.RespondedAt)}</span>}
                  {!detail.UserSeen && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#2E74B5',
                      background: '#EFF6FF', border: '1px solid #bfdbfe', borderRadius: 999, padding: '1px 8px' }}>
                      Not seen by user yet
                    </span>
                  )}
                </div>
                <div style={{
                  background: '#EFF6FF', border: '1px solid #bfdbfe', borderRadius: 10,
                  padding: 16, fontSize: 14, color: '#1e40af', lineHeight: 1.7,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{detail.AdminReply}</div>
              </div>
            )}

            {/* Reply composer */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
                letterSpacing: '.05em', marginBottom: 6 }}>
                {detail.AdminReply ? 'Send Another Reply' : 'Reply to User'}
              </div>
              <Textarea
                value={replyText}
                onChange={setReplyText}
                placeholder="Write a response the user will see on their end…"
                rows={3}
                maxLength={2000}
                disabled={replying}
              />
              {replyError && <p style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>{replyError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Btn variant="primary" size="sm" disabled={replying} onClick={sendReply}>
                  {replying ? 'Sending…' : '✉ Send Reply'}
                </Btn>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <Btn variant="ghost" onClick={() => setDetail(null)}>Close</Btn>
              <Btn variant={BTN_VARIANT[detail.Status] || 'ghost'}
                disabled={updating === detail.FeedbackId}
                onClick={() => advance(detail)}>
                {updating === detail.FeedbackId ? 'Updating…' : BTN_LABEL[detail.Status]}
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
