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

    it('zoomIn() ignores a trigger in a view behind the current one, with a warning', async () => {
      const home = '<div class="z-view"><span class="zoom-me" data-to="detail">Detail</span><span class="zoom-me" data-to="settings">Settings</span></div>'
      const detail = '<div class="z-view"><span class="zoom-me" data-to="deep">Deep</span></div>'
      const app = createApp({ views: { home, detail, settings: settingsView, deep: '<div class="z-view">Deep</div>' } })
      await app.init()
      const toDetail = app.canvas.querySelector('[data-to="detail"]')
      const toSettings = app.canvas.querySelector('[data-to="settings"]')
      await app.zoomIn(toDetail)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const changes = []
      app.on('viewChanged', ({ type }) => changes.push(type))
      const state = () => ({ stack: app.getViewStack().map(view => view.name), zoomed: [...app.canvas.querySelectorAll('.zoomed')].map(el => el.dataset.to) })
      const before = state()
      try {
        // A sibling's trigger in the parent, and the trigger already entered.
        await app.zoomIn(toSettings)
        await app.zoomIn(toDetail)
        expect(state()).toEqual(before)
        expect(before).toEqual({ stack: ['home', 'detail'], zoomed: ['detail'] })
        expect(changes).toEqual([])
        expect(warn).toHaveBeenCalledTimes(2)
        expect(warn.mock.calls[0].join(' ')).toMatch(/zoomIn\(\) ignored: the trigger for "settings" is in a view behind the current one \("detail"\)/)

        // One level deeper, a trigger in the grandparent is ignored too.
        await app.zoomIn(app.canvas.querySelector('.is-current-view [data-to="deep"]'))
        await app.zoomIn(toSettings)
        expect(app.getViewStack().map(view => view.name)).toEqual(['home', 'detail', 'deep'])
        expect(warn).toHaveBeenCalledTimes(3)

        // The same trigger works once its view is current again, and as a sibling.
        await app.zoomOut()
        await app.goTo('settings', { mode: 'lateral' })
        expect(app.getViewStack().map(view => view.name)).toEqual(['home', 'settings'])
        await app.zoomOut()
        await app.zoomIn(toSettings)
        expect(app.getViewStack().map(view => view.name)).toEqual(['home', 'settings'])
        expect(warn).toHaveBeenCalledTimes(3)
      } finally { warn.mockRestore(); app.destroy() }
    })

    it('zoomIn() still takes a trigger from outside the canvas', async () => {
      const app = createApp()
      await app.init()
      const outside = document.createElement('button')
      outside.className = 'zoom-me'
      outside.dataset.to = 'detail'
      document.body.append(outside)
      await app.zoomIn(outside)
      expect(app.getCurrentViewName()).toBe('detail')
      await app.zoomOut()
      expect(app.getCurrentViewName()).toBe('home')
      app.destroy()
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
