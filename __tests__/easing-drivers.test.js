/**
 * Shared CSS easing and the library drivers (Anime.js v3/v4, GSAP, Motion).
 * Fake libraries stand in for the real ones; the curve and library API shapes
 * match what the real libraries call (checked by hand against their CDN builds).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { cssEasing } from '../src/drivers/driver-helpers.js'
import { animeDriver, gsapDriver, motionDriver } from '../src/drivers/index.js'
import '../src/style.css'

describe('cssEasing', () => {
  it('matches the CSS keyword curves', () => {
    expect(cssEasing('linear')(0.3)).toBeCloseTo(0.3, 5)
    expect(cssEasing('ease-in-out')(0.5)).toBeCloseTo(0.5, 3)
    expect(cssEasing('ease')(0.5)).toBeCloseTo(0.8024, 3)
    expect(cssEasing('ease-in')(0.5)).toBeCloseTo(0.3153, 3)
    expect(cssEasing('ease-out')(0.5)).toBeCloseTo(0.6847, 3)
  })

  it('solves cubic-bezier() and clamps its ends', () => {
    const curve = cssEasing('cubic-bezier(.2,.8,.2,1)')
    expect(curve(0)).toBe(0)
    expect(curve(1)).toBe(1)
    expect(curve(0.5)).toBeGreaterThan(0.9)
    expect(cssEasing('cubic-bezier(.68,-0.55,.27,1.55)')(0.9)).toBeGreaterThan(1)
  })

  it('implements steps() positions and linear() points', () => {
    expect([0, 0.3, 0.6, 0.99, 1].map(cssEasing('steps(3)'))).toEqual([0, 0, 1 / 3, 2 / 3, 1])
    expect([0, 0.3, 0.6].map(cssEasing('steps(3, start)'))).toEqual([1 / 3, 1 / 3, 2 / 3])
    expect([0.1, 0.5, 0.9].map(cssEasing('steps(3, jump-none)'))).toEqual([0, 0.5, 1])
    const points = cssEasing('linear(0, 0.8 20%, 1)')
    expect(points(0.1)).toBeCloseTo(0.4, 5)
    expect(points(0.6)).toBeCloseTo(0.9, 5)
  })

  it('returns null for library ease names and invalid syntax', () => {
    for (const ease of ['power2.out', 'easeOutExpo', 'outExpo', 'cubic-bezier(2,0,0,1)', 'steps(0)']) {
      expect(cssEasing(ease)).toBe(null)
    }
  })
})

const view = content => `<div class="z-view" style="width:400px;height:300px">${content}</div>`
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

async function zoomWith (driver, ease = 'cubic-bezier(.2,.8,.2,1)') {
  app = new Zumly({
    mount: '.canvas',
    initialView: 'home',
    views: { home: view('<div class="zoom-me" data-to="detail" style="position:absolute;left:40px;top:40px;width:80px;height:60px">go</div>'), detail: view('detail') },
    transitions: { driver, duration: '100ms', ease }
  })
  await app.init()
  await app.zoomTo('detail')
  expect(app.getCurrentViewName()).toBe('detail')
  expect(app.canvas.querySelector('.is-current-view').classList.contains('is-new-current-view')).toBe(false)
  await app.zoomOut()
  expect(app.getCurrentViewName()).toBe('home')
}

/** Drives onUpdate at progress 0.5 and then completes, recording the call. */
function progressRecorder () {
  const calls = []
  return {
    calls,
    run (options, update, complete, read) {
      calls.push(options)
      update(0.5)
      read?.()
      update(1)
      complete()
    }
  }
}

