const crypto = require('crypto');
const COMMON = require('./commonPasswords');
const breachCheck = require('../services/breachCheck');

/**
 * Central password policy — the single source of truth for registration,
 * signup-OTP, change-password, forgot/admin reset and the temp-password flow.
 * Mirrored (for live feedback only) in frontend/src/utils/passwordPolicy.js.
 *
 *   • ≥ PASSWORD_MIN_LENGTH (default 12) and ≤ PASSWORD_MAX_LENGTH (default 128)
 *     characters, counted in Unicode code points — never truncated.
 *   • upper + lower case letter (Unicode-aware), a digit, a special character
 *   • no leading/trailing whitespace, no control characters
 *   • not a common password / trivially derived from one, not built from the
 *     user's own email or name
 *   • not in a known breach (k-anonymity range query; see breachCheck.js)
 * Passphrases, spaces inside, emoji and non-Latin scripts are all fine.
 */
const envInt = (name, d, min) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n >= min ? n : d;
};
const minLength = () => envInt('PASSWORD_MIN_LENGTH', 12, 8);
const maxLength = () => envInt('PASSWORD_MAX_LENGTH', 128, 32);
const historyCount = () => {
  const n = parseInt(process.env.PASSWORD_HISTORY_COUNT, 10);
  return Number.isFinite(n) && n >= 0 ? n : 5;
};
const cpLength = (s) => [...s].length;

const DELEET = { '@': 'a', '4': 'a', '0': 'o', '1': 'l', '!': 'i', '3': 'e', '$': 's', '5': 's', '7': 't', '+': 't' };

/** True if the password is a common one or a trivial variation (case, digits, symbols, leetspeak). */
function looksCommon(pw) {
  const lower = pw.normalize('NFKC').toLowerCase();
  const letters = lower.replace(/[^\p{L}]/gu, '');
  const deleet = [...lower].map((c) => DELEET[c] ?? c).join('').replace(/[^a-z]/g, '');
  const alnum = lower.replace(/[^\p{L}\p{N}]/gu, '');
  // 'P@ssw0rd!!!' → drop padding digits/symbols at the ends, then undo leetspeak
  const core = [...lower.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')].map((c) => DELEET[c] ?? c).join('').replace(/[^a-z]/g, '');
  if ([lower, alnum, letters, deleet, core].some((c) => c && COMMON.has(c))) return true;
  if (/^(.)\1+$/u.test(lower)) return true; // aaaaaaaaaaaa
  return false;
}

function containsPersonalInfo(pw, ctx = {}) {
  const lower = pw.toLowerCase();
  const parts = [];
  if (ctx.email) parts.push(String(ctx.email).split('@')[0]);
  if (ctx.fullName) parts.push(...String(ctx.fullName).split(/\s+/));
  return parts.some((p) => {
    const t = p.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    return t.length >= 4 && lower.includes(t);
  });
}

/**
 * Synchronous, offline rules. Returns an array of human-readable problems
 * (empty = acceptable). ctx = { email, fullName } is optional.
 */
function validatePassword(pw, ctx = {}) {
  if (typeof pw !== 'string' || !pw) return ['Password is required.'];
  const errors = [];
  const len = cpLength(pw);
  const min = minLength();
  const max = maxLength();

  if (len < min) errors.push(`Use at least ${min} characters.`);
  if (len > max) errors.push(`Use at most ${max} characters.`);
  if (pw !== pw.trim()) errors.push('Remove spaces at the start or end.');
  if (/\p{Cc}/u.test(pw)) errors.push('Remove control characters.');
  if (!/\p{Ll}/u.test(pw)) errors.push('Include a lowercase letter.');
  if (!/\p{Lu}/u.test(pw)) errors.push('Include an uppercase letter.');
  if (!/\p{Nd}/u.test(pw)) errors.push('Include a number.');
  if (!/[^\p{L}\p{N}\s]/u.test(pw)) errors.push('Include a special character.');

  if (!errors.length) {
    if (looksCommon(pw)) errors.push('This password is too common or easy to guess.');
    else if (containsPersonalInfo(pw, ctx)) errors.push('Don’t use your name or email in your password.');
  }
  return errors;
}

/**
 * Full policy: offline rules, then the breach check (only for otherwise
 * valid passwords, so we never query for obviously-rejected input).
 * Throws nothing; a breach-service outage follows PASSWORD_BREACH_CHECK:
 * `on` (default) fails open with a warning, `strict` rejects, `off` skips.
 */
async function checkPasswordPolicy(pw, ctx = {}) {
  const errors = validatePassword(pw, ctx);
  if (errors.length) return errors;
  const res = await breachCheck.isBreached(pw);
  if (res.breached) return ['This password has appeared in a known data breach. Choose a different one.'];
  if (res.unavailable && breachCheck.mode() === 'strict') {
    return ['We couldn’t verify this password right now. Please try again in a moment.'];
  }
  return [];
}

// Ambiguous characters (0/O, 1/l/I) omitted so the emailed password is easy to type.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';
const SYMBOL = '!@#$%^&*-_=+?';
const ALL = UPPER + LOWER + DIGIT + SYMBOL;
const pick = (set) => set[crypto.randomInt(set.length)];

/** Cryptographically random password that always satisfies the policy. */
function generateTempPassword(length = 16) {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < Math.max(length, minLength())) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {          // Fisher–Yates with CSPRNG
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function tempPasswordTtlMinutes() {
  return envInt('TEMP_PASSWORD_EXPIRES_MIN', 60, 1);
}

module.exports = {
  validatePassword, checkPasswordPolicy, generateTempPassword, tempPasswordTtlMinutes,
  historyCount, minLength, maxLength, looksCommon,
};
