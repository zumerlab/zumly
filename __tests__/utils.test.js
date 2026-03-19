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

  it('ignores transitions.effects and warns (not implemented)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { effects: ['blur', 'sepia'] },
      },
      instance
    )

    expect(instance.effects).toEqual(['none', 'none'])
    expect(warnSpy).toHaveBeenCalled()
    expect(warnSpy.mock.calls[0][0]).toContain('transitions.effects')

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
})

