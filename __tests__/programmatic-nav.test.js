/**
 * Tests for programmatic navigation API: getCurrentViewName, getZoomLevel, back, zoomTo.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'

describe('programmatic navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="canvas zumly-canvas"></div>'
  })

  const homeView = '<div class="z-view"><span class="zoom-me" data-to="detail">Go to detail</span></div>'
  const detailView = '<div class="z-view"><p>Detail view</p><span class="zoom-me" data-to="settings">Settings</span></div>'
  const settingsView = '<div class="z-view"><p>Settings</p></div>'

  const createApp = (opts = {}) => new Zumly({
    mount: '.canvas',
    initialView: 'home',
    views: { home: homeView, detail: detailView, settings: settingsView },
    transitions: { driver: 'none', duration: '0s', ease: 'linear' },
    ...opts,
  })

  describe('getCurrentViewName()', () => {
    it('returns the initial view after init()', async () => {
      const app = createApp()
      await app.init()
      expect(app.getCurrentViewName()).toBe('home')
    })

    it('returns the current view after programmatic zoomTo', async () => {
      const app = createApp()
      await app.init()
      await app.zoomTo('detail')
      expect(app.getCurrentViewName()).toBe('detail')
    })

    it('returns the current view after click-based zoomIn', async () => {
      const app = createApp()
      await app.init()
      const trigger = app.canvas.querySelector('.zoom-me[data-to="detail"]')
      await app.zoomIn(trigger)
      expect(app.getCurrentViewName()).toBe('detail')
    })
  })

  describe('getZoomLevel()', () => {
    it('returns 1 after init()', async () => {
      const app = createApp()
      await app.init()
      expect(app.getZoomLevel()).toBe(1)
    })

    it('returns 2 after zoomTo to one level deeper', async () => {
      const app = createApp()
      await app.init()
      await app.zoomTo('detail')
      expect(app.getZoomLevel()).toBe(2)
    })

    it('returns 3 after zoomTo twice', async () => {
      const app = createApp()
      await app.init()
      await app.zoomTo('detail')
      await app.zoomTo('settings')
      expect(app.getZoomLevel()).toBe(3)
    })
  })

  describe('zoomTo()', () => {
    it('navigates to target view without requiring a click on .zoom-me', async () => {
      const app = createApp()
      await app.init()
      expect(app.getCurrentViewName()).toBe('home')

      await app.zoomTo('detail')
      expect(app.getCurrentViewName()).toBe('detail')
      expect(app.canvas.querySelector('.is-current-view').dataset.viewName).toBe('detail')

      await app.zoomTo('settings')
      expect(app.getCurrentViewName()).toBe('settings')
      expect(app.canvas.querySelector('.is-current-view').dataset.viewName).toBe('settings')
    })

    it('fails safely for unknown view name without corrupting instance', async () => {
      const app = createApp()
      await app.init()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await app.zoomTo('nonexistent')
      expect(app.getCurrentViewName()).toBe('home')
      expect(app.getZoomLevel()).toBe(1)
      expect(warnSpy).toHaveBeenCalled()

      warnSpy.mockRestore()
    })

    it('no-ops when zooming to current view', async () => {
      const app = createApp()
      await app.init()
      await app.zoomTo('home')
      expect(app.getCurrentViewName()).toBe('home')
      expect(app.getZoomLevel()).toBe(1)
    })
  })

  describe('back()', () => {
    it('returns to previous view after programmatic zoomTo', async () => {
      const app = createApp()
      await app.init()
      await app.zoomTo('detail')
      expect(app.getCurrentViewName()).toBe('detail')

      app.back()
      expect(app.getCurrentViewName()).toBe('home')
      expect(app.getZoomLevel()).toBe(1)
    })

    it('does not throw at root level', async () => {
      const app = createApp()
      await app.init()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(() => app.back()).not.toThrow()
      expect(app.getZoomLevel()).toBe(1)
      warnSpy.mockRestore()
    })
  })

  describe('click-driven zoom still works', () => {
    it('zoomIn via click works after programmatic API exists', async () => {
      const app = createApp()
      await app.init()
      const trigger = app.canvas.querySelector('.zoom-me[data-to="detail"]')
      await app.zoomIn(trigger)

      expect(app.getCurrentViewName()).toBe('detail')
      expect(app.getZoomLevel()).toBe(2)

      app.back()
      expect(app.getCurrentViewName()).toBe('home')
    })

    it('click and programmatic navigation can be mixed', async () => {
      const app = createApp()
      await app.init()

      await app.zoomTo('detail')
      expect(app.getCurrentViewName()).toBe('detail')

      const settingsTrigger = app.canvas.querySelector('.zoom-me[data-to="settings"]')
      await app.zoomIn(settingsTrigger)
      expect(app.getCurrentViewName()).toBe('settings')

      app.back()
      expect(app.getCurrentViewName()).toBe('detail')
      app.back()
      expect(app.getCurrentViewName()).toBe('home')
    })
  })
})
