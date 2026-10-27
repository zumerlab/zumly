/**
 * Library drivers (GSAP, Anime.js, Motion) slide between siblings like the
 * css and waapi drivers: same transforms, duration and easing, incoming view
 * fading in, outgoing fading out. Fake libraries stand in for the real ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { animeDriver, gsapDriver, motionDriver } from '../src/drivers/index.js'
import { cssEasing } from '../src/drivers/driver-helpers.js'
import '../src/style.css'

const box = (left, to) => `<div class="zoom-me" data-to="${to}" style="position:absolute;left:${left}px;top:100px;width:60px;height:40px">${to}</div>`
const views = {
  home: `<div class="z-view" style="width:400px;height:300px">${box(20, 'a')}${box(200, 'b')}</div>`,
  a: '<div class="z-view" style="width:200px;height:150px"><p>a</p></div>',
  b: '<div class="z-view" style="width:200px;height:150px"><p>b</p></div>'
}

let app

beforeEach(() => {
  document.body.innerHTML = '<div style="position:relative;width:400px;height:300px"><div class="canvas zumly-canvas"></div></div>'
})

afterEach(() => {
  app?.destroy()
  app = null
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

/** Zoom into 'a' with an instant driver, then switch to the library driver. */
async function atA (driver, transitions = {}) {
  app = new Zumly({ mount: '.canvas', initialView: 'home', views, transitions: { driver: 'none', duration: '200ms', ease: 'linear', ...transitions } })
  await app.init()
  await app.zoomTo('a')
  app.transitionDriver = { runTransition: driver }
  const spy = vi.spyOn(app.transitionDriver, 'runTransition')
  return spy
}

/** Records every frame the fake library paints, at fixed progress values. */
function frames (canvas) {
  const out = []
  const snap = () => out.push([...canvas.querySelectorAll(':scope > .z-view')].map(el => ({
    name: el.dataset.viewName, transform: el.style.transform, opacity: el.style.opacity
  })))
  return { out, snap }
}

const PROGRESS = [0, 0.5, 1]

function animeV4 (record) {
  return {
    animate (target, options) {
      record.calls.push(options)
      for (const p of PROGRESS) { target.value = p; options.onUpdate(); record.snap() }
      options.onComplete()
      return { pause () {} }
    }
  }
}

function motion (record) {
  return {
    animate (from, to, options) {
      record.calls.push(options)
      for (const p of PROGRESS) { options.onUpdate(p); record.snap() }
      return Promise.resolve()
    }
  }
}

function gsap (record) {
  return {
    set () {},
    timeline ({ onStart, onComplete }) {
      const tweens = []
      const tl = {
        fromTo (el, from, vars) { tweens.push({ el, from, vars }); return tl },
        to (el, vars) { tweens.push({ el, from: {}, vars }); return tl },
        kill () {}
      }
      queueMicrotask(() => {
        onStart?.()
        record.calls.push(...tweens.map(t => ({ el: t.el, from: t.from, ...t.vars })))
        for (const { el, vars } of tweens) {
          el.style.transform = vars.transform
          if (vars.opacity !== undefined) el.style.opacity = String(vars.opacity)
        }
        onComplete()
      })
      return tl
    }
  }
}

