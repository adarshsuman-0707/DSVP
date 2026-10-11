import { evaluate, strengthOf, LEVELS, extraProblems } from '../../utils/passwordPolicy';

/**
 * Strength meter + requirement checklist with inline styles, for pages that
 * don't use the auth theme (Profile, ResetPasswordPage). Colors are passed in
 * so it fits light and dark surfaces.
 */
export default function PasswordRequirements({ password, track = '#e2e8f0', muted = '#94a3b8', ok = '#15803d', bad = '#dc2626' }) {
  if (!password) return null;
  const level = strengthOf(password);
  const color = LEVELS[level].color;
  const extras = extraProblems(password);
  return (
    <div style={{ marginTop: -8, marginBottom: 16 }} aria-live="polite">
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[1, 2, 3, 4].map((n) => (
          <div key={n} style={{ height: 4, flex: 1, borderRadius: 2, background: level >= n ? color : track, transition: 'background 200ms' }} />
        ))}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color }}>{LEVELS[level].label}</span>
      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 10px' }}>
        {evaluate(password).map((r) => (
          <li key={r.id} style={{ fontSize: 12, color: r.ok ? ok : muted }}>{r.ok ? '✓' : '○'} {r.label}</li>
        ))}
      </ul>
      {extras.map((m) => <p key={m} style={{ fontSize: 12, color: bad, margin: '6px 0 0' }}>✗ {m}</p>)}
    </div>
  );
}
