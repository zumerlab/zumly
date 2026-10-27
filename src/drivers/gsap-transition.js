/**
 * GSAP transition driver.
 *
 * Script tag: load GSAP before Zumly and use `driver: 'gsap'` (global `gsap`).
 *   <script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
 * Bundler: pass the library — `driver: gsapDriver(gsap)` with `import { gsap } from 'gsap'`.
 *
 * CSS easing strings follow the same curve as the CSS driver; other strings
 * are GSAP ease names ('power3.inOut', 'expo.out').
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
  createFinishGuard,
  SAFETY_BUFFER_MS,
} from './driver-helpers.js'
import { cssEasing } from './easing.js'
import { runProgressTransition, warnMissingLibrary } from './progress-tween.js'

export function runTransition (spec, onComplete, lib) {
  const gsap = lib ?? (typeof globalThis !== 'undefined' && globalThis.gsap)
  if (!gsap || typeof gsap.timeline !== 'function') {
    warnMissingLibrary('gsap', 'GSAP not found. Load it with a <script> tag before using driver: \'gsap\', or pass it: driver: gsapDriver(gsap).')
    runProgressTransition(spec, onComplete, ({ onUpdate, onComplete }) => { onUpdate(1); onComplete() })
    return
  }

  const { type, currentView, previousView, lastView, currentStage, duration, ease, canvas } = spec
  if (!currentView || !previousView || !currentStage) {
    onComplete()
    return
  }

  const durationSec = parseDurationSec(duration)

  if (type === 'lateral') {
    runLateral(gsap, spec, durationSec, ease, onComplete)
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

  const staggerSec = (currentStage.stagger || 0) / 1000
  const tl = guardedTimeline(gsap, (durationSec + staggerSec * (v2 ? 2 : 1)) * 1000, () => {
    applyZoomInEndState(currentView, currentStage)
    applyZoomInEndState(previousView, currentStage)
    if (lastView) applyZoomInEndState(lastView, currentStage)
    onComplete()
  })

  const gsapEase = normalizeEasing(ease)
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

  const staggerSec = (currentStage.stagger || 0) / 1000
  const tl = guardedTimeline(gsap, (durationSec + staggerSec * (lastView && to2 ? 2 : 1)) * 1000, () => {
    removeViewFromCanvas(currentView, canvas)
    applyZoomOutPreviousState(previousView, to1)
    if (lastView && to2) applyZoomOutLastState(lastView, to2)
    onComplete()
  })

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

// ─── Lateral ─────────────────────────────────────────────────────────

/** Slide between siblings with the same transforms as the css and waapi drivers. */
function runLateral (gsap, spec, durationSec, ease, onComplete) {
  const {
    currentView: incoming, previousView: outgoing, backView, backViewState, lastView, lastViewState,
    incomingTransformStart, incomingTransformEnd, outgoingTransform, outgoingTransformEnd, currentStage, canvas
  } = spec
  const v0 = currentStage.views[0]
  const incomingEnd = incomingTransformEnd || v0.forwardState.transform

  showViews(incoming)
  incoming.classList.replace('is-new-current-view', 'is-current-view')
  incoming.classList.remove('zoom-current-view', 'has-no-events')
  incoming.style.transformOrigin = v0.forwardState.origin

  const tl = guardedTimeline(gsap, durationSec * 1000, () => {
    incoming.style.transform = incomingEnd
    incoming.style.removeProperty('opacity')
    if (backView && backViewState) backView.style.transform = backViewState.transformEnd
    if (lastView && lastViewState) lastView.style.transform = lastViewState.transformEnd
    if (spec.keepAlive) {
      outgoing.style.opacity = ''
      if (spec.keepAlive !== 'visible') outgoing.style.transform = outgoingTransformEnd
    } else {
      removeViewFromCanvas(outgoing, canvas)
    }
    onComplete()
  })

  const gsapEase = normalizeEasing(ease)
  const vars = to => ({ ...to, duration: durationSec, ease: gsapEase })
  tl.fromTo(incoming, { transform: incomingTransformStart, opacity: 0 }, vars({ transform: incomingEnd, opacity: 1 }), 0)
  if (spec.keepAlive !== 'visible') {
    tl.fromTo(outgoing, { transform: outgoingTransform, opacity: 1 }, vars({ transform: outgoingTransformEnd, opacity: 0 }), 0)
  }
  if (backView && backViewState) {
    tl.fromTo(backView, { transform: backViewState.transformStart }, vars({ transform: backViewState.transformEnd }), 0)
  }
  if (lastView && lastViewState) {
    tl.fromTo(lastView, { transform: lastViewState.transformStart }, vars({ transform: lastViewState.transformEnd }), 0)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * A timeline that finishes once: on completion, or at its deadline when GSAP's
 * ticker is paused (hidden tab). The deadline counts from the first frame.
 */
function guardedTimeline (gsap, totalMs, finish) {
  let tl
  const guard = createFinishGuard(() => {
    tl?.kill?.()
    finish()
  }, totalMs + SAFETY_BUFFER_MS)
  tl = gsap.timeline({
    onStart: () => guard.extend(totalMs + SAFETY_BUFFER_MS),
    onComplete: () => guard.finish()
  })
  return tl
}

function setTransform (el, state) {
  el.style.transformOrigin = state.origin
  el.style.transform = state.transform
}

/** CSS easing → the same curve as a function (GSAP accepts ease functions); GSAP names pass through. */
function normalizeEasing (ease) {
  return cssEasing(ease) ?? (typeof ease === 'string' ? ease : 'power2.inOut')
}

/**
 * Driver bound to a GSAP instance (for bundlers, where there is no global).
 * @param {object} gsap
 */
export function gsapDriver (gsap) {
  return (spec, onComplete) => runTransition(spec, onComplete, gsap)
}
