/**
 * CSS easing functions in JavaScript, so drivers that animate a progress value
 * (Anime.js, GSAP, Motion) follow the same curve as the CSS and WAAPI drivers
 * for the same `ease` string.
 */

const KEYWORDS = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1]
}

/**
 * cubic-bezier(x1, y1, x2, y2) as a function of progress: solves x(t) = p
 * with Newton's method, falling back to bisection, then returns y(t).
 */
export function cubicBezier (x1, y1, x2, y2) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = t => ((ax * t + bx) * t + cx) * t
  const sampleY = t => ((ay * t + by) * t + cy) * t
  const slopeX = t => (3 * ax * t + 2 * bx) * t + cx

  const solve = p => {
    let t = p
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - p
      if (Math.abs(error) < 1e-6) return t
      const slope = slopeX(t)
      if (Math.abs(slope) < 1e-6) break
      t -= error / slope
    }
    let low = 0
    let high = 1
    t = p
    while (high - low > 1e-6) {
      if (sampleX(t) < p) low = t
      else high = t
      t = (low + high) / 2
    }
    return t
  }

  return p => (p <= 0 ? 0 : p >= 1 ? 1 : sampleY(solve(p)))
}

/** steps(n, position) per CSS Easing Level 1. */
export function steps (count, position = 'end') {
  const jumps = position === 'jump-none' ? count - 1 : position === 'jump-both' ? count + 1 : count
  const startsHigh = position === 'start' || position === 'jump-start' || position === 'jump-both'
  return p => {
    if (p >= 1) return 1
    let step = Math.floor(p * count) + (startsHigh ? 1 : 0)
    if (p >= 0 && step < 0) step = 0
    return Math.min(step, jumps) / jumps
  }
}

const linear = p => p

/**
 * Turn a CSS timing function into f(progress) → eased progress.
 * Returns null for anything that is not CSS easing syntax (e.g. 'power2.out',
 * 'easeOutExpo'), which drivers pass through to their animation library.
 *
 * @param {string} ease
 * @returns {((p: number) => number) | null}
 */
export function cssEasing (ease) {
  if (typeof ease !== 'string') return null
  const value = ease.trim().toLowerCase()
  if (value === 'linear') return linear
  if (KEYWORDS[value]) return cubicBezier(...KEYWORDS[value])
  if (value === 'step-start') return steps(1, 'start')
  if (value === 'step-end') return steps(1, 'end')

  const bezier = value.match(/^cubic-bezier\(([^)]*)\)$/)
  if (bezier) {
    const args = bezier[1].split(',').map(Number)
    if (args.length === 4 && args.every(Number.isFinite) && args[0] >= 0 && args[0] <= 1 && args[2] >= 0 && args[2] <= 1) {
      return cubicBezier(...args)
    }
    return null
  }

  const stepped = value.match(/^steps\(\s*(\d+)\s*(?:,\s*([a-z-]+)\s*)?\)$/)
  if (stepped) {
    const count = Number(stepped[1])
    const position = stepped[2] || 'end'
    const valid = ['start', 'end', 'jump-start', 'jump-end', 'jump-none', 'jump-both']
    if (count >= 1 && valid.includes(position) && !(position === 'jump-none' && count < 2)) return steps(count, position)
    return null
  }

  // linear(0, 0.25 40%, 1) — piecewise linear points with optional percentages.
  const piecewise = value.match(/^linear\((.*)\)$/)
  if (piecewise) return linearPoints(piecewise[1])
  return null
}

function linearPoints (list) {
  const points = []
  for (const part of list.split(',')) {
    const [output, ...inputs] = part.trim().split(/\s+/)
    const y = Number(output)
    if (!Number.isFinite(y)) return null
    if (inputs.length === 0) points.push({ y, x: null })
    for (const input of inputs) {
      if (!/%$/.test(input)) return null
      points.push({ y, x: Number(input.slice(0, -1)) / 100 })
    }
  }
  if (points.length < 2) return null
  if (points[0].x === null) points[0].x = 0
  if (points[points.length - 1].x === null) points[points.length - 1].x = 1
  // Inputs never decrease; missing inputs are spread evenly between known ones.
  let maxX = 0
  for (const point of points) {
    if (point.x !== null) point.x = maxX = Math.max(point.x, maxX)
  }
  for (let i = 1; i < points.length; i++) {
    if (points[i].x !== null) continue
    let j = i
    while (points[j].x === null) j++
    const start = points[i - 1].x
    const gap = (points[j].x - start) / (j - i + 1)
    for (let k = i; k < j; k++) points[k].x = start + gap * (k - i + 1)
  }
  return p => {
    if (p <= points[0].x) return points[0].y
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]
      const b = points[i]
      if (p <= b.x) return b.x === a.x ? b.y : a.y + (b.y - a.y) * (p - a.x) / (b.x - a.x)
    }
    return points[points.length - 1].y
  }
}
