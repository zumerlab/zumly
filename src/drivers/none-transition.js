/**
 * No-animation transition driver.
 * Applies final state immediately and calls onComplete synchronously.
 * Useful for tests or instant UX.
 * @param {Object} spec - { type, currentView, previousView, lastView, currentStage, canvas? }
 * @param {function} onComplete
 */
export function runTransition (spec, onComplete) {
  const { type, currentView, previousView, lastView, currentStage, canvas } = spec
  if (!currentView || !previousView || !currentStage) {
    onComplete()
    return
  }

  if (type === 'zoomIn') {
    applyZoomInEndState(currentView, currentStage)
    applyZoomInEndState(previousView, currentStage)
    if (lastView) applyZoomInEndState(lastView, currentStage)
  } else if (type === 'zoomOut') {
    removeCurrentView(currentView, canvas)
    applyZoomOutPreviousState(previousView, currentStage.views[1].backwardState)
    if (lastView) applyZoomOutLastState(lastView, currentStage.views[2].backwardState)
  }

  onComplete()
}

function applyZoomInEndState (element, currentStage) {
  if (element.classList.contains('is-new-current-view')) {
    const v = currentStage.views[0].forwardState
    element.classList.replace('is-new-current-view', 'is-current-view')
    element.classList.remove('zoom-current-view', 'has-no-events')
    element.style.transformOrigin = v.origin
    element.style.transform = v.transform
    return
  }
  if (element.classList.contains('is-previous-view')) {
    const v = currentStage.views[1].forwardState
    element.classList.remove('zoom-previous-view')
    element.style.transformOrigin = v.origin
    element.style.transform = v.transform
    return
  }
  if (element.classList.contains('is-last-view')) {
    const v = currentStage.views[2].forwardState
    element.classList.remove('zoom-last-view')
    element.style.transformOrigin = v.origin
    element.style.transform = v.transform
  }
}

function removeCurrentView (element, canvas) {
  try {
    if (canvas) canvas.removeChild(element)
  } catch (e) {
    try {
      if (element.parentElement) canvas.removeChild(element.parentElement)
    } catch (e2) {
      // ignore
    }
  }
}

function applyZoomOutPreviousState (element, backwardState) {
  element.classList.remove('zoom-previous-view-reverse')
  element.style.transformOrigin = '0 0'
  element.style.transform = backwardState.transform
}

function applyZoomOutLastState (element, backwardState) {
  element.classList.remove('zoom-last-view-reverse')
  element.style.transformOrigin = backwardState.origin
  element.style.transform = backwardState.transform
}
