/**
 * Motion (motion.dev) transition driver.
 *
 * Script tag: load Motion before Zumly and use `driver: 'motion'` (global `Motion`).
 *   <script src="https://cdn.jsdelivr.net/npm/motion@11/dist/motion.js"></script>
 * Bundler: pass the library — `driver: motionDriver({ animate })` with
 *   `import { animate } from 'motion'`.
 *
 * CSS easing strings follow the same curve as the CSS driver; other values are
 * Motion easings ('easeOut', 'backInOut', [x1, y1, x2, y2]).
 *
 * @param {Object} spec - Transition spec from the engine
 * @param {function} onComplete - MUST be called exactly once when done
 * @param {{ animate: function }} [lib] - Motion module; defaults to global `Motion`
 */
import { runProgressTransition, warnMissingLibrary } from './progress-tween.js'

function resolveAnimate (lib) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {}
  const animate = lib ? (lib.animate ?? lib) : (g.Motion?.animate ?? g.motion?.animate)
  return typeof animate === 'function' ? animate : null
}

export function runTransition (spec, onComplete, lib) {
  const animate = resolveAnimate(lib)
  if (!animate) {
    warnMissingLibrary('motion', 'Motion not found. Load it with a <script> tag before using driver: \'motion\', or pass it: driver: motionDriver({ animate }).')
    runProgressTransition(spec, onComplete, ({ onUpdate, onComplete }) => { onUpdate(1); onComplete() })
    return
  }

  runProgressTransition(spec, onComplete, ({ durationMs, nativeEase, onUpdate, onComplete }) => {
    let controls
    try {
      controls = animate(0, 1, {
        duration: durationMs / 1000,
        ease: nativeEase ?? 'linear',
        onUpdate
      })
    } catch (error) {
      console.warn(`Zumly motion driver: animate() failed (${error.message}). Finishing without animation.`) // eslint-disable-line no-console
      onUpdate(1)
      onComplete()
      return
    }
    Promise.resolve(controls).then(() => { onUpdate(1); onComplete() }, () => { onUpdate(1); onComplete() })
    return () => controls?.stop?.()
  })
}

/**
 * Driver bound to Motion's animate (for bundlers, where there is no global).
 * @param {{ animate: function } | function} motion
 */
export function motionDriver (motion) {
  return (spec, onComplete) => runTransition(spec, onComplete, motion)
}
