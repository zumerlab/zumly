import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkParameters, prepareAndInsertView, renderView } from '../src/utils.js'

describe('utils.prepareAndInsertView()', () => {
  let canvas
  let views

  beforeEach(() => {
    document.body.innerHTML = '<div id="canvas"></div>'
    canvas = document.getElementById('canvas')
    views = { home: '<div class="z-view"><p>Home</p></div>' }
  })

  it('adds .z-view if node does not have it', async () => {
    const node = document.createElement('div')
    node.innerHTML = '<span>content</span>'
    expect(node.classList.contains('z-view')).toBe(false)

    const result = await prepareAndInsertView(node, 'home', canvas, true, views, new Map())
    expect(result.classList.contains('z-view')).toBe(true)
    expect(canvas.contains(result)).toBe(true)
  })

  it('keeps .z-view when node already has it', async () => {
    const node = document.createElement('div')
    node.classList.add('z-view')
    node.innerHTML = '<p>content</p>'

    const result = await prepareAndInsertView(node, 'home', canvas, true, views, new Map())
    expect(result.classList.contains('z-view')).toBe(true)
    expect(result).toBe(node)
  })

  it('calls mounted() only after insertion into canvas', async () => {
    const insertedBeforeMounted = []
    const node = document.createElement('div')
    node.classList.add('z-view')
    views.home = {
      render: () => '<div class="z-view"></div>',
      mounted () {
        insertedBeforeMounted.push(canvas.contains(node))
      }
    }

    await prepareAndInsertView(node, 'home', canvas, true, views, new Map())
    expect(insertedBeforeMounted).toEqual([true])
  })
})

describe('utils.renderView()', () => {
  let canvas
  let views

  beforeEach(() => {
    document.body.innerHTML = '<div id="canvas"></div>'
    canvas = document.getElementById('canvas')
    views = { home: '<div class="card">Home</div>' }
  })

  it('is deprecated and delegates to ViewResolver + prepareAndInsertView', async () => {
    const result = await renderView('home', canvas, views, true, new Map())
    expect(result).toBeTruthy()
    expect(result.classList.contains('z-view')).toBe(true)
    expect(result.dataset.viewName).toBe('home')
    expect(canvas.querySelector('.z-view')).toBe(result)
  })

  it('produces correct classes and dataset consistent with pipeline', async () => {
    const result = await renderView('home', canvas, views, true, new Map())
    expect(result.classList.contains('z-view')).toBe(true)
    expect(result.dataset.viewName).toBe('home')
    expect(result.classList.contains('is-current-view')).toBe(true)
    expect(canvas.contains(result)).toBe(true)
  })
})

describe('utils.checkParameters()', () => {
  it('applies defaults when transitions are missing', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
      },
      instance
    )

    expect(instance.cover).toBe('width')
    expect(instance.duration).toBe('1s')
    expect(instance.ease).toBe('ease-in-out')
    expect(instance.effects).toEqual(['none', 'none'])
    expect(instance.preload).toEqual([])
    expect(instance.debug).toBe(false)
    expect(instance.componentContext instanceof Map).toBe(true)
  })

  it('accepts cover=height and keeps it', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { cover: 'height' },
      },
      instance
    )

    expect(instance.cover).toBe('height')
  })

  it('falls back to cover=width when cover is invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { cover: 'auto' },
      },
      instance
    )

    expect(instance.cover).toBe('width')
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('parses transitions.effects as array of CSS filter strings', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { effects: ['blur(3px)', 'blur(8px) saturate(0)'] },
      },
      instance
    )

    expect(instance.effects).toEqual(['blur(3px)', 'blur(8px) saturate(0)'])
  })

  it('warns and falls back for invalid transitions.effects', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { effects: 'invalid' },
      },
      instance
    )

    expect(instance.effects).toEqual(['none', 'none'])
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('sets preload/debug/componentContext defaults', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        preload: ['home'],
        debug: true,
      },
      instance
    )

    expect(instance.preload).toEqual(['home'])
    expect(instance.debug).toBe(true)
    expect(instance.componentContext instanceof Map).toBe(true)
  })

  it('sets isValid=true when all required params are valid', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
      },
      instance
    )
    expect(instance.isValid).toBe(true)
  })

  it('keeps isValid=false when mount is missing', () => {
    const instance = {}
    checkParameters({ initialView: 'home', views: {} }, instance)
    expect(instance.isValid).toBe(false)
  })

  it('keeps isValid=false when options is null', () => {
    const instance = {}
    checkParameters(null, instance)
    expect(instance.isValid).toBe(false)
  })

  it('parses transitions.parallax as number between 0 and 1', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { parallax: 0.15 },
      },
      instance
    )
    expect(instance.parallax).toBe(0.15)
  })

  it('defaults parallax to 0 when not provided', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
      },
      instance
    )
    expect(instance.parallax).toBe(0)
  })

  it('warns and falls back for invalid transitions.parallax', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { parallax: 'bad' },
      },
      instance
    )
    expect(instance.parallax).toBe(0)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('parses transitions.stagger as positive number (ms)', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { stagger: 60 },
      },
      instance
    )
    expect(instance.stagger).toBe(60)
  })

  it('defaults stagger to 0 when not provided', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
      },
      instance
    )
    expect(instance.stagger).toBe(0)
  })

  it('warns and falls back for invalid transitions.stagger', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { stagger: 'bad' },
      },
      instance
    )
    expect(instance.stagger).toBe(0)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('parses transitions.hideTrigger as true', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { hideTrigger: true },
      },
      instance
    )
    expect(instance.hideTrigger).toBe(true)
  })

  it('parses transitions.hideTrigger as "fade"', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { hideTrigger: 'fade' },
      },
      instance
    )
    expect(instance.hideTrigger).toBe('fade')
  })

  it('defaults hideTrigger to false when not provided', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
      },
      instance
    )
    expect(instance.hideTrigger).toBe(false)
  })

  it('warns and falls back for invalid transitions.hideTrigger', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { hideTrigger: 'invalid' },
      },
      instance
    )
    expect(instance.hideTrigger).toBe(false)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('parses deferred option as boolean', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        deferred: true,
      },
      instance
    )
    expect(instance.deferred).toBe(true)
  })

  it('defaults deferred to false when not provided', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
      },
      instance
    )
    expect(instance.deferred).toBe(false)
  })
})

