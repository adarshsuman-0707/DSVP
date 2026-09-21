import { useState, useEffect, useRef, useCallback } from 'react';
import { getMyFeedback, getMyFeedbackUnseenCount, markFeedbackSeen } from '../../services/api';

const STATUS_CFG = {
  open:     { icon: '💬', color: '#2E74B5', bg: '#EFF6FF', label: 'Open' },
  reviewed: { icon: '👁', color: '#F2A93B', bg: '#FFF7ED', label: 'Reviewed' },
  resolved: { icon: '✓',  color: '#4CAF50', bg: '#F0FDF4', label: 'Resolved' },
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Bell icon + dropdown showing the user's OWN feedback thread — status
 * changes and admin replies. Closes the loop that FeedbackModal alone
 * leaves open: a user could submit feedback and have it resolved/reopened
 * with zero way to ever find out.
 */
export default function NotificationBell() {
  const [open, setOpen]           = useState(false);
  const [items, setItems]         = useState([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [loading, setLoading]     = useState(false);
  const rootRef = useRef(null);

  const refreshCount = useCallback(() => {
    getMyFeedbackUnseenCount()
      .then(res => setUnseenCount(res.data.count || 0))
      .catch(() => {});
  }, []);

  // Poll every 60s so a status change while the tab is open still surfaces
  // without needing a full page reload.
  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, 60000);
    return () => clearInterval(id);
  }, [refreshCount]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function togglePanel() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      getMyFeedback()
        .then(res => setItems(res.data.feedback || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }

  async function handleItemClick(item) {
    if (!item.UserSeen) {
      try {
        await markFeedbackSeen(item.FeedbackId);
        setItems(prev => prev.map(x => x.FeedbackId === item.FeedbackId ? { ...x, UserSeen: true } : x));
        setUnseenCount(c => Math.max(0, c - 1));
      } catch { /* non-fatal */ }
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        onClick={togglePanel}
        title="Notifications"
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0',
          background: open ? '#EFF6FF' : '#f8fafc', cursor: 'pointer', fontSize: 15,
          transition: 'all 150ms',
        }}
      >
        🔔
        {unseenCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 16, height: 16, borderRadius: 999, padding: '0 3px',
            background: '#ef4444', color: '#fff', fontSize: 9.5, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #fff',
          }}>{unseenCount > 9 ? '9+' : unseenCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 42, right: 0, width: 360, maxHeight: 440,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,.14)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', zIndex: 500,
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1e293b' }}>Your Feedback</span>
            {unseenCount > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444' }}>{unseenCount} new update{unseenCount !== 1 ? 's' : ''}</span>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <p style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>Loading…</p>
            ) : items.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>💬</div>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                  No feedback submitted yet. Use the Feedback button to reach out any time.
                </p>
              </div>
            ) : (
              items.map(item => {
                const cfg = STATUS_CFG[item.Status] || STATUS_CFG.open;
                return (
                  <div
                    key={item.FeedbackId}
                    onClick={() => handleItemClick(item)}
                    style={{
                      padding: '12px 16px', borderBottom: '1px solid #f8fafc',
                      cursor: 'pointer', background: item.UserSeen ? 'transparent' : '#F0F9FF',
                      transition: 'background 120ms',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      {!item.UserSeen && (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2E74B5', marginTop: 5, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: cfg.color, background: cfg.bg,
                            border: `1px solid ${cfg.color}33`, borderRadius: 999, padding: '1px 7px',
                            textTransform: 'uppercase', letterSpacing: '.03em',
                          }}>{cfg.icon} {cfg.label}</span>
                          <span style={{ fontSize: 10.5, color: '#94a3b8', marginLeft: 'auto', flexShrink: 0 }}>
                            {timeAgo(item.RespondedAt || item.CreatedAt)}
                          </span>
                        </div>
                        <div style={{
                          fontSize: 13, fontWeight: 600, color: '#1e293b',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{item.Subject}</div>
                        {item.AdminReply ? (
                          <div style={{
                            fontSize: 12, color: '#2E74B5', marginTop: 4, lineHeight: 1.5,
                            background: '#EFF6FF', border: '1px solid #bfdbfe', borderRadius: 8,
                            padding: '6px 8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          }}>
                            <span style={{ fontWeight: 700 }}>Reply: </span>{item.AdminReply}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                            No response yet — we'll notify you here when there's an update.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
