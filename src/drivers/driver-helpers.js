import { showViewContent } from '../view-visibility.js'

/**
 * Shared helpers for Zumly transition drivers.
 *
 * These utilities handle the repetitive DOM work that every driver needs:
 * applying final states, removing views, parsing durations, and running
 * lateral (same-level) transitions. Import what you need; skip what you don't.
 *
 * @module driver-helpers
 * @see ../../docs/DRIVER_API.md for the full driver authoring guide
 */

// ─── Duration parsing ────────────────────────────────────────────────

/**
 * Parse a CSS-style duration string to milliseconds.
 * Accepts "1s", "500ms", "0.3s", or a raw number (treated as ms).
 * Returns a safe fallback (500ms) for garbage input.
 *
 * @param {string|number} duration
 * @returns {number} Duration in milliseconds (≥ 0)
 *
 * @example
 *   parseDurationMs('1s')    // → 1000
 *   parseDurationMs('200ms') // → 200
 *   parseDurationMs(300)     // → 300
 *   parseDurationMs('nope')  // → 500
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

/**
 * Parse duration to seconds (convenience for libs like GSAP that use seconds).
 *
 * @param {string|number} duration
 * @returns {number} Duration in seconds (≥ 0)
 */
export function parseDurationSec (duration) {
  return parseDurationMs(duration) / 1000
}

// ─── End-state application ───────────────────────────────────────────

/**
 * Apply the final zoom-in state to an element based on its current class.
 * This is the DOM cleanup that runs after the animation finishes.
 *
 * What it does for each role:
 * - `is-new-current-view` → becomes `is-current-view`, no-events removed, final transform applied
 * - `is-previous-view` → no-events removed, final transform applied
 * - `is-last-view` → no-events removed, final transform applied
 *
 * @param {HTMLElement} element - The view element
 * @param {object} currentStage - The snapshot with `views[]` array
 */
export function applyZoomInEndState (element, currentStage) {
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
    element.classList.remove('zoom-previous-view', 'has-no-events')
    element.style.transformOrigin = v.origin
    element.style.transform = v.transform
    return
  }
  if (element.classList.contains('is-last-view')) {
    const v = currentStage.views[2].forwardState
    element.classList.remove('zoom-last-view', 'has-no-events')
    element.style.transformOrigin = v.origin
    element.style.transform = v.transform
  }
}

/**
 * Apply the final zoom-out state to the previous view (it becomes current).
 *
 * @param {HTMLElement} element
 * @param {{ origin?: string, transform: string }} backwardState
 */
export function applyZoomOutPreviousState (element, backwardState) {
  element.classList.remove('zoom-previous-view-reverse', 'has-no-events', 'has-effect', 'has-effect-reverse')
  element.style.removeProperty('--z-effect-filter')
  element.style.transformOrigin = '0 0'
  element.style.transform = backwardState.transform
}

/**
 * Apply the final zoom-out state to the last view (it becomes previous).
 *
 * @param {HTMLElement} element
 * @param {{ origin: string, transform: string }} backwardState
 */
export function applyZoomOutLastState (element, backwardState) {
  element.classList.remove('zoom-last-view-reverse', 'has-no-events', 'has-effect', 'has-effect-reverse')
  element.style.removeProperty('--z-effect-filter')
  element.style.transformOrigin = backwardState.origin
  element.style.transform = backwardState.transform
}

// ─── DOM removal ─────────────────────────────────────────────────────

/**
 * Safely remove a view from the canvas. Handles wrapped elements (e.g. Svelte
 * components that get an extra parent div).
 *
 * @param {HTMLElement} element - The view to remove
 * @param {HTMLElement} canvas - The canvas container
 */
export function removeViewFromCanvas (element, canvas) {
  try {
    if (canvas) canvas.removeChild(element)
  } catch (e) {
    try {
      if (element.parentElement) canvas.removeChild(element.parentElement)
    } catch (e2) {
      // Element already removed or re-parented — safe to ignore.
    }
  }
}

// ─── Visibility helpers ──────────────────────────────────────────────

/**
 * Make a view visible and interactive before animating it.
 * Views start hidden (class `hide` for opacity, `contentVisibility: hidden` via view-visibility)
 * when inserted by prepareAndInsertView. Drivers must call this before running any animation.
 *
 * @param  {...HTMLElement} elements - One or more view elements (nulls are skipped)
 */
export function showViews (...elements) {
  for (const el of elements) {
    if (!el) continue
    el.classList.remove('hide')
    showViewContent(el)
  }
}

// ─── Lateral (same-level) transition ─────────────────────────────────

