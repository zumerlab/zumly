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

  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null

  // Set initial state from snapshot so we don't rely on leftover animation state
  currentView.style.transformOrigin = v0.backwardState.origin
  currentView.style.transform = v0.backwardState.transform
  previousView.style.transformOrigin = v1.backwardState.origin
  previousView.style.transform = v1.backwardState.transform
  if (v2) {
    lastView.style.transformOrigin = v2.backwardState.origin
    lastView.style.transform = v2.backwardState.transform
  }

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

  Promise.all(anims.map(a => a.finished)).then(() => {
    anims.forEach(a => a.cancel())
    applyZoomInEndState(currentView, currentStage)
    applyZoomInEndState(previousView, currentStage)
    if (lastView) applyZoomInEndState(lastView, currentStage)
    onComplete()
  }).catch(() => {
    anims.forEach(a => a.cancel())
    onComplete()
  })
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
    // Keep parity with the CSS driver: once the animation finishes,
    // the view should be interactive again when it becomes current later.
    element.classList.remove('has-no-events')
    element.style.transformOrigin = v.origin
    element.style.transform = v.transform
    return
  }
  if (element.classList.contains('is-last-view')) {
    const v = currentStage.views[2].forwardState
    element.classList.remove('has-no-events')
    element.style.transformOrigin = v.origin
    element.style.transform = v.transform
  }
}

function runZoomOutWaapi (currentView, previousView, lastView, currentStage, durationMs, ease, canvas, onComplete) {
  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null
  const to1 = v1.backwardState
  const to2 = v2 ? v2.backwardState : null

  // Only set current view initial state; leave previous/last to the animation so WAAPI has full control
  currentView.style.transformOrigin = v0.forwardState.origin
  currentView.style.transform = v0.forwardState.transform

  let anims
  function startAnims () {
    previousView.style.transformOrigin = v1.forwardState.origin
    if (lastView && v2) lastView.style.transformOrigin = v2.forwardState.origin
    // 2-view case: use computed transform as "from" so animation definitely runs from current position
    const from1 = previousView.style.transform || getComputedStyle(previousView).transform || v1.forwardState.transform
    const from2 = lastView && v2
      ? (lastView.style.transform || getComputedStyle(lastView).transform || v2.forwardState.transform)
      : null
    const animCurrent = currentView.animate(
      [{ transform: v0.forwardState.transform }, { transform: v0.backwardState.transform }],
      { duration: durationMs, easing: ease, fill: 'forwards' }
    )
    anims = [animCurrent]
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
    // So that the animation drives transform, not the inline style (critical for 2-view zoomOut)
    previousView.style.removeProperty('transform')
    if (lastView) lastView.style.removeProperty('transform')
    Promise.all(anims.map(a => a.finished)).then(finishZoomOut).catch(() => { anims.forEach(a => a.cancel()); onComplete() })
  }

  function finishZoomOut () {
    anims.forEach(a => a.cancel())
    try {
      if (canvas) canvas.removeChild(currentView)
    } catch (e) {
      try {
        if (currentView.parentElement) canvas.removeChild(currentView.parentElement)
      } catch (e2) {}
    }
    previousView.classList.remove('has-no-events')
    previousView.style.transformOrigin = '0 0'
    previousView.style.transform = to1.transform
    if (lastView && to2) {
      lastView.style.transformOrigin = to2.origin
      lastView.style.transform = to2.transform
    }
    onComplete()
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(startAnims)
  })
}
