/**
 * Pure geometry and transform helpers for Zumly zoom transitions.
 * Accept plain input values; return plain objects/strings.
 */

/**
 * Compute cover scale for zoom: width-based or height-based.
 * @param {number} triggerWidth - Width of the clicked element (trigger)
 * @param {number} triggerHeight - Height of the trigger
 * @param {number} currentViewWidth - Width of the new current view
 * @param {number} currentViewHeight - Height of the new current view
 * @param {'width'|'height'} cover - Which dimension to use for scale
 * @returns {{ scale: number, scaleInv: number }}
 */
export function computeCoverScale (triggerWidth, triggerHeight, currentViewWidth, currentViewHeight, cover) {
  const scaleByWidth = currentViewWidth / triggerWidth
  const scaleByHeight = currentViewHeight / triggerHeight
  if (cover === 'height') {
    return { scale: scaleByHeight, scaleInv: 1 / scaleByHeight }
  }
  return { scale: scaleByWidth, scaleInv: 1 / scaleByWidth }
}

/**
 * Compute the current view start transform (shrunk to trigger, in canvas coords).
 * @param {{ x: number, y: number, width: number, height: number }} triggerRect - getBoundingClientRect of trigger
 * @param {{ left: number, top: number }} canvasOffset - canvas rect left/top
 * @param {{ width: number, height: number }} currentViewRect - current view width/height
 * @param {number} scaleInv - Inverse of cover scale
 * @returns {string} CSS transform value
 */
export function computeCurrentViewStartTransform (triggerRect, canvasOffset, currentViewRect, scaleInv) {
  const offsetX = canvasOffset.left
  const offsetY = canvasOffset.top
  const tx = triggerRect.x - offsetX + (triggerRect.width - currentViewRect.width * scaleInv) / 2
  const ty = triggerRect.y - offsetY + (triggerRect.height - currentViewRect.height * scaleInv) / 2
  return `translate(${tx}px, ${ty}px) scale(${scaleInv})`
}

/**
 * Compute the current view end transform (full size, centered on trigger position).
 * Uses trigger rect AFTER the previous view has been transformed (trigger moved with parent).
 * @param {{ x: number, y: number, width: number, height: number }} triggerRectAfterTransform
 * @param {{ left: number, top: number }} canvasOffset
 * @param {{ width: number, height: number }} currentViewRect
 * @returns {string} CSS transform value
 */
export function computeCurrentViewEndTransform (triggerRectAfterTransform, canvasOffset, currentViewRect) {
  const offsetX = canvasOffset.left
  const offsetY = canvasOffset.top
  const tx = triggerRectAfterTransform.x - offsetX + (triggerRectAfterTransform.width - currentViewRect.width) / 2
  const ty = triggerRectAfterTransform.y - offsetY + (triggerRectAfterTransform.height - currentViewRect.height) / 2
  return `translate(${tx}px, ${ty}px)`
}

/**
 * Compute the previous view transform-origin (center of trigger, relative to previous view).
 * @param {{ x: number, y: number, width: number, height: number }} triggerRect
 * @param {{ x: number, y: number }} previousViewRect - previous view rect (x, y sufficient)
 * @returns {string} CSS transform-origin value
 */
export function computePreviousViewOrigin (triggerRect, previousViewRect) {
  const ox = triggerRect.x + triggerRect.width / 2 - previousViewRect.x
  const oy = triggerRect.y + triggerRect.height / 2 - previousViewRect.y
  return `${ox}px ${oy}px`
}

/**
 * Compute the previous view end transform (centered in canvas, scaled).
 * @param {{ width: number, height: number }} canvasRect
 * @param {{ x: number, y: number, width: number, height: number }} triggerRect
 * @param {{ x: number, y: number }} previousViewRect
 * @param {number} scale
 * @returns {{ x: number, y: number, transform: string }} Translate x,y (for lastView) and full transform string
 */
export function computePreviousViewEndTransform (canvasRect, triggerRect, previousViewRect, scale) {
  const x = canvasRect.width / 2 - triggerRect.width / 2 - triggerRect.x + previousViewRect.x
  const y = canvasRect.height / 2 - triggerRect.height / 2 - triggerRect.y + previousViewRect.y
  return {
    x,
    y,
    transform: `translate(${x}px, ${y}px) scale(${scale})`
  }
}

/**
 * Compute the last view end transform (complex chained positioning).
 * @param {{ width: number, height: number }} canvasRect
 * @param {{ left: number, top: number }} canvasOffset
 * @param {{ x: number, y: number, width: number, height: number }} triggerRect
 * @param {{ x: number, y: number }} coorPrev - previous view rect after reset to transformPreviousView0
 * @param {{ x: number, y: number, width: number, height: number }} coorLast - lastView's zoomed element rect
 * @param {{ x: number, y: number, width: number, height: number }} newcoordenadasPV - previous view rect after transformPreviousView1
 * @param {number} scale
 * @param {number} preScale
 * @returns {string} CSS transform value
 */
export function computeLastViewEndTransform (canvasRect, canvasOffset, triggerRect, coorPrev, coorLast, newcoordenadasPV, scale, preScale) {
  const offsetX = canvasOffset.left
  const offsetY = canvasOffset.top
  const baseX = canvasRect.width / 2 - triggerRect.width / 2 - triggerRect.x
  const baseY = canvasRect.height / 2 - triggerRect.height / 2 - triggerRect.y
  const tx = baseX + (coorPrev.x - coorLast.x) + newcoordenadasPV.x - offsetX + (newcoordenadasPV.width - coorLast.width) / 2
  const ty = baseY + (coorPrev.y - coorLast.y) + newcoordenadasPV.y - offsetY + (newcoordenadasPV.height - coorLast.height) / 2
  return `translate(${tx}px, ${ty}px) scale(${scale * preScale})`
}

/**
 * Compute last view intermediate transform (used briefly during DOM reads).
 * @param {number} x - From computePreviousViewEndTransform
 * @param {number} y
 * @param {{ left: number, top: number }} canvasOffset
 * @param {number} scale
 * @param {number} preScale
 * @returns {string} CSS transform value
 */
export function computeLastViewIntermediateTransform (x, y, canvasOffset, scale, preScale) {
  return `translate(${x - canvasOffset.left}px, ${y - canvasOffset.top}px) scale(${scale * preScale})`
}
