import { describe, it, expect, beforeEach } from 'vitest'
import {
  createViewEntry,
  createRemovedViewEntry,
  createZoomSnapshot,
  getDetachedNode,
  INDEX_LAST,
  INDEX_REMOVED
} from '../src/snapshots.js'
import { Zumly } from '../src/zumly.js'

describe('snapshots', () => {
  describe('createZoomSnapshot()', () => {
    it('returns expected structure for 2-view transition (current + previous)', () => {
      const current = createViewEntry(
        'detail',
        { origin: '50% 50%', duration: '1s', ease: 'ease-out', transform: 'translate(0, 0) scale(0.25)' },
        { origin: '50% 50%', duration: '1s', ease: 'ease-out', transform: 'translate(100px, 50px)' }
      )
      const previous = createViewEntry(
        'home',
        { origin: '0 0', duration: '1s', ease: 'ease-out', transform: '' },
        { origin: '125px 100px', duration: '1s', ease: 'ease-out', transform: 'translate(200px, 150px) scale(4)' }
      )
      const snapshot = createZoomSnapshot(2, current, previous, null, null)

      expect(snapshot).toHaveProperty('zoomLevel', 2)
      expect(snapshot).toHaveProperty('views')
      expect(Array.isArray(snapshot.views)).toBe(true)
      expect(snapshot.views).toHaveLength(2)
      expect(snapshot.views[0]).toEqual(current)
      expect(snapshot.views[1]).toEqual(previous)
      expect(snapshot.views[0].viewName).toBe('detail')
      expect(snapshot.views[1].viewName).toBe('home')
      expect(snapshot.views[0].backwardState.transform).toContain('scale(0.25)')
      expect(snapshot.views[1].forwardState.transform).toContain('scale(4)')
    })

    it('includes lastView data when present', () => {
      const current = createViewEntry('c', { origin: '0 0', transform: '' }, { origin: '0 0', transform: 'translate(0,0)' })
      const previous = createViewEntry('p', { origin: '0 0', transform: '' }, { origin: '0 0', transform: 'translate(0,0)' })
      const last = createViewEntry(
        'l',
        { origin: '0 0', duration: '1s', ease: 'ease', transform: 'translate(10px, 10px) scale(2)' },
        { origin: '0 0', duration: '1s', ease: 'ease', transform: 'translate(20px, 20px) scale(4)' }
      )
      const snapshot = createZoomSnapshot(3, current, previous, last, null)

      expect(snapshot.views).toHaveLength(3)
      expect(snapshot.views[INDEX_LAST]).toEqual(last)
      expect(snapshot.views[INDEX_LAST].viewName).toBe('l')
      expect(snapshot.views[INDEX_LAST].backwardState.transform).toContain('scale(2)')
      expect(snapshot.views[INDEX_LAST].forwardState.transform).toContain('scale(4)')
    })

    it('includes removed view with detachedNode when present', () => {
      const current = createViewEntry('c', { origin: '0 0', transform: '' }, { origin: '0 0', transform: '' })
      const previous = createViewEntry('p', { origin: '0 0', transform: '' }, { origin: '0 0', transform: '' })
      const last = createViewEntry('l', { origin: '0 0', transform: '' }, { origin: '0 0', transform: '' })
      const detached = document.createElement('div')
      detached.className = 'z-view'
      const removed = createRemovedViewEntry(detached)
      const snapshot = createZoomSnapshot(4, current, previous, last, removed)

      expect(snapshot.views).toHaveLength(4)
      expect(snapshot.views[INDEX_REMOVED]).toHaveProperty('detachedNode', detached)
      expect(getDetachedNode(snapshot)).toBe(detached)
    })
  })

  describe('getDetachedNode()', () => {
    it('returns undefined when no removed view', () => {
      const snapshot = createZoomSnapshot(2, { viewName: 'a', backwardState: {}, forwardState: {} }, { viewName: 'b', backwardState: {}, forwardState: {} }, null, null)
      expect(getDetachedNode(snapshot)).toBeUndefined()
    })

    it('supports legacy format (viewName as Node) for backward compatibility', () => {
      const node = document.createElement('div')
      const snapshot = { views: [{}, {}, {}, { viewName: node }] }
      expect(getDetachedNode(snapshot)).toBe(node)
    })
  })

  describe('zoomOut() consumes stored snapshot', () => {
    it('consumes snapshot without throwing', async () => {
      document.body.innerHTML = '<div class="first zumly-canvas"></div>'
      const homeView = `<div class="z-view"><div class="card zoom-me" data-to="newView"></div></div>`
      const newView = `<div class="z-view"><p>Detail</p></div>`
      const app = new Zumly({
        mount: '.first',
        initialView: 'homeView',
        views: { homeView, newView },
        transitions: { driver: 'none', duration: '0s', ease: 'linear' }
      })
      await app.init()
      const trigger = app.canvas.querySelector('.zoom-me')
      await app.zoomIn(trigger)

      expect(() => app.zoomOut()).not.toThrow()
      expect(app.storedViews.length).toBe(1)
    })

    it('consumes snapshot with lastView without throwing', async () => {
      document.body.innerHTML = '<div class="first zumly-canvas"></div>'
      const homeView = `<div class="z-view"><div class="card zoom-me" data-to="level2"></div></div>`
      const level2 = `<div class="z-view"><div class="card zoom-me" data-to="level3"></div></div>`
      const level3 = `<div class="z-view"><p>Level 3</p></div>`
      const app = new Zumly({
        mount: '.first',
        initialView: 'homeView',
        views: { homeView, level2, level3 },
        transitions: { driver: 'none', duration: '0s', ease: 'linear' }
      })
      await app.init()
      await app.zoomIn(app.canvas.querySelector('.zoom-me'))
      await app.zoomIn(app.canvas.querySelector('.zoom-me'))

      expect(() => app.zoomOut()).not.toThrow()
      expect(() => app.zoomOut()).not.toThrow()
      expect(app.storedViews.length).toBe(1)
    })
  })
})
