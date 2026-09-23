/**
 * DSVP centralized color tokens — dark theme.
 *
 * Single source of truth for the semantic color system shared across
 * visualizations (AVL today; BST/Heap/Trie/etc. should consume the same
 * tokens as they're built, per the DSVP color spec). Do not hardcode colors
 * inside components — import tokens from here.
 */

export const colors = {
  background: '#0B1120',
  canvas: '#0F172A',
  panel: '#111827',
  panelSecondary: '#1E293B',
  card: '#172033',
  editorBg: '#0D1117',
  border: '#334155',

  text: {
    primary: '#F8FAFC',
    secondary: '#CBD5E1',
    muted: '#94A3B8',
    disabled: '#64748B',
    code: '#E2E8F0',
  },

  node: {
    default:   { bg: '#1E293B', border: '#64748B', text: '#F8FAFC' },
    active:    { bg: '#2563EB', border: '#60A5FA', text: '#FFFFFF' },
    comparing: { bg: '#7C3AED', border: '#A78BFA', text: '#FFFFFF' },
    traversal: { bg: '#0E7490', border: '#22D3EE', text: '#ECFEFF' },
    inserting: { bg: '#047857', border: '#34D399', text: '#ECFDF5' },
    deleting:  { bg: '#991B1B', border: '#F87171', text: '#FEF2F2' },
    rotationPivot: { bg: '#D97706', border: '#FBBF24', text: '#FFFFFF' },
    rotationRoot:  { bg: '#0891B2', border: '#67E8F9', text: '#FFFFFF' },
  },

  balance: {
    zero:    '#22C55E', // BF = 0, perfectly balanced
    one:     '#84CC16', // BF = ±1, valid but leaning
    two:     '#F59E0B', // BF = ±2, needs rebalancing
    invalid: '#EF4444', // |BF| > 2, invalid AVL state
  },

  edge: {
    default: '#475569',
    active: '#60A5FA',
    comparison: '#A78BFA',
    rotation: '#F59E0B',
    newAfterRotation: '#22C55E',
    deleted: '#EF4444',
  },

  reference: {
    old: '#EF4444',
    moving: '#F59E0B',
    new: '#22C55E',
  },

  status: {
    success: '#22C55E',
    info: '#38BDF8',
    warning: '#F59E0B',
    error: '#EF4444',
    neutral: '#64748B',
  },

  timeline: {
    insert: '#22C55E',
    search: '#38BDF8',
    delete: '#EF4444',
    compare: '#A78BFA',
    heightUpdate: '#06B6D4',
    balanceCheck: '#F59E0B',
    rotation: '#F97316',
    rootChange: '#14B8A6',
    traversal: '#8B5CF6',
    completed: '#22C55E',
    error: '#EF4444',
  },

  sourceLine: {
    currentBg: '#1E3A8A',
    currentBorder: '#60A5FA',
    currentText: '#FFFFFF',
    previousBg: '#172033',
    breakpoint: '#F43F5E',
  },
};

/** BF -> semantic balance color, per the DSVP balance-factor scale. */
export function balanceFactorColor(bf) {
  const abs = Math.abs(bf);
  if (abs === 0) return colors.balance.zero;
  if (abs === 1) return colors.balance.one;
  if (abs === 2) return colors.balance.two;
  return colors.balance.invalid;
}

/** BF -> accessible label (icon + text), never color-only. */
export function balanceFactorLabel(bf) {
  const abs = Math.abs(bf);
  const sign = bf > 0 ? '+' : '';
  if (abs <= 1) return `BF ${sign}${bf}`;
  if (abs === 2) return `⚠ Balance ${sign}${bf}`;
  return `✕ Invalid ${sign}${bf}`;
}

export default colors;
