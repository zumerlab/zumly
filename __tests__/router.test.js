/**
 * Tests for the hash router plugin (src/plugins/router.js).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { ZumlyRouter } from '../src/plugins/router.js'

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
})
