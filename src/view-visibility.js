/**
 * Centralized `content-visibility` handling for view layers during zoom prep / teardown.
 * Single source of truth — .z-view.hide only handles opacity; this module controls content-visibility.
 */

/**
 * @param {HTMLElement | null | undefined} element
 */
export function hideViewContent (element) {
  if (element) element.style.contentVisibility = 'hidden'
}

/**
 * @param {HTMLElement | null | undefined} element
 */
export function showViewContent (element) {
  if (element) element.style.contentVisibility = 'visible'
}
