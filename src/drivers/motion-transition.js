/**
 * Motion (motion.dev) transition driver.
 * Interpolates computed transform matrices during animation.
 * Load Motion before use:
 * <script src="https://cdn.jsdelivr.net/npm/motion@11/dist/motion.min.js"></script>
 *
 * @param {Object} spec - Transition spec from the engine
 * @param {function} onComplete - MUST be called exactly once when done
 */
import {
  parseDurationSec,
  showViews,
  applyZoomInEndState,
  applyZoomOutPreviousState,
  applyZoomOutLastState,
  removeViewFromCanvas,
  runLateralInstant,
  readComputedMatrix,
  interpolateMatrix,
  matrixToString,
} from './driver-helpers.js'

export function runTransition (spec, onComplete) {
  const animate = getMotionAnimate()
  if (!animate || typeof animate !== 'function') {
    console.warn('Zumly Motion driver: Motion not loaded. Add <script src="https://cdn.jsdelivr.net/npm/motion@11/dist/motion.min.js"></script>')
    onComplete()
    return
  }

  const { type, currentView, previousView, lastView, currentStage, duration, ease, canvas } = spec
  if (!currentView || !previousView || !currentStage) {
    onComplete()
    return
  }

  const durationSec = parseDurationSec(duration)

  if (type === 'lateral') {
    runLateralInstant(spec, onComplete)
  } else if (type === 'zoomIn') {
    runZoomIn(animate, currentView, previousView, lastView, currentStage, durationSec, ease, onComplete)
  } else if (type === 'zoomOut') {
    runZoomOut(animate, currentView, previousView, lastView, currentStage, durationSec, ease, canvas, onComplete)
  } else {
    onComplete()
  }
}

// ─── Zoom In ─────────────────────────────────────────────────────────

function runZoomIn (animate, currentView, previousView, lastView, currentStage, durationSec, ease, onComplete) {
  showViews(currentView, previousView, lastView)

  const matrices = computeMatrixPairs(
    currentView, previousView, lastView, currentStage, 'forward'
  )
  applyMatricesAtProgress(matrices, 0)

  const stagger = currentStage.stagger || 0
  const staggerSec = stagger / 1000
  const durationMs = durationSec * 1000
  const totalSec = durationSec + (matrices.length > 2 ? staggerSec * 2 : staggerSec)

  const controls = animate(0, 1, {
    duration: totalSec,
    ease: normalizeEasing(ease),
    onUpdate: t => {
      const elapsed = t * totalSec * 1000
      applyStaggeredMatrices(matrices, elapsed, durationMs, stagger)
    },
  })

  controls.then(() => {
    applyZoomInEndState(currentView, currentStage)
    applyZoomInEndState(previousView, currentStage)
    if (lastView) applyZoomInEndState(lastView, currentStage)
    onComplete()
  }).catch(() => onComplete())
}

// ─── Zoom Out ────────────────────────────────────────────────────────

function runZoomOut (animate, currentView, previousView, lastView, currentStage, durationSec, ease, canvas, onComplete) {
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null
  const to1 = v1.backwardState
  const to2 = v2 ? v2.backwardState : null

  const matrices = computeMatrixPairs(
    currentView, previousView, lastView, currentStage, 'backward'
  )
  applyMatricesAtProgress(matrices, 0)

  const stagger = currentStage.stagger || 0
  const staggerSec = stagger / 1000
  const durationMs = durationSec * 1000
  const totalSec = durationSec + (matrices.length > 2 ? staggerSec * 2 : staggerSec)

  const controls = animate(0, 1, {
    duration: totalSec,
    ease: normalizeEasing(ease),
    onUpdate: t => {
      const elapsed = t * totalSec * 1000
      applyStaggeredMatrices(matrices, elapsed, durationMs, stagger)
    },
  })

  controls.then(() => {
    removeViewFromCanvas(currentView, canvas)
    applyZoomOutPreviousState(previousView, to1)
    if (lastView && to2) applyZoomOutLastState(lastView, to2)
    onComplete()
  }).catch(() => onComplete())
}

// ─── Matrix computation ──────────────────────────────────────────────

function computeMatrixPairs (currentView, previousView, lastView, currentStage, direction) {
  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null

  const entries = [
    { el: currentView, backward: v0.backwardState, forward: v0.forwardState },
    { el: previousView, backward: v1.backwardState, forward: v1.forwardState },
  ]
  if (v2) entries.push({ el: lastView, backward: v2.backwardState, forward: v2.forwardState })

  return entries.map(({ el, backward, forward }) => {
    if (direction === 'forward') {
      return {
        el,
        from: readComputedMatrix(el, backward.origin, backward.transform),
        to: readComputedMatrix(el, backward.origin, forward.transform),
      }
    } else {
      return {
        el,
        from: readComputedMatrix(el, forward.origin, forward.transform),
        to: readComputedMatrix(el, forward.origin, backward.transform),
      }
    }
  })
}

function applyMatricesAtProgress (matrices, t) {
  for (const { el, from, to } of matrices) {
    el.style.transform = matrixToString(interpolateMatrix(from, to, t))
  }
}

function applyStaggeredMatrices (matrices, elapsed, durationMs, stagger) {
  for (let i = 0; i < matrices.length; i++) {
    const { el, from, to } = matrices[i]
    const delay = i * stagger
    const localElapsed = Math.max(0, elapsed - delay)
    const t = durationMs > 0 ? Math.min(1, localElapsed / durationMs) : 1
    el.style.transform = matrixToString(interpolateMatrix(from, to, t))
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getMotionAnimate () {
  const g = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : {}
  return g.motion?.animate || g.Motion?.animate || g.animate
}

function normalizeEasing (ease) {
  if (typeof ease !== 'string') return 'easeInOut'
  const s = ease.toLowerCase()
  if (s === 'linear') return 'linear'
  if (s.includes('ease-in-out')) return 'easeInOut'
  if (s.includes('ease-in')) return 'easeIn'
  if (s.includes('ease-out')) return 'easeOut'
  return ease
}
