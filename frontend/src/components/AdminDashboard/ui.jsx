/* Shared micro-components used across all admin tabs */
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';

export function PageHeader({ title, subtitle, action }) {
  const { T } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 28, gap: 12 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text, marginBottom: 4 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14, color: T.textSecondary }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, style = {} }) {
  const { T } = useTheme();
  return (
    <div style={{
      background: T.card, border: `1.5px solid ${T.cardBorder}`,
      borderRadius: 16, boxShadow: T.shadow, color: T.text, ...style,
    }}>{children}</div>
  );
}

export function KpiCard({ icon, label, value, color, bg }) {
  const { T } = useTheme();
  return (
    <Card style={{ padding: '22px 22px' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, marginBottom: 14 }}>{icon}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1, marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textMuted,
        textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
    </Card>
  );
}

export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, style = {} }) {
  const { T } = useTheme();
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: 'none', borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 600, fontFamily: 'inherit', transition: 'all 150ms',
    opacity: disabled ? 0.55 : 1,
  };
  const sizes   = { sm: { padding: '5px 12px', fontSize: 12 }, md: { padding: '8px 16px', fontSize: 13 }, lg: { padding: '11px 22px', fontSize: 14 } };
  const variants = {
    primary:  { background: 'linear-gradient(135deg,#2E74B5,#1F4E79)', color: '#fff', boxShadow: '0 2px 8px rgba(46,116,181,.35)' },
    success:  { background: 'linear-gradient(135deg,#4CAF50,#2E74B5)', color: '#fff' },
    danger:   T.mode === 'dark' ? { background: 'rgba(225,87,89,.14)', color: '#f87171', border: '1px solid rgba(225,87,89,.35)' } : { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
    ghost:    { background: T.cardAlt, color: T.textSecondary, border: `1px solid ${T.border}` },
    accent:   T.mode === 'dark' ? { background: 'rgba(242,169,59,.14)', color: '#fbbf24', border: '1px solid rgba(242,169,59,.35)' } : { background: '#FFF7ED', color: '#F2A93B', border: '1px solid #fed7aa' },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

const BADGE_COLORS = {
  default:  { color: '#64748b', dark: '#94a3b8' },
  admin:    { color: '#F2A93B', dark: '#fbbf24' },
  user:     { color: '#4CAF50', dark: '#4ade80' },
  premium:  { color: '#7c3aed', dark: '#a78bfa' },
  basic:    { color: '#2E74B5', dark: '#60a5fa' },
  free:     { color: '#4CAF50', dark: '#4ade80' },
  success:  { color: '#4CAF50', dark: '#4ade80' },
  pending:  { color: '#F2A93B', dark: '#fbbf24' },
  failed:   { color: '#dc2626', dark: '#f87171' },
  open:     { color: '#2E74B5', dark: '#60a5fa' },
  reviewed: { color: '#F2A93B', dark: '#fbbf24' },
  resolved: { color: '#4CAF50', dark: '#4ade80' },
  easy:     { color: '#4CAF50', dark: '#4ade80' },
  medium:   { color: '#F2A93B', dark: '#fbbf24' },
  hard:     { color: '#dc2626', dark: '#f87171' },
  active:   { color: '#4CAF50', dark: '#4ade80' },
  inactive: { color: '#94a3b8', dark: '#64748b' },
  blocked:  { color: '#dc2626', dark: '#f87171' },
  created:  { color: '#64748b', dark: '#94a3b8' },
  partially_refunded: { color: '#F2A93B', dark: '#fbbf24' },
  refunded: { color: '#64748b', dark: '#94a3b8' },
};

export function Badge({ children, variant = 'default' }) {
  const { T } = useTheme();
  const c = BADGE_COLORS[variant] || BADGE_COLORS.default;
  const color = T.mode === 'dark' ? c.dark : c.color;
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: T.mode === 'dark' ? `${color}22` : `${color}14`,
      color, border: `1px solid ${T.mode === 'dark' ? `${color}55` : `${color}33`}`,
      textTransform: 'capitalize', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

export function THead({ cols }) {
  const { T } = useTheme();
  return (
    <thead>
      <tr style={{ background: T.cardAlt }}>
        {cols.map(c => (
          <th key={c} style={{
            padding: '10px 20px', textAlign: 'left', fontSize: 11,
            fontWeight: 700, color: T.mode === 'dark' ? T.text : T.textMuted, textTransform: 'uppercase',
            letterSpacing: '.06em', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
          }}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

export function TRow({ children, onClick }) {
  const { T } = useTheme();
  return (
    <tr onClick={onClick} style={{ borderBottom: `1px solid ${T.divider}`, transition: 'background 150ms', cursor: onClick ? 'pointer' : undefined }}
      onMouseEnter={e => { e.currentTarget.style.background = T.hoverBg; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      {children}
    </tr>
  );
}

export function TD({ children, style = {} }) {
  const { T } = useTheme();
  return <td style={{ padding: '12px 20px', fontSize: 13, color: T.mode === 'dark' ? T.text : T.textSecondary, ...style }}>{children}</td>;
}

export function Avatar({ name, size = 32 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg,#1F4E79,#2E74B5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color: '#fff',
    }}>{initials}</div>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search…' }) {
  const { T } = useTheme();
  return (
    <div style={{ position: 'relative', minWidth: 240 }}>
      <span style={{
        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
        fontSize: 14, color: T.textMuted, pointerEvents: 'none',
      }}>🔍</span>
      <input value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
          border: `1.5px solid ${T.border}`, fontSize: 13, outline: 'none',
          background: T.inputBg, color: T.text, boxSizing: 'border-box',
          transition: 'border-color 150ms',
        }}
        onFocus={e => { e.target.style.borderColor = T.accent; e.target.style.background = T.card; }}
        onBlur={e  => { e.target.style.borderColor = T.border; e.target.style.background = T.inputBg; }}
      />
    </div>
  );
}

export function FilterChips({ options, value, onChange }) {
  const { T } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          border: '1.5px solid', cursor: 'pointer',
          borderColor: value === o.value ? T.accent : T.border,
          background:  value === o.value ? T.chipBg : T.card,
          color:       value === o.value ? T.accent : T.textSecondary,
          transition: 'all 150ms',
        }}>{o.label}</button>
      ))}
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * Server-side pagination bar: "Showing X-Y of Z", rows-per-page select,
 * prev/next, and up to 5 page number buttons.
 * Pass `onPageSizeChange` to show the rows-per-page selector.
 */
export function Pagination({ page, total, pageSize, onChange, onPageSizeChange }) {
  const { T } = useTheme();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'flex-end',
      flexWrap: 'wrap', padding: '14px 20px', borderTop: `1px solid ${T.divider}` }}>
      <span style={{ fontSize: 12, color: T.textMuted }}>
        {total === 0 ? '0 of 0' : `${(page-1)*pageSize+1}–${Math.min(page*pageSize, total)} of ${total}`}
      </span>

      {onPageSizeChange && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textSecondary }}>
          Rows per page
          <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}
            style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.inputBg, color: T.text, fontSize: 12, cursor: 'pointer' }}>
            {PAGE_SIZE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </label>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onChange(page-1)} disabled={page<=1} style={pgBtnStyle(page<=1, false, T)}>‹</button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = Math.max(1, Math.min(totalPages-4, page-2)) + i;
          return (
            <button key={p} onClick={() => onChange(p)} style={pgBtnStyle(false, p===page, T)}>{p}</button>
          );
        })}
        <button onClick={() => onChange(page+1)} disabled={page>=totalPages} style={pgBtnStyle(page>=totalPages, false, T)}>›</button>
      </div>
    </div>
  );
}
function pgBtnStyle(disabled, active, T) {
  return {
    width: 30, height: 30, borderRadius: 6, border: '1px solid',
    borderColor: active ? T.accent : T.border,
    background:  active ? T.chipBg : T.card,
    color:       active ? T.accent : disabled ? T.textMuted : T.textSecondary,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

export function SkeletonRows({ cols = 5, rows = 6 }) {
  const { T } = useTheme();
  return (
    <tbody>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} style={{ borderBottom: `1px solid ${T.divider}` }}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c} style={{ padding: '12px 20px' }}>
              <div style={{
                height: 14, borderRadius: 4, background: T.divider,
                width: `${60 + ((r * 7 + c * 13) % 30)}%`,
                animation: 'skeletonPulse 1.4s ease-in-out infinite',
              }} />
            </td>
          ))}
        </tr>
      ))}
      <style>{`@keyframes skeletonPulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </tbody>
  );
}

export function Spinner() {
  const { T } = useTheme();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: `3px solid ${T.border}`, borderTopColor: T.accent,
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export function ErrorBanner({ message }) {
  const { T } = useTheme();
  return message ? (
    <div style={{
      background: T.mode === 'dark' ? 'rgba(225,87,89,.12)' : '#fef2f2',
      border: `1px solid ${T.mode === 'dark' ? 'rgba(225,87,89,.35)' : '#fecaca'}`, borderRadius: 10,
      padding: '12px 16px', color: T.mode === 'dark' ? '#f87171' : '#dc2626', fontSize: 13, marginBottom: 20,
      display: 'flex', gap: 8, alignItems: 'center',
    }}>⚠ {message}</div>
  ) : null;
}

export function EmptyState({ icon = '📭', title = 'No data', subtitle }) {
  const { T } = useTheme();
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <p style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>{title}</p>
      {subtitle && <p style={{ fontSize: 13, color: T.textMuted }}>{subtitle}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 520 }) {
  const { T } = useTheme();
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.55)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: T.card, borderRadius: 18, padding: 32, width: '100%', maxWidth: width,
        maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${T.border}`,
        boxShadow: T.mode === 'dark' ? '0 24px 60px rgba(0,0,0,.5)' : '0 24px 60px rgba(0,0,0,.18)',
        animation: 'fadeIn .2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{title}</h2>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`,
            background: T.cardAlt, cursor: 'pointer', fontSize: 16, color: T.textSecondary,
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormField({ label, children, error }) {
  const { T } = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {error && <p style={{ fontSize: 11, color: T.mode === 'dark' ? '#f87171' : '#dc2626', marginTop: 4 }}>{error}</p>}
    </div>
  );
}

