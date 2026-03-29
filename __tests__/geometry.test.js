import { describe, it, expect } from 'vitest'
import {
  computeCoverScale,
  computeCurrentViewStartTransform,
  computeCurrentViewEndTransform,
  computePreviousViewOrigin,
  computePreviousViewEndTransform,
  computeLastViewEndTransform,
  parseOrigin,
  parseTranslateScale,
  computeChildRectAfterParentTransformChange
} from '../src/geometry.js'

describe('geometry helpers', () => {
  describe('computeCoverScale()', () => {
    it('cover: "width" returns scale from width ratio', () => {
      const result = computeCoverScale(100, 50, 400, 200, 'width')
      expect(result.scale).toBe(4)
      expect(result.scaleInv).toBe(0.25)
    })

    it('cover: "height" returns scale from height ratio', () => {
      const result = computeCoverScale(100, 50, 400, 200, 'height')
      expect(result.scale).toBe(4)
      expect(result.scaleInv).toBe(0.25)
    })

    it('cover: "width" and "height" differ when aspect ratios differ', () => {
      const triggerW = 100
      const triggerH = 50
      const viewW = 400
      const viewH = 100
      const widthResult = computeCoverScale(triggerW, triggerH, viewW, viewH, 'width')
      const heightResult = computeCoverScale(triggerW, triggerH, viewW, viewH, 'height')
      expect(widthResult.scale).toBe(4)
      expect(heightResult.scale).toBe(2)
      expect(widthResult.scale).not.toBe(heightResult.scale)
    })
  })

  describe('computeCurrentViewTransforms', () => {
    it('start transform is a string with translate and scale', () => {
      const triggerRect = { x: 50, y: 60, width: 100, height: 80 }
      const canvasOffset = { left: 0, top: 0 }
      const currentViewRect = { width: 400, height: 200 }
      const scaleInv = 0.5
      const t = computeCurrentViewStartTransform(triggerRect, canvasOffset, currentViewRect, scaleInv)
      expect(typeof t).toBe('string')
      expect(t).toMatch(/^translate\([^)]+\)\s+scale\([^)]+\)$/)
      expect(t).toContain('scale(0.5)')
    })

    it('end transform is a string with translate only (no scale)', () => {
      const triggerRectAfterTransform = { x: 100, y: 120, width: 100, height: 80 }
      const canvasOffset = { left: 0, top: 0 }
      const currentViewRect = { width: 400, height: 200 }
      const t = computeCurrentViewEndTransform(triggerRectAfterTransform, canvasOffset, currentViewRect)
      expect(typeof t).toBe('string')
      expect(t).toMatch(/^translate\([^)]+\)$/)
      expect(t).not.toContain('scale')
    })

    it('start and end transforms differ when inputs differ', () => {
      const triggerRect = { x: 50, y: 60, width: 100, height: 80 }
      const triggerRectAfter = { x: 100, y: 120, width: 100, height: 80 }
      const canvasOffset = { left: 0, top: 0 }
      const currentViewRect = { width: 400, height: 200 }
      const start = computeCurrentViewStartTransform(triggerRect, canvasOffset, currentViewRect, 0.25)
      const end = computeCurrentViewEndTransform(triggerRectAfter, canvasOffset, currentViewRect)
      expect(start).not.toBe(end)
      expect(start).toContain('scale(0.25)')
      expect(end).not.toContain('scale')
    })
  })

  describe('computePreviousViewOrigin()', () => {
    it('returns transform-origin string', () => {
      const triggerRect = { x: 100, y: 80, width: 50, height: 40 }
      const previousViewRect = { x: 0, y: 0 }
      const origin = computePreviousViewOrigin(triggerRect, previousViewRect)
      expect(typeof origin).toBe('string')
      expect(origin).toMatch(/^\d+px \d+px$/)
      expect(origin).toBe('125px 100px')
    })
  })

  describe('computePreviousViewEndTransform()', () => {
    it('returns transform string and x,y for lastView', () => {
      const canvasRect = { width: 800, height: 600 }
      const triggerRect = { x: 100, y: 80, width: 50, height: 40 }
      const previousViewRect = { x: 0, y: 0 }
      const scale = 4
      const result = computePreviousViewEndTransform(canvasRect, triggerRect, previousViewRect, scale)
      expect(result).toHaveProperty('x')
      expect(result).toHaveProperty('y')
      expect(result).toHaveProperty('transform')
      expect(typeof result.transform).toBe('string')
      expect(result.transform).toContain(`scale(${scale})`)
    })

    it('applies parallax factor to reduce translation displacement', () => {
      const canvasRect = { width: 800, height: 600 }
      const triggerRect = { x: 100, y: 80, width: 50, height: 40 }
      const previousViewRect = { x: 0, y: 0 }
      const scale = 4
      const noParallax = computePreviousViewEndTransform(canvasRect, triggerRect, previousViewRect, scale, 0)
      const withParallax = computePreviousViewEndTransform(canvasRect, triggerRect, previousViewRect, scale, 0.2)
      // Raw x,y stay the same (used for lastView intermediate computation)
      expect(withParallax.x).toBe(noParallax.x)
      expect(withParallax.y).toBe(noParallax.y)
      // But the transform translation is reduced by the parallax factor
      expect(withParallax.transform).toContain(`scale(${scale})`)
      expect(withParallax.transform).not.toBe(noParallax.transform)
      // Parallaxed translate values should be 80% of the originals (factor = 1 - 0.2)
      const expectedTx = noParallax.x * 0.8
      const expectedTy = noParallax.y * 0.8
      expect(withParallax.transform).toBe(`translate(${expectedTx}px, ${expectedTy}px) scale(${scale})`)
    })
  })

  describe('parseOrigin()', () => {
    it('parses "123px 456px" into numeric values', () => {
      const o = parseOrigin('123px 456px')
      expect(o.x).toBe(123)
      expect(o.y).toBe(456)
    })

    it('handles decimal values', () => {
      const o = parseOrigin('12.5px 34.75px')
      expect(o.x).toBe(12.5)
      expect(o.y).toBe(34.75)
    })
  })

  describe('parseTranslateScale()', () => {
    it('parses "translate(10px, 20px) scale(3)"', () => {
      const r = parseTranslateScale('translate(10px, 20px) scale(3)')
      expect(r.tx).toBe(10)
      expect(r.ty).toBe(20)
      expect(r.scale).toBe(3)
    })

    it('handles negative values', () => {
      const r = parseTranslateScale('translate(-5.5px, -10.2px) scale(0.25)')
      expect(r.tx).toBe(-5.5)
      expect(r.ty).toBe(-10.2)
      expect(r.scale).toBe(0.25)
    })
  })

  describe('computeChildRectAfterParentTransformChange()', () => {
    const O = { x: 0, y: 0 } // zero origin

    it('identity→identity returns same rect', () => {
      const child = { x: 50, y: 60, width: 100, height: 80 }
      const parent = { x: 0, y: 0, width: 400, height: 300 }
      const result = computeChildRectAfterParentTransformChange(
        child, parent, O, 0, 0, 1, O, 0, 0, 1
      )
      expect(result.x).toBeCloseTo(50)
      expect(result.y).toBeCloseTo(60)
      expect(result.width).toBeCloseTo(100)
      expect(result.height).toBeCloseTo(80)
    })

    it('identity→translate shifts child', () => {
      const child = { x: 50, y: 60, width: 100, height: 80 }
      const parent = { x: 0, y: 0, width: 400, height: 300 }
      const result = computeChildRectAfterParentTransformChange(
        child, parent, O, 0, 0, 1, O, 10, 20, 1
      )
      expect(result.x).toBeCloseTo(60)
      expect(result.y).toBeCloseTo(80)
      expect(result.width).toBeCloseTo(100)
      expect(result.height).toBeCloseTo(80)
    })

    it('identity→scale(2) with origin 0,0 doubles position and size', () => {
      const child = { x: 100, y: 200, width: 50, height: 40 }
      const parent = { x: 0, y: 0, width: 400, height: 300 }
      const result = computeChildRectAfterParentTransformChange(
        child, parent, O, 0, 0, 1, O, 0, 0, 2
      )
      expect(result.x).toBeCloseTo(200)
      expect(result.y).toBeCloseTo(400)
      expect(result.width).toBeCloseTo(100)
      expect(result.height).toBeCloseTo(80)
    })

    it('handles parent already transformed (old scale 2 → new scale 4)', () => {
      // Parent layout at (0,0) 400x300, old transform: scale(2) origin 0,0
      // So parent screen rect = (0,0) 800x600
      // Child layout at (50,60) 100x80, after old scale(2): screen rect = (100,120) 200x160
      const parent = { x: 0, y: 0, width: 800, height: 600 }
      const child = { x: 100, y: 120, width: 200, height: 160 }
      const result = computeChildRectAfterParentTransformChange(
        child, parent, O, 0, 0, 2, O, 0, 0, 4
      )
      // Child layout (50,60) 100x80 → after scale(4): (200,240) 400x320
      expect(result.x).toBeCloseTo(200)
      expect(result.y).toBeCloseTo(240)
      expect(result.width).toBeCloseTo(400)
      expect(result.height).toBeCloseTo(320)
    })

    it('handles origin change between old and new transforms', () => {
      // Parent layout at (0,0) 400x300
      // Old: translate(0,0) scale(1) origin(0,0) → parent screen (0,0) 400x300
      // Child layout at (200,150) → screen same
      const parent = { x: 0, y: 0, width: 400, height: 300 }
      const child = { x: 200, y: 150, width: 50, height: 50 }
      const newOrigin = { x: 200, y: 150 } // origin at child center
      const result = computeChildRectAfterParentTransformChange(
        child, parent, O, 0, 0, 1, newOrigin, 0, 0, 2
      )
      // scale(2) around (200,150): child at (200,150) stays at (200,150), size doubles
      expect(result.x).toBeCloseTo(200)
      expect(result.y).toBeCloseTo(150)
      expect(result.width).toBeCloseTo(100)
      expect(result.height).toBeCloseTo(100)
    })
  })

  describe('computeLastViewEndTransform()', () => {
    it('matches known output for fixed rects (object-param refactor regression)', () => {
      const canvasRect = { width: 800, height: 600 }
      const canvasOffset = { left: 10, top: 20 }
      const triggerRect = { x: 100, y: 80, width: 50, height: 40 }
      const previousViewRectAtBaseTransform = { x: 5, y: 6, width: 400, height: 300 }
      const lastViewZoomedElementRect = { x: 7, y: 8, width: 30, height: 20 }
      const previousViewRectWithPreviousAtEndTransform = { x: 9, y: 10, width: 350, height: 250 }
      const t = computeLastViewEndTransform({
        canvasRect,
        canvasOffset,
        triggerRect,
        previousViewRectAtBaseTransform,
        lastViewZoomedElementRect,
        previousViewRectWithPreviousAtEndTransform,
        scale: 2,
        preScale: 0.5
      })
      expect(t).toBe('translate(432px, 303px) scale(1)')
    })
  })
})
