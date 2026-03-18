import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'

let homeView
let appMocked

beforeEach(() => {
  document.body.innerHTML = `
    <div class="first zumly-canvas"></div>
  `

  homeView = `<div class="z-view">
    <div class='card zoom-me' data-to='newView'></div>
  </div>`
  const newView = `<div class="z-view"><p>Detail</p></div>`

  appMocked = new Zumly({
    mount: '.first',
    initialView: 'homeView',
    views: { homeView, newView },
  })
})

describe('Zumly methods', () => {
  it('storeViews() should store views and notify', () => {
    appMocked.tracing = vi.fn()
    appMocked.storeViews('test')
    expect(appMocked.tracing).toHaveBeenCalledWith('storedViews()')
    expect(appMocked.storedViews).toContain('test')
  })

  it('setPreviousScale() should store scale and notify', () => {
    appMocked.tracing = vi.fn()
    expect(appMocked.storedPreviousScale.length).toBe(1)
    appMocked.setPreviousScale(1)
    expect(appMocked.tracing).toHaveBeenCalledWith('setPreviousScale()')
    expect(appMocked.storedPreviousScale.length).toBe(2)
  })

  it('tracing() should push to trace or reset on "ended"', () => {
    appMocked.debug = true
    appMocked.tracing('ended')
    expect(appMocked.trace).toHaveLength(0)
    appMocked.tracing('test')
    expect(appMocked.trace).toHaveLength(1)
  })

  it('notify() should not throw', () => {
    expect(() => appMocked.notify('alert', 'error')).not.toThrow()
  })

  it('zoomLevel() should return storedViews.length', () => {
    appMocked.storedViews = [{}, {}, {}, {}, {}, {}]
    expect(appMocked.zoomLevel()).toBe(6)
  })

  it('init() should call tracing with "init()"', async () => {
    appMocked.tracing = vi.fn()
    await appMocked.init()
    expect(appMocked.tracing).toHaveBeenCalledWith('init()')
  })

  it('zoomIn() should call tracing', async () => {
    await appMocked.init()
    const trigger = appMocked.canvas.querySelector('.zoom-me')
    expect(trigger).toBeTruthy()
    appMocked.tracing = vi.fn()
    await appMocked.zoomIn(trigger)
    expect(appMocked.tracing).toHaveBeenCalledWith('zoomIn()')
    expect(appMocked.tracing).toHaveBeenCalledWith('getView()')
  })

  it('zoomOut() should decrease storedViews when level > 1', async () => {
    document.body.innerHTML = '<div class="first zumly-canvas"></div>'
    const homeView = `<div class="z-view"><div class="card zoom-me" data-to="newView"></div></div>`
    const newView = `<div class="z-view"><p>Detail</p></div>`
    const app = new Zumly({
      mount: '.first',
      initialView: 'homeView',
      views: { homeView, newView },
      transitions: { duration: '0s', ease: 'linear' },
    })
    await app.init()
    const trigger = app.canvas.querySelector('.zoom-me')
    await app.zoomIn(trigger)
    // In headless, animationend may not fire; simulate post-zoom state so zoomOut can run
    const newCurrent = app.canvas.querySelector('.is-new-current-view')
    if (newCurrent) {
      newCurrent.classList.replace('is-new-current-view', 'is-current-view')
      newCurrent.classList.remove('zoom-current-view', 'has-no-events')
    }
    app.blockEvents = false
    const len = app.storedViews.length
    app.zoomOut()
    expect(app.storedViews.length).toBe(len - 1)
  })
})
