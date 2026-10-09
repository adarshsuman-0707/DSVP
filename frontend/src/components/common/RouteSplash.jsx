import { useTheme } from '../../context/ThemeContext';
import Logo from './Logo';

/* Neutral full-screen placeholder used while auth resolves or a lazy route
   chunk loads. Uses the active theme's background so it never flashes a
   different colour than the page that replaces it. */
export default function RouteSplash() {
  const { T } = useTheme();
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
      background: T.bg, fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <Logo size={48} />
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: `3px solid ${T.border}`, borderTopColor: '#2E74B5',
        animation: 'dsvp-spin 0.7s linear infinite',
      }} />
      <style>{'@keyframes dsvp-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
