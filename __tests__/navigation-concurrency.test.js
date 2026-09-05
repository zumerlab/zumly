import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { getDriver } from '../src/drivers/index.js'
import { createViewLifecycle } from '../src/view-lifecycle.js'

const view = '<div class="z-view" style="width:400px;height:300px"></div>'
let app

function createApp (options = {}) {
  app = new Zumly({
    mount: '.canvas', initialView: 'home',
    views: { home: view, a: view, b: view },
    transitions: { driver: 'none' },
    ...options,
  })
  return app
}

function controlledDriver () {
  const pending = []
  const none = getDriver('none')
  return {
    pending,
    driver (spec, complete) {
      pending.push({ complete, finish: () => none.runTransition(spec, complete) })
    },
  }
}

beforeEach(() => {
  document.body.innerHTML = '<div class="canvas zumly-canvas" style="width:800px;height:600px"></div>'
})
afterEach(() => { app?.destroy(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('navigation coordination', () => {
  it.each(['depth', 'lateral'])('locks %s navigation before resolving its view', async mode => {
    let resolveView
    const secondView = vi.fn(() => view)
    const control = controlledDriver()
    createApp({
      views: { home: view, a: () => new Promise(resolve => { resolveView = resolve }), b: secondView },
      transitions: { driver: control.driver },
    })
    await app.init()
    const navigation = app.goTo('a', { mode })
    expect(app.blockEvents).toBe(true)
    await app.goTo('b', { mode })
    expect(secondView).not.toHaveBeenCalled()
    resolveView(view)
    await vi.waitFor(() => expect(control.pending).toHaveLength(1))
    control.pending[0].finish()
    await navigation
    expect(app.getCurrentViewName()).toBe('a')
    expect(app.canvas.querySelectorAll('.is-current-view')).toHaveLength(1)
    expect(app.blockEvents).toBe(false)
  })

  it('waits for driver completion before allowing sequential depth, lateral, and back navigation', async () => {
    const control = controlledDriver()
    createApp({ transitions: { driver: control.driver } })
    await app.init()
    const steps = [
      [() => app.zoomTo('a'), 'a'],
      [() => app.goTo('b', { mode: 'lateral' }), 'b'],
      [() => app.back(), 'a'],
      [() => app.zoomOut(), 'home'],
    ]
    for (const [start, expected] of steps) {
      let settled = false
      const navigation = start().then(() => { settled = true })
      await vi.waitFor(() => expect(control.pending).toHaveLength(1))
      expect(settled).toBe(false)
      control.pending.shift().finish()
      await navigation
      expect(app.getCurrentViewName()).toBe(expected)
      expect(app.blockEvents).toBe(false)
    }
  })

  it('releases a pending view request on destroy and disposes a late result', async () => {
    let resolveView
    const cleanup = vi.fn()
    createApp({ views: {
      home: view,
      a: ({ onCleanup }) => {
        onCleanup(cleanup)
        return new Promise(resolve => { resolveView = resolve })
      },
    } })
    await app.init()
    const navigation = app.zoomTo('a')
    app.destroy()
    await navigation
    expect(cleanup).toHaveBeenCalledTimes(1)
    resolveView(view)
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1))
    expect(app.storedViews).toHaveLength(0)
    expect(app.canvas.querySelector('[data-view-name="a"]')).toBeNull()
  })

  it('releases a pending transition on destroy and ignores a late callback', async () => {
    const control = controlledDriver()
    createApp({ transitions: { driver: control.driver } })
    await app.init()
    const after = vi.fn()
    app.on('afterZoomIn', after)
    const navigation = app.zoomTo('a')
    await vi.waitFor(() => expect(control.pending).toHaveLength(1))
    app.destroy()
    await navigation
    control.pending[0].complete()
    expect(after).not.toHaveBeenCalled()
    expect(app.storedViews).toHaveLength(0)
  })

  it.each(['destroy', 'geometry failure'])('disposes detached deferred descendants after %s', async reason => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const cleanup = vi.fn()
    const child = document.createElement('span')
    const childLifecycle = createViewLifecycle()
    childLifecycle.onCleanup(cleanup)
    childLifecycle.attach(child)
    const shell = document.createElement('div')
    shell.append(child)
    createApp({ deferred: true, views: { home: view, a: () => shell } })
    await app.init()
    let observer
    if (reason === 'destroy') {
      observer = new MutationObserver(() => {
        if (app.canvas.querySelector('[data-view-name="a"]')) app.destroy()
      })
      observer.observe(app.canvas, { childList: true })
    } else {
      vi.spyOn(app.canvas.querySelector('.is-current-view'), 'getBoundingClientRect')
        .mockImplementation(() => { throw new Error('geometry failure') })
    }
    try {
      await app.zoomTo('a')
      await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1))
      expect(app.canvas.querySelector('[data-view-name="a"]')).toBeNull()
    } finally { observer?.disconnect() }
  })

  it('unlocks after a failed view and allows a subsequent navigation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    createApp({ views: { home: view, a: () => { throw new Error('failed view') }, b: view } })
    await app.init()
    await app.zoomTo('a')
    expect(app.blockEvents).toBe(false)
    expect(app.getCurrentViewName()).toBe('home')
    await app.zoomTo('b')
    expect(app.getCurrentViewName()).toBe('b')
  })

  it('preserves lateral history when a depth view fails to load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    createApp({ views: { home: view, a: view, b: () => { throw new Error('failed view') } } })
    await app.init()
    await app.goTo('a', { mode: 'lateral' })
    await app.zoomTo('b')
    expect(app.getCurrentViewName()).toBe('a')
    expect(app.lateralHistory).toHaveLength(1)
    await app.back()
    expect(app.getCurrentViewName()).toBe('home')
  })

  it('finishes with the none driver when a custom driver throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    createApp({ transitions: { driver: () => { throw new Error('failed driver') } } })
    await app.init()
    await app.zoomTo('a')
    expect(app.blockEvents).toBe(false)
    expect(app.canvas.querySelector('.is-current-view').dataset.viewName).toBe('a')
    await app.zoomOut()
    expect(app.getCurrentViewName()).toBe('home')
  })
})
