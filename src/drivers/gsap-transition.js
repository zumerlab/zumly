/**
 * GSAP transition driver.
 * Uses the global `gsap` (GreenSock) if available. Load GSAP before using this driver.
 * @param {Object} spec - { type, currentView, previousView, lastView, currentStage, duration, ease, canvas? }
 * @param {function} onComplete
 */
export function runTransition (spec, onComplete) {
  const gsap = typeof globalThis !== 'undefined' && globalThis.gsap
  if (!gsap || typeof gsap.to !== 'function') {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Zumly GSAP driver: GSAP not loaded. Add <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>')
    }
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
    runLateralFallback(spec, onComplete)
  } else if (type === 'zoomIn') {
    runZoomInGsap(gsap, currentView, previousView, lastView, currentStage, durationSec, ease, onComplete)
  } else if (type === 'zoomOut') {
    runZoomOutGsap(gsap, currentView, previousView, lastView, currentStage, durationSec, ease, canvas, onComplete)
  } else {
    onComplete()
  }
}

function runLateralFallback (spec, onComplete) {
  const { currentView: incomingView, previousView: outgoingView, backView, backViewState, lastView, lastViewState, incomingTransformEnd, currentStage, canvas } = spec
  incomingView.classList.remove('hide')
  incomingView.style.contentVisibility = 'auto'
  const v0 = currentStage.views[0]
  incomingView.classList.replace('is-new-current-view', 'is-current-view')
  incomingView.classList.remove('zoom-current-view', 'has-no-events')
  incomingView.style.transformOrigin = v0.forwardState.origin
  incomingView.style.transform = incomingTransformEnd || v0.forwardState.transform
  if (backView && backViewState) backView.style.transform = backViewState.transformEnd
  if (lastView && lastViewState) lastView.style.transform = lastViewState.transformEnd
  try {
    if (canvas) canvas.removeChild(outgoingView)
  } catch (e) {
    try {
      if (outgoingView.parentElement) canvas.removeChild(outgoingView.parentElement)
    } catch (e2) { /* ignore */ }
  }
  onComplete()
}

function parseDurationSec (duration) {
  if (typeof duration === 'number') return duration / 1000
  const str = String(duration)
  const num = parseFloat(str)
  if (str.includes('ms')) return num / 1000
  if (str.includes('s')) return num
  return 1
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

function runZoomInGsap (gsap, currentView, previousView, lastView, currentStage, durationSec, ease, onComplete) {
  currentView.classList.remove('hide')
  currentView.style.contentVisibility = 'auto'
  previousView.style.contentVisibility = 'auto'
  if (lastView) lastView.style.contentVisibility = 'auto'

  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null

  currentView.style.transformOrigin = v0.backwardState.origin
  currentView.style.transform = v0.backwardState.transform
  previousView.style.transformOrigin = v1.backwardState.origin
  previousView.style.transform = v1.backwardState.transform
  if (v2) {
    lastView.style.transformOrigin = v2.backwardState.origin
    lastView.style.transform = v2.backwardState.transform
  }

  const tl = gsap.timeline({ onComplete: () => {
    applyZoomInEndState(currentView, currentStage)
    applyZoomInEndState(previousView, currentStage)
    if (lastView) applyZoomInEndState(lastView, currentStage)
    onComplete()
  } })

  tl.to(currentView, {
    transform: v0.forwardState.transform,
    duration: durationSec,
    ease: normalizeEasing(ease)
  }, 0)
  tl.to(previousView, {
    transform: v1.forwardState.transform,
    duration: durationSec,
    ease: normalizeEasing(ease)
  }, 0)
  if (v2) {
    tl.to(lastView, {
      transform: v2.forwardState.transform,
      duration: durationSec,
      ease: normalizeEasing(ease)
    }, 0)
  }
}

function runZoomOutGsap (gsap, currentView, previousView, lastView, currentStage, durationSec, ease, canvas, onComplete) {
  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null
  const to1 = v1.backwardState
  const to2 = v2 ? v2.backwardState : null

  currentView.style.transformOrigin = v0.forwardState.origin
  currentView.style.transform = v0.forwardState.transform
  const from1 = previousView.style.transform || getComputedStyle(previousView).transform || v1.forwardState.transform
  const from2 = lastView && v2
    ? (lastView.style.transform || getComputedStyle(lastView).transform || v2.forwardState.transform)
    : null

  previousView.style.transformOrigin = v1.forwardState.origin
  if (lastView && v2) lastView.style.transformOrigin = v2.forwardState.origin

  const tl = gsap.timeline({
    onComplete: () => {
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
  })

  tl.fromTo(currentView,
    { transform: v0.forwardState.transform },
    { transform: v0.backwardState.transform, duration: durationSec, ease: normalizeEasing(ease) },
    0
  )
  tl.fromTo(previousView,
    { transform: from1 },
    { transform: to1.transform, duration: durationSec, ease: normalizeEasing(ease) },
    0
  )
  previousView.style.removeProperty('transform')
  if (lastView && to2) {
    tl.fromTo(lastView,
      { transform: from2 },
      { transform: to2.transform, duration: durationSec, ease: normalizeEasing(ease) },
      0
    )
    lastView.style.removeProperty('transform')
  }
}

function normalizeEasing (ease) {
  if (typeof ease !== 'string') return 'power2.inOut'
  const s = ease.toLowerCase()
  if (s === 'linear') return 'none'
  if (s.includes('ease-in-out')) return 'power2.inOut'
  if (s.includes('ease-in')) return 'power2.in'
  if (s.includes('ease-out')) return 'power2.out'
  return s
}
