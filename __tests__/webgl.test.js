/**
 * webgl: zooms drawn in a WebGL canvas, the views behind as textures. Headless Chromium may
 * have no WebGL2: then the option leaves the views DOM, which is tested too. A fake snapdom
 * answers at once with a blank canvas, enough for the textures.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { parseEffect, EFFECTS } from '../src/webgl.js'
import '../src/style.css'

const hasWebGL2 = !!document.createElement('canvas').getContext('webgl2')

const trigger = (to, left) => `<div class="zoom-me" data-to="${to}" style="position:absolute;left:${left}px;top:100px;width:80px;height:60px">${to}</div>`
const view = (name, triggers = []) =>
  `<div class="z-view" style="width:400px;height:300px;background:#123">${triggers.map((t, i) => trigger(t, 40 + i * 160)).join('')}<p>${name}</p></div>`
const views = { home: view('home', ['a', 'b']), a: view('a', ['c']), b: view('b'), c: view('c') }

let app
let warn
const warned = text => warn.mock.calls.some(args => args.join(' ').includes(text))

function fakeSnapdom () {
  return vi.fn(async (element) => ({
    async toCanvas () {
      const canvas = document.createElement('canvas')
      canvas.width = element.offsetWidth + 2
      canvas.height = element.offsetHeight + 2
      return canvas
    }
  }))
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

async function start ({ webgl = true, flatten = {}, ...options } = {}) {
  app = new Zumly({
    mount: '.canvas',
    initialView: 'home',
    views,
    transitions: { driver: 'none', duration: '40ms', ease: 'linear', effects: ['blur(3px) brightness(.7)', 'blur(8px)'] },
    flatten: flatten === false ? false : { snapdom: fakeSnapdom(), minNodes: 0, ...flatten },
    webgl,
    ...options
  })
  await app.init()
  return app
}

const role = name => app.canvas.querySelector(`:scope > .is-${name}-view`)
const settled = () => expect.poll(() => app.blockEvents, { timeout: 3000 }).toBe(false)

describe('webgl: effect strings', () => {
  it('reads every function of a CSS filter string, in its units', () => {
    expect(parseEffect('blur(3px) brightness(70%) hue-rotate(.5turn) saturate(1.5)')).toEqual({ blur: 3, brightness: 0.7, 'hue-rotate': 180, saturate: 1.5 })
    expect(parseEffect('none')).toEqual({})
    expect(parseEffect('pixelate(10px) rubber(1)')).toEqual({ pixelate: 10, rubber: 1 })
  })

  it('takes up to four numbers in an effect, a #hex color as three', () => {
    expect(parseEffect('tint(#ff0066 .5) blur(2px)')).toEqual({ tint: [1, 0, 0.4, 0.5], blur: 2 })
    expect(parseEffect('wave(4px, 2, 30deg)')).toEqual({ wave: [4, 2, 30] })
    expect(parseEffect('tint(#f06)')).toEqual({ tint: [1, 0, 0.4] })
  })

  it('has CSS\'s filter functions, each with the value that leaves a view as it is', () => {
    for (const name of ['blur', 'brightness', 'contrast', 'saturate', 'grayscale', 'sepia', 'invert', 'opacity', 'hue-rotate']) {
      expect(typeof EFFECTS[name].none).toBe('number')
    }
    expect(EFFECTS.brightness.none).toBe(1)
    expect(EFFECTS.grayscale.none).toBe(0)
  })
})

describe('webgl: option', () => {
  it('needs flatten: without it, it is left out with a warning', async () => {
    await start({ flatten: false })
    expect(app.webgl).toBe(false)
    expect(app._webgl).toBeFalsy()
    expect(warned('needs flatten')).toBe(true)
  })

  it('takes effects as GLSL by name, and warns about anything else', async () => {
    await start({ webgl: { effects: { pixelate: { none: 0, uv: 'st = st;' } }, glass: true } })
    expect(app.webgl).toEqual({ effects: { pixelate: { none: 0, uv: 'st = st;' } }, glass: true, hover: false, ancestors: false })
    app.destroy()
    await start({ webgl: { effects: { bad: { uv: 1 } } } })
    expect(app.webgl.effects).toEqual({})
    expect(warned('webgl.effects')).toBe(true)
  })
})

describe.runIf(!hasWebGL2)('webgl without WebGL2', () => {
  it('leaves the views DOM and zooms as before', async () => {
    await start()
    expect(app._webgl).toBeNull()
    expect(app.canvas.querySelector('.z-gl')).toBeNull()
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await settled()
    expect(role('current').dataset.viewName).toBe('a')
    expect(app.canvas.querySelector('.z-gl-off')).toBeNull()
  })
})

describe.runIf(hasWebGL2)('webgl', () => {
  it('draws the views behind, hidden in the DOM, and only the current view stays DOM', async () => {
    await start()
    expect(app.canvas.querySelector(':scope > canvas.z-gl')).not.toBeNull()
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await settled()
    await expect.poll(() => role('previous').classList.contains('z-gl-off')).toBe(true)
    expect(role('current').classList.contains('z-gl-off')).toBe(false)
    expect(app.canvas.dataset.zGlMoving).toBeUndefined()
  })

  it('brings a view back to the DOM in front, and its effect without starting over', async () => {
    await start()
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await settled()
    await app.zoomOut()
    await settled()
    await expect.poll(() => app.canvas.querySelector('.z-gl-off')).toBeNull()
    expect(role('current').dataset.viewName).toBe('home')
  })

  it('moves to a sibling in WebGL, and keeps the view behind drawn', async () => {
    await start()
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await settled()
    await app.goTo('b')
    await settled()
    expect(role('current').dataset.viewName).toBe('b')
    await expect.poll(() => role('previous').classList.contains('z-gl-off')).toBe(true)
  })

  it('goes back to the DOM when its context is lost, and draws again when it comes back', async () => {
    await start()
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await settled()
    const lose = app._webgl.gl.getExtension('WEBGL_lose_context')
    lose.loseContext()
    await expect.poll(() => app._webgl.lost).toBe(true)
    expect(app.canvas.querySelector('.z-gl-off')).toBeNull()
    lose.restoreContext()
    await expect.poll(() => app._webgl.lost).toBe(false)
  })

  it('follows a zoom-out gesture: the views behind in WebGL, to the end or back', async () => {
    await start({ gestures: { follow: true } })
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await settled()
    await expect.poll(() => role('previous').classList.contains('z-gl-off')).toBe(true)
    expect(app._beginZoomOutScrub('wheel')).toBe(true)
    expect(app.canvas.dataset.zGlMoving).toBe('scrub')
    app._scrubZoomOut(0.3)
    await app._endZoomOutScrub(false)
    expect(role('current').dataset.viewName).toBe('a')
    await expect.poll(() => role('previous').classList.contains('z-gl-off')).toBe(true)
    expect(app._beginZoomOutScrub('wheel')).toBe(true)
    app._scrubZoomOut(0.8)
    await app._endZoomOutScrub(true)
    await settled()
    expect(role('current').dataset.viewName).toBe('home')
    await expect.poll(() => app.canvas.querySelector('.z-gl-off')).toBeNull()
    expect(app.canvas.dataset.zGlMoving).toBeUndefined()
  })

  it('draws two views behind on a third level, and goes back', async () => {
    await start()
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await settled()
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="c"]'))
    await settled()
    await expect.poll(() => role('last')?.classList.contains('z-gl-off')).toBe(true)
    expect(role('previous').classList.contains('z-gl-off')).toBe(true)
    expect(app._webgl.layers.map(l => l.view.dataset.viewName).sort()).toEqual(['a', 'home'])
    await app.zoomOut()
    await settled()
    expect(role('current').dataset.viewName).toBe('a')
    await expect.poll(() => app._webgl.layers.map(l => l.view.dataset.viewName)).toEqual(['home'])
  })

  const over = el => el.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))

  it('hover: builds the view on its trigger, and the click zooms with it and its photo', async () => {
    let built = 0
    const a = ({ target }) => {
      built++
      target.className = 'z-view'
      target.style.cssText = 'width:400px;height:300px'
      target.innerHTML = '<p>a</p>'
    }
    await start({ webgl: { hover: true }, views: { ...views, a } })
    const infos = []
    app._webgl.onMotion = (phase, spec, info) => { if (phase === 'start') infos.push(info) }
    const trigger = role('current').querySelector('.zoom-me[data-to="a"]')
    over(trigger)
    await expect.poll(() => built).toBe(1)
    await app.zoomIn(trigger)
    await settled()
    expect(built).toBe(1)
    expect(infos[0]).toMatchObject({ early: true, photoMs: 0 })
    expect(role('current').dataset.viewName).toBe('a')
    expect(app.canvas.querySelectorAll(':scope > .z-view')).toHaveLength(2)
  })

  it('hover: leaving a trigger for another throws its view away, cleanups and all', async () => {
    let cleaned = 0
    const a = ({ target, onCleanup }) => {
      onCleanup(() => cleaned++)
      target.className = 'z-view'
      target.innerHTML = '<p>a</p>'
    }
    await start({ webgl: { hover: true }, views: { ...views, a } })
    over(role('current').querySelector('.zoom-me[data-to="a"]'))
    await new Promise(resolve => setTimeout(resolve, 100))
    over(role('current').querySelector('.zoom-me[data-to="b"]'))
    await expect.poll(() => cleaned).toBe(1)
    // The view of the second trigger is in the canvas only while it is photographed.
    await expect.poll(() => app.canvas.querySelectorAll(':scope > .z-view').length).toBe(1)
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="b"]'))
    await settled()
    expect(role('current').dataset.viewName).toBe('b')
  })

  it('ancestors: past the third level, the views behind stay as one picture, and go back', async () => {
    await start({ webgl: { ancestors: true }, views: { ...views, c: view('c', ['d']), d: view('d') } })
    for (const to of ['a', 'c', 'd']) {
      await app.zoomIn(role('current').querySelector(`.zoom-me[data-to="${to}"]`))
      await settled()
    }
    await expect.poll(() => app._webgl.layers.some(l => l.deep)).toBe(true)
    await app.zoomOut()
    await settled()
    expect(role('current').dataset.viewName).toBe('c')
    await expect.poll(() => app._webgl.layers.some(l => l.deep)).toBe(false)
  })

  it('takes its canvas and hidden views away on destroy', async () => {
    await start()
    await app.zoomIn(role('current').querySelector('.zoom-me[data-to="a"]'))
    await settled()
    const canvas = app.canvas
    app.destroy()
    expect(canvas.querySelector('.z-gl')).toBeNull()
    app = null
  })
})
