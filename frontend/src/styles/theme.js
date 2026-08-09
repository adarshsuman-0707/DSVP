// ============================================================
//  DSVP — Design Tokens
//  Single source of truth for JS-side styling.
//  CSS custom properties in index.css mirror these values.
// ============================================================

export const colors = {
  primary:       '#1F4E79',
  primaryLight:  '#2563a8',
  primaryDark:   '#163a5e',
  secondary:     '#2E74B5',
  success:       '#4CAF50',
  danger:        '#E15759',
  accent:        '#F2A93B',
  surfaceLight:  '#DCE6F1',
  surfaceMuted:  '#F7F7F7',
  surfaceCard:   '#ffffff',
  textPrimary:   '#1e293b',
  textSecondary: '#64748b',
  textMuted:     '#94a3b8',
  border:        '#e2e8f0',
};

export const typography = {
  body: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize:   '14px',
    fontWeight:  400,
  },
  heading: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontWeight:  700,
  },
  code: {
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    fontSize:   '13px',
  },
  microLabel: {
    fontFamily:    "'Inter', system-ui, sans-serif",
    fontSize:      '11px',
    fontWeight:     500,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
};

export const motion = {
  structuralTransitionMs: 400,
  easing:                 'ease-in-out',
  fast:                   '150ms ease',
  medium:                 '300ms ease',
};

export const shadows = {
  sm: '0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06)',
  md: '0 4px 6px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.06)',
  lg: '0 10px 15px rgba(0,0,0,.08), 0 4px 6px rgba(0,0,0,.05)',
  xl: '0 20px 25px rgba(0,0,0,.1), 0 10px 10px rgba(0,0,0,.04)',
};

export const radius = {
  sm:   '6px',
  md:   '10px',
  lg:   '16px',
  xl:   '24px',
  full: '9999px',
};

export const breakpoints = {
  desktop: 1200,
  tablet:  768,
};

export const layout = {
  sidebarWidth: 240,
  topbarHeight: 60,
};
