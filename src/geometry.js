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
 * @param {number} [parallax=0] - Parallax intensity (0-1). Reduces translation to create depth lag.
 * @returns {{ x: number, y: number, transform: string }} Translate x,y (for lastView) and full transform string
 */
export function computePreviousViewEndTransform (canvasRect, triggerRect, previousViewRect, scale, parallax = 0) {
  const x = canvasRect.width / 2 - triggerRect.width / 2 - triggerRect.x + previousViewRect.x
  const y = canvasRect.height / 2 - triggerRect.height / 2 - triggerRect.y + previousViewRect.y
  const factor = 1 - parallax
  const px = x * factor
  const py = y * factor
  return {
    x,
    y,
    transform: `translate(${px}px, ${py}px) scale(${scale})`
  }
}

/**
 * Compute the last view end transform (complex chained positioning).
 * @param {object} params
 * @param {{ width: number, height: number }} params.canvasRect
 * @param {{ left: number, top: number }} params.canvasOffset
 * @param {{ x: number, y: number, width: number, height: number }} params.triggerRect
 * @param {{ x: number, y: number, width: number, height: number }} params.previousViewRectAtBaseTransform - previous view rect after restoring base transform
 * @param {{ x: number, y: number, width: number, height: number }} params.lastViewZoomedElementRect - last view’s .zoomed (or last view) rect
 * @param {{ x: number, y: number, width: number, height: number }} params.previousViewRectWithPreviousAtEndTransform - previous view rect while it holds the “end” transform
 * @param {number} params.scale - cover scale from the active zoom step
 * @param {number} params.preScale - accumulated scale from shallower levels
 * @param {number} [params.parallax=0] - Parallax intensity (0-1). Last view uses 2x factor for deeper depth lag.
 * @returns {string} CSS transform value
 */
