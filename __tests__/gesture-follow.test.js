/**
 * Tests for the zoom-out that follows a gesture (gestures.follow) and pinch input.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'

const views = {
  home: `<div class="z-view" style="width:400px;height:300px">
    <span class="zoom-me" data-to="detail" style="position:absolute;left:60px;top:60px;width:80px;height:60px;border-radius:50%">go</span>
  </div>`,
  detail: '<div class="z-view" style="width:400px;height:300px"><p>detail</p></div>'
}

function createApp (opts = {}) {
  const mount = document.createElement('div')
  mount.className = 'zumly-canvas'
  mount.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px'
  document.body.appendChild(mount)
  return new Zumly({
    mount,
    initialView: 'home',
    views,
    transitions: { driver: 'none', duration: '200ms', effects: ['blur(4px)', 'blur(8px)'] },
    gestures: { follow: true },
    ...opts
  })
}

async function atDetail (opts) {
  const app = createApp(opts)
  await app.init()
  await app.zoomIn(app.canvas.querySelector('.zoom-me'))
  return app
}

const scale = el => new DOMMatrix(getComputedStyle(el).transform).a
const wheel = (app, deltaY) => app.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }))
const until = (fn, timeout = 2000) => vi.waitFor(fn, { timeout, interval: 10 })

function touch (app, type, points) {
  const target = app.canvas.querySelector('.is-current-view') || app.canvas
  const touches = points.map(([x, y], identifier) => new Touch({ identifier, target, screenX: x, screenY: y, clientX: x, clientY: y }))
  const event = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : touches,
    targetTouches: type === 'touchend' ? [] : touches,
    changedTouches: touches
  })
  target.dispatchEvent(event)
  return event
}

describe('gestures.follow', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('is off by default: a wheel tick zooms out at once', async () => {
    const app = await atDetail({ gestures: undefined })
    wheel(app, 4)
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })

  it('moves the views with the wheel and reports progress', async () => {
    const app = await atDetail()
    const progress = []
    app.on('zoomOutProgress', e => progress.push(e))
    const current = app.canvas.querySelector('.is-current-view')
    const start = scale(current)
    wheel(app, 40)
    wheel(app, 40)
    expect(progress.map(e => e.phase)).toEqual(['start', 'move', 'move'])
    expect(progress[2].progress).toBeCloseTo(0.2, 5)
    expect(progress[0]).toMatchObject({ viewName: 'home', from: 'detail', source: 'wheel' })
    expect(scale(current)).toBeLessThan(start)
    // The previous view loses its blur along the way
    const previous = app.canvas.querySelector('.is-previous-view')
    expect(getComputedStyle(previous).filter).not.toBe('blur(4px)')
    app.destroy()
  })

  it('puts everything back when released before the threshold', async () => {
    const app = await atDetail()
    const current = app.canvas.querySelector('.is-current-view')
    const previous = app.canvas.querySelector('.is-previous-view')
    const before = [current.style.transform, getComputedStyle(current).transform, getComputedStyle(previous).transform]
    const phases = []
    app.on('zoomOutProgress', e => phases.push(e.phase))
    wheel(app, 30)
    wheel(app, 30)
    await until(() => expect(phases).toContain('end'))
    expect(phases).toContain('cancel')
    expect(app.getCurrentViewName()).toBe('detail')
    expect([current.style.transform, getComputedStyle(current).transform, getComputedStyle(previous).transform]).toEqual(before)
    expect(current.getAnimations()).toHaveLength(0)
    expect(app.blockEvents).toBe(false)
    app.destroy()
  })

  it('finishes the zoom-out when released past the threshold', async () => {
    const app = await atDetail()
    const after = vi.fn()
    app.on('afterZoomOut', after)
    for (let i = 0; i < 6; i++) wheel(app, 40)
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    expect(after).toHaveBeenCalledTimes(1)
    const home = app.canvas.querySelector('.is-current-view')
    expect(home.classList.contains('has-effect')).toBe(false)
    expect(app.canvas.querySelectorAll(':scope > .z-view')).toHaveLength(1)
    expect(home.getAnimations()).toHaveLength(0)
    app.destroy()
  })

  it('honors a custom threshold', async () => {
    const app = await atDetail({ gestures: { follow: true, threshold: 0.2 } })
    for (let i = 0; i < 3; i++) wheel(app, 40)
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })

  it('ignores the momentum tail after a released gesture', async () => {
    const app = await atDetail()
    for (let i = 0; i < 12; i++) wheel(app, 40)
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    await app.zoomIn(app.canvas.querySelector('.zoom-me'))
    // Late momentum events arrive while settling
    wheel(app, 10)
    expect(app.getCurrentViewName()).toBe('detail')
    app.destroy()
  })

  it('still zooms out at once on a mouse wheel notch', async () => {
    const app = await atDetail()
    wheel(app, 100)
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })

  it('rounds the view toward a round trigger', async () => {
    const app = await atDetail()
    const current = app.canvas.querySelector('.is-current-view')
    for (let i = 0; i < 4; i++) wheel(app, 40)
    expect(parseFloat(getComputedStyle(current).borderTopLeftRadius)).toBeGreaterThan(0)
    app.destroy()
  })

  it('follows a swipe to the left and cancels a short one', async () => {
    const app = await atDetail()
    const current = app.canvas.querySelector('.is-current-view')
    const start = scale(current)
    touch(app, 'touchstart', [[600, 300]])
    touch(app, 'touchmove', [[560, 302]])
    touch(app, 'touchmove', [[520, 304]])
    expect(scale(current)).toBeLessThan(start)
    // The finger rests before lifting, so this is no flick
    await new Promise(r => setTimeout(r, 150))
    touch(app, 'touchend', [[520, 304]])
    await until(() => expect(app.blockEvents).toBe(false))
    expect(app.getCurrentViewName()).toBe('detail')
    app.destroy()
  })

  it('flicks a short, fast swipe through', async () => {
    const app = await atDetail()
    touch(app, 'touchstart', [[600, 300]])
    touch(app, 'touchmove', [[580, 300]])
    await new Promise(r => setTimeout(r, 16))
    touch(app, 'touchmove', [[520, 300]])
    touch(app, 'touchend', [[520, 300]])
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })

  it('finishes a long swipe', async () => {
    const app = await atDetail()
    touch(app, 'touchstart', [[700, 300]])
    for (let x = 680; x >= 300; x -= 40) touch(app, 'touchmove', [[x, 300]])
    touch(app, 'touchend', [[300, 300]])
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })
})

describe('inputs.pinch', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('is off by default', async () => {
    const app = await atDetail({ gestures: undefined })
    touch(app, 'touchstart', [[300, 300], [500, 300]])
    touch(app, 'touchmove', [[380, 300], [420, 300]])
    touch(app, 'touchend', [[380, 300], [420, 300]])
    await new Promise(r => setTimeout(r, 50))
    expect(app.getCurrentViewName()).toBe('detail')
    app.destroy()
  })

  it('zooms out when two fingers close', async () => {
    const app = await atDetail({ gestures: undefined, inputs: { pinch: true } })
    touch(app, 'touchstart', [[300, 300], [500, 300]])
    const move = touch(app, 'touchmove', [[380, 300], [420, 300]])
    expect(move.defaultPrevented).toBe(true)
    touch(app, 'touchend', [[380, 300], [420, 300]])
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })

  it('follows the pinch with gestures.follow and does not tap afterwards', async () => {
    const app = await atDetail({ inputs: { pinch: true } })
    const current = app.canvas.querySelector('.is-current-view')
    const start = scale(current)
    touch(app, 'touchstart', [[300, 300], [500, 300]])
    touch(app, 'touchmove', [[330, 300], [470, 300]])
    expect(scale(current)).toBeLessThan(start)
    touch(app, 'touchmove', [[390, 300], [410, 300]])
    touch(app, 'touchend', [[390, 300], [410, 300]])
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    // Nothing zooms back in from the lifted fingers
    await new Promise(r => setTimeout(r, 50))
    expect(app.getCurrentViewName()).toBe('home')
    app.destroy()
  })
})
