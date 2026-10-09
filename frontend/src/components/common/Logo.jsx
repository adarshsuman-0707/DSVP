/* DSVP app icon — served from /public/logo.png (256px, pre-resized from
   src/assets/image.png so we don't ship the 1.9 MB original). */
export default function Logo({ size = 32, radius, style, className }) {
  return (
    <img
      src="/logo.png" alt="DSVP" width={size} height={size}
      className={className} decoding="async" draggable={false}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.24), flexShrink: 0, display: 'block', ...style }}
    />
  );
}
