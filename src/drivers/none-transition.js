/**
 * No-animation transition driver.
 * Applies final state immediately and calls onComplete synchronously.
 * Useful for tests, instant UX, or reduced-motion preference.
 *
 * This is the simplest possible Zumly driver — a good starting point
 * for writing your own. See docs/DRIVER_API.md for the full guide.
 *
 * @param {Object} spec - Transition spec from the engine
 * @param {function} onComplete - MUST be called exactly once when done
 */
import {
  showViews,
  applyZoomInEndState,
  applyZoomOutPreviousState,
  applyZoomOutLastState,
  removeViewFromCanvas,
  runLateralInstant,
} from './driver-helpers.js'

export function runTransition (spec, onComplete) {
  const { type, currentView, previousView, lastView, currentStage, canvas } = spec

  if (!currentView || !previousView || !currentStage) {
    onComplete()
    return
  }

  if (type === 'lateral') {
    runLateralInstant(spec, onComplete)
    return
  }

  if (type === 'zoomIn') {
    showViews(currentView, previousView, lastView)
    applyZoomInEndState(currentView, currentStage)
    applyZoomInEndState(previousView, currentStage)
    if (lastView) applyZoomInEndState(lastView, currentStage)
    onComplete()
    return
  }

  if (type === 'zoomOut') {
    removeViewFromCanvas(currentView, canvas)
    showViews(previousView, lastView)
    applyZoomOutPreviousState(previousView, currentStage.views[1].backwardState)
    if (lastView) applyZoomOutLastState(lastView, currentStage.views[2].backwardState)
    onComplete()
    return
  }

  // Unknown type — still must call onComplete
  onComplete()
}
