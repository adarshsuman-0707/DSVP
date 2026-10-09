import { useId, useRef, useState } from 'react';
import Logo from '../common/Logo';

/* Shared building blocks for the login / register / reset screens. */

const svgProps = {
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
};

export const IconArrowRight = (p) => <svg {...svgProps} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconArrowLeft  = (p) => <svg {...svgProps} {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
export const IconEye        = (p) => <svg {...svgProps} {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
export const IconEyeOff     = (p) => <svg {...svgProps} {...p}><path d="M17.9 17.9A10.5 10.5 0 0 1 12 19C5.6 19 2 12 2 12a18 18 0 0 1 4.1-5M9.9 5.2A9.8 9.8 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>;
export const IconAlert      = (p) => <svg {...svgProps} width={16} height={16} {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>;
export const IconCheck      = (p) => <svg {...svgProps} {...p}><path d="M20 6 9 17l-5-5" /></svg>;
export const IconX          = (p) => <svg {...svgProps} width={14} height={14} {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>;

/** Geometric DSVP mark: three linked nodes. */
export function BrandMark() {
  return <Logo size={34} className="auth-brand-mark" />;
}

/** Label + control with a proper for/id association. `children` is a render prop receiving the input id. */
export function Field({ label, aside, children }) {
  const id = useId();
  return (
    <div className="auth-field">
      <div className="auth-label-row">
        <label className="auth-label" htmlFor={id}>{label}</label>
        {aside}
      </div>
      {children(id)}
    </div>
  );
}

export function TextInput({ id, ...rest }) {
  return <input id={id} className="auth-input" {...rest} />;
}

export function PasswordInput({ id, show, onToggle, ...rest }) {
  return (
    <div className="auth-input-wrap">
      <input id={id} className="auth-input" type={show ? 'text' : 'password'} {...rest} />
      <button
        type="button" className="auth-eye" onClick={onToggle}
        aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
      >
        {show ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}

export function Alert({ message }) {
  if (!message) return null;
  return (
    <div className="auth-alert" role="alert">
      <IconAlert />
      <span>{message}</span>
    </div>
  );
}

export function PrimaryButton({ loading, label, loadingLabel, disabled = false, arrow = true }) {
  return (
    <button type="submit" className="auth-btn" disabled={loading || disabled} aria-busy={loading}>
      {loading ? (<><span className="auth-spin" aria-hidden="true" />{loadingLabel}</>) : (<>{label}{arrow && <IconArrowRight />}</>)}
    </button>
  );
}

export function Steps({ labels, active }) {
  return (
    <div className="auth-steps" aria-label={`Step ${active + 1} of ${labels.length}`}>
      {labels.map((l, i) => (
        <div key={l} className={i <= active ? 'on' : ''}><i /><span>{l}</span></div>
      ))}
    </div>
  );
}

/* ── OTP: shared state/handlers + the six boxes ── */
export function useOtp() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const refs = useRef([]);
  const focus = (i) => refs.current[i]?.focus();

  return {
    otp, refs,
    code: otp.join(''),
    reset() { setOtp(['', '', '', '', '', '']); setTimeout(() => focus(0), 100); },
    focusFirst() { setTimeout(() => focus(0), 100); },
    onChange(i, val) {
      if (!/^\d?$/.test(val)) return;
      setOtp(prev => { const n = [...prev]; n[i] = val; return n; });
      if (val && i < 5) focus(i + 1);
    },
    onKeyDown(i, e) {
      if (e.key === 'Backspace' && !otp[i] && i > 0) focus(i - 1);
      if (e.key === 'ArrowLeft' && i > 0) focus(i - 1);
      if (e.key === 'ArrowRight' && i < 5) focus(i + 1);
    },
    onPaste(e) {
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (!pasted) return;
      e.preventDefault();
      setOtp(prev => { const n = [...prev]; pasted.split('').forEach((c, k) => { n[k] = c; }); return n; });
      focus(Math.min(pasted.length, 5));
    },
  };
}

export function OtpBoxes({ state }) {
  return (
    <div className="auth-otp" role="group" aria-label="6-digit verification code">
      {state.otp.map((digit, i) => (
        <input
          key={i}
          ref={el => { state.refs.current[i] = el; }}
          type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1}`}
          className={digit ? 'filled' : ''}
          value={digit}
          onChange={e => state.onChange(i, e.target.value)}
          onKeyDown={e => state.onKeyDown(i, e)}
          onPaste={i === 0 ? state.onPaste : undefined}
        />
      ))}
    </div>
  );
}
