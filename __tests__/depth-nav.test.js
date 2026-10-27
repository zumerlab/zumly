/**
 * Tests for depthNav styles ('button', 'title', 'rings'), the rings fan and
 * the layout that keeps the depth button and the sibling bar apart.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import '../src/style.css'

const trigger = (to, left) => `<span class="zoom-me" data-to="${to}" style="position:absolute;left:${left}px;top:60px;width:80px;height:60px">${to}</span>`
const views = {
  home: `<div class="z-view" style="width:400px;height:300px">${trigger('sys', 40)}${trigger('b', 160)}${trigger('c', 280)}</div>`,
  sys: { title: 'Seguridad', render: () => `<div class="z-view" style="width:400px;height:300px">${trigger('log', 40)}</div>` },
  b: '<div class="z-view" style="width:400px;height:300px">b</div>',
  c: '<div class="z-view" style="width:400px;height:300px">c</div>',
  log: `<div class="z-view" data-title="Registro" style="width:400px;height:300px">${trigger('entry', 40)}</div>`,
  entry: '<div class="z-view" style="width:400px;height:300px">entry</div>'
}

function createApp (opts = {}, width = 800) {
  const mount = document.createElement('div')
  mount.className = 'zumly-canvas'
  mount.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:600px`
  document.body.appendChild(mount)
  return new Zumly({ mount, initialView: 'home', views, transitions: { driver: 'none', duration: '0s' }, lateralNav: false, ...opts })
}

async function down (app, ...names) {
  for (const name of names) await app.zoomIn(app.canvas.querySelector(`.is-current-view .zoom-me[data-to="${name}"]`))
}

const nav = app => app.canvas.querySelector(':scope > .z-depth-nav')
const pointer = (el, type, pointerType) => el.dispatchEvent(new PointerEvent(type, { bubbles: type !== 'pointerenter' && type !== 'pointerleave', pointerType }))

describe('depthNav styles', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it("defaults to 'button', and falls back to it on an unknown style", async () => {
    const app = createApp()
    await app.init()
    await down(app, 'sys')
    expect(nav(app).classList.contains('z-depth-nav--button')).toBe(true)
    expect(nav(app).querySelector('.z-nav-back .z-nav-icon .z-depth-ring')).not.toBeNull()
    app.destroy()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const odd = createApp({ depthNav: { style: 'blob' } })
    expect(odd.depthNav.style).toBe('button')
    warn.mockRestore()
    odd.destroy()
  })

  it("'title' shows the name of the view above and follows navigation", async () => {
    const app = createApp({ depthNav: { style: 'title' } })
    await app.init()
    await down(app, 'sys', 'log')
    const button = nav(app).querySelector('.z-nav-back--title')
    expect(button.querySelector('.z-nav-title').textContent).toBe('Seguridad')
    expect(button.querySelector('.z-depth-dot')).toBeTruthy()
    await app.zoomOut()
    expect(nav(app).querySelector('.z-nav-title').textContent).toBe('home')
    nav(app).querySelector('button').click()
    await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })

  it("'rings' draws a ring per level above, with per-level classes", async () => {
    const app = createApp({ depthNav: { style: 'rings' } })
    await app.init()
    await down(app, 'sys', 'log', 'entry')
    const rings = [...nav(app).querySelectorAll('.z-depth-rings .z-depth-ring')]
    expect(rings.map(r => r.dataset.view)).toEqual(['log', 'sys', 'home'])
    expect(rings[0].classList.contains('z-depth-ring--up-1')).toBe(true)
    expect(rings[2].classList.contains('z-depth-ring--depth-0')).toBe(true)
    const radii = rings.map(r => Number(r.getAttribute('r')))
    expect(radii[0]).toBeLessThan(radii[1])
    expect(radii[1]).toBeLessThan(radii[2])
    // A tap goes up one level
    nav(app).querySelector('.z-nav-back').click()
    await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('log'))
    expect(nav(app).querySelectorAll('.z-depth-rings .z-depth-ring')).toHaveLength(2)
    app.destroy()
  })

  it('opens the bands on hover and jumps several levels', async () => {
    const app = createApp({ depthNav: { style: 'rings' } })
    await app.init()
    await down(app, 'sys', 'log', 'entry')
    const fan = nav(app).querySelector('.z-depth-fan')
    expect(fan.hidden).toBe(true)
    pointer(nav(app), 'pointerenter', 'mouse')
    expect(fan.hidden).toBe(false)
    const bands = [...fan.querySelectorAll('.z-depth-band')]
    expect(bands.map(b => b.textContent)).toEqual(['Registro', 'Seguridad', 'home'])
    expect(bands[1].classList.contains('z-depth-band--up-2')).toBe(true)
    bands[2].click()
    await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('home'))
    expect(app.zoomLevel()).toBe(1)
    app.destroy()
  })

  it('opens on a long press without also going back', async () => {
    const app = createApp({ depthNav: { style: 'rings' } })
    await app.init()
    await down(app, 'sys', 'log')
    const button = nav(app).querySelector('.z-nav-back')
    pointer(button, 'pointerdown', 'touch')
    await new Promise(r => setTimeout(r, 520))
    pointer(button, 'pointerup', 'touch')
    button.click()
    expect(nav(app).querySelector('.z-depth-fan').hidden).toBe(false)
    await new Promise(r => setTimeout(r, 20))
    expect(app.getCurrentViewName()).toBe('log')
    app.destroy()
  })

  it('works from the keyboard without leaking arrows to the canvas', async () => {
    const app = createApp({ depthNav: { style: 'rings' } })
    await app.init()
    await down(app, 'sys', 'log')
    const button = nav(app).querySelector('.z-nav-back')
    button.focus()
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    button.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', bubbles: true }))
    const bands = nav(app).querySelectorAll('.z-depth-band')
    expect(document.activeElement).toBe(bands[0])
    bands[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    bands[0].dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(button)
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(nav(app).querySelector('.z-depth-fan').hidden).toBe(true)
    await new Promise(r => setTimeout(r, 20))
    expect(app.getCurrentViewName()).toBe('log')
    app.destroy()
  })

  it('grows the dot with a followed gesture', async () => {
    const app = createApp({ depthNav: { style: 'rings' }, gestures: { follow: true } })
    await app.init()
    await down(app, 'sys')
    for (let i = 0; i < 6; i++) app.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true }))
    expect(Number(nav(app).style.getPropertyValue('--z-grow'))).toBe(1)
    expect(nav(app).classList.contains('is-past-threshold')).toBe(true)
    await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })
})

describe('depth and lateral navigation together', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  const overlap = (a, b) => {
    const r1 = a.getBoundingClientRect()
    const r2 = b.getBoundingClientRect()
    return r1.left < r2.right && r2.left < r1.right && r1.top < r2.bottom && r2.top < r1.bottom
  }

  for (const width of [800, 380, 240]) {
    it(`do not overlap on a ${width}px canvas`, async () => {
      const app = createApp({ depthNav: { style: 'title' }, lateralNav: { mode: 'always' } }, width)
      await app.init()
      await down(app, 'sys')
      const lateral = app.canvas.querySelector(':scope > .z-lateral-nav')
      expect(lateral).toBeTruthy()
      expect(overlap(nav(app), lateral)).toBe(false)
      app.destroy()
    })
  }

  it('leaves the bar centered when they sit on different edges', async () => {
    const app = createApp({ depthNav: { style: 'title', position: 'top-left' }, lateralNav: { mode: 'always' } }, 380)
    await app.init()
    await down(app, 'sys')
    const lateral = app.canvas.querySelector(':scope > .z-lateral-nav')
    expect(lateral.style.getPropertyValue('--z-nav-shift-x')).toBe('')
    expect(lateral.style.getPropertyValue('--z-nav-shift-y')).toBe('')
    app.destroy()
  })
})
