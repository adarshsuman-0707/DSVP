/**
 * Password policy — live-feedback mirror of backend/src/utils/passwordPolicy.js.
 * The server is authoritative (it also rejects common/breached passwords and
 * reused ones); this only tells people what's needed while they type.
 * Lengths count Unicode code points, never truncating.
 */
export const MIN_LENGTH = 12;
export const MAX_LENGTH = 128;

const len = (s) => [...s].length;

export const RULES = [
  { id: 'len',   label: `${MIN_LENGTH}+ characters`,  test: (p) => len(p) >= MIN_LENGTH },
  { id: 'lower', label: 'Lowercase letter',           test: (p) => /\p{Ll}/u.test(p) },
  { id: 'upper', label: 'Uppercase letter',           test: (p) => /\p{Lu}/u.test(p) },
  { id: 'digit', label: 'Number',                     test: (p) => /\p{Nd}/u.test(p) },
  { id: 'sym',   label: 'Special character',          test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
];

/** Problems that aren't a "checklist" item: shown as extra messages. */
export function extraProblems(pw) {
  const out = [];
  if (len(pw) > MAX_LENGTH) out.push(`Use at most ${MAX_LENGTH} characters.`);
  if (pw && pw !== pw.trim()) out.push('Remove spaces at the start or end.');
  return out;
}

export function evaluate(pw = '') {
  return RULES.map((r) => ({ ...r, ok: r.test(pw) }));
}

/** First-line validation before calling the API; [] means "looks fine". */
export function localProblems(pw = '') {
  const unmet = evaluate(pw).filter((r) => !r.ok).map((r) => `Missing: ${r.label.toLowerCase()}.`);
  return [...unmet, ...extraProblems(pw)];
}

export const LEVELS = [
  { label: 'Too weak', color: '#F87171' },
  { label: 'Weak',     color: '#F87171' },
  { label: 'Fair',     color: '#FBBF24' },
  { label: 'Good',     color: '#34D399' },
  { label: 'Strong',   color: '#2DD4BF' },
];

/** 0 (empty) … 4. Long passphrases earn "Strong" even without every symbol class. */
export function strengthOf(pw = '') {
  if (!pw) return 0;
  const met = evaluate(pw).filter((r) => r.ok).length;
  const n = len(pw);
  if (met === RULES.length && !extraProblems(pw).length) return n >= 16 ? 4 : 3;
  if (n >= 20 && met >= 3) return 2;
  return met <= 2 ? 1 : 2;
}
