import { useId, useMemo, useState } from 'react';
import { Field, PasswordInput, IconCheck, IconX } from './authUi';
import { evaluate, extraProblems, strengthOf, LEVELS, MAX_LENGTH } from '../../utils/passwordPolicy';

/**
 * Reusable "choose a new password" block for the auth screens: password
 * field with show/hide, strength meter, live requirement checklist, and a
 * confirm field with match feedback. Controlled — the parent owns the values
 * and runs final validation (the server re-validates everything).
 *
 * Props: password, onPassword, confirm, onConfirm, disabled, label, confirmLabel,
 *        autoFocus, extraMismatch (e.g. "same as current" message)
 */
export default function NewPasswordFields({
  password, onPassword, confirm, onConfirm, disabled = false,
  label = 'New password', confirmLabel = 'Confirm new password',
  placeholder = 'Create a strong password', autoFocus = false, notice = '',
}) {
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const rulesId = useId();

  const rules = useMemo(() => evaluate(password), [password]);
  const extras = useMemo(() => extraProblems(password), [password]);
  const level = strengthOf(password);
  const mismatch = !!confirm && confirm !== password;

  return (
    <>
      <Field label={label}>
        {(id) => (
          <>
            <PasswordInput
              id={id} name="new-password" value={password} required disabled={disabled} autoFocus={autoFocus}
              autoComplete="new-password" placeholder={placeholder} aria-describedby={rulesId}
              show={showNew} onToggle={() => setShowNew((s) => !s)}
              onChange={(e) => onPassword(e.target.value)}
            />
            {password.length > 0 && (
              <div aria-live="polite">
                <div className="auth-strength">
                  {[1, 2, 3, 4].map((n) => (
                    <i key={n} style={level >= n ? { background: LEVELS[level].color } : undefined} />
                  ))}
                </div>
                <span className="auth-strength-label" style={{ color: LEVELS[level].color }}>
                  Password strength: {LEVELS[level].label}
                </span>
              </div>
            )}
            <ul className="auth-rules" id={rulesId}>
              {rules.map((r) => (
                <li key={r.id} className={r.ok ? 'ok' : ''}>
                  {r.ok ? <IconCheck width={13} height={13} /> : <IconX width={13} height={13} />}
                  {r.label}
                </li>
              ))}
            </ul>
            <p className="auth-hint-note">Passphrases, spaces and any language are welcome (up to {MAX_LENGTH} characters).</p>
            {extras.map((m) => <p key={m} className="auth-hint bad" aria-live="polite" style={{ margin: '6px 0 0' }}><IconX />{m}</p>)}
          </>
        )}
      </Field>
      {notice && <p className="auth-hint bad" aria-live="polite"><IconX />{notice}</p>}

      <Field label={confirmLabel}>
        {(id) => (
          <PasswordInput
            id={id} name="confirm-password" value={confirm} required disabled={disabled}
            autoComplete="new-password" placeholder="Re-enter new password"
            show={showConfirm} onToggle={() => setShowConfirm((s) => !s)}
            onChange={(e) => onConfirm(e.target.value)}
          />
        )}
      </Field>
      {confirm && (
        <p className={`auth-hint ${mismatch ? 'bad' : 'ok'}`} aria-live="polite">
          {mismatch ? <><IconX />Passwords do not match</> : <><IconCheck width={14} height={14} />Passwords match</>}
        </p>
      )}
    </>
  );
}
