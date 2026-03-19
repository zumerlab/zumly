import { describe, it, expect, vi } from 'vitest'
import { checkParameters } from '../src/utils.js'

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

  it('normalizes effects=blur/sepia/saturate', () => {
    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { effects: ['blur', 'sepia', 'saturate'] },
      },
      instance
    )

    expect(instance.effects).toEqual([
      'blur(0px) sepia(0) saturate(0) ',
      'blur(0.8px) sepia(5) saturate(8) ',
    ])
  })

  it('falls back effects when effects array contains invalid values', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const instance = {}
    checkParameters(
      {
        mount: '.first',
        initialView: 'home',
        views: { home: '<div class="z-view"></div>' },
        transitions: { effects: ['blur', 'bad'] },
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
})

