/**
 * Web Animations API transition driver.
 * Uses element.animate() for each view; on finish applies final state and calls onComplete.
 * @param {Object} spec - { type, currentView, previousView, lastView, currentStage, duration, ease, canvas? }
 * @param {function} onComplete
 */
export function runTransition (spec, onComplete) {
  const { type, currentView, previousView, lastView, currentStage, duration, ease, canvas } = spec
  if (!currentView || !previousView || !currentStage) {
    onComplete()
    return
  }

  const durationMs = parseDurationMs(duration)

  if (type === 'zoomIn') {
    runZoomInWaapi(currentView, previousView, lastView, currentStage, durationMs, ease, onComplete)
  } else if (type === 'zoomOut') {
    runZoomOutWaapi(currentView, previousView, lastView, currentStage, durationMs, ease, canvas, onComplete)
  } else {
    onComplete()
  }
}

function parseDurationMs (duration) {
  if (typeof duration === 'number') return duration
  const str = String(duration)
  const num = parseFloat(str)
  if (str.includes('ms')) return num
  if (str.includes('s')) return num * 1000
  return 1000
}

function runZoomInWaapi (currentView, previousView, lastView, currentStage, durationMs, ease, onComplete) {
  currentView.classList.remove('hide')
  currentView.style.contentVisibility = 'auto'
  previousView.style.contentVisibility = 'auto'
  if (lastView) lastView.style.contentVisibility = 'auto'

  const anims = []
  const v0 = currentStage.views[0]
  anims.push(currentView.animate(
    [{ transform: v0.backwardState.transform }, { transform: v0.forwardState.transform }],
    { duration: durationMs, easing: ease, fill: 'forwards' }
  ))
  const v1 = currentStage.views[1]
  anims.push(previousView.animate(
    [{ transform: v1.backwardState.transform }, { transform: v1.forwardState.transform }],
    { duration: durationMs, easing: ease, fill: 'forwards' }
  ))
  if (lastView && currentStage.views[2]) {
    const v2 = currentStage.views[2]
    anims.push(lastView.animate(
      [{ transform: v2.backwardState.transform }, { transform: v2.forwardState.transform }],
      { duration: durationMs, easing: ease, fill: 'forwards' }
    ))
  }

  Promise.all(anims.map(a => a.finished)).then(() => {
    applyZoomInEndState(currentView, currentStage)
    applyZoomInEndState(previousView, currentStage)
    if (lastView) applyZoomInEndState(lastView, currentStage)
    onComplete()
  }).catch(() => onComplete())
}

function applyZoomInEndState (element, currentStage) {
  if (element.classList.contains('is-new-current-view')) {
    const v = currentStage.views[0].forwardState
    element.classList.replace('is-new-current-view', 'is-current-view')
    element.classList.remove('has-no-events')
    element.style.transformOrigin = v.origin
    element.style.transform = v.transform
    return
  }
  if (element.classList.contains('is-previous-view')) {
    const v = currentStage.views[1].forwardState
    element.style.transformOrigin = v.origin
    element.style.transform = v.transform
    return
  }
  if (element.classList.contains('is-last-view')) {
    const v = currentStage.views[2].forwardState
    element.style.transformOrigin = v.origin
    element.style.transform = v.transform
  }
}

function runZoomOutWaapi (currentView, previousView, lastView, currentStage, durationMs, ease, canvas, onComplete) {
  const v1 = currentStage.views[1].backwardState
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2].backwardState : null

  const anims = []
  anims.push(previousView.animate(
    [{ transform: previousView.style.transform || 'none' }, { transform: v1.transform }],
    { duration: durationMs, easing: ease, fill: 'forwards' }
  ))
  if (lastView && v2) {
    anims.push(lastView.animate(
      [{ transform: lastView.style.transform || 'none' }, { transform: v2.transform }],
      { duration: durationMs, easing: ease, fill: 'forwards' }
    ))
  }

  Promise.all(anims.map(a => a.finished)).then(() => {
    try {
      if (canvas) canvas.removeChild(currentView)
    } catch (e) {
      try {
        if (currentView.parentElement) canvas.removeChild(currentView.parentElement)
      } catch (e2) {}
    }
    previousView.style.transformOrigin = '0 0'
    previousView.style.transform = v1.transform
    if (lastView && v2) {
      lastView.style.transformOrigin = v2.origin
      lastView.style.transform = v2.transform
    }
    onComplete()
  }).catch(() => onComplete())
}
