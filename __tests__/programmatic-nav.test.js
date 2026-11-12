/**
 * Tests for programmatic navigation API: getCurrentViewName, getZoomLevel, back, zoomTo.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { ZumlyRouter } from '../src/plugins/router.js'

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

    describe('zoomIn() with a trigger in a view behind the current one', () => {
      const home = `<div class="z-view" style="width:400px;height:300px">
        <span class="zoom-me" data-to="detail" data-id="1" style="position:absolute;left:20px;top:20px;width:40px;height:30px">Detail</span>
        <span class="zoom-me" data-to="settings" data-id="2" style="position:absolute;left:120px;top:20px;width:40px;height:30px">Settings</span>
        <span class="zoom-me" data-to="about" data-sibling="false" style="position:absolute;left:220px;top:20px;width:40px;height:30px">About</span>
      </div>`
      const seen = []
      const leaf = name => ctx => {
        seen.push({ name, props: { ...ctx.props }, trigger: ctx.trigger?.dataset.to })
        return `<div class="z-view" style="width:80px;height:60px">${name}<span class="zoom-me" data-to="deep">Deep</span></div>`
      }
      const events = ['beforeLateral', 'lateralStart', 'afterLateral', 'beforeZoomIn', 'zoomInStart', 'afterZoomIn', 'beforeZoomOut', 'afterZoomOut', 'viewMounted', 'viewChanged']
      let app, fired, warn

      const start = async () => {
        document.body.innerHTML = '<div style="position:relative;width:400px;height:300px"><div class="canvas zumly-canvas"></div></div>'
        window.history.replaceState(null, '', '#')
        seen.length = 0
        app = createApp({ views: { home, detail: leaf('detail'), settings: leaf('settings'), about: leaf('about'), deep: '<div class="z-view" style="width:40px;height:30px">Deep</div>' } })
        app.use(ZumlyRouter)
        await app.init()
        await app.zoomIn(app.canvas.querySelector('[data-to="detail"]'))
        fired = []
        for (const name of events) app.on(name, data => fired.push(`${name}:${data.viewName}${data.from !== undefined ? '<' + data.from : ''}`))
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      }
      const trigger = name => app.canvas.querySelector(`.is-previous-view [data-to="${name}"], .is-last-view [data-to="${name}"]`)
      const state = () => ({
        stack: app.getViewStack().map(view => view.name),
        level: app.zoomLevel(),
        hash: window.location.hash,
        dots: [...app.canvas.querySelectorAll('.z-lateral-nav .z-nav-lat-dot')].map(dot => dot.classList.contains('is-active')),
        zoomed: [...app.canvas.querySelectorAll('.zoomed')].map(el => el.dataset.to),
        lateralHistory: app.lateralHistory.length,
        fired: [...fired],
        last: seen.at(-1)
      })

      afterEach(() => {
        warn?.mockRestore()
        app?.destroy()
        app = null
        window.history.replaceState(null, '', '#')
      })

      it('moves to the sibling when the trigger is a sibling\'s in the parent, as a click on it does', async () => {
        await start()
        const result = app.zoomIn(trigger('settings'))
        expect(result).toBeInstanceOf(Promise)
        expect(await result).toBeUndefined()
        const programmatic = state()
        expect(programmatic).toEqual({
          stack: ['home', 'settings'],
          level: 2,
          hash: '#/home/settings?id=2',
          dots: [false, true],
          zoomed: ['settings'],
          lateralHistory: 1,
          fired: ['beforeLateral:settings<detail', 'viewMounted:settings', 'lateralStart:settings<detail', 'afterLateral:settings<detail', 'viewChanged:settings<detail'],
          last: { name: 'settings', props: { to: 'settings', id: '2' }, trigger: 'settings' }
        })
        expect(warn).not.toHaveBeenCalled()

        // back() returns to the sibling it left, then zooms out.
        await app.back()
        expect(app.getViewStack().map(view => view.name)).toEqual(['home', 'detail'])
        expect(window.location.hash).toBe('#/home/detail?id=1')
        await app.back()
        expect(app.getCurrentViewName()).toBe('home')
        app.destroy()

        // A real click on that trigger's spot ends in the same state.
        await start()
        const rect = trigger('settings').getBoundingClientRect()
        app.canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }))
        await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('settings'))
        await app._navigationTask?.promise
        expect(state()).toEqual(programmatic)
      })

      it('does nothing when the trigger is the one already entered', async () => {
        await start()
        const before = state()
        expect(await app.zoomIn(trigger('detail'))).toBeUndefined()
        expect(state()).toEqual(before)
        expect(before.stack).toEqual(['home', 'detail'])
        expect(warn).not.toHaveBeenCalled()
      })

      it('ignores, with a warning, a trigger in the parent that is not a sibling\'s', async () => {
        await start()
        const before = state()
        await app.zoomIn(trigger('about'))
        expect(state()).toEqual(before)
        expect(warn).toHaveBeenCalledTimes(1)
        const text = warn.mock.calls[0].join(' ')
        expect(text).toMatch(/zoomIn\(\) ignored: the trigger for "about" is in a view behind the current one \("detail"\) and does not lead to a sibling of it\. Call zoomOut\(\) first\./)
        expect(text).not.toMatch(/goTo/)
      })

      it('ignores, with a warning, a trigger in the grandparent', async () => {
        await start()
        await app.zoomIn(app.canvas.querySelector('.is-current-view [data-to="deep"]'))
        const before = state()
        expect(before.stack).toEqual(['home', 'detail', 'deep'])
        await app.zoomIn(trigger('settings'))
        expect(state()).toEqual(before)
        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0].join(' ')).toMatch(/the trigger for "settings" is in a view behind the current one \("deep"\) and does not lead to a sibling of it/)

        // Once its view is the parent again, the same trigger moves to its sibling.
        await app.zoomOut()
        await app.zoomIn(trigger('settings'))
        expect(app.getViewStack().map(view => view.name)).toEqual(['home', 'settings'])
        expect(warn).toHaveBeenCalledTimes(1)
      })
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
