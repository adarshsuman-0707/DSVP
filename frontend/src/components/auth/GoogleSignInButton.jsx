import { useCallback, useEffect, useRef, useState } from 'react';
import { getGoogleNonce } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let gisPromise = null;
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC; s.async = true; s.defer = true;
      s.onload = resolve;
      s.onerror = () => { gisPromise = null; s.remove(); reject(new Error('gis-load')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

/**
 * "Continue with Google" — Google Identity Services renders the account
 * chooser button. Each render uses a fresh single-use server nonce that
 * Google embeds in the signed ID token; the backend verifies the token and
 * consumes the nonce, so a credential can never be replayed. Nothing the
 * browser says about the user is trusted — only the credential is sent.
 *
 * Props: onSuccess(result), onError(message)
 */
export default function GoogleSignInButton({ onSuccess, onError }) {
  const { googleLogin } = useAuth();
  const slotRef = useRef(null);
  const [phase, setPhase] = useState(CLIENT_ID ? 'loading' : 'off'); // loading | ready | busy | unavailable | off
  const [attempt, setAttempt] = useState(0);
  const handlers = useRef({ onSuccess, onError });
  handlers.current = { onSuccess, onError };

  const handleCredential = useCallback(async (response) => {
    setPhase('busy');
    try {
      const result = await googleLogin(response.credential);
      handlers.current.onSuccess?.(result);
    } catch (err) {
      const status = err?.response?.status;
      handlers.current.onError?.(
        err?.response?.data?.message
          || (status === 429 ? 'Too many attempts. Please wait a moment.' : 'Google sign-in failed. Please try again.'),
      );
      setAttempt((n) => n + 1);   // the nonce is spent: render again with a fresh one
    }
  }, [googleLogin]);

  useEffect(() => {
    if (!CLIENT_ID) return undefined;
    let cancelled = false;
    setPhase('loading');
    (async () => {
      try {
        const [{ data }] = await Promise.all([getGoogleNonce(), loadGis()]);
        if (cancelled || !slotRef.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          nonce: data.nonce,
          callback: handleCredential,
          ux_mode: 'popup',
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });
        slotRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(slotRef.current, {
          type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular',
          text: 'continue_with', logo_alignment: 'left',
          width: Math.min(400, Math.max(200, slotRef.current.parentElement?.offsetWidth || 320)),
        });
        setPhase('ready');
      } catch (err) {
        if (cancelled) return;
        setPhase('unavailable');
        if (err?.response?.status !== 503) {
          handlers.current.onError?.('Google sign-in is temporarily unavailable. Use email and password instead.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [attempt, handleCredential]);

  if (phase === 'off' || phase === 'unavailable') return null;

  return (
    <div className="auth-google" aria-live="polite">
      {phase === 'loading' && <div className="auth-google-skel" aria-label="Loading Google sign-in" />}
      {phase === 'busy' && (
        <div className="auth-google-busy" role="status"><span className="auth-spin" aria-hidden="true" />Signing in with Google…</div>
      )}
      <div ref={slotRef} className="auth-google-slot" hidden={phase !== 'ready'} />
    </div>
  );
}
