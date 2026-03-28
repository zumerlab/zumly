/**
 * GSAP transition driver.
 * Requires global `gsap` — load from CDN before use:
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
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
} from './driver-helpers.js'

export function runTransition (spec, onComplete) {
  const gsap = typeof globalThis !== 'undefined' && globalThis.gsap
  if (!gsap || typeof gsap.to !== 'function') {
    console.warn('Zumly GSAP driver: GSAP not loaded. Add <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>')
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
    runZoomIn(gsap, currentView, previousView, lastView, currentStage, durationSec, ease, onComplete)
  } else if (type === 'zoomOut') {
    runZoomOut(gsap, currentView, previousView, lastView, currentStage, durationSec, ease, canvas, onComplete)
  } else {
    onComplete()
  }
}

// ─── Zoom In ─────────────────────────────────────────────────────────

function runZoomIn (gsap, currentView, previousView, lastView, currentStage, durationSec, ease, onComplete) {
  showViews(currentView, previousView, lastView)

  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null

  // Set initial transforms
  setTransform(currentView, v0.backwardState)
  setTransform(previousView, v1.backwardState)
  if (v2) setTransform(lastView, v2.backwardState)

  const tl = gsap.timeline({
    onComplete: () => {
      applyZoomInEndState(currentView, currentStage)
      applyZoomInEndState(previousView, currentStage)
      if (lastView) applyZoomInEndState(lastView, currentStage)
      onComplete()
    }
  })

  const gsapEase = normalizeEasing(ease)
  const staggerSec = (currentStage.stagger || 0) / 1000
  tl.to(currentView, { transform: v0.forwardState.transform, duration: durationSec, ease: gsapEase }, 0)
  tl.to(previousView, { transform: v1.forwardState.transform, duration: durationSec, ease: gsapEase }, staggerSec)
  if (v2) {
    tl.to(lastView, { transform: v2.forwardState.transform, duration: durationSec, ease: gsapEase }, staggerSec * 2)
  }
}

// ─── Zoom Out ────────────────────────────────────────────────────────

function runZoomOut (gsap, currentView, previousView, lastView, currentStage, durationSec, ease, canvas, onComplete) {
  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null
  const to1 = v1.backwardState
  const to2 = v2 ? v2.backwardState : null

  setTransform(currentView, v0.forwardState)

  const from1 = previousView.style.transform || getComputedStyle(previousView).transform || v1.forwardState.transform
  const from2 = lastView && v2
    ? (lastView.style.transform || getComputedStyle(lastView).transform || v2.forwardState.transform)
    : null

  previousView.style.transformOrigin = v1.forwardState.origin
  if (lastView && v2) lastView.style.transformOrigin = v2.forwardState.origin

  const gsapEase = normalizeEasing(ease)

  const tl = gsap.timeline({
    onComplete: () => {
      removeViewFromCanvas(currentView, canvas)
      applyZoomOutPreviousState(previousView, to1)
      if (lastView && to2) applyZoomOutLastState(lastView, to2)
      onComplete()
    }
  })

  const staggerSec = (currentStage.stagger || 0) / 1000

  // Set initial transforms so views hold position during stagger delay
  gsap.set(previousView, { transform: from1 })
  if (lastView && from2) gsap.set(lastView, { transform: from2 })

  tl.fromTo(currentView,
    { transform: v0.forwardState.transform },
    { transform: v0.backwardState.transform, duration: durationSec, ease: gsapEase },
    0
  )
  tl.fromTo(previousView,
    { transform: from1 },
    { transform: to1.transform, duration: durationSec, ease: gsapEase },
    staggerSec
  )

  if (lastView && to2) {
    tl.fromTo(lastView,
      { transform: from2 },
      { transform: to2.transform, duration: durationSec, ease: gsapEase },
      staggerSec * 2
    )
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function setTransform (el, state) {
  el.style.transformOrigin = state.origin
  el.style.transform = state.transform
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
