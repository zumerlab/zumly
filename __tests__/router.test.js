/**
 * Tests for the hash router plugin (src/plugins/router.js).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { ZumlyRouter } from '../src/plugins/router.js'
import { getDriver } from '../src/drivers/index.js'

const homeView = '<div class="z-view"><span class="zoom-me" data-to="detail">Go</span><span class="zoom-me" data-to="other">Other</span></div>'
const detailView = '<div class="z-view"><p>Detail</p></div>'
const otherView = '<div class="z-view"><p>Other</p></div>'

function createApp (opts = {}) {
  return new Zumly({
    mount: '.canvas',
    initialView: 'home',
    views: { home: homeView, detail: detailView, other: otherView },
    transitions: { driver: 'none', duration: '0s' },
    ...opts,
  })
}

describe('ZumlyRouter plugin', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="canvas zumly-canvas"></div>'
    window.history.replaceState(null, '', '#')
  })

  afterEach(() => {
    window.history.replaceState(null, '', '#')
  })

  it('sets the initial hash on init()', async () => {
    const app = createApp()
    app.use(ZumlyRouter)
    await app.init()
    expect(window.location.hash).toBe('#/home')
    app.destroy()
  })

  it('pushes the path on zoom-in and rewrites it on zoom-out', async () => {
    const app = createApp()
    app.use(ZumlyRouter)
    await app.init()

    await app.zoomTo('detail')
    expect(window.location.hash).toBe('#/home/detail')

    app.zoomOut()
    expect(window.location.hash).toBe('#/home')
    app.destroy()
  })

  it('updates the hash on lateral navigation', async () => {
    const app = createApp()
    app.use(ZumlyRouter)
    await app.init()
    await app.zoomTo('detail')

    await app.goTo('other', { mode: 'lateral' })
    expect(window.location.hash).toBe('#/home/other')
    app.destroy()
  })

  it('honors custom separator and prefix', async () => {
    const app = createApp()
    app.use(ZumlyRouter, { separator: '.', prefix: '!' })
    await app.init()
    await app.zoomTo('detail')
    expect(window.location.hash).toBe('#!home.detail')
    app.destroy()
  })

  it('stops updating the hash after destroy()', async () => {
    const app = createApp()
    app.use(ZumlyRouter)
    await app.init()
    await app.zoomTo('detail')
    app.destroy()

    window.history.replaceState(null, '', '#/somewhere-else')
    // A second instance without the router must not touch the hash
    document.body.innerHTML = '<div class="canvas zumly-canvas"></div>'
    const app2 = createApp()
    await app2.init()
    await app2.zoomTo('detail')
    expect(window.location.hash).toBe('#/somewhere-else')
    app2.destroy()
  })

  it('installs immediately when used after init()', async () => {
    const app = createApp()
    await app.init()
    app.use(ZumlyRouter)
    expect(window.location.hash).toBe('#/home')
    app.destroy()
  })

  it('awaits every zoom-out in a history jump without rewriting browser history', async () => {
    const app = createApp()
    app.use(ZumlyRouter)
    await app.init()
    await app.zoomTo('detail')
    await app.zoomTo('other')
    const pending = []
    const none = getDriver('none')
    app.transitionDriver = {
      runTransition (spec, complete) { pending.push(() => none.runTransition(spec, complete)) },
    }
    window.history.replaceState(null, '', '#/home')
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')
    try {
      window.dispatchEvent(new PopStateEvent('popstate'))
      await vi.waitFor(() => expect(pending).toHaveLength(1))
      pending.shift()()
      await vi.waitFor(() => expect(pending).toHaveLength(1))
      expect(app.getCurrentViewName()).toBe('detail')
      expect(window.location.hash).toBe('#/home')
      pending.shift()()
      await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('home'))
      expect(app.getZoomLevel()).toBe(1)
      expect(push).not.toHaveBeenCalled()
      expect(replace).not.toHaveBeenCalled()
    } finally {
      push.mockRestore(); replace.mockRestore(); app.destroy()
    }
  })

  it('waits for a running navigation and consumes the latest popstate target', async () => {
    const app = createApp()
    app.use(ZumlyRouter)
    await app.init()
    await app.zoomTo('detail')
    const pending = []
    const none = getDriver('none')
    app.transitionDriver = {
      runTransition (spec, complete) { pending.push(() => none.runTransition(spec, complete)) },
    }
    try {
      const navigation = app.zoomTo('other')
      await vi.waitFor(() => expect(pending).toHaveLength(1))
      window.history.replaceState(null, '', '#/home/detail')
      window.dispatchEvent(new PopStateEvent('popstate'))
      window.history.replaceState(null, '', '#/home')
      window.dispatchEvent(new PopStateEvent('popstate'))
      pending.shift()()
      await navigation
      for (let i = 0; i < 2; i++) {
        await vi.waitFor(() => expect(pending).toHaveLength(1))
        pending.shift()()
      }
      await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('home'))
      expect(window.location.hash).toBe('#/home')
    } finally { app.destroy() }
  })

  it('uses lateral back history without creating a forward entry', async () => {
    const app = createApp()
    app.use(ZumlyRouter)
    await app.init()
    await app.zoomTo('detail')
    await app.goTo('other', { mode: 'lateral' })
    try {
      window.history.replaceState(null, '', '#/home/detail')
      window.dispatchEvent(new PopStateEvent('popstate'))
      await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('detail'))
      expect(app.lateralHistory).toHaveLength(0)
      expect(window.location.hash).toBe('#/home/detail')
    } finally { app.destroy() }
  })

  it('consumes multiple lateral entries when browser history skips siblings', async () => {
    const app = createApp({ views: { home: homeView, detail: detailView, other: otherView, third: '<div class="z-view">Third</div>' } })
    app.use(ZumlyRouter)
    await app.init()
    await app.zoomTo('detail')
    await app.goTo('other', { mode: 'lateral' })
    await app.goTo('third', { mode: 'lateral' })
    try {
      window.history.replaceState(null, '', '#/home/detail')
      window.dispatchEvent(new PopStateEvent('popstate'))
      await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('detail'))
      expect(app.lateralHistory).toHaveLength(0)
      expect(window.location.hash).toBe('#/home/detail')
    } finally { app.destroy() }
  })
})
