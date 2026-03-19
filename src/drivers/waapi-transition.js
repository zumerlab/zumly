/**
 * Web Animations API transition driver.
 * Uses element.animate() — no external dependencies.
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
  createFinishGuard,
  SAFETY_BUFFER_MS,
} from './driver-helpers.js'

// Re-export for tests that import it directly
export { parseDurationMs }

export function runTransition (spec, onComplete) {
  const { type, currentView, previousView, lastView, currentStage, duration, ease, canvas } = spec

  if (!currentView || !previousView || !currentStage) {
    onComplete()
    return
  }

  const durationMs = parseDurationMs(duration)

  if (type === 'lateral') {
    runLateralInstant(spec, onComplete)
    return
  }

  if (type === 'zoomIn') {
    runZoomIn(currentView, previousView, lastView, currentStage, durationMs, ease, onComplete)
    return
  }

  if (type === 'zoomOut') {
    runZoomOut(currentView, previousView, lastView, currentStage, durationMs, ease, canvas, onComplete)
    return
  }

  onComplete()
}

// ─── Zoom In ─────────────────────────────────────────────────────────

function runZoomIn (currentView, previousView, lastView, currentStage, durationMs, ease, onComplete) {
  showViews(currentView, previousView, lastView)

  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null

  // Set initial state from snapshot
  currentView.style.transformOrigin = v0.backwardState.origin
  currentView.style.transform = v0.backwardState.transform
  previousView.style.transformOrigin = v1.backwardState.origin
  previousView.style.transform = v1.backwardState.transform
  if (v2) {
    lastView.style.transformOrigin = v2.backwardState.origin
    lastView.style.transform = v2.backwardState.transform
  }

  // Start WAAPI animations
  const anims = []
  anims.push(currentView.animate(
    [{ transform: v0.backwardState.transform }, { transform: v0.forwardState.transform }],
    { duration: durationMs, easing: ease, fill: 'forwards' }
  ))
  anims.push(previousView.animate(
    [{ transform: v1.backwardState.transform }, { transform: v1.forwardState.transform }],
    { duration: durationMs, easing: ease, fill: 'forwards' }
  ))
  if (v2) {
    anims.push(lastView.animate(
      [{ transform: v2.backwardState.transform }, { transform: v2.forwardState.transform }],
      { duration: durationMs, easing: ease, fill: 'forwards' }
    ))
  }

  const { finish } = createFinishGuard(() => {
    cancelAll(anims)
    try {
      applyZoomInEndState(currentView, currentStage)
      applyZoomInEndState(previousView, currentStage)
      if (lastView) applyZoomInEndState(lastView, currentStage)
    } catch (e) { /* DOM cleanup should not block onComplete */ }
    onComplete()
  }, durationMs + SAFETY_BUFFER_MS)

  Promise.all(anims.map(a => a.finished)).then(finish).catch(finish)
}

// ─── Zoom Out ────────────────────────────────────────────────────────

function runZoomOut (currentView, previousView, lastView, currentStage, durationMs, ease, canvas, onComplete) {
  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null
  const to1 = v1.backwardState
  const to2 = v2 ? v2.backwardState : null

  // Set current view initial state
  currentView.style.transformOrigin = v0.forwardState.origin
  currentView.style.transform = v0.forwardState.transform

  // Defer animation start to ensure computed styles are flushed
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      previousView.style.transformOrigin = v1.forwardState.origin
      if (lastView && v2) lastView.style.transformOrigin = v2.forwardState.origin

      // Use computed transform as "from" so animation runs from actual position
      const from1 = previousView.style.transform || getComputedStyle(previousView).transform || v1.forwardState.transform
      const from2 = lastView && v2
        ? (lastView.style.transform || getComputedStyle(lastView).transform || v2.forwardState.transform)
        : null

      const anims = []
      anims.push(currentView.animate(
        [{ transform: v0.forwardState.transform }, { transform: v0.backwardState.transform }],
        { duration: durationMs, easing: ease, fill: 'forwards' }
      ))
      anims.push(previousView.animate(
        [{ transform: from1 }, { transform: to1.transform }],
        { duration: durationMs, easing: ease, fill: 'forwards' }
      ))
      if (lastView && to2) {
        anims.push(lastView.animate(
          [{ transform: from2 }, { transform: to2.transform }],
          { duration: durationMs, easing: ease, fill: 'forwards' }
        ))
      }

      // Let WAAPI drive transforms — remove inline styles that would conflict
      previousView.style.removeProperty('transform')
      if (lastView) lastView.style.removeProperty('transform')

      const { finish } = createFinishGuard(() => {
        cancelAll(anims)
        try {
          removeViewFromCanvas(currentView, canvas)
          applyZoomOutPreviousState(previousView, to1)
          if (lastView && to2) applyZoomOutLastState(lastView, to2)
        } catch (e) { /* DOM cleanup should not block onComplete */ }
        onComplete()
      }, durationMs + SAFETY_BUFFER_MS)

      Promise.all(anims.map(a => a.finished)).then(finish).catch(finish)
    })
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────

function cancelAll (anims) {
  for (const a of anims) {
    try { a.cancel() } catch (e) { /* already finished or removed */ }
  }
}
