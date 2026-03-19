/**
 * Web Animations API transition driver.
 * Uses element.animate() for each view; on finish applies final state and calls onComplete.
 * Includes safety timeout so onComplete runs even if finished never settles (e.g. element removed).
 * Rejected finished promises are handled: animations are cancelled, final state applied where safe, onComplete called.
 *
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

/** Safety buffer beyond parsed duration when finished may never settle. */
const SAFETY_BUFFER_MS = 150

/**
 * Parse duration to milliseconds. Supports "1s", "500ms", numeric, and invalid fallback.
 * @param {string|number} duration
 * @returns {number}
 */
export function parseDurationMs (duration) {
  if (typeof duration === 'number' && !Number.isNaN(duration)) return Math.max(0, duration)
  const str = String(duration)
  const m = str.match(/^(\d+(?:\.\d+)?)\s*(ms|s)?$/i)
  if (!m) return 500
  const val = parseFloat(m[1])
  const unit = (m[2] || 's').toLowerCase()
  return unit === 'ms' ? Math.max(0, val) : Math.max(0, val * 1000)
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

  let completed = false

  function finish () {
    if (completed) return
    completed = true
    clearTimeout(safetyTimer)
    anims.forEach(a => {
      try { a.cancel() } catch (e) { /* ignore */ }
    })
    try {
      applyZoomInEndState(currentView, currentStage)
      applyZoomInEndState(previousView, currentStage)
      if (lastView) applyZoomInEndState(lastView, currentStage)
    } catch (e) {
      /* ensure DOM cleanup doesn't block onComplete */
    }
    onComplete()
  }

  const safetyTimer = setTimeout(finish, durationMs + SAFETY_BUFFER_MS)

  Promise.all(anims.map(a => a.finished))
    .then(finish)
    .catch(() => {
      finish()
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

    let completed = false

    function finishZoomOut () {
      if (completed) return
      completed = true
      clearTimeout(safetyTimer)
      anims.forEach(a => {
        try { a.cancel() } catch (e) { /* ignore */ }
      })
      try {
        if (canvas) canvas.removeChild(currentView)
      } catch (e) {
        try {
          if (currentView.parentElement) canvas.removeChild(currentView.parentElement)
        } catch (e2) {}
      }
      try {
        previousView.classList.remove('has-no-events')
        previousView.style.transformOrigin = '0 0'
        previousView.style.transform = to1.transform
        if (lastView && to2) {
          lastView.style.transformOrigin = to2.origin
          lastView.style.transform = to2.transform
        }
      } catch (e) {
        /* ensure DOM cleanup doesn't block onComplete */
      }
      onComplete()
    }

    const safetyTimer = setTimeout(finishZoomOut, durationMs + SAFETY_BUFFER_MS)

    Promise.all(anims.map(a => a.finished))
      .then(finishZoomOut)
      .catch(() => {
        finishZoomOut()
      })
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(startAnims)
  })
}
