/**
 * Tests for the public driver-helpers surface (src/drivers/driver-helpers.js),
 * exported as 'zumly/driver-helpers'.
 */
import { describe, it, expect, vi } from 'vitest'
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
    expect(el.style.transformOrigin).toBe('10px 20px')
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