describe('library drivers', () => {
  it('Anime.js v4: animate() with a linear tween and the CSS curve applied per layer', async () => {
    const recorder = progressRecorder()
    const anime = {
      animate (target, options) {
        recorder.run(options, p => { target.value = p; options.onUpdate() }, options.onComplete)
      }
    }
    await zoomWith(animeDriver(anime))
    expect(recorder.calls[0].ease).toBe('linear')
    expect(recorder.calls[0].duration).toBe(100)
  })

  it('Anime.js v3: anime() with native ease names passed through', async () => {
    const recorder = progressRecorder()
    const anime = options => recorder.run(options, p => { options.targets.value = p; options.update() }, options.complete)
    await zoomWith(animeDriver(anime), 'easeOutExpo')
    expect(recorder.calls[0].easing).toBe('easeOutExpo')
  })

  it('GSAP: CSS easing becomes an ease function, GSAP names pass through untouched', async () => {
    const eases = []
    const gsap = {
      set () {},
      timeline ({ onComplete }) {
        const tl = {
          to (el, vars) { eases.push(vars.ease); el.style.transform = vars.transform; return tl },
          fromTo (el, from, vars) { eases.push(vars.ease); el.style.transform = vars.transform; return tl }
        }
        queueMicrotask(onComplete)
        return tl
      }
    }
    await zoomWith(gsapDriver(gsap))
    expect(typeof eases[0]).toBe('function')
    expect(eases[0](0.5)).toBeGreaterThan(0.9)
    eases.length = 0
    app.destroy()
    await zoomWith(gsapDriver(gsap), 'power3.inOut')
    expect(eases[0]).toBe('power3.inOut')
  })

  it('Motion: animate(0, 1) with seconds and a promise-like result', async () => {
    const calls = []
    const animate = (from, to, options) => {
      calls.push(options)
      options.onUpdate(0.5)
      return Promise.resolve()
    }
    await zoomWith(motionDriver({ animate }))
    expect(calls[0]).toMatchObject({ duration: 0.1, ease: 'linear' })
  })

  it('a missing library warns once and still finishes navigation in its final state', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    delete globalThis.gsap
    await zoomWith('gsap')
    await app.zoomTo('detail')
    expect(warn.mock.calls.filter(call => String(call[0]).includes('GSAP not found'))).toHaveLength(1)
  })

  it('staggered layers each follow the full curve instead of a slice of it', async () => {
    const frames = []
    const anime = {
      animate (target, options) {
        for (const p of [0, 0.25, 0.5, 0.75, 1]) {
          target.value = p
          options.onUpdate()
          frames.push([...document.querySelectorAll('.z-view')].map(el => el.style.transform))
        }
        options.onComplete()
      }
    }
    app = new Zumly({
      mount: '.canvas',
      initialView: 'home',
      views: { home: view('<div class="zoom-me" data-to="detail" style="position:absolute;left:40px;top:40px;width:80px;height:60px">go</div>'), detail: view('detail') },
      transitions: { driver: animeDriver(anime), duration: '100ms', ease: 'linear', stagger: 100 }
    })
    await app.init()
    await app.zoomTo('detail')
    // With 100ms stagger over a 200ms timeline the previous view has not moved at 25%.
    expect(frames[1][0]).toBe(frames[0][0])
    expect(frames[4][0]).not.toBe(frames[0][0])
  })

  it('finishes at its deadline when the library never runs (hidden tab) and ignores late callbacks', async () => {
    let late
    const anime = { animate (target, options) { late = options; return { pause () { late.paused = true } } } }
    app = new Zumly({
      mount: '.canvas',
      initialView: 'home',
      views: { home: view('<div class="zoom-me" data-to="detail" style="position:absolute;left:40px;top:40px;width:80px;height:60px">go</div>'), detail: view('detail') },
      transitions: { driver: animeDriver(anime), duration: '100ms' }
    })
    await app.init()
    const started = performance.now()
    await app.zoomTo('detail')
    expect(performance.now() - started).toBeLessThan(1000)
    expect(app.getCurrentViewName()).toBe('detail')
    expect(late.paused).toBe(true)
    const current = app.canvas.querySelector('.is-current-view')
    const transform = current.style.transform
    late.onUpdate()
    late.onComplete()
    expect(current.style.transform).toBe(transform)
    expect(current.classList.contains('is-current-view')).toBe(true)
  })
})
