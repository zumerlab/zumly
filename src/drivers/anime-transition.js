/**
 * Anime.js transition driver.
 * Requires global `anime` — load from CDN before use:
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"></script>
 *
 * Interpolates computed transform matrices to keep intermediate coordinates correct
 * when transform-origin varies between states.
 *
 * @param {Object} spec - Transition spec from the engine
 * @param {function} onComplete - MUST be called exactly once when done
 */
import {
  parseDurationMs,
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
  const anime = typeof globalThis !== 'undefined' && globalThis.anime
  if (!anime || typeof anime !== 'function') {
    console.warn('Zumly anime driver: Anime.js not loaded. Add <script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"></script>')
    onComplete()
    return
  }

  const { type, currentView, previousView, lastView, currentStage, duration, ease, canvas } = spec
  if (!currentView || !previousView || !currentStage) {
    onComplete()
    return
  }

  const durationMs = parseDurationMs(duration)

  if (type === 'lateral') {
    runLateralInstant(spec, onComplete)
  } else if (type === 'zoomIn') {
    runZoomIn(anime, currentView, previousView, lastView, currentStage, durationMs, ease, onComplete)
  } else if (type === 'zoomOut') {
    runZoomOut(anime, currentView, previousView, lastView, currentStage, durationMs, ease, canvas, onComplete)
  } else {
    onComplete()
  }
}

// ─── Zoom In ─────────────────────────────────────────────────────────

function runZoomIn (anime, currentView, previousView, lastView, currentStage, durationMs, ease, onComplete) {
  showViews(currentView, previousView, lastView)

  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null

  // Read computed matrices for all views
  const matrices = computeMatrixPairs(
    [
      { el: currentView, backward: v0.backwardState, forward: v0.forwardState },
      { el: previousView, backward: v1.backwardState, forward: v1.forwardState },
      ...(v2 ? [{ el: lastView, backward: v2.backwardState, forward: v2.forwardState }] : []),
    ],
    'forward' // zoom-in: backward → forward
  )

  // Set initial transforms
  applyMatrices(matrices, 0)

  const stagger = currentStage.stagger || 0
  const totalDuration = durationMs + (v2 ? stagger * 2 : stagger)
  const progress = { value: 0 }
  anime({
    targets: progress,
    value: 1,
    duration: totalDuration,
    easing: normalizeEasing(ease),
    update: () => {
      const elapsed = progress.value * totalDuration
      applyStaggeredMatrices(matrices, elapsed, durationMs, stagger)
    },
    complete: () => {
      applyZoomInEndState(currentView, currentStage)
      applyZoomInEndState(previousView, currentStage)
      if (lastView) applyZoomInEndState(lastView, currentStage)
      onComplete()
    }
  })
}

// ─── Zoom Out ────────────────────────────────────────────────────────

function runZoomOut (anime, currentView, previousView, lastView, currentStage, durationMs, ease, canvas, onComplete) {
  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null
  const to1 = v1.backwardState
  const to2 = v2 ? v2.backwardState : null

  // Read computed matrices (zoom-out: forward → backward)
  const matrices = computeMatrixPairs(
    [
      { el: currentView, backward: v0.backwardState, forward: v0.forwardState },
      { el: previousView, backward: v1.backwardState, forward: v1.forwardState },
      ...(v2 ? [{ el: lastView, backward: v2.backwardState, forward: v2.forwardState }] : []),
    ],
    'backward' // zoom-out: forward → backward
  )

  applyMatrices(matrices, 0)

  const stagger = currentStage.stagger || 0
  const totalDuration = durationMs + (v2 ? stagger * 2 : stagger)
  const progress = { value: 0 }
  anime({
    targets: progress,
    value: 1,
    duration: totalDuration,
    easing: normalizeEasing(ease),
    update: () => {
      const elapsed = progress.value * totalDuration
      applyStaggeredMatrices(matrices, elapsed, durationMs, stagger)
    },
    complete: () => {
      removeViewFromCanvas(currentView, canvas)
      applyZoomOutPreviousState(previousView, to1)
      if (lastView && to2) applyZoomOutLastState(lastView, to2)
      onComplete()
    }
  })
}

// ─── Matrix pair computation ─────────────────────────────────────────

/**
 * Compute from/to matrix pairs for a set of views.
 * @param {{ el, backward, forward }[]} views
 * @param {'forward'|'backward'} direction - 'forward' = backward→forward, 'backward' = forward→backward
 * @returns {{ el, from, to }[]}
 */
function computeMatrixPairs (views, direction) {
  return views.map(({ el, backward, forward }) => {
    if (direction === 'forward') {
      const from = readComputedMatrix(el, backward.origin, backward.transform)
      const to = readComputedMatrix(el, backward.origin, forward.transform)
      return { el, from, to }
    } else {
      const from = readComputedMatrix(el, forward.origin, forward.transform)
      const to = readComputedMatrix(el, forward.origin, backward.transform)
      return { el, from, to }
    }
  })
}

function applyMatrices (matrices, t) {
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

// ─── Easing normalization ────────────────────────────────────────────

function normalizeEasing (ease) {
  if (typeof ease !== 'string') return 'easeInOutQuad'
  const s = ease.toLowerCase()
  if (s === 'linear') return 'linear'
  if (s.includes('ease-in-out')) return 'easeInOutQuad'
  if (s.includes('ease-in')) return 'easeInQuad'
  if (s.includes('ease-out')) return 'easeOutQuad'
  return s
}
