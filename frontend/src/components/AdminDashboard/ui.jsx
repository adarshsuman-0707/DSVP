/* Shared micro-components used across all admin tabs */

export function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 28, gap: 12 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 4 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14, color: '#64748b' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, style = {} }) {
  return (
    <div style={{
      background: '#fff', border: '1.5px solid #e2e8f0',
      borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)', ...style,
    }}>{children}</div>
  );
}

export function KpiCard({ icon, label, value, color, bg }) {
  return (
    <Card style={{ padding: '22px 22px' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, marginBottom: 14 }}>{icon}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1, marginBottom: 6 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8',
        textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
    </Card>
  );
}

export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, style = {} }) {
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
    danger:   { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
    ghost:    { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' },
    accent:   { background: '#FFF7ED', color: '#F2A93B', border: '1px solid #fed7aa' },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

export function Badge({ children, variant = 'default' }) {
  const map = {
    default: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },
    admin:   { bg: '#FFF7ED', color: '#F2A93B', border: '#fed7aa' },
    user:    { bg: '#F0FDF4', color: '#4CAF50', border: '#bbf7d0' },
    premium: { bg: '#FEF3C7', color: '#D97706', border: '#fde68a' },
    free:    { bg: '#F0FDF4', color: '#4CAF50', border: '#bbf7d0' },
    success: { bg: '#F0FDF4', color: '#4CAF50', border: '#bbf7d0' },
    pending: { bg: '#FFF7ED', color: '#F2A93B', border: '#fed7aa' },
    failed:  { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    open:    { bg: '#EFF6FF', color: '#2E74B5', border: '#bfdbfe' },
    reviewed:{ bg: '#FFF7ED', color: '#F2A93B', border: '#fed7aa' },
    resolved:{ bg: '#F0FDF4', color: '#4CAF50', border: '#bbf7d0' },
    easy:    { bg: '#F0FDF4', color: '#4CAF50', border: '#bbf7d0' },
    medium:  { bg: '#FFF7ED', color: '#F2A93B', border: '#fed7aa' },
    hard:    { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    active:  { bg: '#F0FDF4', color: '#4CAF50', border: '#bbf7d0' },
    inactive:{ bg: '#f1f5f9', color: '#94a3b8', border: '#e2e8f0' },
  };
  const c = map[variant] || map.default;
  return (
    <span style={{
      padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      textTransform: 'capitalize', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

export function THead({ cols }) {
  return (
    <thead>
      <tr style={{ background: '#f8fafc' }}>
        {cols.map(c => (
          <th key={c} style={{
            padding: '10px 20px', textAlign: 'left', fontSize: 11,
            fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
            letterSpacing: '.06em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
          }}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

export function TRow({ children, onClick }) {
  return (
    <tr onClick={onClick} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 150ms', cursor: onClick ? 'pointer' : undefined }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      {children}
    </tr>
  );
}

export function TD({ children, style = {} }) {
  return <td style={{ padding: '12px 20px', fontSize: 13, color: '#374151', ...style }}>{children}</td>;
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
  return (
    <div style={{ position: 'relative', minWidth: 240 }}>
      <span style={{
        position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
        fontSize: 14, color: '#94a3b8', pointerEvents: 'none',
      }}>🔍</span>
      <input value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8,
          border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none',
          background: '#f8fafc', boxSizing: 'border-box',
          transition: 'border-color 150ms',
        }}
        onFocus={e => { e.target.style.borderColor = '#2E74B5'; e.target.style.background = '#fff'; }}
        onBlur={e  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
      />
    </div>
  );
}

export function FilterChips({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600,
          border: '1.5px solid', cursor: 'pointer',
          borderColor: value === o.value ? '#2E74B5' : '#e2e8f0',
          background:  value === o.value ? '#EFF6FF' : '#fff',
          color:       value === o.value ? '#2E74B5' : '#64748b',
          transition: 'all 150ms',
        }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Pagination({ page, total, pageSize, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', padding: '14px 20px' }}>
      <span style={{ fontSize: 12, color: '#94a3b8' }}>
        {(page-1)*pageSize+1}–{Math.min(page*pageSize, total)} of {total}
      </span>
      <button onClick={() => onChange(page-1)} disabled={page<=1} style={pgBtnStyle(page<=1)}>‹</button>
      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
        const p = Math.max(1, Math.min(totalPages-4, page-2)) + i;
        return (
          <button key={p} onClick={() => onChange(p)} style={pgBtnStyle(false, p===page)}>{p}</button>
        );
      })}
      <button onClick={() => onChange(page+1)} disabled={page>=totalPages} style={pgBtnStyle(page>=totalPages)}>›</button>
    </div>
  );
}
function pgBtnStyle(disabled, active) {
  return {
    width: 30, height: 30, borderRadius: 6, border: '1px solid',
    borderColor: active ? '#2E74B5' : '#e2e8f0',
    background:  active ? '#EFF6FF' : '#fff',
    color:       active ? '#2E74B5' : disabled ? '#cbd5e1' : '#64748b',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

export function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '3px solid #e2e8f0', borderTopColor: '#2E74B5',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export function ErrorBanner({ message }) {
  return message ? (
    <div style={{
      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
      padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 20,
      display: 'flex', gap: 8, alignItems: 'center',
    }}>⚠ {message}</div>
  ) : null;
}

export function EmptyState({ icon = '📭', title = 'No data', subtitle }) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <p style={{ fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{title}</p>
      {subtitle && <p style={{ fontSize: 13, color: '#94a3b8' }}>{subtitle}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 520 }) {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,.45)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#fff', borderRadius: 18, padding: 32, width: '100%', maxWidth: width,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 60px rgba(0,0,0,.18)',
        animation: 'fadeIn .2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{title}</h2>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0',
            background: '#f8fafc', cursor: 'pointer', fontSize: 16, color: '#64748b',
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormField({ label, children, error }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {error && <p style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</p>}
    </div>
  );
}

const inputBase = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid #e2e8f0', fontSize: 13, outline: 'none',
  background: '#f8fafc', boxSizing: 'border-box', fontFamily: 'inherit',
  transition: 'border-color 150ms',
};
export function Input({ value, onChange, placeholder, type = 'text', ...rest }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} style={inputBase}
      onFocus={e => { e.target.style.borderColor = '#2E74B5'; e.target.style.background = '#fff'; }}
      onBlur={e  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
      {...rest} />
  );
}
export function Select({ value, onChange, children, ...rest }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ ...inputBase, cursor: 'pointer' }} {...rest}>
      {children}
    </select>
  );
}
export function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows} style={{ ...inputBase, resize: 'vertical' }}
      onFocus={e => { e.target.style.borderColor = '#2E74B5'; e.target.style.background = '#fff'; }}
      onBlur={e  => { e.target.style.borderColor = '#e2e8f0'; e.target.style.background = '#f8fafc'; }}
    />
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <div onClick={() => onChange(!checked)} style={{
        width: 40, height: 22, borderRadius: 11, transition: 'background 200ms',
        background: checked ? '#2E74B5' : '#e2e8f0', position: 'relative', flexShrink: 0,
      }}>
        <div style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 2,
          left: checked ? 20 : 2, transition: 'left 200ms',
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        }} />
      </div>
      {label && <span style={{ fontSize: 13, color: '#374151' }}>{label}</span>}
    </label>
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
