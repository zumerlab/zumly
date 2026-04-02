/**
 * Tests for automatic lateral navigation:
 * - Click detection on sibling triggers in previous view (_findSiblingTriggerAtPoint)
 * - onZoom dispatching lateral instead of zoom-out when clicking a sibling
 * - Separate depth nav (z-depth-nav) and lateral nav (z-lateral-nav)
 * - lateralNav and depthNav option parsing in checkParameters
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { checkParameters } from '../src/utils.js'

describe('lateralNav option parsing', () => {
  it('defaults to { mode: auto, arrows: true, dots: true, keepAlive: false, position: bottom-center } when not provided', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
    }, instance)
    expect(instance.lateralNav).toEqual({ mode: 'auto', arrows: true, dots: true, keepAlive: false, position: 'bottom-center' })
  })

  it('can be disabled with false', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
      lateralNav: false,
    }, instance)
    expect(instance.lateralNav).toBe(false)
  })

  it('accepts partial object { arrows: false }', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
      lateralNav: { arrows: false },
    }, instance)
    expect(instance.lateralNav).toEqual({ mode: 'auto', arrows: false, dots: true, keepAlive: false, position: 'bottom-center' })
  })

  it('accepts partial object { dots: false }', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
      lateralNav: { dots: false },
    }, instance)
    expect(instance.lateralNav).toEqual({ mode: 'auto', arrows: true, dots: false, keepAlive: false, position: 'bottom-center' })
  })

  it('accepts full object { arrows: true, dots: true }', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
      lateralNav: { arrows: true, dots: true },
    }, instance)
    expect(instance.lateralNav).toEqual({ mode: 'auto', arrows: true, dots: true, keepAlive: false, position: 'bottom-center' })
  })

  it('accepts mode: always', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
      lateralNav: { mode: 'always' },
    }, instance)
    expect(instance.lateralNav.mode).toBe('always')
  })

  it('accepts keepAlive: visible', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
      lateralNav: { keepAlive: 'visible' },
    }, instance)
    expect(instance.lateralNav.keepAlive).toBe('visible')
  })

  it('accepts position: top-center', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
      lateralNav: { position: 'top-center' },
    }, instance)
    expect(instance.lateralNav.position).toBe('top-center')
  })
})

describe('depthNav option parsing', () => {
  it('defaults to { position: bottom-left } when not provided', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
    }, instance)
    expect(instance.depthNav).toEqual({ position: 'bottom-left' })
  })

  it('can be disabled with false', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
      depthNav: false,
    }, instance)
    expect(instance.depthNav).toBe(false)
  })

  it('accepts position: top-left', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
      depthNav: { position: 'top-left' },
    }, instance)
    expect(instance.depthNav).toEqual({ position: 'top-left' })
  })
})

describe('lateral click navigation', () => {
  const homeView = '<div class="z-view"><span class="zoom-me" data-to="detailA">A</span><span class="zoom-me" data-to="detailB">B</span><span class="zoom-me" data-to="detailC">C</span></div>'
  const detailAView = '<div class="z-view"><p>Detail A</p></div>'
  const detailBView = '<div class="z-view"><p>Detail B</p></div>'
  const detailCView = '<div class="z-view"><p>Detail C</p></div>'

  beforeEach(() => {
    document.body.innerHTML = '<div class="canvas zumly-canvas" style="position:absolute;top:0;left:0;width:800px;height:600px;"></div>'
  })

  const createApp = (opts = {}) => new Zumly({
    mount: '.canvas',
    initialView: 'home',
    views: { home: homeView, detailA: detailAView, detailB: detailBView, detailC: detailCView },
    transitions: { driver: 'none', duration: '0s', ease: 'linear' },
    ...opts,
  })

  describe('_getSiblings()', () => {
    it('returns empty when at root level (no previous view)', async () => {
      const app = createApp()
      await app.init()
      const { siblings, currentIndex } = app._getSiblings()
      expect(siblings).toEqual([])
      expect(currentIndex).toBe(-1)
    })

    it('returns all sibling view names and current index after zoom-in', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const { siblings, currentIndex } = app._getSiblings()
      expect(siblings).toEqual(['detailA', 'detailB', 'detailC'])
      expect(currentIndex).toBe(0)
    })

    it('updates current index after lateral navigation', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      await app.goTo('detailB', { mode: 'lateral' })
      const { siblings, currentIndex } = app._getSiblings()
      expect(siblings).toEqual(['detailA', 'detailB', 'detailC'])
      expect(currentIndex).toBe(1)
    })
  })

  describe('_findSiblingTriggerAtPoint()', () => {
    it('returns null when at root level', async () => {
      const app = createApp()
      await app.init()
      const result = app._findSiblingTriggerAtPoint(100, 100)
      expect(result).toBeNull()
    })

    it('returns null when no previous view exists', async () => {
      const app = createApp()
      await app.init()
      expect(app._findSiblingTriggerAtPoint(0, 0)).toBeNull()
    })
  })

  describe('onZoom nav element filtering', () => {
    it('ignores events from .z-depth-nav elements', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const initialView = app.getCurrentViewName()

      const navEl = document.createElement('button')
      navEl.className = 'z-nav-back'
      const navContainer = document.createElement('div')
      navContainer.className = 'z-depth-nav'
      navContainer.appendChild(navEl)
      app.canvas.appendChild(navContainer)

      const event = new MouseEvent('mouseup', { bubbles: true })
      Object.defineProperty(event, 'target', { value: navEl })
      app.onZoom(event)

      expect(app.getCurrentViewName()).toBe(initialView)
      navContainer.remove()
    })

    it('ignores events from .z-lateral-nav elements', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const initialView = app.getCurrentViewName()

      const navEl = document.createElement('button')
      navEl.className = 'z-nav-arrow'
      const navContainer = document.createElement('div')
      navContainer.className = 'z-lateral-nav'
      navContainer.appendChild(navEl)
      app.canvas.appendChild(navContainer)

      const event = new MouseEvent('mouseup', { bubbles: true })
      Object.defineProperty(event, 'target', { value: navEl })
      app.onZoom(event)

      expect(app.getCurrentViewName()).toBe(initialView)
      navContainer.remove()
    })
  })

  describe('depth nav UI', () => {
    it('creates depth nav after zoom-in', async () => {
      const app = createApp()
      await app.init()
      expect(app.canvas.querySelector('.z-depth-nav')).toBeNull()

      await app.goTo('detailA', { mode: 'depth' })
      const nav = app.canvas.querySelector('.z-depth-nav')
      expect(nav).toBeTruthy()
      expect(nav.querySelector('.z-nav-back')).toBeTruthy()
    })

    it('positions depth nav at bottom-left by default', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const nav = app.canvas.querySelector('.z-depth-nav')
      expect(nav.classList.contains('z-depth-nav--bottom-left')).toBe(true)
    })

    it('positions depth nav at top-left when configured', async () => {
      const app = createApp({ depthNav: { position: 'top-left' } })
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const nav = app.canvas.querySelector('.z-depth-nav')
      expect(nav.classList.contains('z-depth-nav--top-left')).toBe(true)
    })

    it('does not create depth nav when depthNav is false', async () => {
      const app = createApp({ depthNav: false })
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      expect(app.canvas.querySelector('.z-depth-nav')).toBeNull()
    })

    it('removes depth nav after zoom-out to root', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      expect(app.canvas.querySelector('.z-depth-nav')).toBeTruthy()

      app.zoomOut()
      await new Promise(r => setTimeout(r, 50))
      expect(app.canvas.querySelector('.z-depth-nav')).toBeNull()
    })
  })

  describe('lateral nav UI', () => {
    it('creates lateral nav after zoom-in when siblings exist', async () => {
      const app = createApp()
      await app.init()
      expect(app.canvas.querySelector('.z-lateral-nav')).toBeNull()

      await app.goTo('detailA', { mode: 'depth' })
      const nav = app.canvas.querySelector('.z-lateral-nav')
      expect(nav).toBeTruthy()
    })

    it('does not create lateral nav when lateralNav is false', async () => {
      const app = createApp({ lateralNav: false })
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      expect(app.canvas.querySelector('.z-lateral-nav')).toBeNull()
    })

    it('creates only dots when arrows: false', async () => {
      const app = createApp({ lateralNav: { arrows: false, dots: true } })
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const nav = app.canvas.querySelector('.z-lateral-nav')
      expect(nav).toBeTruthy()
      expect(nav.querySelector('.z-nav-arrow')).toBeNull()
      expect(nav.querySelector('.z-nav-lateral-dots')).toBeTruthy()
    })

    it('creates only arrows when dots: false', async () => {
      const app = createApp({ lateralNav: { arrows: true, dots: false } })
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const nav = app.canvas.querySelector('.z-lateral-nav')
      expect(nav).toBeTruthy()
      expect(nav.querySelectorAll('.z-nav-arrow').length).toBe(2)
      expect(nav.querySelector('.z-nav-lateral-dots')).toBeNull()
    })

    it('renders correct number of lateral dots matching siblings count', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const dots = app.canvas.querySelectorAll('.z-nav-lat-dot')
      expect(dots.length).toBe(3) // detailA, detailB, detailC
    })

    it('marks the active lateral dot for current view', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const activeDot = app.canvas.querySelector('.z-nav-lat-dot.is-active')
      expect(activeDot).toBeTruthy()
    })

    it('updates active dot after lateral navigation', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      await app.goTo('detailB', { mode: 'lateral' })
      const activeDot = app.canvas.querySelector('.z-nav-lat-dot.is-active')
      expect(activeDot).toBeTruthy()
    })

    it('disables prev arrow on first sibling', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const prevArrow = app.canvas.querySelector('.z-nav-prev')
      const nextArrow = app.canvas.querySelector('.z-nav-next')
      expect(prevArrow.disabled).toBe(true)
      expect(nextArrow.disabled).toBe(false)
    })

    it('disables next arrow on last sibling', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailC', { mode: 'depth' })
      const prevArrow = app.canvas.querySelector('.z-nav-prev')
      const nextArrow = app.canvas.querySelector('.z-nav-next')
      expect(prevArrow.disabled).toBe(false)
      expect(nextArrow.disabled).toBe(true)
    })

    it('removes lateral nav after zoom-out to root', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      expect(app.canvas.querySelector('.z-lateral-nav')).toBeTruthy()

      app.zoomOut()
      await new Promise(r => setTimeout(r, 50))
      expect(app.canvas.querySelector('.z-lateral-nav')).toBeNull()
    })

    it('depth and lateral nav are separate elements', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const depthNav = app.canvas.querySelector('.z-depth-nav')
      const lateralNav = app.canvas.querySelector('.z-lateral-nav')
      expect(depthNav).toBeTruthy()
      expect(lateralNav).toBeTruthy()
      expect(depthNav).not.toBe(lateralNav)
    })
  })

  describe('cleanup', () => {
    it('both navs are cleaned up on destroy()', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      expect(app.canvas.querySelector('.z-depth-nav')).toBeTruthy()
      expect(app.canvas.querySelector('.z-lateral-nav')).toBeTruthy()

      const canvas = app.canvas
      app.destroy()
      expect(canvas.querySelector('.z-depth-nav')).toBeNull()
      expect(canvas.querySelector('.z-lateral-nav')).toBeNull()
    })
  })
})
