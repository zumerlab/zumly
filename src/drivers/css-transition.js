/**
 * CSS-based transition driver (default).
 * Uses CSS variables and keyframe classes; completes via animationend.
 * Includes safety timeout so onComplete runs even if animationend is missed.
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
  createFinishGuard,
  SAFETY_BUFFER_MS,
} from './driver-helpers.js'

export function runTransition (spec, onComplete) {
  const { type, currentView, previousView, lastView, currentStage, duration, ease, canvas } = spec

  if (!currentView || !previousView || !currentStage) {
    onComplete()
    return
  }

  if (type === 'lateral') {
    runLateral(spec, onComplete)
  } else if (type === 'zoomIn') {
    runZoomIn(currentView, previousView, lastView, currentStage, duration, ease, onComplete)
  } else if (type === 'zoomOut') {
    runZoomOut(currentView, previousView, lastView, currentStage, duration, ease, canvas, onComplete)
  } else {
    onComplete()
  }
}

// ─── Lateral ─────────────────────────────────────────────────────────

function runLateral (spec, onComplete) {
  const {
    currentView: incomingView,
    previousView: outgoingView,
    backView,
    backViewState,
    lastView,
    lastViewState,
    incomingTransformStart,
    incomingTransformEnd,
    outgoingTransform,
    outgoingTransformEnd,
    currentStage,
    duration,
    ease,
    canvas,
  } = spec
  const durationMs = parseDurationMs(duration)
  const v0 = currentStage.views[0]

  showViews(incomingView)
  incomingView.classList.replace('is-new-current-view', 'is-current-view')
  incomingView.classList.remove('zoom-current-view', 'has-no-events')
  incomingView.style.transformOrigin = v0.forwardState.origin

  // Set CSS variables and animation classes for each participating element
  if (backView && backViewState) {
    setCSSVars(backView, duration, ease, { '--lateral-from': backViewState.transformStart, '--lateral-to': backViewState.transformEnd })
    backView.classList.add('zoom-lateral-back')
  }
  if (lastView && lastViewState) {
    setCSSVars(lastView, duration, ease, { '--lateral-from': lastViewState.transformStart, '--lateral-to': lastViewState.transformEnd })
    lastView.classList.add('zoom-lateral-back')
  }

  // Skip outgoing animation in 'visible' keepAlive mode
  if (spec.keepAlive !== 'visible') {
    setCSSVars(outgoingView, duration, ease, { '--lateral-out-from': outgoingTransform, '--lateral-out-to': outgoingTransformEnd })
    outgoingView.classList.add('zoom-lateral-out')
  }

  setCSSVars(incomingView, duration, ease, { '--lateral-in-from': incomingTransformStart, '--lateral-in-to': incomingTransformEnd })
  incomingView.classList.add('zoom-lateral-in')

  // Collect all animated elements
  const elements = spec.keepAlive === 'visible' ? [incomingView] : [outgoingView, incomingView]
  if (backView && backViewState) elements.push(backView)
  if (lastView && lastViewState) elements.push(lastView)

  let pending = elements.length
  const budgetMs = durationMs + SAFETY_BUFFER_MS
  const zoomAnims = new Set(['zoom-lateral-in', 'zoom-lateral-out', 'zoom-lateral-back'])
  const { finish, extend } = createFinishGuard(() => {
    cleanupAnimListeners(elements, handleEnd, handleStart)
    if (spec.keepAlive) {
      outgoingView.classList.remove('zoom-lateral-out')
      outgoingView.style.opacity = ''
    } else {
      removeViewFromCanvas(outgoingView, canvas)
    }
    if (backView) {
      backView.classList.remove('zoom-lateral-back')
      backView.style.transform = backViewState?.transformEnd || backView.style.transform
    }
    if (lastView) {
      lastView.classList.remove('zoom-lateral-back')
      lastView.style.transform = lastViewState?.transformEnd || lastView.style.transform
    }
    incomingView.classList.remove('zoom-lateral-in')
    incomingView.style.transform = incomingTransformEnd
    onComplete()
  }, budgetMs)

  // See runZoomIn: re-arm the deadline from the real animation start.
  function handleStart (event) {
    if (event.target !== event.currentTarget || !zoomAnims.has(event.animationName)) return
    extend(budgetMs)
  }

  function handleEnd (event) {
    if (event.target !== event.currentTarget || !zoomAnims.has(event.animationName)) return
    const el = event.currentTarget
    el.removeEventListener('animationend', handleEnd)
    el.removeEventListener('animationstart', handleStart)
    pending--
    if (pending <= 0) finish()
  }

  elements.forEach(el => {
    el.addEventListener('animationstart', handleStart)
    el.addEventListener('animationend', handleEnd)
  })
}

// ─── Zoom In ─────────────────────────────────────────────────────────

function runZoomIn (currentView, previousView, lastView, currentStage, duration, ease, onComplete) {
  showViews(currentView, previousView, lastView)

  const stagger = currentStage.stagger || 0

  // Set CSS variables for keyframe animations
  setCSSVars(currentView, duration, ease, {
    '--current-view-transform-start': currentStage.views[0].backwardState.transform,
    '--current-view-transform-end': currentStage.views[0].forwardState.transform,
  })
  if (stagger > 0) currentView.style.setProperty('animation-delay', '0ms')
  setCSSVars(previousView, duration, ease, {
    '--previous-view-transform-start': currentStage.views[1].backwardState.transform,
    '--previous-view-transform-end': currentStage.views[1].forwardState.transform,
  })
  if (stagger > 0) previousView.style.setProperty('animation-delay', `${stagger}ms`)
  if (lastView) {
    setCSSVars(lastView, duration, ease, {
      '--last-view-transform-start': currentStage.views[2].backwardState.transform,
      '--last-view-transform-end': currentStage.views[2].forwardState.transform,
    })
    if (stagger > 0) lastView.style.setProperty('animation-delay', `${stagger * 2}ms`)
  }

  // Trigger animations via classes
  currentView.classList.add('zoom-current-view')
  previousView.classList.add('zoom-previous-view')
  if (lastView) lastView.classList.add('zoom-last-view')

  const elements = lastView ? [currentView, previousView, lastView] : [currentView, previousView]
  let pending = elements.length
  const durationMs = parseDurationMs(duration)
  const maxDelay = lastView ? stagger * 2 : stagger
  const budgetMs = durationMs + maxDelay + SAFETY_BUFFER_MS
  const zoomAnims = new Set(['zoom-current-view', 'zoom-previous-view', 'zoom-last-view'])

  const { finish, extend } = createFinishGuard(() => {
    cleanupAnimListeners(elements, handleEnd, handleStart)
    elements.forEach(el => el.style.removeProperty('animation-delay'))
    // Safety path (missed animationend: render lag, hidden tab, removed
    // element): apply the end state ourselves — never leave views stuck
    // with zoom classes and has-no-events.
    elements.forEach(el => {
      if (el?.isConnected) {
        try { applyZoomInEndState(el, currentStage) } catch (e) { /* ignore */ }
      }
    })
    onComplete()
  }, budgetMs)

  // Animations begin on the next render frame, which can lag far behind this
  // JS call when the incoming view is heavy (iframes, large subtrees). Re-arm
  // the safety deadline from the real start so it can't fire mid-animation.
  function handleStart (event) {
    if (event.target !== event.currentTarget || !zoomAnims.has(event.animationName)) return
    extend(budgetMs)
  }

  function handleEnd (event) {
    // Animation events bubble: ignore animations from view content, and only
    // accept this element's own zoom keyframes.
    if (event.target !== event.currentTarget || !zoomAnims.has(event.animationName)) return
    const el = event.currentTarget
    el.removeEventListener('animationend', handleEnd)
    el.removeEventListener('animationstart', handleStart)
    if (el.isConnected) {
      try { applyZoomInEndState(el, currentStage) } catch (e) { /* ignore */ }
    }
    pending--
    if (pending <= 0) finish()
  }

  elements.forEach(el => {
    el.addEventListener('animationstart', handleStart)
    el.addEventListener('animationend', handleEnd)
  })
}

