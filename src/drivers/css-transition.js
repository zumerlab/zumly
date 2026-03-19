/**
 * CSS-based transition driver.
 * Uses CSS variables and keyframe classes; completes via animationend.
 * Includes a safety timeout so onComplete() runs even if animationend is missed
 * (e.g. element removed, duration 0, browser quirks). Listeners are always cleaned up.
 *
 * @param {Object} spec - { type: 'zoomIn'|'zoomOut', currentView, previousView, lastView, currentStage, duration, ease, canvas? }
 * @param {function} onComplete - called when all animations have finished and cleanup is done
 */
export function runTransition (spec, onComplete) {
  const { type, currentView, previousView, lastView, currentStage, duration, ease, canvas } = spec
  if (!currentView || !previousView || !currentStage) {
    onComplete()
    return
  }

  if (type === 'zoomIn') {
    runZoomIn(currentView, previousView, lastView, currentStage, duration, ease, onComplete)
  } else if (type === 'zoomOut') {
    runZoomOut(currentView, previousView, lastView, currentStage, duration, ease, canvas, onComplete)
  } else {
    onComplete()
  }
}

/** Parse duration string (e.g. "1s", "500ms") to milliseconds. */
function parseDurationMs (duration) {
  if (typeof duration !== 'string') return 500
  const m = duration.match(/^(\d+(?:\.\d+)?)(ms|s)?$/i)
  if (!m) return 500
  const val = parseFloat(m[1])
  const unit = (m[2] || 's').toLowerCase()
  return unit === 'ms' ? val : val * 1000
}

/** Safety buffer beyond parsed duration to avoid racing animationend. */
const SAFETY_BUFFER_MS = 150

function runZoomIn (currentView, previousView, lastView, currentStage, duration, ease, onComplete) {
  currentView.classList.remove('hide')
  currentView.style.setProperty('--zoom-duration', duration)
  currentView.style.setProperty('--zoom-ease', ease)
  currentView.style.setProperty('--current-view-transform-start', currentStage.views[0].backwardState.transform)
  currentView.style.setProperty('--current-view-transform-end', currentStage.views[0].forwardState.transform)

  previousView.style.setProperty('--zoom-duration', duration)
  previousView.style.setProperty('--zoom-ease', ease)
  previousView.style.setProperty('--previous-view-transform-start', currentStage.views[1].backwardState.transform)
  previousView.style.setProperty('--previous-view-transform-end', currentStage.views[1].forwardState.transform)

  if (lastView) {
    lastView.style.setProperty('--zoom-duration', duration)
    lastView.style.setProperty('--zoom-ease', ease)
    lastView.style.setProperty('--last-view-transform-start', currentStage.views[2].backwardState.transform)
    lastView.style.setProperty('--last-view-transform-end', currentStage.views[2].forwardState.transform)
  }

  currentView.style.contentVisibility = 'auto'
  previousView.style.contentVisibility = 'auto'
  if (lastView) lastView.style.contentVisibility = 'auto'

  currentView.classList.add('zoom-current-view')
  previousView.classList.add('zoom-previous-view')
  if (lastView) lastView.classList.add('zoom-last-view')

  const elements = lastView ? [currentView, previousView, lastView] : [currentView, previousView]
  let pending = elements.length
  let completed = false

  function finish () {
    if (completed) return
    completed = true
    clearTimeout(safetyTimer)
    elements.forEach(el => {
      if (el && typeof el.removeEventListener === 'function') {
        el.removeEventListener('animationend', handleEnd)
      }
    })
    onComplete()
  }

  function handleEnd (event) {
    const el = event && event.target
    if (el && typeof el.removeEventListener === 'function') {
      el.removeEventListener('animationend', handleEnd)
    }
    if (el && el.isConnected) {
      try {
        applyZoomInEndState(el, currentStage)
      } catch (e) {
        // Ignore cleanup errors on partially detached DOM
      }
    }
    pending--
    if (pending <= 0) finish()
  }

  elements.forEach(el => {
    if (el && typeof el.addEventListener === 'function') {
      el.addEventListener('animationend', handleEnd)
    }
  })

  const durationMs = parseDurationMs(duration)
  const safetyTimer = setTimeout(finish, durationMs + SAFETY_BUFFER_MS)
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

function runZoomOut (currentView, previousView, lastView, currentStage, duration, ease, canvas, onComplete) {
  currentView.classList.add('zoom-current-view-reverse')
  previousView.classList.add('zoom-previous-view-reverse')
  if (lastView) lastView.classList.add('zoom-last-view-reverse')

  currentView.style.setProperty('--zoom-duration', duration)
  currentView.style.setProperty('--zoom-ease', ease)
  previousView.style.setProperty('--zoom-duration', duration)
  previousView.style.setProperty('--zoom-ease', ease)
  if (lastView) lastView.style.setProperty('--zoom-duration', duration)

  const elements = lastView ? [currentView, previousView, lastView] : [currentView, previousView]
  let pending = elements.length
  let completed = false

  function finish () {
    if (completed) return
    completed = true
    clearTimeout(safetyTimer)
    elements.forEach(el => {
      if (el && typeof el.removeEventListener === 'function') {
        el.removeEventListener('animationend', handleEnd)
      }
    })
    onComplete()
  }

  function handleEnd (event) {
    const el = event && event.target
    if (el && typeof el.removeEventListener === 'function') {
      el.removeEventListener('animationend', handleEnd)
    }
    if (el && el.isConnected) {
      try {
        applyZoomOutEndState(el, currentStage, canvas)
      } catch (e) {
        // Ignore cleanup errors on partially detached DOM
      }
    }
    pending--
    if (pending <= 0) finish()
  }

  elements.forEach(el => {
    if (el && typeof el.addEventListener === 'function') {
      el.addEventListener('animationend', handleEnd)
    }
  })

  const durationMs = parseDurationMs(duration)
  const safetyTimer = setTimeout(finish, durationMs + SAFETY_BUFFER_MS)
}

function applyZoomOutEndState (element, currentZoomLevel, canvas) {
  if (element.classList.contains('zoom-current-view-reverse')) {
    try {
      if (canvas) canvas.removeChild(element)
    } catch (e) {
      try {
        if (element.parentElement) canvas.removeChild(element.parentElement)
      } catch (e2) {
        // ignore
      }
    }
    return
  }
  if (element.classList.contains('zoom-previous-view-reverse')) {
    const v = currentZoomLevel.views[1].backwardState
    element.classList.remove('zoom-previous-view-reverse')
    element.style.transformOrigin = '0 0'
    element.style.transform = v.transform
    return
  }
  if (element.classList.contains('zoom-last-view-reverse')) {
    const v = currentZoomLevel.views[2].backwardState
    element.classList.remove('zoom-last-view-reverse')
    element.style.transformOrigin = v.origin
    element.style.transform = v.transform
  }
}
