import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDriver, cssTransition, waapiTransition } from '../src/drivers/index.js'
import { parseDurationMs } from '../src/drivers/waapi-transition.js'
import { Zumly } from '../src/zumly.js'

describe('Transition drivers', () => {
  describe('getDriver()', () => {
    it('returns object with runTransition for "css"', () => {
      const driver = getDriver('css')
      expect(driver).toBeDefined()
      expect(typeof driver.runTransition).toBe('function')
    })

    it('returns object with runTransition for "none"', () => {
      const driver = getDriver('none')
      expect(driver).toBeDefined()
      expect(typeof driver.runTransition).toBe('function')
    })

    it('returns object with runTransition for "waapi"', () => {
      const driver = getDriver('waapi')
      expect(driver).toBeDefined()
      expect(typeof driver.runTransition).toBe('function')
    })

    it('defaults to css for unknown string', () => {
      const driver = getDriver('unknown')
      expect(driver).toBeDefined()
      expect(typeof driver.runTransition).toBe('function')
    })

    it('accepts custom function as driver', () => {
      const custom = vi.fn((spec, onComplete) => {
        expect(spec.type).toBe('zoomIn')
        onComplete()
      })
      const driver = getDriver(custom)
      driver.runTransition({ type: 'zoomIn' }, () => {})
      expect(custom).toHaveBeenCalledWith({ type: 'zoomIn' }, expect.any(Function))
    })
  })

  describe('driver option in Zumly', () => {
    beforeEach(() => {
      document.body.innerHTML = '<div class="canvas zumly-canvas"></div>'
    })

    it('uses "none" driver when transitions.driver is "none"', async () => {
      const homeView = '<div class="z-view"><div class="zoom-me" data-to="detail">Home</div></div>'
      const detailView = '<div class="z-view"><p>Detail</p></div>'
      const app = new Zumly({
        mount: '.canvas',
        initialView: 'home',
        views: { home: homeView, detail: detailView },
        transitions: { driver: 'none' },
      })
      await app.init()
      const trigger = app.canvas.querySelector('.zoom-me')
      await app.zoomIn(trigger)
      expect(app.canvas.querySelector('.is-current-view')).toBeTruthy()
      expect(app.canvas.querySelector('.is-current-view').dataset.viewName).toBe('detail')
      app.zoomOut()
      expect(app.storedViews.length).toBe(1)
    })

    it('default driver is "css" (instance has transitionDriver)', () => {
      const homeView = '<div class="z-view">Home</div>'
      const app = new Zumly({
        mount: '.canvas',
        initialView: 'home',
        views: { home: homeView },
      })
      expect(app.transitionDriver).toBeDefined()
      expect(typeof app.transitionDriver.runTransition).toBe('function')
    })
  })

  describe('none driver runTransition', () => {
    it('calls onComplete when spec is invalid', () => {
      const driver = getDriver('none')
      const onComplete = vi.fn()
      driver.runTransition({}, onComplete)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('calls onComplete when spec has no currentView', () => {
      const driver = getDriver('none')
      const onComplete = vi.fn()
      driver.runTransition({
        type: 'zoomIn',
        previousView: document.createElement('div'),
        currentStage: { views: [] },
      }, onComplete)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  describe('CSS driver runTransition', () => {
    it('calls onComplete when spec is invalid', () => {
      const onComplete = vi.fn()
      cssTransition({}, onComplete)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('calls onComplete when spec has no currentView', () => {
      const onComplete = vi.fn()
      cssTransition({
        type: 'zoomIn',
        previousView: document.createElement('div'),
        currentStage: { views: [] },
      }, onComplete)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })

    it('zoom-in flow cleans up classes and reaches completion after animationend', () => {
      const currentView = document.createElement('div')
      currentView.classList.add('is-new-current-view', 'has-no-events')
      const previousView = document.createElement('div')
      previousView.classList.add('is-previous-view')
      document.body.appendChild(previousView)
      document.body.appendChild(currentView)

      const currentStage = {
        views: [
          { backwardState: { transform: 'scale(0.5)' }, forwardState: { origin: '0 0', transform: 'translate(0,0)' } },
          { backwardState: { transform: '' }, forwardState: { origin: '0 0', transform: 'translate(100px,0)' } },
        ]
      }

      return new Promise((resolve) => {
        cssTransition({
          type: 'zoomIn',
          currentView,
          previousView,
          lastView: null,
          currentStage,
          duration: '10ms',
          ease: 'linear'
        }, () => {
          expect(currentView.classList.contains('is-current-view')).toBe(true)
          expect(currentView.classList.contains('is-new-current-view')).toBe(false)
          expect(currentView.classList.contains('zoom-current-view')).toBe(false)
          expect(previousView.classList.contains('zoom-previous-view')).toBe(false)
          resolve()
        })

        currentView.dispatchEvent(new AnimationEvent('animationend', { bubbles: true }))
        previousView.dispatchEvent(new AnimationEvent('animationend', { bubbles: true }))
      })
    })

    it('missing or removed elements do not leave driver hanging (safety timeout)', async () => {
      const currentView = document.createElement('div')
      currentView.classList.add('is-new-current-view')
      const previousView = document.createElement('div')
      previousView.classList.add('is-previous-view')
      const currentStage = {
        views: [
          { backwardState: { transform: '' }, forwardState: { origin: '0 0', transform: '' } },
          { backwardState: { transform: '' }, forwardState: { origin: '0 0', transform: '' } },
        ]
      }

      const onComplete = vi.fn()
      cssTransition({
        type: 'zoomIn',
        currentView,
        previousView,
        lastView: null,
        currentStage,
        duration: '10ms',
        ease: 'linear'
      }, onComplete)

      currentView.remove()
      previousView.remove()

      await new Promise(r => setTimeout(r, 200))
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  describe('WAAPI driver parseDurationMs', () => {
    it('parses "500ms" as milliseconds', () => {
      expect(parseDurationMs('500ms')).toBe(500)
    })

    it('parses "1s" as seconds', () => {
      expect(parseDurationMs('1s')).toBe(1000)
    })

    it('parses "0.5s" as seconds', () => {
      expect(parseDurationMs('0.5s')).toBe(500)
    })

    it('accepts numeric input', () => {
      expect(parseDurationMs(300)).toBe(300)
    })

    it('falls back for invalid input', () => {
      expect(parseDurationMs('invalid')).toBe(500)
      expect(parseDurationMs('')).toBe(500)
    })
  })

  describe('WAAPI driver runTransition', () => {
    it('successful zoom-in transition calls onComplete()', async () => {
      const currentView = document.createElement('div')
      currentView.classList.add('is-new-current-view', 'has-no-events')
      const previousView = document.createElement('div')
      previousView.classList.add('is-previous-view')
      document.body.appendChild(previousView)
      document.body.appendChild(currentView)

      const currentStage = {
        views: [
          { backwardState: { origin: '0 0', transform: 'scale(0.5)' }, forwardState: { origin: '0 0', transform: 'translate(0,0)' } },
          { backwardState: { origin: '0 0', transform: '' }, forwardState: { origin: '0 0', transform: 'translate(100px,0)' } },
        ]
      }

      const onComplete = vi.fn()
      waapiTransition({
        type: 'zoomIn',
        currentView,
        previousView,
        lastView: null,
        currentStage,
        duration: '20ms',
        ease: 'linear'
      }, onComplete)

      await new Promise(r => setTimeout(r, 100))
      expect(onComplete).toHaveBeenCalledTimes(1)
      expect(currentView.classList.contains('is-current-view')).toBe(true)
    })

    it('rejected finished promises still clean up and call onComplete without throwing', async () => {
      const currentView = document.createElement('div')
      currentView.classList.add('is-new-current-view')
      const previousView = document.createElement('div')
      previousView.classList.add('is-previous-view')
      document.body.appendChild(previousView)
      document.body.appendChild(currentView)

      const currentStage = {
        views: [
          { backwardState: { origin: '0 0', transform: '' }, forwardState: { origin: '0 0', transform: '' } },
          { backwardState: { origin: '0 0', transform: '' }, forwardState: { origin: '0 0', transform: '' } },
        ]
      }

      const rejectingPromise = Promise.reject(new Error('simulated reject'))
      const originalAnimate = Element.prototype.animate
      vi.spyOn(Element.prototype, 'animate').mockImplementation(function (...args) {
        const anim = originalAnimate.apply(this, args)
        if (this === currentView) {
          return { finished: rejectingPromise, cancel: () => {} }
        }
        return anim
      })

      const onComplete = vi.fn()
      waapiTransition({
        type: 'zoomIn',
        currentView,
        previousView,
        lastView: null,
        currentStage,
        duration: '10ms',
        ease: 'linear'
      }, onComplete)

      await new Promise(r => setTimeout(r, 50))
      expect(onComplete).toHaveBeenCalledTimes(1)
      vi.restoreAllMocks()
    })

    it('removed elements do not leave driver hanging (safety timeout)', async () => {
      const currentView = document.createElement('div')
      currentView.classList.add('is-new-current-view')
      const previousView = document.createElement('div')
      previousView.classList.add('is-previous-view')
      document.body.appendChild(previousView)
      document.body.appendChild(currentView)

      const currentStage = {
        views: [
          { backwardState: { origin: '0 0', transform: '' }, forwardState: { origin: '0 0', transform: '' } },
          { backwardState: { origin: '0 0', transform: '' }, forwardState: { origin: '0 0', transform: '' } },
        ]
      }

      const onComplete = vi.fn()
      waapiTransition({
        type: 'zoomIn',
        currentView,
        previousView,
        lastView: null,
        currentStage,
        duration: '10ms',
        ease: 'linear'
      }, onComplete)

      currentView.remove()
      previousView.remove()

      await new Promise(r => setTimeout(r, 200))
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })
})