describe.each([
  ['anime', record => animeDriver(animeV4(record))],
  ['motion', record => motionDriver(motion(record))]
])('%s driver: lateral', (name, make) => {
  it('slides with the engine transforms, fades, and ends like waapi', async () => {
    const record = { calls: [], ...frames(document.querySelector('.canvas')) }
    const driver = make(record)
    const spy = await atA(driver)
    await app.goTo('b', { mode: 'lateral' })
    expect(app.getCurrentViewName()).toBe('b')

    const spec = spy.mock.calls[0][0]
    expect(spec.type).toBe('lateral')
    expect(record.calls).toHaveLength(1)
    // Duration in the library's unit, CSS ease applied by Zumly (linear tween).
    if (name === 'anime') expect(record.calls[0]).toMatchObject({ duration: 200, ease: 'linear' })
    else expect(record.calls[0]).toMatchObject({ duration: 0.2, ease: 'linear' })

    const [first, middle] = record.out
    const at = (frame, view) => frame.find(f => f.name === view)
    // Incoming starts transparent at its start pose and fades in; outgoing fades out.
    expect(Number(at(first, 'b').opacity)).toBe(0)
    expect(Number(at(middle, 'b').opacity)).toBeCloseTo(0.5, 5)
    expect(Number(at(first, 'a').opacity)).toBe(1)
    expect(Number(at(middle, 'a').opacity)).toBeCloseTo(0.5, 5)
    const tx = transform => new DOMMatrix(transform).e
    expect(tx(at(first, 'b').transform)).toBeCloseTo(new DOMMatrix(spec.incomingTransformStart).e, 3)
    expect(tx(at(middle, 'b').transform)).toBeCloseTo((new DOMMatrix(spec.incomingTransformStart).e + new DOMMatrix(spec.incomingTransformEnd).e) / 2, 3)
    expect(tx(at(middle, 'home').transform)).toBeCloseTo((new DOMMatrix(spec.backViewState.transformStart).e + new DOMMatrix(spec.backViewState.transformEnd).e) / 2, 3)

    // Final state: outgoing removed, incoming current at its end transform, no inline opacity.
    const current = app.canvas.querySelector('.is-current-view')
    expect(current.dataset.viewName).toBe('b')
    expect(current.style.transform).toBe(spec.incomingTransformEnd)
    expect(current.style.opacity).toBe('')
    expect(app.canvas.querySelector('[data-view-name="a"]')).toBeNull()
    const back = new DOMMatrix(app.canvas.querySelector('.is-previous-view').style.transform)
    const backEnd = new DOMMatrix(spec.backViewState.transformEnd)
    for (const key of ['a', 'd', 'e', 'f']) expect(back[key]).toBeCloseTo(backEnd[key], 5)
  })

  it('applies a CSS ease curve to every frame', async () => {
    const record = { calls: [], ...frames(document.querySelector('.canvas')) }
    const spy = await atA(make(record), { ease: 'ease-in' })
    await app.goTo('b', { mode: 'lateral' })
    const spec = spy.mock.calls[0][0]
    const middle = record.out[1].find(f => f.name === 'b')
    expect(Number(middle.opacity)).toBeCloseTo(cssEasing('ease-in')(0.5), 3)
    const start = new DOMMatrix(spec.incomingTransformStart).e
    const end = new DOMMatrix(spec.incomingTransformEnd).e
    expect(new DOMMatrix(middle.transform).e).toBeCloseTo(start + (end - start) * cssEasing('ease-in')(0.5), 3)
  })

  it('keeps the outgoing view in keepAlive mode and brings it back', async () => {
    const record = { calls: [], ...frames(document.querySelector('.canvas')) }
    const driver = make(record)
    app = new Zumly({ mount: '.canvas', initialView: 'home', views, lateralNav: { keepAlive: true }, transitions: { driver, duration: '50ms' } })
    await app.init()
    await app.zoomTo('a')
    const a = app.canvas.querySelector('.is-current-view')
    await app.goTo('b', { mode: 'lateral' })
    expect(a.classList.contains('is-lateral-hidden')).toBe(true)
    expect(a.style.opacity).toBe('')
    await app.back()
    expect(app.canvas.querySelector('.is-current-view')).toBe(a)
    expect(a.style.opacity).toBe('')
  })

  it('finishes at its deadline when the library never runs (hidden tab)', async () => {
    let late
    const stalled = name === 'anime'
      ? animeDriver({ animate (target, options) { late = () => { target.value = 0.5; options.onUpdate() }; return { pause () {} } } })
      : motionDriver({ animate (from, to, options) { late = () => options.onUpdate(0.5); return new Promise(() => {}) } })
    await atA(stalled, { duration: '100ms' })
    const started = performance.now()
    await app.goTo('b', { mode: 'lateral' })
    expect(performance.now() - started).toBeLessThan(1000)
    const current = app.canvas.querySelector('.is-current-view')
    expect(current.dataset.viewName).toBe('b')
    const transform = current.style.transform
    late()
    expect(current.style.transform).toBe(transform)
    expect(current.style.opacity).toBe('')
  })
})

describe('gsap driver: lateral', () => {
  it('tweens the same transforms and opacities in one timeline, from 0', async () => {
    const record = { calls: [] }
    const spy = await atA(gsapDriver(gsap(record)))
    await app.goTo('b', { mode: 'lateral' })
    const spec = spy.mock.calls[0][0]
    const byView = view => record.calls.find(call => call.el.dataset.viewName === view)
    expect(byView('b')).toMatchObject({ from: { transform: spec.incomingTransformStart, opacity: 0 }, transform: spec.incomingTransformEnd, opacity: 1, duration: 0.2 })
    expect(byView('a')).toMatchObject({ from: { transform: spec.outgoingTransform, opacity: 1 }, transform: spec.outgoingTransformEnd, opacity: 0 })
    expect(byView('home')).toMatchObject({ from: { transform: spec.backViewState.transformStart }, transform: spec.backViewState.transformEnd })
    expect(typeof byView('b').ease).toBe('function')
    const current = app.canvas.querySelector('.is-current-view')
    expect(current.dataset.viewName).toBe('b')
    expect(current.style.opacity).toBe('')
    expect(app.canvas.querySelector('[data-view-name="a"]')).toBeNull()
  })

  it('passes GSAP ease names through', async () => {
    const record = { calls: [] }
    await atA(gsapDriver(gsap(record)), { ease: 'power3.inOut' })
    // atA normalised the ease against the none driver; set it as the user would.
    await app.goTo('b', { mode: 'lateral', ease: 'power3.inOut' })
    expect(record.calls.every(call => call.ease === 'power3.inOut')).toBe(true)
  })

  it('finishes at its deadline when GSAP never ticks (hidden tab)', async () => {
    const stalled = { set () {}, timeline () { const tl = { fromTo: () => tl, to: () => tl, kill () {} }; return tl } }
    await atA(gsapDriver(stalled), { duration: '100ms' })
    const started = performance.now()
    await app.goTo('b', { mode: 'lateral' })
    expect(performance.now() - started).toBeLessThan(1000)
    expect(app.canvas.querySelector('.is-current-view').dataset.viewName).toBe('b')
  })
})

describe('library drivers and reduced motion', () => {
  it.each([
    ['anime', record => animeDriver(animeV4(record))],
    ['motion', record => motionDriver(motion(record))],
    ['gsap', record => gsapDriver(gsap(record))]
  ])('%s: a lateral move is instant when the user prefers reduced motion', async (name, make) => {
    const record = { calls: [], snap () {} }
    app = new Zumly({ mount: '.canvas', initialView: 'home', views, transitions: { driver: make(record), duration: '2s' } })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true })
    await app.init()
    await app.zoomTo('a')
    await app.goTo('b', { mode: 'lateral' })
    expect(app.getCurrentViewName()).toBe('b')
    expect(record.calls).toHaveLength(0)
  })
})
