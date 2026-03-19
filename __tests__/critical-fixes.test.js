/**
 * Tests for critical production fixes:
 * 1. destroy() — cleanup of listeners, timers, observers
 * 2. blockEvents safety timeout — prevents permanent UI freeze
 * 3. Error recovery in _doZoomIn — DOM rollback on geometry failure
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Zumly } from '../src/zumly.js'

const homeView = '<div class="z-view"><span class="zoom-me" data-to="detail">Go</span></div>'
const detailView = '<div class="z-view"><p>Detail</p><span class="zoom-me" data-to="nested">Nested</span></div>'
const nestedView = '<div class="z-view"><p>Nested</p></div>'

function createApp (opts = {}) {
  return new Zumly({
    mount: '.canvas',
    initialView: 'home',
    views: { home: homeView, detail: detailView, nested: nestedView },
    transitions: { driver: 'none', duration: '0s', ease: 'linear' },
    ...opts,
  })
}

// ─── destroy() ─────────────────────────────────────────────────────

describe('destroy()', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="canvas zumly-canvas"></div>'
  })

  it('sets _destroyed flag and isValid to false', async () => {
    const app = createApp()
    await app.init()
    expect(app._destroyed).toBe(false)
    expect(app.isValid).toBe(true)

    app.destroy()
    expect(app._destroyed).toBe(true)
    expect(app.isValid).toBe(false)
  })

  it('clears internal state arrays', async () => {
    const app = createApp()
    await app.init()
    await app.zoomTo('detail')
    expect(app.storedViews.length).toBeGreaterThan(0)
    expect(app.storedPreviousScale.length).toBeGreaterThan(1)

    app.destroy()
    expect(app.storedViews).toHaveLength(0)
    expect(app.storedPreviousScale).toEqual([1])
    expect(app.currentStage).toBeNull()
    expect(app.lateralHistory).toHaveLength(0)
  })

  it('nullifies prefetcher and transitionDriver', async () => {
    const app = createApp()
    await app.init()
    expect(app.prefetcher).toBeTruthy()
    expect(app.transitionDriver).toBeTruthy()

    app.destroy()
    expect(app.prefetcher).toBeNull()
    expect(app.transitionDriver).toBeNull()
  })

  it('removes tabindex from canvas', async () => {
    const app = createApp()
    await app.init()
    expect(app.canvas.getAttribute('tabindex')).toBe('0')

    app.destroy()
    expect(app.canvas.getAttribute('tabindex')).toBeNull()
  })

  it('is idempotent — calling destroy() twice does not throw', async () => {
    const app = createApp()
    await app.init()
    app.destroy()
    expect(() => app.destroy()).not.toThrow()
  })

  it('prevents all public methods from operating after destroy', async () => {
    const app = createApp()
    await app.init()
    app.destroy()

    // None of these should throw
    await expect(app.init()).resolves.toBeUndefined()
    await expect(app.zoomTo('detail')).resolves.toBeUndefined()
    await expect(app.goTo('detail')).resolves.toBeUndefined()
    expect(() => app.back()).not.toThrow()
    expect(() => app.zoomOut()).not.toThrow()
  })

  it('click events on canvas do nothing after destroy', async () => {
    const app = createApp()
    await app.init()
    const trigger = app.canvas.querySelector('.zoom-me')
    app.destroy()

    // Simulate click — should not throw or navigate
    const event = new MouseEvent('mouseup', { bubbles: true })
    expect(() => trigger.dispatchEvent(event)).not.toThrow()
  })

  it('disconnects ResizeObserver', async () => {
    const app = createApp()
    await app.init()
    const observer = app._resizeObserver
    if (observer) {
      const disconnectSpy = vi.spyOn(observer, 'disconnect')
      app.destroy()
      expect(disconnectSpy).toHaveBeenCalled()
    } else {
      // ResizeObserver may not exist in test environment — just verify no throw
      app.destroy()
    }
  })

  it('clears pending timers', async () => {
    const app = createApp()
    await app.init()
    // Trigger a resize debounce
    app._handleResize()
    expect(app._resizeDebounceTimer).not.toBeNull()

    app.destroy()
    expect(app._resizeDebounceTimer).toBeNull()
  })
})

// ─── blockEvents safety timeout ────────────────────────────────────

describe('blockEvents safety timeout', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="canvas zumly-canvas"></div>'
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('_setBlockEvents sets blockEvents true and starts safety timer', () => {
    const app = createApp()
    app._setBlockEvents()
    expect(app.blockEvents).toBe(true)
    expect(app._blockEventsSafetyTimer).not.toBeNull()
  })

  it('safety timer resets blockEvents after timeout', async () => {
    const app = createApp()
    await app.init()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    app._setBlockEvents()
    expect(app.blockEvents).toBe(true)

    // Advance past safety timeout (8 seconds)
    vi.advanceTimersByTime(8001)

    expect(app.blockEvents).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('safety timer is cleared when driver completes normally', async () => {
    const app = createApp()
    await app.init()

    app._setBlockEvents()
    const timerId = app._blockEventsSafetyTimer
    expect(timerId).not.toBeNull()

    // Simulate normal driver completion
    app.blockEvents = false
    app._onTransitionComplete()

    expect(app._blockEventsSafetyTimer).toBeNull()
  })

  it('safety timer does not fire after destroy', async () => {
    const app = createApp()
    await app.init()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    app._setBlockEvents()
    app.destroy()

    vi.advanceTimersByTime(10000)
    // blockEvents was reset by destroy(), and the destroyed flag prevents the callback
    expect(app.blockEvents).toBe(false)
    warnSpy.mockRestore()
  })

  it('with a hanging custom driver, safety timeout rescues the UI', async () => {
    document.body.innerHTML = '<div class="canvas zumly-canvas"></div>'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Custom driver that NEVER calls onComplete
    const hangingDriver = (spec, onComplete) => {
      // Intentionally not calling onComplete()
    }

    const app = new Zumly({
      mount: '.canvas',
      initialView: 'home',
      views: { home: homeView, detail: detailView },
      transitions: { driver: hangingDriver, duration: '100ms' },
    })
    await app.init()

    await app.zoomTo('detail')
    expect(app.blockEvents).toBe(true)

    vi.advanceTimersByTime(8001)
    expect(app.blockEvents).toBe(false)

    warnSpy.mockRestore()
  })
})

// ─── Error recovery in _doZoomIn ───────────────────────────────────

describe('_doZoomIn error recovery', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="canvas zumly-canvas"></div>'
  })

  it('recovers when getBoundingClientRect throws during geometry computation', async () => {
    const app = createApp()
    await app.init()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const storedViewsBefore = app.storedViews.length
    const trigger = app.canvas.querySelector('.zoom-me[data-to="detail"]')

    // Fail inside _doZoomIn try {} (after canvas + trigger + currentView rects): 4th call is previousView
    const originalGetBCR = HTMLElement.prototype.getBoundingClientRect
    let callCount = 0
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      callCount++
      if (callCount > 3) {
        throw new Error('Simulated getBoundingClientRect failure')
      }
      return originalGetBCR.call(this)
    })

    await app.zoomIn(trigger)

    // Verify recovery:
    // 1. The current view should still be 'home' (zoom was aborted)
    expect(app.getCurrentViewName()).toBe('home')
    // 2. storedViews should not have grown
    expect(app.storedViews.length).toBe(storedViewsBefore)
    // 3. The previous view should still have is-current-view class
    const currentView = app.canvas.querySelector('.is-current-view')
    expect(currentView).toBeTruthy()
    // 4. blockEvents should not be stuck
    expect(app.blockEvents).toBe(false)
    // 5. The new view element should have been removed from canvas
    const detailInCanvas = app.canvas.querySelector('[data-view-name="detail"]')
    expect(detailInCanvas).toBeNull()

    vi.restoreAllMocks()
    errorSpy.mockRestore()
  })

  it('after error recovery, subsequent zoom still works', async () => {
    const app = createApp()
    await app.init()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const trigger = app.canvas.querySelector('.zoom-me[data-to="detail"]')

    const originalGetBCR = HTMLElement.prototype.getBoundingClientRect
    let callCount = 0
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      callCount++
      if (callCount === 4) {
        throw new Error('Simulated failure')
      }
      return originalGetBCR.call(this)
    })

    await app.zoomIn(trigger)
    expect(app.getCurrentViewName()).toBe('home')

    vi.restoreAllMocks()

    await app.zoomIn(trigger)
    expect(app.getCurrentViewName()).toBe('detail')

    errorSpy.mockRestore()
  })

  it('async fetch followed by destroy does not throw', async () => {
    // Verify that if the instance is destroyed while prefetcher.get() is pending,
    // _doZoomIn bails out gracefully.
    const app = createApp()
    await app.init()

    // Start zoom, then destroy before it completes
    const zoomPromise = app.zoomTo('detail')
    app.destroy()

    await expect(zoomPromise).resolves.toBeUndefined()
  })
})

// ─── destroyed guard on all public methods ─────────────────────────

describe('destroyed instance guards', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="canvas zumly-canvas"></div>'
  })

  it('zoomIn on destroyed instance is a no-op', async () => {
    const app = createApp()
    await app.init()
    const trigger = app.canvas.querySelector('.zoom-me')
    app.destroy()
    // Should not throw
    await app.zoomIn(trigger)
  })

  it('event handlers on destroyed instance are no-ops', async () => {
    const app = createApp()
    await app.init()
    app.destroy()
    // Manually call event handlers — should not throw
    expect(() => app.onZoom({ target: document.createElement('div'), stopPropagation: () => {} })).not.toThrow()
    expect(() => app.onKeyUp({ key: 'ArrowLeft', preventDefault: () => {} })).not.toThrow()
    expect(() => app.onWeel({ deltaY: 10 })).not.toThrow()
  })
})
