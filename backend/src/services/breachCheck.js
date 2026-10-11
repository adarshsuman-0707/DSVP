const crypto = require('crypto');

/**
 * Known-compromised password check using the Have I Been Pwned "range" API.
 * Privacy-preserving (k-anonymity): only the first 5 hex characters of the
 * password's SHA-1 are sent; the full hash and the password never leave this
 * process, and the response is matched locally. `Add-Padding` hides the
 * result size from network observers.
 *
 *   PASSWORD_BREACH_CHECK = on (default, fail-open) | strict (fail-closed) | off
 *   PASSWORD_BREACH_THRESHOLD = minimum breach count to reject (default 1)
 *   PASSWORD_BREACH_TIMEOUT_MS = per-request timeout (default 3000)
 */
const ENDPOINT = 'https://api.pwnedpasswords.com/range/';
let fetchImpl = (...a) => fetch(...a); // swappable for tests

const mode = () => {
  const m = String(process.env.PASSWORD_BREACH_CHECK || 'on').toLowerCase();
  return ['on', 'strict', 'off'].includes(m) ? m : 'on';
};

/** Returns { breached, unavailable }. Never throws, never logs the password. */
async function isBreached(password) {
  if (mode() === 'off') return { breached: false, unavailable: false };
  const sha1 = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const threshold = Math.max(1, parseInt(process.env.PASSWORD_BREACH_THRESHOLD, 10) || 1);
  const timeout = parseInt(process.env.PASSWORD_BREACH_TIMEOUT_MS, 10) || 3000;
  try {
    const res = await fetchImpl(ENDPOINT + prefix, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'DSVP-password-check' },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.text();
    for (const line of body.split(/\r?\n/)) {
      const [s, count] = line.trim().split(':');
      if (s && s.toUpperCase() === suffix) return { breached: parseInt(count, 10) >= threshold, unavailable: false };
    }
    return { breached: false, unavailable: false };
  } catch (err) {
    console.warn('Password breach check unavailable:', err.name === 'TimeoutError' ? 'timeout' : err.message);
    return { breached: false, unavailable: true };
  }
}

module.exports = { isBreached, mode, _setFetch: (f) => { fetchImpl = f || ((...a) => fetch(...a)); } };
