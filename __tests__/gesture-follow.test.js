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

  it('fades the view into its trigger as a released gesture lands', async () => {
    const app = await atDetail()
    const detail = app.canvas.querySelector('.is-current-view')
    for (let i = 0; i < 6; i++) wheel(app, 40)
    // Released past the threshold, the view finishes the way at opacity 0, as a zoom-out does.
    await until(() => expect(detail.getAnimations().some(a => a.effect.getKeyframes().at(-1).opacity === '0')).toBe(true))
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
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

describe('lateralNav.swipe', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  const siblingViews = {
    home: `<div class="z-view" style="width:400px;height:300px">
      ${['a', 'b', 'c'].map((n, i) => `<span class="zoom-me" data-to="${n}" style="position:absolute;left:${40 + i * 120}px;top:60px;width:80px;height:60px">${n}</span>`).join('')}
    </div>`,
    a: '<div class="z-view" style="width:400px;height:300px">a</div>',
    b: '<div class="z-view" style="width:400px;height:300px">b</div>',
    c: '<div class="z-view" style="width:400px;height:300px">c</div>'
  }

  async function atSibling (opts = {}) {
    const app = createApp({ views: siblingViews, gestures: undefined, ...opts })
    await app.init()
    await app.zoomTo('b')
    return app
  }

  const swipe = (app, from, to) => {
    touch(app, 'touchstart', [[from, 300]])
    touch(app, 'touchmove', [[(from + to) / 2, 300]])
    touch(app, 'touchend', [[to, 300]])
  }

  it('is off by default: a swipe left zooms out', async () => {
    const app = await atSibling()
    swipe(app, 600, 400)
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })

  it('moves to the next sibling on a swipe left and back on a swipe right', async () => {
    const app = await atSibling({ lateralNav: { swipe: true } })
    swipe(app, 600, 400)
    await until(() => expect(app.getCurrentViewName()).toBe('c'))
    expect(app.zoomLevel()).toBe(2)
    swipe(app, 300, 500)
    await until(() => expect(app.getCurrentViewName()).toBe('b'))
    swipe(app, 300, 500)
    await until(() => expect(app.getCurrentViewName()).toBe('a'))
    // No sibling before the first one: nothing happens
    swipe(app, 300, 500)
    await new Promise(r => setTimeout(r, 30))
    expect(app.getCurrentViewName()).toBe('a')
    app.destroy()
  })

  it('does not drive a followed zoom-out where siblings exist', async () => {
    const app = await atSibling({ lateralNav: { swipe: true }, gestures: { follow: true } })
    const progress = vi.fn()
    app.on('zoomOutProgress', progress)
    swipe(app, 700, 300)
    await until(() => expect(app.getCurrentViewName()).toBe('c'))
    expect(progress).not.toHaveBeenCalled()
    app.destroy()
  })

  it('still zooms out with a swipe where there are no siblings', async () => {
    const app = createApp({ lateralNav: { swipe: true }, gestures: undefined })
    await app.init()
    await app.zoomIn(app.canvas.querySelector('.zoom-me'))
    swipe(app, 600, 400)
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })

  it('respects data-no-swipe', async () => {
    const views = { ...siblingViews, b: '<div class="z-view" style="width:400px;height:300px"><div data-no-swipe style="position:absolute;inset:0"></div></div>' }
    const app = await atSibling({ views, lateralNav: { swipe: true } })
    const area = app.canvas.querySelector('[data-no-swipe]')
    const at = (type, x) => {
      const t = new Touch({ identifier: 0, target: area, screenX: x, screenY: 300, clientX: x, clientY: 300 })
      area.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }))
    }
    at('touchstart', 600); at('touchmove', 500); at('touchend', 400)
    await new Promise(r => setTimeout(r, 30))
    expect(app.getCurrentViewName()).toBe('b')
    app.destroy()
  })
})

describe('swipe from a screen edge', () => {
  const siblingViews = {
    ...views,
    home: `<div class="z-view" style="width:400px;height:300px">
      <span class="zoom-me" data-to="a" style="position:absolute;left:20px;top:60px;width:80px;height:60px">a</span>
      <span class="zoom-me" data-to="b" style="position:absolute;left:120px;top:60px;width:80px;height:60px">b</span>
    </div>`,
    a: '<div class="z-view" style="width:400px;height:300px"><p>a</p></div>',
    b: '<div class="z-view" style="width:400px;height:300px"><p>b</p></div>'
  }
  const right = () => window.innerWidth - 5

  beforeEach(() => { document.body.innerHTML = '' })

  it('keeps a swipe at either edge from the browser while there is a view to go back to', async () => {
    const app = await atDetail()
    expect(touch(app, 'touchstart', [[5, 300]]).defaultPrevented).toBe(true)
    touch(app, 'touchend', [[5, 300]])
    expect(touch(app, 'touchstart', [[right(), 300]]).defaultPrevented).toBe(true)
    touch(app, 'touchend', [[right(), 300]])
    expect(touch(app, 'touchstart', [[300, 300]]).defaultPrevented).toBe(false)
    touch(app, 'touchend', [[300, 300]])
    app.destroy()
  })

  it('leaves it to the browser at the root, where its back leaves the app', async () => {
    const app = createApp()
    await app.init()
    expect(touch(app, 'touchstart', [[5, 300]]).defaultPrevented).toBe(false)
    touch(app, 'touchend', [[5, 300]])
    app.destroy()
  })

  it('leaves the tap of a control at the edge alone', async () => {
    const detail = '<div class="z-view" style="width:400px;height:300px"><button style="position:absolute;inset:0">ok</button></div>'
    const app = await atDetail({ views: { ...views, detail } })
    const button = app.canvas.querySelector('button')
    const t = new Touch({ identifier: 0, target: button, screenX: 5, screenY: 300, clientX: 5, clientY: 300 })
    const event = new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t], changedTouches: [t] })
    button.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    app.destroy()
  })

  it('follows the finger to the right from the left edge', async () => {
    const app = await atDetail()
    const progress = []
    app.on('zoomOutProgress', e => progress.push(e))
    touch(app, 'touchstart', [[5, 300]])
    touch(app, 'touchmove', [[305, 300]])
    expect(progress.at(-1)).toMatchObject({ phase: 'move', source: 'swipe' })
    expect(progress.at(-1).progress).toBeGreaterThan(0.5)
    touch(app, 'touchend', [[305, 300]])
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })

  it('zooms out without gestures.follow', async () => {
    const app = await atDetail({ gestures: undefined })
    touch(app, 'touchstart', [[5, 300]])
    touch(app, 'touchend', [[300, 300]])
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })

  it('zooms out instead of moving between siblings', async () => {
    const app = createApp({ views: siblingViews, lateralNav: { swipe: true }, gestures: undefined })
    await app.init()
    await app.zoomIn(app.canvas.querySelectorAll('.zoom-me')[1])
    touch(app, 'touchstart', [[5, 300]])
    touch(app, 'touchend', [[300, 300]])
    await until(() => expect(app.getCurrentViewName()).toBe('home'))
    app.destroy()
  })

  it('does not zoom out on a touch that runs along the edge', async () => {
    const app = await atDetail({ gestures: undefined })
    touch(app, 'touchstart', [[5, 100]])
    touch(app, 'touchend', [[60, 400]])
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(app.getCurrentViewName()).toBe('detail')
    app.destroy()
  })
})
