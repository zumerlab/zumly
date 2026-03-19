/**
 * Snapshot creation and navigation state helpers for Zumly zoom transitions.
 * Produces the structure consumed by transition drivers and zoomOut.
 */

/** Index of current view in snapshot.views */
export const INDEX_CURRENT = 0
/** Index of previous view in snapshot.views */
export const INDEX_PREVIOUS = 1
/** Index of last view in snapshot.views (when zoom level > 2) */
export const INDEX_LAST = 2
/** Index of removed view in snapshot.views (when zoom level > 3) */
export const INDEX_REMOVED = 3

/**
 * Create a view state object (backward or forward).
 * @param {{ origin: string, duration?: string, ease?: string, transform: string }} params
 * @returns {{ origin: string, duration?: string, ease?: string, transform: string }}
 */
export function createViewState ({ origin, duration, ease, transform }) {
  const state = { origin, transform }
  if (duration !== undefined) state.duration = duration
  if (ease !== undefined) state.ease = ease
  return state
}

/**
 * Create a view entry for the snapshot (current, previous, or last view).
 * @param {string} viewName
 * @param {{ origin: string, duration?: string, ease?: string, transform: string }} backwardState
 * @param {{ origin: string, duration?: string, ease?: string, transform: string }} forwardState
 * @returns {{ viewName: string, backwardState: object, forwardState: object }}
 */
export function createViewEntry (viewName, backwardState, forwardState) {
  return { viewName, backwardState, forwardState }
}

/**
 * Create the removed-view entry. Stores the detached DOM node explicitly.
 * @param {Node} detachedNode - The view element removed from the canvas
 * @returns {{ detachedNode: Node }}
 */
export function createRemovedViewEntry (detachedNode) {
  return { detachedNode }
}

/**
 * Assemble a zoom transition snapshot from view metadata.
 * @param {number} zoomLevel
 * @param {{ viewName: string, backwardState: object, forwardState: object } | null} current
 * @param {{ viewName: string, backwardState: object, forwardState: object } | null} previous
 * @param {{ viewName: string, backwardState: object, forwardState: object } | null} last
 * @param {{ detachedNode: Node } | null} removed
 * @returns {{ zoomLevel: number, views: Array }}
 */
export function createZoomSnapshot (zoomLevel, current, previous, last, removed) {
  const views = []
  if (current !== null) views.push(current)
  if (previous !== null) views.push(previous)
  if (last !== null) views.push(last)
  if (removed !== null) views.push(removed)
  return { zoomLevel, views }
}

/**
 * Get the detached node from a snapshot, if any (for reattach on zoomOut).
 * Only the `detachedNode` shape from {@link createRemovedViewEntry} is supported.
 * @param {{ views: Array }} snapshot
 * @returns {Node | undefined}
 */
export function getDetachedNode (snapshot) {
  const entry = snapshot.views?.[INDEX_REMOVED]
  if (!entry || !(entry.detachedNode instanceof Node)) return undefined
  return entry.detachedNode
}