// ─── Zoom Out ────────────────────────────────────────────────────────

function runZoomOut (currentView, previousView, lastView, currentStage, duration, ease, canvas, onComplete) {
  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null
  const stagger = currentStage.stagger || 0

  setCSSVars(currentView, duration, ease, {
    '--current-view-transform-start': v0.backwardState.transform,
    '--current-view-transform-end': v0.forwardState.transform,
  })
  if (stagger > 0) currentView.style.setProperty('animation-delay', '0ms')
  setCSSVars(previousView, duration, ease, {
    '--previous-view-transform-start': v1.backwardState.transform,
    '--previous-view-transform-end': v1.forwardState.transform,
  })
  if (stagger > 0) previousView.style.setProperty('animation-delay', `${stagger}ms`)
  if (lastView && v2) {
    setCSSVars(lastView, duration, ease, {
      '--last-view-transform-start': v2.backwardState.transform,
      '--last-view-transform-end': v2.forwardState.transform,
    })
    if (stagger > 0) lastView.style.setProperty('animation-delay', `${stagger * 2}ms`)
  }

  // Trigger reverse animations
  currentView.classList.add('zoom-current-view-reverse')
  previousView.classList.add('zoom-previous-view-reverse')
  if (lastView) lastView.classList.add('zoom-last-view-reverse')

  const elements = lastView ? [currentView, previousView, lastView] : [currentView, previousView]
  let pending = elements.length
  const durationMs = parseDurationMs(duration)
  const maxDelay = lastView ? stagger * 2 : stagger
  const budgetMs = durationMs + maxDelay + SAFETY_BUFFER_MS
  const zoomAnims = new Set(['zoom-current-view-reverse', 'zoom-previous-view-reverse', 'zoom-last-view-reverse'])

  const { finish, extend } = createFinishGuard(() => {
    cleanupAnimListeners(elements, handleEnd, handleStart)
    elements.forEach(el => el.style.removeProperty('animation-delay'))
    // Safety path: apply end states so the outgoing view is removed and the
    // remaining views are restored even when animationend never arrived.
    elements.forEach(el => {
      if (el?.isConnected) {
        try { applyZoomOutEndState(el, currentStage, canvas) } catch (e) { /* ignore */ }
      }
    })
    onComplete()
  }, budgetMs)

  // See runZoomIn: re-arm the deadline from the real animation start.
  function handleStart (event) {
    if (event.target !== event.currentTarget || !zoomAnims.has(event.animationName)) return
    extend(budgetMs)
  }

  function handleEnd (event) {
    if (event.target !== event.currentTarget || !zoomAnims.has(event.animationName)) return
    const el = event.currentTarget
    el.removeEventListener('animationend', handleEnd)
    el.removeEventListener('animationstart', handleStart)
    if (el.isConnected) {
      try { applyZoomOutEndState(el, currentStage, canvas) } catch (e) { /* ignore */ }
    }
    pending--
    if (pending <= 0) finish()
  }

  elements.forEach(el => {
    el.addEventListener('animationstart', handleStart)
    el.addEventListener('animationend', handleEnd)
  })
}

function applyZoomOutEndState (element, currentStage, canvas) {
  if (element.classList.contains('zoom-current-view-reverse')) {
    removeViewFromCanvas(element, canvas)
    return
  }
  if (element.classList.contains('zoom-previous-view-reverse')) {
    applyZoomOutPreviousState(element, currentStage.views[1].backwardState)
    return
  }
  if (element.classList.contains('zoom-last-view-reverse')) {
    applyZoomOutLastState(element, currentStage.views[2].backwardState)
  }
}

// ─── Internal helpers ────────────────────────────────────────────────

function setCSSVars (el, duration, ease, vars) {
  el.style.setProperty('--zoom-duration', duration)
  el.style.setProperty('--zoom-ease', ease)
  for (const [key, value] of Object.entries(vars)) {
    el.style.setProperty(key, value)
  }
}

function cleanupAnimListeners (elements, endHandler, startHandler) {
  for (const el of elements) {
    if (!el?.removeEventListener) continue
    el.removeEventListener('animationend', endHandler)
    el.removeEventListener('animationstart', startHandler)
  }
}