export function computeLastViewEndTransform ({
  canvasRect,
  canvasOffset,
  triggerRect,
  previousViewRectAtBaseTransform,
  lastViewZoomedElementRect,
  previousViewRectWithPreviousAtEndTransform,
  scale,
  preScale,
  parallax = 0
}) {
  const offsetX = canvasOffset.left
  const offsetY = canvasOffset.top
  const baseX = canvasRect.width / 2 - triggerRect.width / 2 - triggerRect.x
  const baseY = canvasRect.height / 2 - triggerRect.height / 2 - triggerRect.y
  const tx = baseX +
    (previousViewRectAtBaseTransform.x - lastViewZoomedElementRect.x) +
    previousViewRectWithPreviousAtEndTransform.x - offsetX +
    (previousViewRectWithPreviousAtEndTransform.width - lastViewZoomedElementRect.width) / 2
  const ty = baseY +
    (previousViewRectAtBaseTransform.y - lastViewZoomedElementRect.y) +
    previousViewRectWithPreviousAtEndTransform.y - offsetY +
    (previousViewRectWithPreviousAtEndTransform.height - lastViewZoomedElementRect.height) / 2
  const factor = 1 - Math.min(parallax * 2, 0.9)
  return `translate(${tx * factor}px, ${ty * factor}px) scale(${scale * preScale})`
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

/**
 * Parse a transform-origin string like "123px 456px" into numeric values.
 * @param {string} originStr
 * @returns {{ x: number, y: number }}
 */
export function parseOrigin (originStr) {
  const parts = originStr.split(/\s+/)
  return { x: parseFloat(parts[0]) || 0, y: parseFloat(parts[1]) || 0 }
}

/**
 * Parse a transform string like "translate(10px, 20px) scale(3)" into components.
 * @param {string} transformStr
 * @returns {{ tx: number, ty: number, scale: number }}
 */
export function parseTranslateScale (transformStr) {
  const tm = transformStr.match(/translate\(\s*([-\d.]+)px[,\s]+([-\d.]+)px\s*\)/)
  const sm = transformStr.match(/scale\(\s*([-\d.]+)\s*\)/)
  return {
    tx: tm ? parseFloat(tm[1]) : 0,
    ty: tm ? parseFloat(tm[2]) : 0,
    scale: sm ? parseFloat(sm[1]) : 1
  }
}

/**
 * Compute a child element's bounding rect after its parent's CSS transform is REPLACED,
 * WITHOUT forcing a DOM reflow. Pure math replacement for getBoundingClientRect().
 *
 * The parent currently has an old transform applied, so parentRect and childRect already
 * reflect that old transform. This function:
 * 1. Inverts the old transform to recover layout-box positions
 * 2. Applies the new transform to get the final screen positions
 *
 * CSS transform with origin: point_screen = origin + translate + scale * (point_layout - origin)
 * Inverse: point_layout = origin + (point_screen - origin - translate) / scale
 *
 * @param {{ x: number, y: number, width: number, height: number }} childRect - Child's CURRENT bounding rect (includes old parent transform)
 * @param {{ x: number, y: number, width: number, height: number }} parentRect - Parent's CURRENT bounding rect (includes old parent transform)
 * @param {{ x: number, y: number }} oldOrigin - Old transform-origin (relative to parent layout box)
 * @param {number} oldTx - Old translate X
 * @param {number} oldTy - Old translate Y
 * @param {number} oldS - Old scale
 * @param {{ x: number, y: number }} newOrigin - New transform-origin (relative to parent layout box)
 * @param {number} newTx - New translate X
 * @param {number} newTy - New translate Y
 * @param {number} newS - New scale
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function computeChildRectAfterParentTransformChange (
  childRect, parentRect,
  oldOrigin, oldTx, oldTy, oldS,
  newOrigin, newTx, newTy, newS
) {
  // Step 1: recover parent layout box position from its current (transformed) rect
  // parentScreen = layoutBox + oldOrigin + oldTranslate + oldScale * (layoutBox - layoutBox - oldOrigin)
  //              = layoutBox + oldOrigin + oldTranslate + oldScale * (-oldOrigin)
  //              = layoutBox + oldOrigin * (1 - oldScale) + oldTranslate
  // So: layoutBox = parentScreen - oldOrigin * (1 - oldScale) - oldTranslate
  const layoutX = parentRect.x - oldOrigin.x * (1 - oldS) - oldTx
  const layoutY = parentRect.y - oldOrigin.y * (1 - oldS) - oldTy
  const layoutW = parentRect.width / oldS
  const layoutH = parentRect.height / oldS

  // Step 2: recover child layout position
  // childScreen = layoutBox + oldOrigin + oldTranslate + oldScale * (childLayout_rel - oldOrigin)
  // where childLayout_rel = childLayout - layoutBox (relative to parent layout)
  // childScreen = layoutBox + oldOrigin + oldTx + oldS * (childLayout - layoutBox - oldOrigin)
  // So: childLayout = layoutBox + oldOrigin + (childScreen - layoutBox - oldOrigin - oldTx) / oldS
  const childLayoutX = layoutX + oldOrigin.x + (childRect.x - layoutX - oldOrigin.x - oldTx) / oldS
  const childLayoutY = layoutY + oldOrigin.y + (childRect.y - layoutY - oldOrigin.y - oldTy) / oldS
  const childLayoutW = childRect.width / oldS
  const childLayoutH = childRect.height / oldS

  // Step 3: apply new transform to get new screen position
  // childNewScreen = layoutBox + newOrigin + newTx + newS * (childLayout - layoutBox - newOrigin)
  const newX = layoutX + newOrigin.x + newTx + newS * (childLayoutX - layoutX - newOrigin.x)
  const newY = layoutY + newOrigin.y + newTy + newS * (childLayoutY - layoutY - newOrigin.y)
  const newW = childLayoutW * newS
  const newH = childLayoutH * newS

  return {
    x: newX,
    y: newY,
    width: newW,
    height: newH,
    left: newX,
    top: newY,
    right: newX + newW,
    bottom: newY + newH
  }
}

/**
 * Compute a preview transform for elastic zoom (threshold).
 * Produces a slight zoom toward the trigger center, suitable for the hold preview phase.
 *
 * @param {{ x: number, y: number, width: number, height: number }} triggerRect - Trigger bounding rect
 * @param {{ x: number, y: number, width: number, height: number }} canvasRect - Canvas bounding rect
 * @param {string} currentTransform - Current inline transform of the view (may be empty)
 * @param {number} previewScale - Target preview scale (e.g. 1.08)
 * @returns {{ origin: string, transform: string }} CSS transform-origin and transform for the preview end state
 */
export function computePreviewTransform (triggerRect, canvasRect, currentTransform, previewScale) {
  const cx = triggerRect.x + triggerRect.width / 2 - canvasRect.x
  const cy = triggerRect.y + triggerRect.height / 2 - canvasRect.y
  const origin = `${cx}px ${cy}px`
  // Compose scale onto existing transform
  const base = currentTransform && currentTransform.trim() !== '' ? currentTransform : ''
  const transform = base
    ? `${base} scale(${previewScale})`
    : `scale(${previewScale})`
  return { origin, transform }
}
