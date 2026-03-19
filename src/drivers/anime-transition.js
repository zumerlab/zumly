/**
 * Anime.js transition driver.
 * Uses the global `anime` (Anime.js) if available.
 * Interpolates the *computed transform matrix* to keep intermediate coordinates correct.
 * @param {Object} spec - { type, currentView, previousView, lastView, currentStage, duration, ease, canvas? }
 * @param {function} onComplete
 */
export function runTransition (spec, onComplete) {
  const anime = typeof globalThis !== 'undefined' && globalThis.anime
  if (!anime || typeof anime !== 'function') {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Zumly anime driver: Anime.js not loaded. Add <script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.2/anime.min.js"></script>')
    }
    onComplete()
    return
  }

  const { type, currentView, previousView, lastView, currentStage, duration, ease, canvas } = spec
  if (!currentView || !previousView || !currentStage) {
    onComplete()
    return
  }

  const durationMs = parseDurationMs(duration)

  if (type === 'zoomIn') {
    runZoomInAnime(anime, currentView, previousView, lastView, currentStage, durationMs, ease, onComplete)
  } else if (type === 'zoomOut') {
    runZoomOutAnime(anime, currentView, previousView, lastView, currentStage, durationMs, ease, canvas, onComplete)
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

/** Parse "translate(Xpx, Ypx) scale(S)" or matrix(a,b,c,d,e,f); return { tx, ty, scale }. */
function parseTransform (str) {
  if (!str || typeof str !== 'string' || str.trim() === '' || str === 'none') return { tx: 0, ty: 0, scale: 1 }
  const s = str.trim()
  const t = s.match(/translate\s*\(\s*([-\d.eE]+)px\s*,\s*([-\d.eE]+)px\s*\)\s*scale\s*\(\s*([-\d.eE]+)\s*\)/)
  if (t) return { tx: parseFloat(t[1]) || 0, ty: parseFloat(t[2]) || 0, scale: parseFloat(t[3]) || 1 }
  const mat = s.match(/matrix\s*\(\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*,\s*([-\d.eE]+)\s*\)/)
  if (mat) {
    const a = parseFloat(mat[1])
    const b = parseFloat(mat[2])
    const e = parseFloat(mat[5])
    const f = parseFloat(mat[6])
    const scale = Math.sqrt(a * a + b * b) || 1
    return { tx: e, ty: f, scale }
  }
  return { tx: 0, ty: 0, scale: 1 }
}

function interpolateTransform (fromStr, toStr, t) {
  const tt = Math.max(0, Math.min(1, t))
  const from = parseTransform(fromStr)
  const to = parseTransform(toStr)
  const tx = from.tx + (to.tx - from.tx) * tt
  const ty = from.ty + (to.ty - from.ty) * tt
  const scale = from.scale + (to.scale - from.scale) * tt
  return `translate(${tx}px, ${ty}px) scale(${scale})`
}

function identityMatrix () {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
}

function parseMatrixString (mStr) {
  if (!mStr || mStr === 'none') return identityMatrix()
  const m = String(mStr).match(/matrix\(([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+)\)/)
  if (!m) return identityMatrix()
  return {
    a: parseFloat(m[1]) || 1,
    b: parseFloat(m[2]) || 0,
    c: parseFloat(m[3]) || 0,
    d: parseFloat(m[4]) || 1,
    e: parseFloat(m[5]) || 0,
    f: parseFloat(m[6]) || 0,
  }
}

function matrixToString (m) {
  return `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`
}

function lerp (a, b, t) {
  return a + (b - a) * t
}

function interpolateMatrix (from, to, t) {
  const tt = Math.max(0, Math.min(1, t))
  return {
    a: lerp(from.a, to.a, tt),
    b: lerp(from.b, to.b, tt),
    c: lerp(from.c, to.c, tt),
    d: lerp(from.d, to.d, tt),
    e: lerp(from.e, to.e, tt),
    f: lerp(from.f, to.f, tt),
  }
}

function readMatrixForTransform (element, origin, transformStr) {
  element.style.transformOrigin = origin
  element.style.transform = transformStr
  // Flush computed transform update.
  try { element.getBoundingClientRect() } catch {}
  return parseMatrixString(getComputedStyle(element).transform)
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

function runZoomInAnime (anime, currentView, previousView, lastView, currentStage, durationMs, ease, onComplete) {
  currentView.classList.remove('hide')
  currentView.style.contentVisibility = 'auto'
  previousView.style.contentVisibility = 'auto'
  if (lastView) lastView.style.contentVisibility = 'auto'

  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null

  // Compute matrix endpoints (with fixed origin) to interpolate intermediate coordinates correctly.
  const mCurrentFrom = readMatrixForTransform(currentView, v0.backwardState.origin, v0.backwardState.transform)
  const mCurrentTo = readMatrixForTransform(currentView, v0.backwardState.origin, v0.forwardState.transform)
  const mPrevFrom = readMatrixForTransform(previousView, v1.backwardState.origin, v1.backwardState.transform)
  const mPrevTo = readMatrixForTransform(previousView, v1.backwardState.origin, v1.forwardState.transform)
  const mLastFrom = v2 ? readMatrixForTransform(lastView, v2.backwardState.origin, v2.backwardState.transform) : null
  const mLastTo = v2 ? readMatrixForTransform(lastView, v2.backwardState.origin, v2.forwardState.transform) : null

  currentView.style.transform = matrixToString(mCurrentFrom)
  previousView.style.transform = matrixToString(mPrevFrom)
  if (v2) lastView.style.transform = matrixToString(mLastFrom)

  const progress = { value: 0 }
  anime({
    targets: progress,
    value: 1,
    duration: durationMs,
    easing: normalizeEasing(ease),
    update: () => {
      const t = progress.value
      currentView.style.transform = matrixToString(interpolateMatrix(mCurrentFrom, mCurrentTo, t))
      previousView.style.transform = matrixToString(interpolateMatrix(mPrevFrom, mPrevTo, t))
      if (v2) lastView.style.transform = matrixToString(interpolateMatrix(mLastFrom, mLastTo, t))
    },
    complete: () => {
      applyZoomInEndState(currentView, currentStage)
      applyZoomInEndState(previousView, currentStage)
      if (lastView) applyZoomInEndState(lastView, currentStage)
      onComplete()
    }
  })
}

function runZoomOutAnime (anime, currentView, previousView, lastView, currentStage, durationMs, ease, canvas, onComplete) {
  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null
  const to1 = v1.backwardState
  const to2 = v2 ? v2.backwardState : null

  // Matrix endpoints with fixed origin (the from state origin is what CSS keyframes keep during the animation).
  const mCurrentFrom = readMatrixForTransform(currentView, v0.forwardState.origin, v0.forwardState.transform)
  const mCurrentTo = readMatrixForTransform(currentView, v0.forwardState.origin, v0.backwardState.transform)
  const mPrevFrom = readMatrixForTransform(previousView, v1.forwardState.origin, v1.forwardState.transform)
  const mPrevTo = readMatrixForTransform(previousView, v1.forwardState.origin, v1.backwardState.transform)
  const mLastFrom = v2 ? readMatrixForTransform(lastView, v2.forwardState.origin, v2.forwardState.transform) : null
  const mLastTo = v2 ? readMatrixForTransform(lastView, v2.forwardState.origin, v2.backwardState.transform) : null

  currentView.style.transform = matrixToString(mCurrentFrom)
  previousView.style.transform = matrixToString(mPrevFrom)
  if (v2) lastView.style.transform = matrixToString(mLastFrom)

  const progress = { value: 0 }
  anime({
    targets: progress,
    value: 1,
    duration: durationMs,
    easing: normalizeEasing(ease),
    update: () => {
      const t = progress.value
      currentView.style.transform = matrixToString(interpolateMatrix(mCurrentFrom, mCurrentTo, t))
      previousView.style.transform = matrixToString(interpolateMatrix(mPrevFrom, mPrevTo, t))
      if (v2) lastView.style.transform = matrixToString(interpolateMatrix(mLastFrom, mLastTo, t))
    },
    complete: () => {
      try {
        if (canvas) canvas.removeChild(currentView)
      } catch (e) {
        try {
          if (currentView.parentElement) canvas.removeChild(currentView.parentElement)
        } catch (e2) {}
      }
      previousView.classList.remove('zoom-previous-view-reverse')
      previousView.classList.remove('has-no-events')
      previousView.style.transformOrigin = '0 0'
      previousView.style.transform = to1.transform
      if (lastView && to2) {
        lastView.classList.remove('zoom-last-view-reverse')
        lastView.style.transformOrigin = to2.origin
        lastView.style.transform = to2.transform
      }
      onComplete()
    }
  })
}

function normalizeEasing (ease) {
  if (typeof ease !== 'string') return 'easeInOutQuad'
  const s = ease.toLowerCase()
  if (s === 'linear') return 'linear'
  if (s.includes('ease-in-out')) return 'easeInOutQuad'
  if (s.includes('ease-in')) return 'easeInQuad'
  if (s.includes('ease-out')) return 'easeOutQuad'
  return s
}
