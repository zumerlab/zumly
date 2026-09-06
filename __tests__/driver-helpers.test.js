/**
 * Tests for the public driver-helpers surface (src/drivers/driver-helpers.js),
 * exported as 'zumly/driver-helpers'.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  parseDurationMs,
  parseDurationSec,
  createFinishGuard,
  showViews,
  removeViewFromCanvas,
  applyZoomInEndState,
  runLateralInstant,
  identityMatrix,
  parseMatrixString,
  matrixToString,
  lerp,
  interpolateMatrix,
} from '../src/drivers/driver-helpers.js'
import { readTransitionMatrix } from '../src/drivers/transform-matrix.js'

afterEach(() => vi.restoreAllMocks())

describe('parseDurationMs / parseDurationSec', () => {
  it('parses seconds, milliseconds, leading-dot and numbers', () => {
    expect(parseDurationMs('1s')).toBe(1000)
    expect(parseDurationMs('200ms')).toBe(200)
    expect(parseDurationMs('.7s')).toBe(700)
    expect(parseDurationMs('0.3s')).toBe(300)
    expect(parseDurationMs(300)).toBe(300)
    expect(parseDurationSec('2s')).toBe(2)
  })

  it('falls back to 500ms on garbage input', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseDurationMs('nope')).toBe(500)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('createFinishGuard', () => {
  it('runs cleanup exactly once even if called repeatedly', () => {
    vi.useFakeTimers()
    const cleanup = vi.fn()
    const { finish } = createFinishGuard(cleanup, 1000)
    finish()
    finish()
    vi.advanceTimersByTime(2000)
    expect(cleanup).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('safety timer runs cleanup if finish() never fires', () => {
    vi.useFakeTimers()
    const cleanup = vi.fn()
    createFinishGuard(cleanup, 1000)
    vi.advanceTimersByTime(1001)
    expect(cleanup).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('DOM helpers', () => {
  it('showViews unhides elements and skips nulls', () => {
    const el = document.createElement('div')
    el.classList.add('hide')
    expect(() => showViews(el, null, undefined)).not.toThrow()
    expect(el.classList.contains('hide')).toBe(false)
  })

  it('removeViewFromCanvas removes direct children and wrapped views', () => {
    const canvas = document.createElement('div')
    const direct = document.createElement('div')
    canvas.appendChild(direct)
    removeViewFromCanvas(direct, canvas)
    expect(canvas.contains(direct)).toBe(false)

    // Framework-wrapped: the view sits inside an extra wrapper div
    const wrapper = document.createElement('div')
    const wrapped = document.createElement('div')
    wrapper.appendChild(wrapped)
    canvas.appendChild(wrapper)
    removeViewFromCanvas(wrapped, canvas)
    expect(canvas.contains(wrapper)).toBe(false)
  })

  it('applyZoomInEndState promotes is-new-current-view and applies forwardState', () => {
    const el = document.createElement('div')
    el.classList.add('is-new-current-view', 'zoom-current-view', 'has-no-events')
    const stage = {
      views: [
        { forwardState: { origin: '10px 20px', transform: 'translate(1px, 2px)' } },
        null,
        null,
        null,
      ],
    }
    applyZoomInEndState(el, stage)
    expect(el.classList.contains('is-current-view')).toBe(true)
    expect(el.classList.contains('is-new-current-view')).toBe(false)
    expect(el.classList.contains('has-no-events')).toBe(false)
    expect(el.style.transform).toBe('translate(1px, 2px)')
    // Firefox serializes the optional z component explicitly.
    const [x, y, z = '0px'] = el.style.transformOrigin.split(' ')
    expect([x, y, z]).toEqual(['10px', '20px', '0px'])
  })

  it('runLateralInstant swaps views and calls onComplete', () => {
    const canvas = document.createElement('div')
    const incoming = document.createElement('div')
    incoming.classList.add('is-new-current-view', 'hide', 'has-no-events')
    const outgoing = document.createElement('div')
    canvas.appendChild(outgoing)
    canvas.appendChild(incoming)

    const onComplete = vi.fn()
    runLateralInstant({
      currentView: incoming,
      previousView: outgoing,
      backView: null,
      backViewState: null,
      lastView: null,
      lastViewState: null,
      incomingTransformEnd: 'translate(5px, 5px)',
      currentStage: { views: [{ forwardState: { origin: '0px 0px', transform: 'translate(5px, 5px)' } }] },
      canvas,
      keepAlive: false,
    }, onComplete)

    expect(incoming.classList.contains('is-current-view')).toBe(true)
    expect(canvas.contains(outgoing)).toBe(false)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})

describe('matrix toolkit', () => {
  it('parses and serializes matrix strings', () => {
    const m = parseMatrixString('matrix(1, 0, 0, 1, 100, 50)')
    expect(m).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 100, f: 50 })
    expect(matrixToString(m)).toBe('matrix(1, 0, 0, 1, 100, 50)')
  })

  it('returns identity for "none" and garbage', () => {
    expect(parseMatrixString('none')).toEqual(identityMatrix())
    expect(parseMatrixString('rotate(45deg)')).toEqual(identityMatrix())
  })

  it('preserves zero matrix scale components', () => {
    expect(parseMatrixString('matrix(0, 0, 0, 0, 10, 20)'))
      .toEqual({ a: 0, b: 0, c: 0, d: 0, e: 10, f: 20 })
  })

  it.each([
    'translate(-12.3456789px, 31.2345678px) scale(0.123456789)',
    'translate(1e-7px, -2.5e+2px) scale(3.25e-2)',
    'translate(0, 0) scale(0)',
    'scale(-1.5)',
    'none',
  ])('resolves %s without geometry or computed-style reads', transform => {
    const element = document.createElement('div')
    const bounds = vi.spyOn(element, 'getBoundingClientRect')
    const computed = vi.spyOn(window, 'getComputedStyle')
    const matrix = readTransitionMatrix(element, '13.5px 29.25px', transform)
    const native = new DOMMatrix(transform)
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) {
      // Browsers parse some CSS matrix components at float32 precision.
      expect(matrix[key]).toBeCloseTo(native[key], 5)
    }
    expect(element.style.transformOrigin.split(' ').slice(0, 2)).toEqual(['13.5px', '29.25px'])
    expect(bounds).not.toHaveBeenCalled()
    expect(computed).not.toHaveBeenCalled()
  })

  it('retains source precision before the browser paints the matrix', () => {
    const element = document.createElement('div')
    expect(readTransitionMatrix(element, '0 0', 'translate(-12.345678901234px, 31.234567890123px) scale(0.12345678901234)'))
      .toEqual({ a: 0.12345678901234, b: 0, c: 0, d: 0.12345678901234, e: -12.345678901234, f: 31.234567890123 })
  })

  it.each([
    'translate(25%, -10%) scale(1.25)',
    'translate(calc(25% + 3px), 2em) scale(0.75)',
    'scale(2) translate(13px, 7px)',
    'rotate(90deg)',
  ])('preserves browser fallback for %s', transform => {
    const element = document.createElement('div')
    element.style.cssText = 'width: 240px; height: 160px; font-size: 10px'
    document.body.append(element)
    try {
      const bounds = vi.spyOn(element, 'getBoundingClientRect')
      const actual = readTransitionMatrix(element, '31px 17px', transform)
      const native = new DOMMatrix(getComputedStyle(element).transform)
      for (const key of ['a', 'b', 'c', 'd', 'e', 'f']) {
        expect(actual[key]).toBeCloseTo(native[key], 6)
      }
      expect(bounds).toHaveBeenCalledOnce()
    } finally { element.remove() }
  })

  it('uses author styles when the inline transform is empty', () => {
    const stylesheet = document.createElement('style')
    stylesheet.textContent = '.matrix-fallback-test { transform: translate(21px, 34px) scale(2) }'
    const element = document.createElement('div')
    element.className = 'matrix-fallback-test'
    document.body.append(stylesheet, element)
    try {
      expect(readTransitionMatrix(element, '0 0', ''))
        .toEqual({ a: 2, b: 0, c: 0, d: 2, e: 21, f: 34 })
    } finally { stylesheet.remove(); element.remove() }
  })

  it.each(['translate(8, 12) scale(2)', 'scale(1.)', 'translate(1px, 2px) garbage'])('leaves invalid CSS %s to the browser', transform => {
    const element = document.createElement('div')
    element.style.transform = 'translate(21px, 34px) scale(2)'
    document.body.append(element)
    try {
      expect(readTransitionMatrix(element, '0 0', transform))
        .toEqual({ a: 2, b: 0, c: 0, d: 2, e: 21, f: 34 })
    } finally { element.remove() }
  })

  it('interpolates between matrices with clamped t', () => {
    const from = identityMatrix()
    const to = { a: 3, b: 0, c: 0, d: 3, e: 100, f: 200 }
    expect(lerp(0, 10, 0.5)).toBe(5)
    const mid = interpolateMatrix(from, to, 0.5)
    expect(mid).toEqual({ a: 2, b: 0, c: 0, d: 2, e: 50, f: 100 })
    expect(interpolateMatrix(from, to, 2)).toEqual(to)
    expect(interpolateMatrix(from, to, -1)).toEqual(from)
  })
})
