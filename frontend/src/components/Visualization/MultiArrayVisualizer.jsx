import ArrayVisualizer from './ArrayVisualizer';

/**
 * MultiArrayVisualizer
 * ────────────────────
 * If the user's code declares more than one array-typed variable
 * (arr1, arr2, ... — possibly different sizes), each one gets its own
 * live panel instead of the newest one silently overwriting the last.
 * Falls back to a single, full-size ArrayVisualizer when there's 0 or 1
 * tracked array, so existing single-array code looks and behaves exactly
 * as before — this only changes anything once a second array shows up.
 */
export default function MultiArrayVisualizer({
  arrays        = [],       // [{ name, state, activeIndex, secondIndex, type }, ...]
  activeArrayVar = null,    // which array's op this event/step belongs to
  description   = '',
  step          = 0,
  totalSteps    = 0,
  userOutput    = '',
  // legacy single-array props — used when arrays.length <= 1
  arrayState    = [],
  activeIndex   = null,
  secondIndex   = null,
  type          = 'highlight',
}) {
  if (arrays.length <= 1) {
    return (
      <ArrayVisualizer
        arrayState={arrays.length === 1 ? arrays[0].state : arrayState}
        activeIndex={arrays.length === 1 ? arrays[0].activeIndex : activeIndex}
        secondIndex={arrays.length === 1 ? arrays[0].secondIndex : secondIndex}
        type={type}
        description={description}
        step={step}
        totalSteps={totalSteps}
        userOutput={userOutput}
      />
    );
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: '#0d1117', overflow: 'hidden',
    }}>
      {arrays.map((arr, i) => (
        <div
          key={arr.name}
          style={{
            flex: 1, minHeight: 0,
            borderBottom: i < arrays.length - 1 ? '1px solid rgba(255,255,255,.09)' : 'none',
            outline: arr.name === activeArrayVar ? '2px solid rgba(96,165,250,.5)' : 'none',
            outlineOffset: -2,
            transition: 'outline 150ms',
          }}
        >
          <ArrayVisualizer
            name={arr.name}
            arrayState={arr.state}
            activeIndex={arr.activeIndex}
            secondIndex={arr.secondIndex}
            type={arr.name === activeArrayVar ? type : 'highlight'}
            description={arr.name === activeArrayVar ? description : ''}
            step={step}
            totalSteps={totalSteps}
            userOutput={i === arrays.length - 1 ? userOutput : ''}
          />
        </div>
      ))}
    </div>
  );
}
