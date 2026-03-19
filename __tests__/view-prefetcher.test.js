import { describe, it, expect, vi } from 'vitest'
import { ViewPrefetcher } from '../src/view-prefetcher.js'
import { ViewCache } from '../src/view-cache.js'

describe('ViewPrefetcher caching', () => {
  describe('static HTML view', () => {
    it('is cached and returned as a clone', async () => {
      const html = '<div class="z-view"><p>Static</p></div>'
      const views = { home: html }
      const prefetcher = new ViewPrefetcher(views)

      const a = await prefetcher.get('home')
      const b = await prefetcher.get('home')

      expect(a).not.toBe(b)
      expect(a.cloneNode(true).innerHTML).toBe(b.cloneNode(true).innerHTML)
      expect(a.querySelector('p').textContent).toBe('Static')
      expect(b.querySelector('p').textContent).toBe('Static')
    })
  })

  describe('URL-backed view', () => {
    it('caches with TTL and returns clone', async () => {
      const fakeHtml = '<div class="z-view">Fetched</div>'
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(fakeHtml)
      }))

      const views = { remote: 'https://example.com/page.html' }
      const prefetcher = new ViewPrefetcher(views)

      const a = await prefetcher.get('remote')
      const b = await prefetcher.get('remote')

      expect(a).not.toBe(b)
      expect(a.textContent.trim()).toBe('Fetched')
      expect(a.querySelector('.z-view') || a).toBeTruthy()
      expect(fetch).toHaveBeenCalledTimes(1)

      vi.unstubAllGlobals()
    })
  })

  describe('function-based view', () => {
    it('is not incorrectly reused across different contexts', async () => {
      const createView = (id) => {
        const div = document.createElement('div')
        div.className = 'z-view'
        div.dataset.contextId = String(id)
        div.textContent = `ctx-${id}`
        return div
      }
      const views = {
        dynamic: (ctx) => {
          const id = (ctx && ctx.props && ctx.props.id) ?? 'default'
          return createView(id)
        }
      }
      const prefetcher = new ViewPrefetcher(views)

      const a = await prefetcher.get('dynamic', { props: { id: 'A' } })
      const b = await prefetcher.get('dynamic', { props: { id: 'B' } })

      expect(a.dataset.contextId).toBe('A')
      expect(b.dataset.contextId).toBe('B')
      expect(a).not.toBe(b)
      expect(a.textContent).toBe('ctx-A')
      expect(b.textContent).toBe('ctx-B')
    })

    it('resolves fresh on each get (no cache)', async () => {
      let callCount = 0
      const views = {
        counter: () => {
          callCount += 1
          const div = document.createElement('div')
          div.className = 'z-view'
          div.textContent = String(callCount)
          return div
        }
      }
      const prefetcher = new ViewPrefetcher(views)

      const a = await prefetcher.get('counter')
      const b = await prefetcher.get('counter')

      expect(callCount).toBe(2)
      expect(a.textContent).toBe('1')
      expect(b.textContent).toBe('2')
    })
  })

  describe('object view (render)', () => {
    it('is not cached and resolves fresh with context', async () => {
      let renderCount = 0
      const views = {
        obj: {
          render (ctx) {
            renderCount += 1
            const id = (ctx && ctx.props && ctx.props.id) ?? 'none'
            return `<div class="z-view">obj-${id}</div>`
          }
        }
      }
      const prefetcher = new ViewPrefetcher(views)

      const a = await prefetcher.get('obj', { props: { id: 'x' } })
      const b = await prefetcher.get('obj', { props: { id: 'y' } })

      expect(renderCount).toBe(2)
      expect(a.textContent.trim()).toBe('obj-x')
      expect(b.textContent.trim()).toBe('obj-y')
    })
  })
})

describe('ViewCache', () => {
  it('returns clone on get, not the exact original node', () => {
    const cache = new ViewCache()
    const node = document.createElement('div')
    node.textContent = 'x'
    cache.set('k', node)
    const got = cache.get('k')
    expect(got).not.toBe(node)
    expect(got.textContent).toBe('x')
    const got2 = cache.get('k')
    expect(got2).not.toBe(got)
    expect(got2.textContent).toBe('x')
  })

  it('has() returns true for valid entries and false for expired ones', async () => {
    const cache = new ViewCache()
    const div = document.createElement('div')
    div.textContent = 'valid'
    cache.set('valid', div)
    cache.set('expiring', div, 20)

    expect(cache.has('valid')).toBe(true)
    expect(cache.has('expiring')).toBe(true)
    expect(cache.has('missing')).toBe(false)

    await new Promise(r => setTimeout(r, 30))
    expect(cache.has('valid')).toBe(true)
    expect(cache.has('expiring')).toBe(false)
  })

  it('invalidate() removes an entry cleanly', () => {
    const cache = new ViewCache()
    const node = document.createElement('div')
    node.textContent = 'x'
    cache.set('k', node)
    expect(cache.has('k')).toBe(true)
    expect(cache.get('k')).not.toBeNull()

    cache.invalidate('k')
    expect(cache.has('k')).toBe(false)
    expect(cache.get('k')).toBeNull()
  })

  it('expires URL-backed view after TTL', async () => {
    const cache = new ViewCache()
    const div = document.createElement('div')
    div.innerHTML = '<div class="z-view">Cached</div>'
    cache.set('url-view', div, 30)
    expect(cache.get('url-view')).toBeTruthy()
    await new Promise(r => setTimeout(r, 40))
    expect(cache.get('url-view')).toBeNull()
  })
})
