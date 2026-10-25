/**
 * Shared core for drivers that animate a single 0 → 1 progress value with a
 * library (Anime.js, Motion) and paint interpolated matrices for each layer.
 *
 * Reading the engine's matrices once keeps intermediate frames correct when
 * transform-origin differs between states. Easing is applied per layer, so a
 * stagger delays each layer without distorting its curve.
 */
import {
  showViews,
  applyZoomInEndState,
  applyZoomOutPreviousState,
  applyZoomOutLastState,
  removeViewFromCanvas,
  runLateralInstant,
  interpolateMatrix,
  matrixToString,
  parseDurationMs,
  createFinishGuard,
  SAFETY_BUFFER_MS
} from './driver-helpers.js'
import { readTransitionMatrix } from './transform-matrix.js'
import { cssEasing } from './easing.js'

const warned = new Set()

/** Warn once per page about a missing library, instead of on every navigation. */
export function warnMissingLibrary (name, message) {
  if (warned.has(name)) return
  warned.add(name)
  console.warn(`Zumly ${name} driver: ${message} Navigation continues without animation.`) // eslint-disable-line no-console
}

function layers (spec) {
  const { currentView, previousView, lastView, currentStage } = spec
  const [v0, v1, v2] = currentStage.views
  const entries = [
    { el: currentView, state: v0 },
    { el: previousView, state: v1 }
  ]
  if (lastView && v2) entries.push({ el: lastView, state: v2 })
  return entries
}

function matrixPairs (entries, direction) {
  return entries.map(({ el, state }) => {
    const { backwardState: backward, forwardState: forward } = state
    return direction === 'forward'
      ? { el, from: readTransitionMatrix(el, backward.origin, backward.transform), to: readTransitionMatrix(el, backward.origin, forward.transform) }
      : { el, from: readTransitionMatrix(el, forward.origin, forward.transform), to: readTransitionMatrix(el, forward.origin, backward.transform) }
  })
}

function paint (pairs, elapsedMs, durationMs, stagger, curve) {
  for (let i = 0; i < pairs.length; i++) {
    const { el, from, to } = pairs[i]
    const local = Math.max(0, elapsedMs - i * stagger)
    const linear = durationMs > 0 ? Math.min(1, local / durationMs) : 1
    el.style.transform = matrixToString(interpolateMatrix(from, to, curve ? curve(linear) : linear))
  }
}

/**
 * Run a zoom transition with `tween(options)`, which must animate progress
 * from 0 to 1 over `durationMs`, call `onUpdate(progress)` per frame and
 * `onComplete()` once. It may return a function that stops the library's
 * animation.
 *
 * Libraries animate on requestAnimationFrame, which stops in hidden tabs. A
 * deadline (duration + buffer, counted from the first painted frame) finishes
 * the transition anyway; late library callbacks are then ignored, so they can
 * never paint over a later navigation.
 *
 * `ease` is CSS syntax → the library tweens linearly and Zumly applies the CSS
 * curve to each layer. Anything else is a library ease name and is passed to
 * the library as `nativeEase`.
 *
 * @param {object} spec
 * @param {() => void} onComplete
 * @param {(options: { durationMs: number, nativeEase: string|null, onUpdate: (p: number) => void, onComplete: () => void }) => void} tween
 */
export function runProgressTransition (spec, onComplete, tween) {
  const { type, currentView, previousView, lastView, currentStage, duration, ease, canvas } = spec
  if (!currentView || !previousView || !currentStage) {
    onComplete()
    return
  }
  if (type === 'lateral') {
    runLateralInstant(spec, onComplete)
    return
  }
  if (type !== 'zoomIn' && type !== 'zoomOut') {
    onComplete()
    return
  }

  const durationMs = parseDurationMs(duration)
  const entries = layers(spec)
  if (type === 'zoomIn') showViews(currentView, previousView, lastView)
  const pairs = matrixPairs(entries, type === 'zoomIn' ? 'forward' : 'backward')
  const stagger = currentStage.stagger || 0
  const totalMs = durationMs + stagger * (pairs.length - 1)
  const curve = cssEasing(ease)
  paint(pairs, 0, durationMs, stagger, curve)

  let stop = null
  let started = false
  let finished = false
  // Runs once, from the library's completion or from the deadline.
  const guard = createFinishGuard(() => {
    finished = true
    try { stop?.() } catch {}
    if (type === 'zoomIn') {
      for (const { el } of entries) applyZoomInEndState(el, currentStage)
    } else {
      const [, v1, v2] = currentStage.views
      removeViewFromCanvas(currentView, canvas)
      applyZoomOutPreviousState(previousView, v1.backwardState)
      if (lastView && v2) applyZoomOutLastState(lastView, v2.backwardState)
    }
    onComplete()
  }, totalMs + SAFETY_BUFFER_MS)

  const result = tween({
    durationMs: totalMs,
    nativeEase: curve ? null : ease,
    // With a library ease, its eased progress is spread linearly across layers.
    onUpdate: progress => {
      if (finished) return
      if (!started) {
        // Count the deadline from the first frame: heavy views can delay it.
        started = true
        guard.extend(totalMs + SAFETY_BUFFER_MS)
      }
      paint(pairs, progress * totalMs, durationMs, stagger, curve)
    },
    onComplete: () => guard.finish()
  })
  if (typeof result === 'function') {
    if (finished) result()
    else stop = result
  }
}
