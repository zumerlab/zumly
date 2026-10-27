/**
 * destroy() leaves the canvas as it was before the instance started: its
 * views and navigation UI go, content the host put there stays. React
 * StrictMode (mount, unmount, mount) and hot reload rely on it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { ZumlyRouter } from '../src/plugins/router.js'
import '../src/style.css'

const box = (left, to) => `<div class="zoom-me" data-to="${to}" style="position:absolute;left:${left}px;top:100px;width:60px;height:40px">${to}</div>`
const views = {
  home: `<div class="z-view" style="width:400px;height:300px">${box(20, 'a')}${box(120, 'b')}</div>`,
  a: `<div class="z-view" style="width:200px;height:150px">${box(10, 'deep')}<p>a</p></div>`,
  b: '<div class="z-view" style="width:200px;height:150px"><p>b</p></div>',
  deep: '<div class="z-view" style="width:100px;height:80px"><p>deep</p></div>'
}

let apps = []
let canvas

beforeEach(() => {
  document.body.innerHTML = '<div style="position:relative;width:400px;height:300px"><div class="canvas zumly-canvas"><p class="host-note">mine</p></div></div>'
  canvas = document.querySelector('.canvas')
  window.history.replaceState(null, '', '#')
})

afterEach(() => {
  for (const app of apps) app.destroy()
  apps = []
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '#')
  document.body.replaceChildren()
})

function create (options = {}) {
  const app = new Zumly({
    mount: canvas,
    initialView: 'home',
    views,
    transitions: { driver: 'none' },
    lateralNav: { mode: 'always' },
    ...options
  })
  apps.push(app)
  return app
}

const zviews = () => canvas.querySelectorAll(':scope > .z-view')

describe('destroy() cleans the canvas', () => {
  it('removes the views, the back button and the sibling bar, and keeps host content', async () => {
    const app = create()
    await app.init()
    await app.zoomIn(canvas.querySelector('[data-to="a"]'))
    await app.zoomIn(canvas.querySelector('[data-to="deep"]'))
    await app.back()
    await app.goTo('b', { mode: 'lateral' })
    expect(canvas.querySelector('.z-lateral-nav')).not.toBeNull()
    expect(canvas.querySelector('.z-depth-nav')).not.toBeNull()

    app.destroy()
    expect(zviews()).toHaveLength(0)
    expect(canvas.querySelector('.z-lateral-nav, .z-depth-nav')).toBeNull()
    expect([...canvas.children].map(el => el.className)).toEqual(['host-note'])
    expect(canvas.hasAttribute('role')).toBe(false)
    expect(canvas.hasAttribute('tabindex')).toBe(false)
  })

  it('removes kept-alive siblings and leaves a host .z-view alone', async () => {
    const own = document.createElement('div')
    own.className = 'z-view host-view'
    canvas.append(own)
    const app = create({ lateralNav: { keepAlive: true } })
    await app.init()
    await app.zoomTo('a')
    await app.goTo('b', { mode: 'lateral' })
    expect(canvas.querySelector('.is-lateral-hidden')).not.toBeNull()
    app.destroy()
    expect([...zviews()]).toEqual([own])
  })

  it('takes back the zumly-canvas class only when it added it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    canvas.classList.remove('zumly-canvas')
    const app = create()
    await app.init()
    expect(canvas.classList.contains('zumly-canvas')).toBe(true)
    app.destroy()
    expect(canvas.classList.contains('zumly-canvas')).toBe(false)
  })

  it('removes a view that was still loading', async () => {
    let resolve
    const app = create({ views: { ...views, slow: () => new Promise(r => { resolve = r }) } })
    await app.init()
    const navigation = app.zoomTo('slow')
    app.destroy()
    resolve('<div class="z-view"><p>slow</p></div>')
    await navigation
    await new Promise(r => setTimeout(r, 0))
    expect(zviews()).toHaveLength(0)
  })

  it('stops a multi-level zoom-out midway', async () => {
    const app = create({ transitions: { driver: 'waapi', duration: '400ms' } })
    await app.init()
    await app.zoomIn(canvas.querySelector('[data-to="a"]'))
    await app.zoomIn(canvas.querySelector('[data-to="deep"]'))
    const raf = vi.spyOn(window, 'cancelAnimationFrame')
    app.zoomOut(2)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    app.destroy()
    expect(zviews()).toHaveLength(0)
    expect(raf).toHaveBeenCalled()
  })
})

describe('React StrictMode: create, destroy, create on the same canvas', () => {
  async function strictMode (options = {}) {
    // The effect runs, its cleanup runs at once, and it runs again.
    const first = create(options)
    const firstInit = first.init()
    first.destroy()
    await firstInit
    const second = create(options)
    await second.init()
    return second
  }

  it('ends with exactly one set of views and working navigation', async () => {
    const app = await strictMode()
    expect(zviews()).toHaveLength(1)
    expect(canvas.querySelectorAll('[data-to="a"]')).toHaveLength(1)

    await app.zoomIn(canvas.querySelector('[data-to="a"]'))
    expect(app.getCurrentViewName()).toBe('a')
    expect(zviews()).toHaveLength(2)
    expect(canvas.querySelectorAll('.z-lateral-nav')).toHaveLength(1)
    expect(canvas.querySelectorAll('.z-depth-nav')).toHaveLength(1)

    canvas.querySelectorAll('.z-lateral-nav .z-nav-lat-dot')[1].click()
    await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('b'))
    await app.back()
    expect(app.getCurrentViewName()).toBe('a')
    canvas.querySelector('.z-depth-nav button').click()
    await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('home'))
    expect(zviews()).toHaveLength(1)
  })

  it('also when the first instance had finished starting and navigated', async () => {
    const first = create()
    await first.init()
    await first.zoomIn(canvas.querySelector('[data-to="a"]'))
    first.destroy()
    const second = create()
    await second.init()
    expect(zviews()).toHaveLength(1)
    expect(canvas.querySelector('.z-lateral-nav, .z-depth-nav')).toBeNull()
    await second.zoomIn(canvas.querySelector('[data-to="b"]'))
    expect(second.getCurrentViewName()).toBe('b')
    expect(zviews()).toHaveLength(2)
  })

  it('leaves one router listening', async () => {
    const first = create()
    first.use(ZumlyRouter)
    await first.init()
    await first.zoomIn(canvas.querySelector('[data-to="a"]'))
    first.destroy()
    const app = create()
    app.use(ZumlyRouter)
    await app.init()
    expect(window.location.hash).toBe('#/home')
    await app.zoomIn(canvas.querySelector('[data-to="b"]'))
    expect(window.location.hash).toBe('#/home/b')
    window.history.replaceState(null, '', '#/home')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('home'))
    expect(zviews()).toHaveLength(1)
    expect(first.getCurrentViewName()).toBe(null)
  })
})
