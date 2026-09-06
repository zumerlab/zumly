/**
 * Centralized `content-visibility` handling for view layers during zoom prep / teardown.
 * Single source of truth — .z-view.hide only handles opacity; this module controls content-visibility.
 */

// Shared across the bundled engine and separately imported driver helpers.
const visibilityKey = Symbol.for('zumly.viewVisibility')

function rememberVisibility (element) {
  if (element[visibilityKey]) return
  Object.defineProperty(element, visibilityKey, {
    configurable: true,
    value: {
      value: element.style.getPropertyValue('content-visibility'),
      priority: element.style.getPropertyPriority('content-visibility')
    }
  })
}

/** @param {HTMLElement | null | undefined} element */
export function hideViewContent (element) {
  if (!element) return
  rememberVisibility(element)
  element.style.contentVisibility = 'hidden'
}

/**
 * @param {HTMLElement | null | undefined} element
 */
export function showViewContent (element) {
  if (!element) return
  rememberVisibility(element)
  element.style.contentVisibility = 'visible'
}

/** Release the temporary transition override, preserving the host's CSS policy. */
export function restoreViewContent (element) {
  const original = element?.[visibilityKey]
  if (!original) return
  if (original.value) element.style.setProperty('content-visibility', original.value, original.priority)
  else element.style.removeProperty('content-visibility')
  delete element[visibilityKey]
}
