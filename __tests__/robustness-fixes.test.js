/**
 * Tests for runtime robustness fixes:
 * 1. _doZoomIn guard when no current view exists (+ .zoomed rollback)
 * 2. zoomOut stack/DOM sync when a driver never calls onComplete
 * 3. View resolution failures (init, zoomIn, lateral) + prefetcher retry
 * 4. touching flag reset after non-tap gestures
 * 5. Tracked timers cleared on destroy()
 * 6. Shared transform parser with exponent notation support
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { getDriver } from '../src/drivers/index.js'
import { parseTranslateScale, splitTranslate } from '../src/geometry.js'
import { scaleZumlyTransform } from '../src/resize-correction.js'

const homeView = '<div class="z-view"><span class="zoom-me" data-to="detail">Go</span><span class="zoom-me" data-to="other">Other</span></div>'
const detailView = '<div class="z-view"><p>Detail</p></div>'
const otherView = '<div class="z-view"><p>Other</p></div>'

function createApp (opts = {}) {
  return new Zumly({
    mount: '.canvas',
    initialView: 'home',
    views: { home: homeView, detail: detailView, other: otherView },
    transitions: { driver: 'none', duration: '0s', ease: 'linear' },
    ...opts,
  })
}

beforeEach(() => {
  document.body.innerHTML = '<div class="canvas zumly-canvas"></div>'
})

// ─── 1. Missing current view guard ─────────────────────────────────

describe('_doZoomIn missing current view guard', () => {
  it('aborts gracefully when the is-current-view marker was removed', async () => {
    const app = createApp()
    await app.init()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    app.canvas.querySelector('.is-current-view').classList.remove('is-current-view')

    await expect(app.zoomTo('detail')).resolves.toBeUndefined()
    // The freshly inserted view must not leak into the canvas
    expect(app.canvas.querySelector('[data-view-name="detail"]')).toBeNull()
    expect(app.storedViews).toHaveLength(1)
    expect(app.blockEvents).toBe(false)
    errorSpy.mockRestore()
  })

  it('removes the .zoomed marker from the trigger on abort', async () => {
    const app = createApp()
    await app.init()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const trigger = app.canvas.querySelector('.zoom-me[data-to="detail"]')

    app.canvas.querySelector('.is-current-view').classList.remove('is-current-view')
    await app.zoomIn(trigger)

    expect(trigger.classList.contains('zoomed')).toBe(false)
    errorSpy.mockRestore()
  })

  it('removes the .zoomed marker when geometry computation fails', async () => {
    const app = createApp()
    await app.init()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const trigger = app.canvas.querySelector('.zoom-me[data-to="detail"]')

    const originalGetBCR = HTMLElement.prototype.getBoundingClientRect
    let callCount = 0
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      callCount++
      if (callCount > 3) throw new Error('Simulated failure')
      return originalGetBCR.call(this)
    })

    await app.zoomIn(trigger)
    vi.restoreAllMocks()

    expect(trigger.classList.contains('zoomed')).toBe(false)
    expect(app.getCurrentViewName()).toBe('home')

    // A normal round trip still works after the aborted zoom
    await app.zoomIn(trigger)
    expect(app.getCurrentViewName()).toBe('detail')
    errorSpy.mockRestore()
  })
})

// ─── 2. zoomOut stack/DOM sync on hanging driver ───────────────────

describe('zoomOut pending completion on driver hang', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('safety timeout completes the pending zoom-out: stack matches DOM', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Real driver for zoom-in (applies end-state classes), hangs on zoom-out
    const none = getDriver('none')
    const hangOnZoomOut = (spec, onComplete) => {
      if (spec.type === 'zoomOut') return
      none.runTransition(spec, onComplete)
    }
    const app = createApp({ transitions: { driver: hangOnZoomOut, duration: '0s' } })
    await app.init()
    await app.zoomTo('detail')
    expect(app.storedViews).toHaveLength(2)

    app.zoomOut()
    expect(app.blockEvents).toBe(true)
    expect(app.storedViews).toHaveLength(2)

    vi.advanceTimersByTime(8001)

    expect(app.blockEvents).toBe(false)
    // Stack was popped by the pending completion, matching the already-swapped DOM
    expect(app.storedViews).toHaveLength(1)
    expect(app.getCurrentViewName()).toBe('home')
    expect(app.canvas.querySelector('.is-current-view').dataset.viewName).toBe('home')
    warnSpy.mockRestore()
  })

  it('a late driver onComplete after the safety timeout runs only once', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let lateComplete = null
    const none = getDriver('none')
    const captureOnZoomOut = (spec, onComplete) => {
      if (spec.type === 'zoomOut') {
        lateComplete = onComplete
      } else {
        none.runTransition(spec, onComplete)
      }
    }
    const app = createApp({ transitions: { driver: captureOnZoomOut, duration: '0s' } })
    await app.init()
    await app.zoomTo('detail')

    app.zoomOut()
    vi.advanceTimersByTime(8001)
    expect(app.storedViews).toHaveLength(1)

    // Driver wakes up late — must not pop a second time
    lateComplete()
    expect(app.storedViews).toHaveLength(1)
    expect(app.getCurrentViewName()).toBe('home')
    warnSpy.mockRestore()
  })
})

// ─── 3. View resolution failures ───────────────────────────────────

describe('view resolution failures', () => {
  it('init() with a failing initial view does not throw unhandled', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = new Zumly({
      mount: '.canvas',
      initialView: 'bad',
      views: { bad: async () => { throw new Error('boom') } },
      transitions: { driver: 'none' },
    })
    await expect(app.init()).resolves.toBeUndefined()
    expect(app.storedViews).toHaveLength(0)
    errorSpy.mockRestore()
  })

  it('zoomTo a rejecting view resolves, state intact, later zoom works', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = createApp({
      views: {
        home: homeView,
        detail: detailView,
        bad: async () => { throw new Error('boom') },
      },
    })
    await app.init()

    await expect(app.zoomTo('bad')).resolves.toBeUndefined()
    expect(app.getCurrentViewName()).toBe('home')
    expect(app.blockEvents).toBe(false)
    expect(app.storedViews).toHaveLength(1)

    await app.zoomTo('detail')
    expect(app.getCurrentViewName()).toBe('detail')
    errorSpy.mockRestore()
  })

  it('failed lateral navigation does not corrupt lateral history', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const app = createApp({
      views: {
        home: homeView,
        detail: detailView,
        other: otherView,
        bad: async () => { throw new Error('boom') },
      },
    })
    await app.init()
    await app.zoomTo('detail')
    const before = app.lateralHistory.length

    await app.goTo('bad', { mode: 'lateral' })

    expect(app.lateralHistory.length).toBe(before)
    expect(app.getCurrentViewName()).toBe('detail')
    // A working lateral still functions afterwards
    await app.goTo('other', { mode: 'lateral' })
    expect(app.getCurrentViewName()).toBe('other')
    expect(app.lateralHistory.length).toBe(before + 1)
    errorSpy.mockRestore()
  })

  it('prefetcher retries a cacheable view whose first fetch failed', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response('<div class="z-view">Remote</div>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }))
    const app = createApp({
      views: { home: homeView, remote: '/remote-view.html' },
    })
    await app.init()

    await expect(app.prefetcher.get('remote')).rejects.toThrow('network down')
    // Rejection must not stay stuck in the in-flight map: retry resolves
    const node = await app.prefetcher.get('remote')
    expect(node).toBeTruthy()
    expect(node.textContent).toBe('Remote')
    fetchSpy.mockRestore()
  })
})

// ─── 4. touching flag reset ────────────────────────────────────────

describe('touching flag reset', () => {
  it('resets after a swipe (non-tap) gesture', async () => {
    const app = createApp()
    await app.init()
    await app.zoomTo('detail')

    app.onTouchStart({ changedTouches: [{ screenX: 200, screenY: 200 }] })
    expect(app.touching).toBe(true)

    const target = app.canvas.querySelector('.is-current-view')
    app.onTouchEnd({
      changedTouches: [{ screenX: 100, screenY: 200 }],
      target,
      stopPropagation () {},
      preventDefault () {},
    })

    expect(app.touching).toBe(false)
  })

  it('resets even when the gesture arrives while events are blocked', async () => {
    const app = createApp()
    await app.init()

    app.onTouchStart({ changedTouches: [{ screenX: 50, screenY: 50 }] })
    app.blockEvents = true
    app.onTouchEnd({
      changedTouches: [{ screenX: 50, screenY: 50 }],
      target: app.canvas,
      stopPropagation () {},
      preventDefault () {},
    })
    app.blockEvents = false

    expect(app.touching).toBe(false)
  })
})

// ─── 5. Tracked timers cleared on destroy ──────────────────────────

describe('tracked timers on destroy', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('wheel cooldown timer is tracked and cleared by destroy()', async () => {
    const app = createApp()
    await app.init()
    await app.zoomTo('detail')

    app.onWheel({ deltaY: 10, preventDefault () {}, target: app.canvas })
    expect(app._wheelCooldown).toBe(true)
    expect(app._trackedTimers.size).toBeGreaterThan(0)

    app.destroy()
    expect(app._trackedTimers.size).toBe(0)

    // Nothing fires or throws after destroy
    expect(() => vi.advanceTimersByTime(20000)).not.toThrow()
  })

  it('driver onComplete after destroy() does not mutate state', async () => {
    let lateComplete = null
    const captureDriver = (spec, onComplete) => {
      if (spec.type === 'zoomIn') {
        lateComplete = onComplete
      } else {
        onComplete()
      }
    }
    const app = createApp({ transitions: { driver: captureDriver, duration: '0s' } })
    await app.init()
    await app.zoomTo('detail')
    expect(app.blockEvents).toBe(true)

    app.destroy()
    expect(app.storedViews).toHaveLength(0)

    // Late completion is inert: no throw, no state writes
    await expect(Promise.resolve(lateComplete())).resolves.toBeUndefined()
    expect(app.storedViews).toHaveLength(0)
    expect(app.currentStage).toBeNull()
  })
})

// ─── 6. Shared transform parser (exponent notation) ────────────────

describe('shared transform parser', () => {
  it('parseTranslateScale handles exponent notation', () => {
    const r = parseTranslateScale('translate(1.5e-7px, -2e+2px) scale(3e-1)')
    expect(r.tx).toBeCloseTo(1.5e-7)
    expect(r.ty).toBe(-200)
    expect(r.scale).toBeCloseTo(0.3)
  })

  it('parseTranslateScale still parses plain values', () => {
    const r = parseTranslateScale('translate(10px, -20.5px) scale(3)')
    expect(r).toEqual({ tx: 10, ty: -20.5, scale: 3 })
  })

  it('splitTranslate separates translate from the rest', () => {
    const r = splitTranslate('translate(5px, 6px) scale(2)')
    expect(r).toEqual({ tx: 5, ty: 6, rest: 'scale(2)', matched: true })
  })

  it('splitTranslate reports unmatched input', () => {
    const r = splitTranslate('scale(2)')
    expect(r.matched).toBe(false)
    expect(r.rest).toBe('scale(2)')
  })

  it('resize-corrected exponent transforms survive a round trip through geometry', () => {
    // A tiny translate serialized in exponent notation previously parsed as tx=0
    const corrected = scaleZumlyTransform('translate(1e-7px, 2px) scale(2)', 2, 2)
    const parsed = parseTranslateScale(corrected)
    expect(parsed.tx).toBeCloseTo(2e-7)
    expect(parsed.ty).toBe(4)
    expect(parsed.scale).toBe(2)
  })
})
