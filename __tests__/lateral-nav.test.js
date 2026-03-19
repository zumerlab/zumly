/**
 * Tests for same-level (lateral) navigation: goTo with mode 'lateral', back() behavior.
 *
 * Lateral history model: When navigating laterally A->B, we push A. back() pops and
 * restores A. When lateral history is empty, back() zooms out.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'

describe('lateral navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="canvas zumly-canvas"></div>'
  })

  const homeView = '<div class="z-view"><span class="zoom-me" data-to="detailA">A</span><span class="zoom-me" data-to="detailB">B</span></div>'
  const detailAView = '<div class="z-view"><p>A</p><span class="zoom-me" data-to="nested">Nested</span></div>'
  const detailBView = '<div class="z-view"><p>B</p></div>'
  const nestedView = '<div class="z-view"><p>Nested</p></div>'

  const createApp = (opts = {}) => new Zumly({
    mount: '.canvas',
    initialView: 'home',
    views: { home: homeView, detailA: detailAView, detailB: detailBView, nested: nestedView },
    transitions: { driver: 'none', duration: '0s', ease: 'linear' },
    ...opts,
  })

  describe('goTo with mode depth', () => {
    it('normal depth navigation still increases zoom level', async () => {
      const app = createApp()
      await app.init()
      expect(app.getZoomLevel()).toBe(1)

      await app.goTo('detailA', { mode: 'depth' })
      expect(app.getZoomLevel()).toBe(2)
      expect(app.getCurrentViewName()).toBe('detailA')

      await app.goTo('nested', { mode: 'depth' })
      expect(app.getZoomLevel()).toBe(3)
      expect(app.getCurrentViewName()).toBe('nested')
    })

    it('goTo with mode depth behaves like zoomTo', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      expect(app.getCurrentViewName()).toBe('detailA')
      app.back()
      expect(app.getCurrentViewName()).toBe('home')
    })
  })

  describe('goTo with mode lateral', () => {
    it('changes current view while preserving zoom level', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      expect(app.getZoomLevel()).toBe(2)
      expect(app.getCurrentViewName()).toBe('detailA')

      await app.goTo('detailB', { mode: 'lateral' })
      expect(app.getZoomLevel()).toBe(2)
      expect(app.getCurrentViewName()).toBe('detailB')

      await app.goTo('detailA', { mode: 'lateral' })
      expect(app.getZoomLevel()).toBe(2)
      expect(app.getCurrentViewName()).toBe('detailA')
    })

    it('back() after lateral restores previous lateral view', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      await app.goTo('detailB', { mode: 'lateral' })
      expect(app.getCurrentViewName()).toBe('detailB')

      await app.back()
      expect(app.getCurrentViewName()).toBe('detailA')
      expect(app.getZoomLevel()).toBe(2)

      app.back()
      expect(app.getCurrentViewName()).toBe('home')
      expect(app.getZoomLevel()).toBe(1)
    })

    it('repeated lateral across multiple views stays coherent', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      await app.goTo('detailB', { mode: 'lateral' })
      await app.goTo('detailA', { mode: 'lateral' })
      await app.goTo('detailB', { mode: 'lateral' })
      expect(app.getCurrentViewName()).toBe('detailB')
      expect(app.getZoomLevel()).toBe(2)

      await app.back()
      expect(app.getCurrentViewName()).toBe('detailA')
      await app.back()
      expect(app.getCurrentViewName()).toBe('detailB')
      await app.back()
      expect(app.getCurrentViewName()).toBe('detailA')
      app.back()
      expect(app.getCurrentViewName()).toBe('home')
    })

    it('fails safely for unknown view without corrupting instance', async () => {
      const app = createApp()
      await app.init()
      await app.goTo('detailA', { mode: 'depth' })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await app.goTo('nonexistent', { mode: 'lateral' })
      expect(app.getCurrentViewName()).toBe('detailA')
      expect(app.getZoomLevel()).toBe(2)
      expect(warnSpy).toHaveBeenCalled()

      warnSpy.mockRestore()
    })
  })

  describe('click-based zoom still works', () => {
    it('click zoom and lateral coexist', async () => {
      const app = createApp()
      await app.init()

      const triggerA = app.canvas.querySelector('.zoom-me[data-to="detailA"]')
      await app.zoomIn(triggerA)
      expect(app.getCurrentViewName()).toBe('detailA')

      await app.goTo('detailB', { mode: 'lateral' })
      expect(app.getCurrentViewName()).toBe('detailB')

      await app.back()
      expect(app.getCurrentViewName()).toBe('detailA')
      app.back()
      expect(app.getCurrentViewName()).toBe('home')
    })
  })
})
