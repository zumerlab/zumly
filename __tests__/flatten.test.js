/**
 * flatten: views behind are shown as a SnapDOM photo while the real content keeps its layout.
 * Most tests use a fake snapdom that returns a canvas at once; one runs the real SnapDOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { snapdom as realSnapdom } from '@zumer/snapdom'
import { stream as realStream } from '@zumer/snapdom-plugins/stream'
import { Zumly } from '../src/zumly.js'
import { animeDriver, gsapDriver, motionDriver } from '../src/drivers/index.js'
import '../src/style.css'

const trigger = (to, left) => `<div class="zoom-me" data-to="${to}" style="position:absolute;left:${left}px;top:100px;width:80px;height:60px">${to}</div>`
const view = (name, triggers = [], attrs = '', extra = '') =>
  `<div class="z-view" ${attrs} style="width:400px;height:300px;border:4px solid teal;background:#123">${triggers.map((t, i) => trigger(t, 40 + i * 160)).join('')}${extra}<p class="text">${name}</p></div>`
/** Whether Zumly logged a warning containing this text. */
const warned = text => warn.mock.calls.some(args => args.join(' ').includes(text))

const views = {
  home: view('home', ['a', 'b']),
  a: view('a', ['c']),
  b: view('b', ['c']),
  c: view('c', ['d']),
  d: view('d')
}

let app
let snapdom
let warn

/** A snapdom that answers at once with a canvas the size of the element. */
function fakeSnapdom () {
  return vi.fn(async (element) => ({
    async toCanvas () {
      const canvas = document.createElement('canvas')
      canvas.width = element.offsetWidth
      canvas.height = element.offsetHeight
      canvas.dataset.photoOf = element.dataset.viewName
      return canvas
    }
  }))
}

/**
 * A stream stand-in: a canvas the size of the element, ready at once. frame() reports a
 * repaint to the caller, as the real plugin does after each one.
 */
function fakeStream () {
  const streams = []
  const fn = vi.fn((element, options) => {
    const canvas = document.createElement('canvas')
    canvas.width = element.offsetWidth
    canvas.height = element.offsetHeight
    const handle = {
      element,
      options,
      canvas,
      stats: {},
      stop: vi.fn(),
      frame: (frame) => options.onFrame?.({ full: false, reason: null, rects: [], ms: 5, canvas, ...frame })
    }
    handle.ready = Promise.resolve().then(() => handle.frame({ full: true, reason: 'start', ms: 0 }))
    streams.push(handle)
    return handle
  })
  fn.streams = streams
  return fn
}