function inputBase(T) {
  return {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: `1.5px solid ${T.border}`, fontSize: 13, outline: 'none',
    background: T.inputBg, color: T.text, boxSizing: 'border-box', fontFamily: 'inherit',
    transition: 'border-color 150ms',
  };
}
export function Input({ value, onChange, placeholder, type = 'text', ...rest }) {
  const { T } = useTheme();
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} style={inputBase(T)}
      onFocus={e => { e.target.style.borderColor = T.accent; e.target.style.background = T.card; }}
      onBlur={e  => { e.target.style.borderColor = T.border; e.target.style.background = T.inputBg; }}
      {...rest} />
  );
}
export function Select({ value, onChange, children, ...rest }) {
  const { T } = useTheme();
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ ...inputBase(T), cursor: 'pointer' }} {...rest}>
      {children}
    </select>
  );
}
export function Textarea({ value, onChange, placeholder, rows = 4, ...rest }) {
  const { T } = useTheme();
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows} style={{ ...inputBase(T), resize: 'vertical' }}
      onFocus={e => { e.target.style.borderColor = T.accent; e.target.style.background = T.card; }}
      onBlur={e  => { e.target.style.borderColor = T.border; e.target.style.background = T.inputBg; }}
      {...rest}
    />
  );
}

export function Toggle({ checked, onChange, label }) {
  const { T } = useTheme();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 40, height: 22, borderRadius: 11, transition: 'background 200ms',
        background: checked ? T.accent : T.border, position: 'relative', flexShrink: 0,
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 2,
          left: checked ? 20 : 2, transition: 'left 200ms',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        }} />
      </div>
      {label && <span style={{ fontSize: 13, color: T.textSecondary }}>{label}</span>}
    </label>
  );
}