/**
 * Instant lateral navigation: swap current view without animation.
 * This is the shared implementation that drivers use as a baseline.
 * Drivers that want animated lateral transitions can override this.
 *
 * @param {object} spec - Full lateral spec from the engine
 * @param {function} onComplete - Must be called when done
 */
export function runLateralInstant (spec, onComplete) {
  const {
    currentView: incomingView,
    previousView: outgoingView,
    backView,
    backViewState,
    lastView,
    lastViewState,
    incomingTransformEnd,
    currentStage,
    canvas
  } = spec
  const v0 = currentStage.views[0]

  showViews(incomingView)
  incomingView.classList.replace('is-new-current-view', 'is-current-view')
  incomingView.classList.remove('zoom-current-view', 'has-no-events')
  incomingView.style.transformOrigin = v0.forwardState.origin
  incomingView.style.transform = incomingTransformEnd || v0.forwardState.transform

  if (backView && backViewState) backView.style.transform = backViewState.transformEnd
  if (lastView && lastViewState) lastView.style.transform = lastViewState.transformEnd

  if (!spec.keepAlive) removeViewFromCanvas(outgoingView, canvas)
  onComplete()
}

// ─── Safety timeout ──────────────────────────────────────────────────

/**
 * Default safety buffer (ms) beyond the parsed duration. Ensures onComplete
 * fires even if animationend / Promise.all never settles (element removed,
 * duration 0, browser quirk, etc.).
 */
export const SAFETY_BUFFER_MS = 150

/**
 * Create a finish-once guard: returns a `finish()` function that only runs
 * the first time it's called, and clears the safety timer.
 *
 * Use this to avoid the "completed" flag boilerplate in every driver.
 *
 * @param {function} cleanup - The actual cleanup + onComplete work
 * @param {number} timeoutMs - Safety timeout duration
 * @returns {{ finish: function, safetyTimer: number }}
 *
 * @example
 *   const { finish, safetyTimer } = createFinishGuard(() => {
 *     cancelAnimations()
 *     applyFinalState()
 *     onComplete()
 *   }, durationMs + SAFETY_BUFFER_MS)
 *
 *   // In your animation's onComplete:
 *   animation.onfinish = finish
 *
 *   // The safetyTimer ensures finish() runs even if onfinish never fires.
 */
export function createFinishGuard (cleanup, timeoutMs) {
  let completed = false
  const safetyTimer = setTimeout(() => {
    if (!completed) { completed = true; cleanup() }
  }, timeoutMs)

  return {
    finish () {
      if (completed) return
      completed = true
      clearTimeout(safetyTimer)
      cleanup()
    },
    safetyTimer
  }
}

// ─── Matrix interpolation toolkit ────────────────────────────────────
// Used by matrix-based drivers (anime, motion, or any custom driver that
// needs to interpolate transforms through computed matrices).

/** Identity CSS matrix components. */
export function identityMatrix () {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
}

/**
 * Parse a CSS matrix() string into components.
 * @param {string} mStr - e.g. "matrix(1, 0, 0, 1, 100, 50)"
 * @returns {{ a, b, c, d, e, f }}
 */
export function parseMatrixString (mStr) {
  if (!mStr || mStr === 'none') return identityMatrix()
  const m = String(mStr).match(
    /matrix\(([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+),\s*([-\d.eE]+)\)/
  )
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

/**
 * Convert matrix components back to a CSS matrix() string.
 * @param {{ a, b, c, d, e, f }} m
 * @returns {string}
 */
export function matrixToString (m) {
  return `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`
}

/** Linear interpolation between two numbers. */
export function lerp (a, b, t) {
  return a + (b - a) * t
}

/**
 * Interpolate between two matrix objects.
 * @param {{ a,b,c,d,e,f }} from
 * @param {{ a,b,c,d,e,f }} to
 * @param {number} t - Progress 0..1
 * @returns {{ a,b,c,d,e,f }}
 */
export function interpolateMatrix (from, to, t) {
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

/**
 * Read the browser-computed matrix for a given transform + origin pair.
 * ⚠️  Forces a reflow (getBoundingClientRect). Use sparingly — once per
 * element per animation setup, not per frame.
 *
 * @param {HTMLElement} element
 * @param {string} origin - CSS transform-origin
 * @param {string} transformStr - CSS transform value
 * @returns {{ a,b,c,d,e,f }}
 */
export function readComputedMatrix (element, origin, transformStr) {
  element.style.transformOrigin = origin
  element.style.transform = transformStr
  try { element.getBoundingClientRect() } catch {}
  return parseMatrixString(getComputedStyle(element).transform)
}
