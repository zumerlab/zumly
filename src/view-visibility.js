/**
 * Centralized `content-visibility` handling for view layers during zoom prep / teardown.
 * Matches prior inline `style.contentVisibility` behavior (auto vs hidden).
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
  if (element) element.style.contentVisibility = 'auto'
}