beforeEach(() => {
  document.body.innerHTML = '<div class="canvas zumly-canvas" style="width:800px;height:600px"></div>'
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  app?.destroy()
  app = null
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function start ({ flatten = {}, transitions = {}, ...options } = {}) {
  snapdom = fakeSnapdom()
  app = new Zumly({
    mount: '.canvas',
    initialView: 'home',
    views,
    transitions: { driver: 'none', duration: '40ms', ease: 'linear', effects: ['blur(3px)', 'blur(8px)'], ...transitions },
    flatten: flatten === false ? false : { snapdom, minNodes: 0, ...flatten },
    ...options
  })
  await app.init()
  return app
}

const role = name => app.canvas.querySelector(`:scope > .is-${name}-view`)
const named = name => app.canvas.querySelector(`:scope > .z-view[data-view-name="${name}"]`)
const layer = el => el?.querySelector(':scope > .z-flat-layer') || null
const isFlat = el => !!el?.classList.contains('z-flat')
const settled = () => expect.poll(() => app.blockEvents).toBe(false)
/** Wait until the current view has been photographed (the capture waits for quiet and idle). */
const photographed = async (el = role('current')) => {
  await vi.waitFor(() => expect(snapdom.mock.calls.some(([target]) => target === el)).toBe(true), { timeout: 3000, interval: 20 })
  await new Promise(resolve => setTimeout(resolve, 0))
}
async function zoomInto (name) {
  await photographed()
  await app.zoomIn(role('current').querySelector(`.zoom-me[data-to="${name}"]`))
  await settled()
}

describe('flatten', () => {
  it('shows a photo of the view that moves behind; its content keeps its layout', async () => {
    await start()
    await zoomInto('a')
    const home = role('previous')
    expect(isFlat(home)).toBe(true)
    expect(layer(home)?.dataset.photoOf).toBe('home')
    // Hidden but laid out: geometry and sibling hit-tests still read it.
    const text = home.querySelector('.text')
    expect(getComputedStyle(text).visibility).toBe('hidden')
    expect(text.getBoundingClientRect().width).toBeGreaterThan(0)
    // The photo covers the border box; the border stays real, the background is in the photo.
    expect(layer(home).style.left).toBe('-4px')
    expect(layer(home).style.width).toBe(`${home.offsetWidth}px`)
    expect(getComputedStyle(home).borderTopWidth).toBe('4px')
    // Effects still apply, by CSS, to the view that holds the photo.
    await expect.poll(() => getComputedStyle(home).filter).toBe('blur(3px)')
    // The current view is live.
    expect(isFlat(role('current'))).toBe(false)
  })

  it('photographs at rest with fast: false and outlines left out, never during a transition', async () => {
    await start({ transitions: { driver: 'css', duration: '300ms' } })
    await photographed()
    const [, options] = snapdom.mock.calls[0]
    expect(options).toMatchObject({ fast: false, outerTransforms: false, outerShadows: false })
    expect(options.excludeStyleProps('outline-color')).toBe(true)
    expect(options.excludeStyleProps('color')).toBe(false)

    const calls = snapdom.mock.calls.length
    const zoom = app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(app.blockEvents).toBe(true)
    expect(snapdom.mock.calls.length).toBe(calls)
    await zoom
    await settled()
  })

  it('keeps the view live when the photo is not ready yet, and uses it once it is', async () => {
    await start()
    // Straight away: no photo yet, so nothing is flattened and nothing waits.
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await settled()
    expect(isFlat(role('previous'))).toBe(false)
    expect(getComputedStyle(role('previous').querySelector('.text')).visibility).toBe('visible')
    await zoomInto('c')
    expect(isFlat(named('a'))).toBe(true)
    expect(isFlat(named('home'))).toBe(false)
  })

  it('brings the real view back on zoom-out, crossfading from the photo', async () => {
    await start()
    await zoomInto('a')
    await zoomInto('c')
    expect(isFlat(role('previous'))).toBe(true)
    expect(isFlat(role('last'))).toBe(true)

    await app.zoomOut()
    await settled()
    const a = role('current')
    expect(a.dataset.viewName).toBe('a')
    expect(isFlat(a)).toBe(false)
    expect(getComputedStyle(a.querySelector('.text')).visibility).toBe('visible')
    // The photo fades out over the real view, then goes.
    await vi.waitFor(() => expect(layer(a)).toBeNull(), { timeout: 1000 })
    expect(isFlat(role('previous'))).toBe(true)
    await expect.poll(() => getComputedStyle(role('previous')).filter).toBe('blur(3px)')
  })

  it('takes a new photo on each visit', async () => {
    await start()
    await zoomInto('a')
    const home = named('home')
    const first = layer(home)
    await app.zoomOut()
    await settled()
    await vi.waitFor(() => expect(snapdom.mock.calls.filter(([el]) => el === home).length).toBe(2), { timeout: 3000 })
    await new Promise(resolve => setTimeout(resolve, 0))
    await app.zoomIn(home.querySelector('.zoom-me[data-to="a"]'))
    await settled()
    expect(layer(home)).not.toBe(first)
  })

  it.each([
    ['css'],
    ['waapi'],
    ['anime', () => animeDriver({ animate (target, options) { target.value = 1; options.onUpdate(); options.onComplete(); return { pause () {} } } })],
    ['motion', () => motionDriver({ animate (from, to, options) { options.onUpdate(1); return Promise.resolve() } })],
    ['gsap', () => gsapDriver(fakeGsap())]
  ])('works with the %s driver and leaves its transforms as they were', async (name, make) => {
    const driver = make ? make() : name
    // The same navigation without flatten gives the reference transforms.
    await start({ flatten: false, transitions: { driver } })
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await settled()
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="c"]'))
    await settled()
    const reference = [...app.canvas.querySelectorAll(':scope > .z-view')].map(el => el.style.transform)
    app.destroy()
    document.body.innerHTML = '<div class="canvas zumly-canvas" style="width:800px;height:600px"></div>'

    await start({ transitions: { driver: make ? make() : name } })
    await zoomInto('a')
    await zoomInto('c')
    expect(isFlat(role('previous'))).toBe(true)
    expect(isFlat(role('last'))).toBe(true)
    expect([...app.canvas.querySelectorAll(':scope > .z-view')].map(el => el.style.transform)).toEqual(reference)
    await app.zoomOut()
    await settled()
    expect(app.getCurrentViewName()).toBe('a')
    expect(isFlat(role('current'))).toBe(false)
  })

  it('moves to a sibling clicked on the photo of the parent', async () => {
    await start({ transitions: { driver: 'css' } })
    await zoomInto('a')
    const home = role('previous')
    expect(isFlat(home)).toBe(true)
    // The sibling trigger is hidden under the photo, but still laid out where it was.
    const r = home.querySelector('.zoom-me[data-to="b"]').getBoundingClientRect()
    app.canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }))
    await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('b'), { timeout: 2000 })
    await settled()
    expect(isFlat(role('previous'))).toBe(true)
    expect(isFlat(role('current'))).toBe(false)
    expect(app.canvas.querySelector(':scope > .z-view[data-view-name="a"]')).toBeNull()
  })

  it('does not flatten views that do not pay off, or that opt out', async () => {
    const light = Array.from({ length: 5 }, () => '<i></i>').join('')
    const heavy = Array.from({ length: 900 }, () => '<i></i>').join('')
    snapdom = fakeSnapdom()
    app = new Zumly({
      mount: '.canvas',
      initialView: 'light',
      views: {
        light: view('light', ['heavy'], '', light),
        heavy: view('heavy', ['glass'], '', heavy),
        glass: view('glass', ['opted'], '', '<div style="backdrop-filter:blur(4px);width:20px;height:20px"></div>'),
        opted: view('opted', ['framed'], 'data-flatten="false"', heavy),
        framed: view('framed', ['end'], '', `${heavy}<iframe></iframe>`),
        end: view('end')
      },
      transitions: { driver: 'none' },
      flatten: { snapdom }
    })
    await app.init()
    const visit = async (name) => {
      await new Promise(resolve => setTimeout(resolve, 600))
      await app.zoomIn(role('current').querySelector(`.zoom-me[data-to="${name}"]`))
      await settled()
    }
    await visit('heavy')
    await visit('glass')
    await visit('opted')
    await visit('framed')
    await visit('end')
    const photographedViews = snapdom.mock.calls.map(([el]) => el.dataset.viewName)
    expect(photographedViews).toEqual(['heavy', 'glass'])
    expect(isFlat(named('opted'))).toBe(false)
  })

  it('never shows a photo that no longer matches the view', async () => {
    await start()
    await photographed()
    const home = role('current')
    // Content that arrives after the photo (data loading, a value that changed).
    home.querySelector('.text').textContent = 'loaded later'
    await new Promise(resolve => setTimeout(resolve, 0))
    // Straight to the next view, before a new photo: the old one would open the zoom on old content.
    await app.zoomIn(home.querySelector('.zoom-me[data-to="a"]'))
    await settled()
    expect(isFlat(home)).toBe(false)
    expect(getComputedStyle(home.querySelector('.text')).visibility).toBe('visible')
  })

  it('takes a new photo once the view stops changing, and uses it', async () => {
    await start()
    await photographed()
    const home = role('current')
    home.querySelector('.text').textContent = 'loaded later'
    await vi.waitFor(() => expect(snapdom.mock.calls.length).toBe(2), { timeout: 3000 })
    await new Promise(resolve => setTimeout(resolve, 0))
    await app.zoomIn(home.querySelector('.zoom-me[data-to="a"]'))
    await settled()
    expect(isFlat(home)).toBe(true)
  })

  it('gives up on a view that never holds still', async () => {
    await start()
    const home = role('current')
    const text = home.querySelector('.text')
    // A value that changes faster than a photo can be taken.
    let n = 0
    const timer = setInterval(() => { text.textContent = String(n++) }, 20)
    try {
      await new Promise(resolve => setTimeout(resolve, 2500))
      // No photo is worth taking: it would be old before it is used.
      expect(snapdom.mock.calls.length).toBeLessThanOrEqual(3)
      await app.zoomIn(home.querySelector('.zoom-me[data-to="a"]'))
      await settled()
      expect(isFlat(home)).toBe(false)
    } finally {
      clearInterval(timer)
    }
  })

  describe('with stream', () => {
    async function startStreaming () {
      const stream = fakeStream()
      await start({ flatten: { stream } })
      await vi.waitFor(() => expect(stream.streams.length).toBe(1), { timeout: 3000, interval: 20 })
      await stream.streams[0].ready
      return stream
    }

    it('follows the current view and freezes a copy when the zoom starts', async () => {
      const stream = await startStreaming()
      const handle = stream.streams[0]
      const home = role('current')
      expect(handle.element).toBe(home)
      // Ten repaints a second at most: the photo is never more than 100 ms behind.
      expect(handle.options).toMatchObject({ fps: 10, animations: false, fast: false, outerTransforms: false })
      // No one-shot photos while a stream follows the view.
      expect(snapdom).not.toHaveBeenCalled()
      await app.zoomIn(home.querySelector('.zoom-me[data-to="a"]'))
      await settled()
      expect(handle.stop).toHaveBeenCalled()
      expect(isFlat(home)).toBe(true)
      // A canvas of its own: the stream may still draw into its canvas after stopping.
      expect(layer(home)).not.toBe(handle.canvas)
      expect(layer(home).width).toBe(handle.canvas.width)
    })

    it('follows the view again on each visit', async () => {
      const stream = await startStreaming()
      const home = role('current')
      await app.zoomIn(home.querySelector('.zoom-me[data-to="a"]'))
      await settled()
      await vi.waitFor(() => expect(stream.streams.length).toBe(2), { timeout: 3000 })
      expect(stream.streams[1].element).toBe(role('current'))
      await app.zoomOut()
      await settled()
      await vi.waitFor(() => expect(stream.streams.length).toBe(3), { timeout: 3000 })
      expect(stream.streams[2].element).toBe(home)
    })

    it('turns a stream off when it costs too much, and keeps that view live', async () => {
      const stream = await startStreaming()
      const handle = stream.streams[0]
      const home = role('current')
      // Full frames of 150 ms, five a second: most of the main thread.
      for (let i = 0; i < 8; i++) handle.frame({ full: true, reason: 'no host for <div>', ms: 150 })
      expect(handle.stop).toHaveBeenCalled()
      await app.zoomIn(home.querySelector('.zoom-me[data-to="a"]'))
      await settled()
      expect(isFlat(home)).toBe(false)
    })

    it('turns a stream off when one full frame is too slow for the device', async () => {
      const stream = await startStreaming()
      const handle = stream.streams[0]
      handle.frame({ full: true, reason: 'root resized', ms: 400 })
      expect(handle.stop).toHaveBeenCalled()
      await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
      await settled()
      expect(isFlat(named('home'))).toBe(false)
    })

    it('stops the stream on destroy', async () => {
      const stream = await startStreaming()
      app.destroy()
      expect(stream.streams[0].stop).toHaveBeenCalled()
      app = null
    })

    it('works with the real stream plugin', async () => {
      app = new Zumly({
        mount: '.canvas',
        initialView: 'home',
        views,
        transitions: { driver: 'none', effects: ['blur(3px)', 'blur(8px)'] },
        flatten: { snapdom: realSnapdom, stream: realStream, minNodes: 0 }
      })
      await app.init()
      const home = role('current')
      await vi.waitFor(() => expect(app._flattener.photos.has(home)).toBe(true), { timeout: 8000, interval: 50 })
      await app.zoomIn(home.querySelector('.zoom-me[data-to="a"]'))
      await settled()
      expect(isFlat(home)).toBe(true)
      const photo = layer(home)
      expect(photo.width).toBeGreaterThanOrEqual(400)
      const pixel = photo.getContext('2d').getImageData(Math.round(photo.width / 2), Math.round(photo.height * 0.9), 1, 1).data
      expect(pixel[3]).toBeGreaterThan(0)
    }, 15000)
  })

  it('keeps the parent a photo while a zoom-out gesture moves, and the view under it live', async () => {
    await start({ gestures: { follow: true } })
    await zoomInto('a')
    await photographed()
    const a = role('current')
    const wheel = deltaY => app.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }))
    const phases = []
    app.on('zoomOutProgress', e => phases.push(e.phase))
    const calls = snapdom.mock.calls.length
    wheel(30)
    // The view under the finger stays live; the parent coming back is a photo.
    expect(isFlat(a)).toBe(false)
    expect(isFlat(role('previous'))).toBe(true)
    // Released before the threshold: everything goes back, and no photo was taken meanwhile.
    await vi.waitFor(() => expect(phases).toContain('end'), { timeout: 3000 })
    expect(app.getCurrentViewName()).toBe('a')
    expect(isFlat(a)).toBe(false)
    expect(isFlat(role('previous'))).toBe(true)
    expect(snapdom.mock.calls.length).toBe(calls)
  })

  it('drops photos that no longer fit after a resize', async () => {
    snapdom = fakeSnapdom()
    app = new Zumly({
      mount: '.canvas',
      initialView: 'home',
      views: { ...views, home: view('home', ['a']).replace('width:400px;height:300px', 'width:50%;height:50%;position:absolute') },
      transitions: { driver: 'none' },
      flatten: { snapdom, minNodes: 0 }
    })
    await app.init()
    await zoomInto('a')
    const home = role('previous')
    expect(isFlat(home)).toBe(true)
    app.canvas.style.width = '600px'
    await vi.waitFor(() => expect(isFlat(home)).toBe(false), { timeout: 2000 })
  })

  it('cleans up on destroy: photos, listeners and pending captures', async () => {
    await start()
    await zoomInto('a')
    const home = role('previous')
    expect(isFlat(home)).toBe(true)
    const removed = vi.spyOn(window, 'removeEventListener')
    const calls = snapdom.mock.calls.length
    app.destroy()
    expect(isFlat(home)).toBe(false)
    expect(layer(home)).toBeNull()
    expect(removed.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(['pointerdown', 'keydown', 'wheel']))
    // The capture that was scheduled for the current view never runs.
    await new Promise(resolve => setTimeout(resolve, 700))
    expect(snapdom.mock.calls.length).toBe(calls)
    app = null
  })

  it('works without SnapDOM: a warning, and live views', async () => {
    const saved = globalThis.snapdom
    delete globalThis.snapdom
    try {
      app = new Zumly({ mount: '.canvas', initialView: 'home', views, transitions: { driver: 'none' }, flatten: true })
      await app.init()
      expect(warned('flatten needs SnapDOM')).toBe(true)
      await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
      await settled()
      expect(app.getCurrentViewName()).toBe('a')
      expect(app.canvas.querySelector('.z-flat')).toBeNull()
    } finally {
      if (saved) globalThis.snapdom = saved
    }
  })

  it('reads the global snapdom with flatten: true', async () => {
    const global = fakeSnapdom()
    globalThis.snapdom = global
    try {
      app = new Zumly({ mount: '.canvas', initialView: 'home', views, transitions: { driver: 'none' }, flatten: true })
      await app.init()
      // The default threshold skips these small views: the instance started, nothing to photograph.
      expect(app._flattener).toBeTruthy()
      expect(warned('flatten')).toBe(false)
    } finally {
      delete globalThis.snapdom
    }
  })

  it('keeps working when a capture fails', async () => {
    snapdom = vi.fn(async () => { throw new Error('boom') })
    app = new Zumly({ mount: '.canvas', initialView: 'home', views, transitions: { driver: 'none' }, flatten: { snapdom, minNodes: 0 } })
    await app.init()
    await vi.waitFor(() => expect(snapdom).toHaveBeenCalled(), { timeout: 3000 })
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await settled()
    expect(app.getCurrentViewName()).toBe('a')
    expect(isFlat(role('previous'))).toBe(false)
  })

  it('warns about wrong options and falls back', async () => {
    app = new Zumly({ mount: '.canvas', initialView: 'home', views, flatten: { snapdom: 'yes', stream: 'yes', minNodes: -1, scale: 9, speed: 1 } })
    for (const key of ['flatten.snapdom', 'flatten.stream', 'flatten.minNodes', 'flatten.scale', 'flatten.speed']) {
      expect(warned(key)).toBe(true)
    }
    expect(app.flatten).toMatchObject({ snapdom: null, stream: null, minNodes: 800, scale: 1 })
  })

  it('takes a real photo with SnapDOM', async () => {
    app = new Zumly({
      mount: '.canvas',
      initialView: 'home',
      views,
      transitions: { driver: 'none', effects: ['blur(3px)', 'blur(8px)'] },
      flatten: { snapdom: realSnapdom, minNodes: 0 }
    })
    await app.init()
    const home = role('current')
    await vi.waitFor(() => expect(app._flattener.photos.has(home)).toBe(true), { timeout: 8000, interval: 50 })
    await app.zoomIn(home.querySelector('.zoom-me[data-to="a"]'))
    await settled()
    expect(isFlat(home)).toBe(true)
    const photo = layer(home)
    expect(photo.width).toBeGreaterThanOrEqual(400)
    expect(photo.height).toBeGreaterThanOrEqual(300)
    // Not blank: the dark background of the view is in it.
    const pixel = photo.getContext('2d').getImageData(Math.round(photo.width / 2), Math.round(photo.height * 0.9), 1, 1).data
    expect(pixel[3]).toBeGreaterThan(0)
  }, 15000)
})

/** A GSAP stand-in: a timeline that jumps to the end on the next microtask. */
function fakeGsap () {
  return {
    set () {},
    timeline ({ onStart, onComplete }) {
      const tweens = []
      const tl = {
        fromTo (el, from, vars) { tweens.push({ el, vars }); return tl },
        to (el, vars) { tweens.push({ el, vars }); return tl },
        kill () {}
      }
      queueMicrotask(() => {
        onStart?.()
        for (const { el, vars } of tweens) {
          if (vars.transform !== undefined) el.style.transform = vars.transform
          if (vars.opacity !== undefined) el.style.opacity = String(vars.opacity)
        }
        onComplete()
      })
      return tl
    }
  }
}
