import { useEffect, useState, useCallback } from 'react';
import { getAdminFeedback, updateFeedbackStatus, replyToFeedback, deleteAdminFeedback } from '../../../services/api';
import {
  PageHeader, Card, Btn, Badge, THead, TRow, TD, Avatar,
  FilterChips, Pagination, ErrorBanner, EmptyState,
  Modal, Textarea, fmtDate, SkeletonRows,
} from '../ui';
import { useTheme } from '../../../context/ThemeContext';

const STATUS_FILTERS = [
  { value: 'all',      label: 'All' },
  { value: 'open',     label: '🔵 Open' },
  { value: 'reviewed', label: '🟡 Reviewed' },
  { value: 'resolved', label: '🟢 Resolved' },
];

const NEXT_STATUS = { open: 'reviewed', reviewed: 'resolved', resolved: 'open' };
const BTN_LABEL   = { open: 'Mark Reviewed', reviewed: 'Mark Resolved', resolved: 'Re-open' };
const BTN_VARIANT = { open: 'accent', reviewed: 'success', resolved: 'ghost' };
export default function FeedbackTab() {
  const { T } = useTheme();
  const [items,   setItems]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status,  setStatus]  = useState('all');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [detail,  setDetail]  = useState(null);
  const [updating,setUpdating]= useState(null);   // id being updated
  const [replyText, setReplyText] = useState('');
  const [replying,  setReplying]  = useState(false);
  const [replyError, setReplyError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setError('');
    getAdminFeedback({ page, pageSize, status: status !== 'all' ? status : undefined })
      .then(r => { setItems(r.data.data || []); setTotal(r.data.totalRecords || 0); })
      .catch(() => setError('Failed to load feedback.'))
      .finally(() => setLoading(false));
  }, [page, pageSize, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [status]);

  async function handleDelete(item) {
    try {
      await deleteAdminFeedback(item.FeedbackId);
      setConfirmDelete(null);
      setDetail(null);
      load();
    } catch { setError('Failed to delete feedback.'); setConfirmDelete(null); }
  }

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
              background: T.card, border: `1.5px solid ${T.cardBorder}`, borderRadius: 12,
              padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: T.shadow,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: cfg.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{cfg.icon}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.mode === 'dark' ? T.text : '#94a3b8', textTransform: 'capitalize' }}>{s}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: 20 }}>
        <FilterChips options={STATUS_FILTERS} value={status} onChange={setStatus} />
      </div>

      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <THead cols={['User', 'Subject', 'Status', 'Submitted', 'Actions']} />
            {loading ? <SkeletonRows cols={5} /> : (
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
                          <div style={{ fontWeight: 600, color: T.mode === 'dark' ? T.text : '#1e293b', fontSize: 13 }}>{item.FullName || 'Anonymous'}</div>
                          {item.Email && <div style={{ fontSize: 11, color: T.mode === 'dark' ? T.textSecondary : '#94a3b8' }}>{item.Email}</div>}
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <span style={{ fontWeight: 600, color: T.mode === 'dark' ? T.text : '#1e293b' }}>{item.Subject}</span>
                      <p style={{ fontSize: 11, color: T.mode === 'dark' ? T.textSecondary : '#94a3b8', margin: '2px 0 0', lineHeight: 1.4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
                        {item.Message}
                      </p>
                    </TD>
                    <TD><Badge variant={item.Status}>{item.Status}</Badge></TD>
                    <TD style={{ color: T.mode === 'dark' ? T.text : '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(item.CreatedAt)}</TD>
                    <TD onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn size="sm" variant={BTN_VARIANT[item.Status] || 'ghost'}
                          disabled={updating === item.FeedbackId}
                          onClick={() => advance(item)}>
                          {updating === item.FeedbackId ? '…' : BTN_LABEL[item.Status]}
                        </Btn>
                        <Btn size="sm" variant="danger" onClick={() => setConfirmDelete(item)}>Delete</Btn>
                      </div>
                    </TD>
                  </TRow>
                ))}
              </tbody>
            )}
          </table>
        </div>
        <Pagination page={page} total={total} pageSize={pageSize} onChange={setPage} onPageSizeChange={setPageSize} />
      </Card>

      {/* Delete confirmation */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete Feedback" width={400}>
        {confirmDelete && (
          <div>
            <p style={{ fontSize: 14, color: T.textSecondary, marginBottom: 20 }}>
              Delete feedback from <strong>{confirmDelete.FullName || 'Anonymous'}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={() => handleDelete(confirmDelete)}>Yes, delete</Btn>
            </div>
          </div>
        )}
      </Modal>

      {/* Feedback detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Feedback Detail" width={520}>
        {detail && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <Avatar name={detail.FullName || 'Anonymous'} size={44} />
              <div>
                <div style={{ fontWeight: 700, color: T.text, fontSize: 15 }}>{detail.FullName || 'Anonymous'}</div>
                {detail.Email && <div style={{ fontSize: 12, color: T.textSecondary }}>{detail.Email}</div>}
                <div style={{ marginTop: 4 }}><Badge variant={detail.Status}>{detail.Status}</Badge></div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: T.textMuted }}>{fmtDate(detail.CreatedAt)}</span>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase',
                letterSpacing: '.05em', marginBottom: 6 }}>Subject</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{detail.Subject}</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase',
                letterSpacing: '.05em', marginBottom: 6 }}>Message</div>
              <div style={{
                background: T.cardAlt, border: `1px solid ${T.border}`, borderRadius: 10,
                padding: 16, fontSize: 14, color: T.text, lineHeight: 1.7,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>{detail.Message}</div>
            </div>

            {/* Existing admin reply, if any — the user sees this on their side too */}
            {detail.AdminReply && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase',
                  letterSpacing: '.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Your Reply</span>
                  {detail.RespondedAt && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· {fmtDate(detail.RespondedAt)}</span>}
                  {!detail.UserSeen && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: T.accent,
                      background: T.chipBg, border: `1px solid ${T.chipBorder}`, borderRadius: 999, padding: '1px 8px' }}>
                      Not seen by user yet
                    </span>
                  )}
                </div>
                <div style={{
                  background: T.chipBg, border: `1px solid ${T.chipBorder}`, borderRadius: 10,
                  padding: 16, fontSize: 14, color: T.mode === 'dark' ? T.text : '#1e40af', lineHeight: 1.7,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{detail.AdminReply}</div>
              </div>
            )}

            {/* Reply composer */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase',
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
              {replyError && <p style={{ fontSize: 12, color: T.mode === 'dark' ? '#f87171' : '#dc2626', marginTop: 6 }}>{replyError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <Btn variant="primary" size="sm" disabled={replying} onClick={sendReply}>
                  {replying ? 'Sending…' : '✉ Send Reply'}
                </Btn>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="ghost" onClick={() => setDetail(null)}>Close</Btn>
                <Btn variant="danger" onClick={() => setConfirmDelete(detail)}>Delete</Btn>
              </div>
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
