import { identityMatrix, readComputedMatrix } from './driver-helpers.js'

// Zumly emits translate(px, px) followed by an optional uniform scale. These
// matrices are independent of layout and transform-origin: the browser applies
// the origin separately when it paints the matrix. Keep other CSS syntax on the
// computed-style path, including an empty inline value that can expose author CSS.
const number = '[-+]?(?:\\d*\\.\\d+|\\d+)(?:[eE][-+]?\\d+)?'
const length = `(${number})(px)?`
const zumlyTransform = new RegExp(`^(?:translate\\(\\s*${length}\\s*,\\s*${length}\\s*\\)\\s*)?(?:scale\\(\\s*(${number})\\s*\\))?$`)

function parseZumlyMatrix (transformStr) {
  if (typeof transformStr !== 'string') return null
  const value = transformStr.trim()
  if (value === 'none') return identityMatrix()
  if (!value) return null
  const match = value.match(zumlyTransform)
  if (!match) return null
  const tx = Number(match[1] ?? 0)
  const ty = Number(match[3] ?? 0)
  const scale = Number(match[5] ?? 1)
  // CSS permits unitless zero lengths, but not other unitless translations.
  if ((tx !== 0 && !match[2]) || (ty !== 0 && !match[4])) return null
  if (![tx, ty, scale].every(Number.isFinite)) return null
  return { a: scale, b: 0, c: 0, d: scale, e: tx, f: ty }
}

/** Apply a driver state, resolving engine transforms without layout reads. */
export function readTransitionMatrix (element, origin, transformStr) {
  const matrix = parseZumlyMatrix(transformStr)
  if (!matrix) return readComputedMatrix(element, origin, transformStr)
  element.style.transformOrigin = origin
  element.style.transform = transformStr
  return matrix
}
