import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDriver, cssTransition } from '../src/drivers/index.js'
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
})
