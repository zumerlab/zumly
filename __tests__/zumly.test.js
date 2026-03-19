import { describe, it, expect, beforeAll, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'

let zumly0
let zumly1
let homeView

beforeAll(async () => {
  document.body.innerHTML = `
    <div class="first zumly-canvas"></div>
    <div class="second zumly-canvas"></div>
  `

  homeView = `<div class="z-view">
    <div class='card zoom-me' data-to='newView'></div>
  </div>`

  zumly0 = new Zumly({
    mount: '.first',
    initialView: 'homeView',
    views: { homeView },
  })
  await zumly0.init()

  zumly1 = new Zumly({
    mount: '.second',
    initialView: 'homeView',
    views: { homeView },
    transitions: {
      effects: ['blur', 'sepia', 'saturate'],
    },
  })
  await zumly1.init()
})

describe('Zumly parameters', () => {
  describe('that are required', () => {
    it('mount should be a string', () => {
      expect(zumly0.mount).toBe('.first')
    })

    it('initialView should be a string', () => {
      expect(zumly0.initialView).toBe('homeView')
    })

    it('views should be an object', () => {
      expect(zumly0.views).toMatchObject({ homeView })
    })
  })

  describe('that are optional', () => {
    it('cover should be a string', () => {
      expect(zumly0.cover).toBe('width')
    })

    it('duration should be a string', () => {
      expect(zumly0.duration).toBe('1s')
    })

    it('ease should be a string', () => {
      expect(zumly0.ease).toBe('ease-in-out')
    })

    it('effects should be an array (default)', () => {
      expect(zumly0.effects).toEqual(expect.arrayContaining(['none', 'none']))
    })

    it('effects should be an array (custom)', () => {
      expect(zumly1.effects).toEqual(
        expect.arrayContaining([
          'blur(0px) sepia(0) saturate(0) ',
          'blur(0.8px) sepia(5) saturate(8) ',
        ])
      )
    })

    it('debug should be a boolean', () => {
      expect(zumly0.debug).toBe(false)
    })

    it('preload should default to an array', () => {
      expect(Array.isArray(zumly0.preload)).toBe(true)
      expect(zumly0.preload).toHaveLength(0)
    })
  })
})

describe('Zumly instances', () => {
  it('should render initial view into first canvas', () => {
    const first = document.querySelector('.first.zumly-canvas')
    expect(first).toBeTruthy()
    const current = first.querySelector('.z-view.is-current-view')
    expect(current).toBeTruthy()
    expect(current.dataset.viewName).toBe('homeView')
    expect(first.querySelector('.zoom-me[data-to="newView"]')).toBeTruthy()
  })

  it('should render initial view into second canvas', () => {
    const second = document.querySelector('.second.zumly-canvas')
    expect(second).toBeTruthy()
    const current = second.querySelector('.z-view.is-current-view')
    expect(current).toBeTruthy()
    expect(current.dataset.viewName).toBe('homeView')
  })

  it('should have storedViews after init', () => {
    expect(zumly0.storedViews.length).toBeGreaterThanOrEqual(1)
    expect(zumly1.storedViews.length).toBeGreaterThanOrEqual(1)
  })
})

describe('Zumly invalid initialization', () => {
  it('leaves instance invalid when mount is missing', () => {
    const invalid = new Zumly({ initialView: 'home', views: {} })
    expect(invalid.isValid).toBe(false)
    expect(invalid.prefetcher).toBeUndefined()
    expect(invalid.canvas).toBeUndefined()
  })

  it('does not crash and does not bind events when mount selector matches nothing', () => {
    const invalid = new Zumly({
      mount: '.missing',
      initialView: 'home',
      views: { home: '<div class="z-view"></div>' },
    })
    expect(invalid.isValid).toBe(false)
    expect(invalid.canvas).toBeNull()
    expect(invalid.prefetcher).toBeUndefined()
  })

  it('init() on invalid instance is a no-op and never null dereferences', async () => {
    const invalid = new Zumly({ initialView: 'home', views: {} })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(invalid.init()).resolves.toBeUndefined()
    expect(invalid.storedViews).toHaveLength(0)
    errorSpy.mockRestore()
  })
})
