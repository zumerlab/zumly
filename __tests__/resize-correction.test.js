/**
 * Tests for cheap resize correction: translate/origin scaling, scale preservation,
 * idle-only application, deferred correction during transition.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  parseZumlyTransform,
  scaleZumlyTransform,
  parsePixelOrigin,
  scalePixelOrigin,
  applyResizeCorrection
} from '../src/resize-correction.js'
import { Zumly } from '../src/zumly.js'

describe('resize correction helpers', () => {
  describe('parseZumlyTransform', () => {
    it('parses translate(xpx, ypx) scale(s)', () => {
      const r = parseZumlyTransform('translate(100px, 50px) scale(0.25)')
      expect(r).toEqual({ tx: 100, ty: 50, rest: 'scale(0.25)' })
    })

    it('parses translate(xpx, ypx) only', () => {
      const r = parseZumlyTransform('translate(200px, 150px)')
      expect(r).toEqual({ tx: 200, ty: 150, rest: '' })
    })

    it('returns zeroed for empty string', () => {
      const r = parseZumlyTransform('')
      expect(r).toEqual({ tx: 0, ty: 0, rest: '' })
    })

    it('returns null for unsupported format', () => {
      expect(parseZumlyTransform('scale(0.5)')).toBeNull()
      expect(parseZumlyTransform('rotate(45deg)')).toBeNull()
    })
  })

  describe('scaleZumlyTransform', () => {
    it('rescales translate, preserves scale', () => {
      const t = 'translate(100px, 50px) scale(0.25)'
      expect(scaleZumlyTransform(t, 2, 2)).toBe('translate(200px, 100px) scale(0.25)')
    })

    it('scale(...) remains unchanged', () => {
      const t = 'translate(80px, 40px) scale(0.5)'
      const out = scaleZumlyTransform(t, 1.5, 1.5)
      expect(out).toContain('scale(0.5)')
      expect(out).toBe('translate(120px, 60px) scale(0.5)')
    })

    it('returns original for unsupported format', () => {
      const t = 'scale(0.5)'
      expect(scaleZumlyTransform(t, 2, 2)).toBe(t)
    })
  })

  describe('parsePixelOrigin', () => {
    it('parses "Xpx Ypx"', () => {
      expect(parsePixelOrigin('123px 456px')).toEqual({ x: 123, y: 456 })
    })

    it('returns null for non-pixel format', () => {
      expect(parsePixelOrigin('0 0')).toBeNull()
      expect(parsePixelOrigin('50% 50%')).toBeNull()
    })
  })

  describe('scalePixelOrigin', () => {
    it('rescales pixel origin', () => {
      expect(scalePixelOrigin('100px 200px', 2, 0.5)).toBe('200px 100px')
    })

    it('returns original for unsupported format', () => {
      expect(scalePixelOrigin('0 0', 2, 2)).toBe('0 0')
    })
  })
})

describe('resize correction integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="canvas zumly-canvas" style="width:400px;height:300px"></div>'
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

  it('after init(), resize event does not throw', async () => {
    const app = createApp()
    await app.init()
    expect(() => {
      window.dispatchEvent(new Event('resize'))
    }).not.toThrow()
  })

  it('after depth navigation, resize correction updates stored snapshot consistently', async () => {
    const app = createApp()
    await app.init()
    await app.goTo('detailA', { mode: 'depth' })
    const before = app.storedViews[1].views[0].forwardState.transform
    const ratioX = 2
    const ratioY = 1.5
    const w = app.canvas.getBoundingClientRect().width
    const h = app.canvas.getBoundingClientRect().height
    applyResizeCorrection(app, w, h, w * ratioX, h * ratioY)
    const after = app.storedViews[1].views[0].forwardState.transform
    expect(after).not.toBe(before)
    expect(after).toMatch(/translate\s*\(/)
  })

  it('scale(...) parts remain unchanged after resize correction', async () => {
    const app = createApp()
    await app.init()
    await app.goTo('detailA', { mode: 'depth' })
    const snapshot = app.storedViews[1]
    const getScale = (t) => (t && t.match(/scale\s*\([^)]+\)/)) ? t.match(/scale\s*\([^)]+\)/)[0] : null
    const scalesBefore = snapshot.views
      .filter(v => v && !v.detachedNode)
      .flatMap(v => [
        v.backwardState?.transform && getScale(v.backwardState.transform),
        v.forwardState?.transform && getScale(v.forwardState.transform)
      ])
      .filter(Boolean)
    const r = app.canvas.getBoundingClientRect()
    applyResizeCorrection(app, r.width, r.height, r.width * 1.5, r.height * 2)
    const scalesAfter = snapshot.views
      .filter(v => v && !v.detachedNode)
      .flatMap(v => [
        v.backwardState?.transform && getScale(v.backwardState.transform),
        v.forwardState?.transform && getScale(v.forwardState.transform)
      ])
      .filter(Boolean)
    expect(scalesAfter).toEqual(scalesBefore)
  })

  it('translate(...) coordinates are adjusted by expected ratios', async () => {
    const app = createApp()
    await app.init()
    await app.goTo('detailA', { mode: 'depth' })
    const v1 = app.storedViews[1].views[1]
    const before = v1.forwardState.transform
    const m = before.match(/translate\s*\(\s*([-\d.eE]+)px\s*,\s*([-\d.eE]+)px\s*\)/)
    if (!m) return
    const txBefore = parseFloat(m[1])
    const tyBefore = parseFloat(m[2])
    const ratioX = 2
    const ratioY = 1.5
    const r = app.canvas.getBoundingClientRect()
    applyResizeCorrection(app, r.width, r.height, r.width * ratioX, r.height * ratioY)
    const after = v1.forwardState.transform
    const m2 = after.match(/translate\s*\(\s*([-\d.eE]+)px\s*,\s*([-\d.eE]+)px\s*\)/)
    expect(m2).toBeTruthy()
    expect(parseFloat(m2[1])).toBeCloseTo(txBefore * ratioX, 2)
    expect(parseFloat(m2[2])).toBeCloseTo(tyBefore * ratioY, 2)
  })

  it('transform-origin pixel coords are adjusted by expected ratios', async () => {
    const app = createApp()
    await app.init()
    await app.goTo('detailA', { mode: 'depth' })
    const v1 = app.storedViews[1].views[1]
    const originBefore = v1.forwardState.origin
    const parsed = originBefore.match(/^([-\d.eE]+)px\s+([-\d.eE]+)px$/)
    if (!parsed) return
    const oxBefore = parseFloat(parsed[1])
    const oyBefore = parseFloat(parsed[2])
    const ratioX = 1.5
    const ratioY = 2
    const r = app.canvas.getBoundingClientRect()
    applyResizeCorrection(app, r.width, r.height, r.width * ratioX, r.height * ratioY)
    const originAfter = v1.forwardState.origin
    const parsed2 = originAfter.match(/^([-\d.eE]+)px\s+([-\d.eE]+)px$/)
    expect(parsed2).toBeTruthy()
    expect(parseFloat(parsed2[1])).toBeCloseTo(oxBefore * ratioX, 2)
    expect(parseFloat(parsed2[2])).toBeCloseTo(oyBefore * ratioY, 2)
  })

  it('after resize correction, back() still works', async () => {
    const app = createApp()
    await app.init()
    await app.goTo('detailA', { mode: 'depth' })
    const r = app.canvas.getBoundingClientRect()
    applyResizeCorrection(app, r.width, r.height, r.width * 1.2, r.height * 1.2)
    app._recordCanvasSize()
    app.back()
    expect(app.getCurrentViewName()).toBe('home')
    expect(app.getZoomLevel()).toBe(1)
  })

  it('after resize correction, click-based navigation still works', async () => {
    const app = createApp()
    await app.init()
    const r = app.canvas.getBoundingClientRect()
    applyResizeCorrection(app, r.width, r.height, r.width * 0.8, r.height * 0.8)
    app._recordCanvasSize()
    const trigger = app.canvas.querySelector('.zoom-me[data-to="detailA"]')
    await app.zoomIn(trigger)
    expect(app.getCurrentViewName()).toBe('detailA')
  })

  it('after resize correction, lateral navigation still works', async () => {
    const app = createApp()
    await app.init()
    await app.goTo('detailA', { mode: 'depth' })
    const r = app.canvas.getBoundingClientRect()
    applyResizeCorrection(app, r.width, r.height, r.width * 1.1, r.height * 1.1)
    app._recordCanvasSize()
    await app.goTo('detailB', { mode: 'lateral' })
    expect(app.getCurrentViewName()).toBe('detailB')
    await app.back()
    expect(app.getCurrentViewName()).toBe('detailA')
  })

  it('if resize occurs during transition, correction is deferred and applied afterward', async () => {
    const app = createApp({ transitions: { driver: 'css', duration: '500ms', ease: 'linear' } })
    await app.init()
    await app.goTo('detailA', { mode: 'depth' })
    const r0 = app.canvas.getBoundingClientRect()
    app._lastCanvasWidth = r0.width
    app._lastCanvasHeight = r0.height
    app.back()
    app.canvas.style.width = `${r0.width + 100}px`
    app.canvas.style.height = `${r0.height + 50}px`
    app._handleResize()
    await new Promise(r => setTimeout(r, 100))
    expect(app._pendingResizeCorrection).toBe(true)
    app.blockEvents = false
    app._onTransitionComplete()
    expect(app._pendingResizeCorrection).toBe(false)
    await new Promise(r => setTimeout(r, 700))
  })
})
