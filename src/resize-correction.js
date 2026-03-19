/**
 * Cheap resize correction for Zumly.
 * Adjusts stored transforms (translate coords) and origins (pixel coords) by canvas size ratios.
 * Preserves scale(...) exactly. Does not recompute geometry from trigger rects.
 * Unsupported formats are left unchanged.
 */

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
  const translateMatch = transform.match(/translate\s*\(\s*([-\d.eE]+)px\s*,\s*([-\d.eE]+)px\s*\)/)
  if (!translateMatch) return null
  const tx = parseFloat(translateMatch[1])
  const ty = parseFloat(translateMatch[2])
  const rest = transform.replace(/translate\s*\([^)]+\)\s*/, '').trim()
  return { tx, ty, rest }
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
 * Apply resize correction to stored snapshots and visible DOM.
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

  for (const snapshot of instance.storedViews) {
    const views = snapshot.views
    if (!Array.isArray(views)) continue
    for (let i = 0; i < views.length; i++) {
      const entry = views[i]
      if (!entry || entry.detachedNode) continue
      if (entry.backwardState) {
        entry.backwardState.transform = scaleZumlyTransform(entry.backwardState.transform, ratioX, ratioY)
        if (entry.backwardState.origin != null) {
          entry.backwardState.origin = scalePixelOrigin(entry.backwardState.origin, ratioX, ratioY)
        }
      }
      if (entry.forwardState) {
        entry.forwardState.transform = scaleZumlyTransform(entry.forwardState.transform, ratioX, ratioY)
        if (entry.forwardState.origin != null) {
          entry.forwardState.origin = scalePixelOrigin(entry.forwardState.origin, ratioX, ratioY)
        }
      }
    }
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
