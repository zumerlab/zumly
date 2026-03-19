import { describe, it, expect } from 'vitest'
import {
  computeCoverScale,
  computeCurrentViewStartTransform,
  computeCurrentViewEndTransform,
  computePreviousViewOrigin,
  computePreviousViewEndTransform,
  computeLastViewEndTransform
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
