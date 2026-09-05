/**
 * Cheap resize correction for Zumly.
 * Adjusts stored transforms (translate coords) and origins (pixel coords) by canvas size ratios.
 * Preserves scale(...) exactly. Does not recompute geometry from trigger rects.
 * Unsupported formats are left unchanged.
 */

import { splitTranslate } from './geometry.js'

/**
 * Parse Zumly-style transform to extract translate (x,y) and the rest (scale, etc).
 * Supports: "translate(Xpx, Ypx) scale(S)", "translate(Xpx, Ypx)", "".
 * @param {string} transform
 * @returns {{ tx: number, ty: number, rest: string } | null} null if unsupported
 */
export function parseZumlyTransform (transform) {
  if (typeof transform !== 'string' || transform.trim() === '') {
    return { tx: 0, ty: 0, rest: '' }
  }
  const t = splitTranslate(transform)
  if (!t.matched) return null
  return { tx: t.tx, ty: t.ty, rest: t.rest }
}

/**
 * Rescale translate coords by ratioX/ratioY; preserve scale(...) unchanged.
 * @param {string} transform
 * @param {number} ratioX
 * @param {number} ratioY
 * @returns {string} corrected transform, or original if unsupported
 */
export function scaleZumlyTransform (transform, ratioX, ratioY) {
  const parsed = parseZumlyTransform(transform)
  if (parsed === null) return transform
  const tx = parsed.tx * ratioX
  const ty = parsed.ty * ratioY
  const rest = parsed.rest ? ` ${parsed.rest}` : ''
  return `translate(${tx}px, ${ty}px)${rest}`.trim()
}

/**
 * Parse pixel-based origin "Xpx Ypx".
 * @param {string} origin
 * @returns {{ x: number, y: number } | null} null if not in supported format
 */
export function parsePixelOrigin (origin) {
  if (typeof origin !== 'string' || !origin.trim()) return null
  const m = origin.trim().match(/^([-\d.eE]+)px\s+([-\d.eE]+)px$/)
  if (!m) return null
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) }
}

/**
 * Rescale pixel origin by ratioX/ratioY.
 * @param {string} origin
 * @param {number} ratioX
 * @param {number} ratioY
 * @returns {string} corrected origin, or original if unsupported
 */
export function scalePixelOrigin (origin, ratioX, ratioY) {
  const parsed = parsePixelOrigin(origin)
  if (parsed === null) return origin
  return `${parsed.x * ratioX}px ${parsed.y * ratioY}px`
}

/**
 * Apply resize correction to stored snapshots, lateral history, and visible DOM.
 * Updates transforms (translate only) and pixel origins. Preserves scale.
 * @param {Object} instance - Zumly instance with storedViews, currentStage, canvas
 * @param {number} prevWidth - previous canvas width
 * @param {number} prevHeight - previous canvas height
 * @param {number} newWidth - new canvas width
 * @param {number} newHeight - new canvas height
 */
export function applyResizeCorrection (instance, prevWidth, prevHeight, newWidth, newHeight) {
  if (!instance.storedViews?.length || !instance.canvas) return
  if (prevWidth <= 0 || prevHeight <= 0) return

  const ratioX = newWidth / prevWidth
  const ratioY = newHeight / prevHeight

  // A lateral history entry can reference states also present in its full stage
  // or storedViews. Scale each state once, including saved ancestor poses.
  const resizedStates = new Set()
  const resizeEntry = entry => {
    if (!entry || entry.detachedNode) return
    for (const state of [entry.backwardState, entry.forwardState]) {
      if (!state || resizedStates.has(state)) continue
      resizedStates.add(state)
      state.transform = scaleZumlyTransform(state.transform, ratioX, ratioY)
      if (state.origin != null) {
        state.origin = scalePixelOrigin(state.origin, ratioX, ratioY)
      }
    }
  }
  const snapshots = [...instance.storedViews]
  for (const history of instance.lateralHistory || []) {
    if (history.stage) snapshots.push(history.stage)
    resizeEntry(history.entry)
  }
  for (const snapshot of snapshots) {
    if (!Array.isArray(snapshot.views)) continue
    snapshot.views.forEach(resizeEntry)
  }

  const canvas = instance.canvas
  const currentView = canvas.querySelector('.is-current-view')
  const previousView = canvas.querySelector('.is-previous-view')
  const lastView = canvas.querySelector('.is-last-view')
  const newCurrentView = canvas.querySelector('.is-new-current-view')
  const viewsToUpdate = [currentView, previousView, lastView, newCurrentView].filter(Boolean)

  for (const el of viewsToUpdate) {
    if (!el.style) continue
    const currentTransform = el.style.transform
    if (currentTransform != null && currentTransform !== '') {
      el.style.transform = scaleZumlyTransform(currentTransform, ratioX, ratioY)
    }
    const currentOrigin = el.style.transformOrigin
    if (currentOrigin != null && currentOrigin !== '') {
      el.style.transformOrigin = scalePixelOrigin(currentOrigin, ratioX, ratioY)
    }
  }
}
