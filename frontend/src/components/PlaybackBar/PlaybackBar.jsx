/**
 * PlaybackBar
 * ────────────
 * No functional bug here — this component only reads `displayStep` /
 * `displayTotal` (and the raw currentStep/totalSteps for the scrubber
 * range) that Workspace.jsx computes. It was rendering correctly all
 * along; the "nothing shows besides the array" issue was entirely
 * upstream in traceGenerator.js not populating callStack/currentFunc/
 * currentLine on events. Included here unchanged for completeness.
 */
export default function PlaybackBar({
  currentStep,
  totalSteps,
  isPlaying,
  speed,
  onPlayPause,
  onStep,
  onScrub,
  onReset,
  onSpeedChange,
  displayStep,
  displayTotal,
}) {
  const progress = totalSteps > 0 ? ((currentStep - 1) / Math.max(totalSteps - 1, 1)) * 100 : 0;
  const showStep  = displayStep  ?? currentStep;
  const showTotal = displayTotal ?? totalSteps;

  return (
    <div
      role="toolbar"
      aria-label="Playback controls"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 20px', height: 52, flexShrink: 0,
        background: '#161b22',
        borderTop: '1px solid rgba(255,255,255,.07)',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* reset to the first step */}
      {onReset && (
        <CtrlBtn
          onClick={onReset}
          disabled={currentStep <= 1 && !isPlaying}
          label="Reset to first step"
        >⟲</CtrlBtn>
      )}

      {/* step back */}
      <CtrlBtn
        onClick={() => onStep(-1)}
        disabled={currentStep <= 1}
        label="Previous step (←)"
      >⏮</CtrlBtn>

      {/* play/pause */}
      <CtrlBtn
        onClick={onPlayPause}
        disabled={totalSteps === 0}
        label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        primary
      >
        {isPlaying ? '⏸' : '▶'}
      </CtrlBtn>

      {/* step forward */}
      <CtrlBtn
        onClick={() => onStep(1)}
        disabled={currentStep >= totalSteps}
        label="Next step (→)"
      >⏭</CtrlBtn>

      {/* scrubber */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          type="range"
          min={1}
          max={Math.max(totalSteps, 1)}
          value={currentStep}
          onChange={e => onScrub(Number(e.target.value))}
          disabled={totalSteps === 0}
          aria-label="Scrub to step"
          style={{
            width: '100%', height: 4, cursor: 'pointer',
            accentColor: '#2E74B5', appearance: 'none', WebkitAppearance: 'none',
            background: `linear-gradient(to right, #2E74B5 ${progress}%, rgba(255,255,255,.12) ${progress}%)`,
            borderRadius: 2, outline: 'none', border: 'none',
          }}
        />
      </div>

      {/* step counter */}
      <span style={{
        fontSize: 12, fontWeight: 600, color: '#8b949e',
        minWidth: 88, textAlign: 'right', letterSpacing: '.02em',
      }}>
        {showTotal === 0 ? 'No trace' : `Step ${showStep} / ${showTotal}`}
      </span>

      {/* divider */}
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,.1)' }} />

      {/* speed */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Speed
        </span>
        <select
          value={speed}
          onChange={e => onSpeedChange(Number(e.target.value))}
          aria-label="Playback speed"
          style={{
            background: '#21262d', border: '1px solid rgba(255,255,255,.1)',
            color: '#e6edf3', borderRadius: 6, padding: '4px 8px',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', outline: 'none',
          }}
        >
          {[0.5, 1, 2, 4].map(s => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function CtrlBtn({ children, onClick, disabled, label, primary }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        width: 34, height: 34, borderRadius: 8,
        border: primary ? 'none' : '1px solid rgba(255,255,255,.1)',
        background: primary
          ? disabled ? 'rgba(46,116,181,.25)' : 'rgba(46,116,181,.8)'
          : 'rgba(255,255,255,.05)',
        color: disabled ? '#555' : '#e6edf3',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 150ms', flexShrink: 0,
      }}
      onMouseEnter={e => {
        if (!disabled) e.currentTarget.style.background = primary
          ? 'rgba(46,116,181,1)' : 'rgba(255,255,255,.1)';
      }}
      onMouseLeave={e => {
        if (!disabled) e.currentTarget.style.background = primary
          ? 'rgba(46,116,181,.8)' : 'rgba(255,255,255,.05)';
      }}
    >
      {children}
    </button>
  );
}
