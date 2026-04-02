/**
 * Tests for automatic lateral navigation:
 * - Click detection on sibling triggers in previous view (_findSiblingTriggerAtPoint)
 * - onZoom dispatching lateral instead of zoom-out when clicking a sibling
 * - Unified nav UI (z-nav): creation, update, removal
 * - lateralNav option parsing in checkParameters
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { checkParameters } from '../src/utils.js'

describe('lateralNav option parsing', () => {
  it('defaults to { mode: auto, arrows: true, dots: true, keepAlive: false } when not provided', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
    }, instance)
    expect(instance.lateralNav).toEqual({ mode: 'auto', arrows: true, dots: true, keepAlive: false })
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
    expect(instance.lateralNav).toEqual({ mode: 'auto', arrows: false, dots: true, keepAlive: false })
  })

  it('accepts partial object { dots: false }', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
      lateralNav: { dots: false },
    }, instance)
    expect(instance.lateralNav).toEqual({ mode: 'auto', arrows: true, dots: false, keepAlive: false })
  })

  it('accepts full object { arrows: true, dots: true }', () => {
    const instance = {}
    checkParameters({
      mount: '.canvas',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
      lateralNav: { arrows: true, dots: true },
    }, instance)
    expect(instance.lateralNav).toEqual({ mode: 'auto', arrows: true, dots: true, keepAlive: false })
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

  describe('onZoom lateral detection', () => {
    it('ignores events from .z-nav elements', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const initialView = app.getCurrentViewName()

      // Simulate a mouseup event from a nav button
      const navEl = document.createElement('button')
      navEl.className = 'z-nav-arrow'
      const navContainer = document.createElement('div')
      navContainer.className = 'z-nav'
      navContainer.appendChild(navEl)
      app.canvas.appendChild(navContainer)

      const event = new MouseEvent('mouseup', { bubbles: true })
      Object.defineProperty(event, 'target', { value: navEl })
      app.onZoom(event)

      // Should not have zoomed out or done anything
      expect(app.getCurrentViewName()).toBe(initialView)
      navContainer.remove()
    })
  })

  describe('nav UI', () => {
    it('creates nav UI after zoom-in when siblings exist', async () => {
      const app = createApp()
      await app.init()
      expect(app.canvas.querySelector('.z-nav')).toBeNull()

      await app.goTo('detailA', { mode: 'depth' })
      const nav = app.canvas.querySelector('.z-nav')
      expect(nav).toBeTruthy()
    })

    it('does not create lateral section in nav when lateralNav is false', async () => {
      const app = createApp({ lateralNav: false })
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      expect(app.canvas.querySelector('.z-nav-lateral')).toBeNull()
    })

    it('creates only dots when arrows: false', async () => {
      const app = createApp({ lateralNav: { arrows: false, dots: true } })
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const nav = app.canvas.querySelector('.z-nav')
      expect(nav).toBeTruthy()
      expect(nav.querySelector('.z-nav-arrow')).toBeNull()
      expect(nav.querySelector('.z-nav-lateral-dots')).toBeTruthy()
    })

    it('creates only arrows when dots: false', async () => {
      const app = createApp({ lateralNav: { arrows: true, dots: false } })
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const nav = app.canvas.querySelector('.z-nav')
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

    it('removes lateral section from nav after zoom-out to root', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      expect(app.canvas.querySelector('.z-nav-lateral')).toBeTruthy()

      app.zoomOut()
      await new Promise(r => setTimeout(r, 50))
      // After zoom-out to root, no siblings → lateral section gone
      expect(app.canvas.querySelector('.z-nav-lateral')).toBeNull()
    })

    it('is cleaned up on destroy()', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      expect(app.canvas.querySelector('.z-nav')).toBeTruthy()

      const canvas = app.canvas
      app.destroy()
      expect(canvas.querySelector('.z-nav')).toBeNull()
    })
  })
})