/**
 * A clean "..." action menu — replaces a row full of individual buttons.
 * `items`: [{ label, onClick, danger?, disabled? }] — pass `null` for a divider.
 */
export function ActionMenu({ items, label = '⋯' }) {
  const { T } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.border}`,
        background: T.cardAlt, cursor: 'pointer', fontSize: 16, color: T.textSecondary,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{label}</button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 34, zIndex: 40, minWidth: 190,
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
          boxShadow: T.mode === 'dark' ? '0 12px 28px rgba(0,0,0,.5)' : '0 12px 28px rgba(0,0,0,.12)', padding: 6,
        }}>
          {items.map((item, i) => item == null ? (
            <div key={i} style={{ height: 1, background: T.divider, margin: '5px 4px' }} />
          ) : (
            <button key={i}
              disabled={item.disabled}
              onClick={() => { setOpen(false); item.onClick(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', border: 'none', background: 'none',
                textAlign: 'left', borderRadius: 7, cursor: item.disabled ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 500,
                color: item.disabled ? T.textMuted : item.danger ? (T.mode === 'dark' ? '#f87171' : '#dc2626') : T.textSecondary,
              }}
              onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = item.danger ? (T.mode === 'dark' ? 'rgba(225,87,89,.14)' : '#fef2f2') : T.hoverBg; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >{item.icon && <span>{item.icon}</span>}{item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Confirmation modal for status-changing/destructive actions. Handles its
 * own loading state and disables the confirm button while pending so a
 * double-click can't fire the action twice.
 */
export function ConfirmModal({ open, onClose, title, message, confirmLabel = 'Confirm', danger, onConfirm }) {
  const { T } = useTheme();
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) setLoading(false); }, [open]);

  async function handleConfirm() {
    if (loading) return;
    setLoading(true);
    try { await onConfirm(); } finally { setLoading(false); }
  }

  return (
    <Modal open={open} onClose={() => !loading && onClose()} title={title} width={420}>
      <p style={{ fontSize: 14, color: T.textSecondary, marginBottom: 22, lineHeight: 1.6 }}>{message}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Btn variant="ghost" onClick={onClose} disabled={loading}>Cancel</Btn>
        <Btn variant={danger ? 'danger' : 'primary'} onClick={handleConfirm} disabled={loading}>
          {loading ? 'Processing…' : confirmLabel}
        </Btn>
      </div>
    </Modal>
  );
}

/**
 * Minimal toast stack. Usage: const { toasts, push } = useToasts(); render
 * <ToastStack toasts={toasts} />; call push('success', 'Saved!').
 */
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  function push(type, message) {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, type, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }
  return { toasts, push };
}

export function ToastStack({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          padding: '12px 18px', borderRadius: 10, minWidth: 240, maxWidth: 360,
          fontSize: 13, fontWeight: 600, color: '#fff',
          background: t.type === 'error' ? '#dc2626' : t.type === 'success' ? '#16a34a' : '#334155',
          boxShadow: '0 8px 24px rgba(0,0,0,.2)',
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'toastIn 200ms ease',
        }}>
          <span>{t.type === 'error' ? '⚠' : t.type === 'success' ? '✓' : 'ℹ'}</span>
          {t.message}
        </div>
      ))}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

export function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function fmtRupee(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
}
