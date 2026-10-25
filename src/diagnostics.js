/**
 * Developer diagnostics: messages that point at the likely mistake.
 * Pure helpers; callers decide how to report (see notification() in utils.js).
 */

/** Edit distance between two short strings (view names, option keys). */
function distance (a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return prev[b.length]
}

/**
 * Closest candidate to a mistyped name, or null when nothing is close.
 * Case differences count as a match ('lateralnav' → 'lateralNav').
 * @param {string} name
 * @param {Iterable<string>} candidates
 * @returns {string|null}
 */
export function suggest (name, candidates) {
  const lower = String(name).toLowerCase()
  let best = null
  let bestScore = Infinity
  for (const candidate of candidates) {
    const score = candidate.toLowerCase() === lower ? 0 : distance(lower, candidate.toLowerCase())
    if (score < bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best !== null && bestScore <= Math.max(1, Math.floor(lower.length / 3)) ? best : null
}

/** ' Did you mean "x"?' or '' */
export function didYouMean (name, candidates) {
  const match = suggest(name, candidates)
  return match ? ` Did you mean "${match}"?` : ''
}

/**
 * Message for a view name that is not a key in `views`.
 * @param {string} name
 * @param {object} views
 */
export function unknownViewMessage (name, views) {
  const names = Object.keys(views)
  return `view "${name}" is not defined in views.${didYouMean(name, names)} Available: ${names.join(', ') || '(none)'}.`
}

/**
 * Names of keys in `object` that are not in `known`.
 * @param {object} object
 * @param {string[]} known
 * @returns {string[]}
 */
export function unknownKeys (object, known) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return []
  return Object.keys(object).filter(key => !known.includes(key))
}

/** CSS time: '1s', '.7s', '600ms', '0'. */
export const CSS_TIME = /^(\d*\.?\d+)\s*(ms|s)$|^0$/i

/** True when the string uses CSS easing syntax (as opposed to a library ease name like 'power2.out'). */
export function isCssEasingSyntax (ease) {
  return typeof ease === 'string' &&
    /^(linear|ease|ease-in|ease-out|ease-in-out|step-start|step-end)$|^(cubic-bezier|steps|linear)\(/i.test(ease.trim())
}

/**
 * Whether the browser accepts `ease` as a CSS timing function. Returns true
 * when it cannot be checked (no CSS.supports), so validation never blocks.
 */
export function isValidCssEasing (ease) {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true
  return CSS.supports('transition-timing-function', ease)
}
