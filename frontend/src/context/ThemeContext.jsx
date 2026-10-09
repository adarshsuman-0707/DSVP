import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/* ════════════════════════════════════════════════════════════
   DSVP app-wide theme — dark (default) / light toggle.
   Same pattern as the Workspace editor's theme toggle:
   localStorage-persisted, no external state library needed.
   ════════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'dsvp_app_theme';

export const THEMES = {
  dark: {
    mode: 'dark',
    bg: '#0b1220',
    bgGradient: 'radial-gradient(circle at 15% 0%, rgba(59,130,196,.08) 0%, transparent 45%), radial-gradient(circle at 85% 20%, rgba(139,92,246,.07) 0%, transparent 45%), #0b1220',
    sidebarBg: '#0e1626',
    topbarBg: 'rgba(14,22,38,.85)',
    card: '#111b2e',
    cardAlt: '#0e1626',
    cardBorder: '#1e293b',
    cardBorderHover: '#2E74B5',
    inputBg: '#0b1220',
    text: '#e6ecf5',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    border: '#1e293b',
    divider: '#1a2333',
    accent: '#3B82C4',
    accent2: '#8b5cf6',
    success: '#4CAF50',
    danger: '#E15759',
    warning: '#F2A93B',
    hoverBg: 'rgba(59,130,196,.08)',
    chipBg: 'rgba(59,130,196,.14)',
    chipBorder: 'rgba(59,130,196,.35)',
    shadow: '0 4px 18px rgba(0,0,0,.35)',
    glow: '0 0 0 1px rgba(59,130,196,.15), 0 8px 24px rgba(0,0,0,.4)',
    heatEmpty: '#161f30',
  },
  light: {
    mode: 'light',
    bg: '#f8fafc',
    bgGradient: '#f8fafc',
    sidebarBg: '#ffffff',
    topbarBg: 'rgba(255,255,255,.9)',
    card: '#ffffff',
    cardAlt: '#f8fafc',
    cardBorder: '#e2e8f0',
    cardBorderHover: '#2E74B5',
    inputBg: '#f8fafc',
    text: '#1e293b',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    border: '#e2e8f0',
    divider: '#f1f5f9',
    accent: '#2E74B5',
    accent2: '#8b5cf6',
    success: '#4CAF50',
    danger: '#E15759',
    warning: '#F2A93B',
    hoverBg: '#f1f5f9',
    chipBg: '#EFF6FF',
    chipBorder: '#bfdbfe',
    shadow: '0 1px 4px rgba(0,0,0,.05)',
    glow: '0 6px 18px rgba(46,116,181,.15)',
    heatEmpty: '#eef2f6',
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ }
  }, [mode]);

  const toggleTheme = useCallback(() => setMode(m => (m === 'dark' ? 'light' : 'dark')), []);

  const value = useMemo(
    () => ({ mode, T: THEMES[mode], toggleTheme, setMode }),
    [mode, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // safe fallback for components rendered outside the provider
    return { mode: 'dark', T: THEMES.dark, toggleTheme: () => {}, setMode: () => {} };
  }
  return ctx;
}
