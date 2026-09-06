import { afterEach, describe, expect, it, vi } from 'vitest'
import { ViewPrefetcher } from '../src/view-prefetcher.js'
import { ViewResolver } from '../src/view-resolver.js'
import { ViewCache } from '../src/view-cache.js'

const prefetchers = []
const pendingResponses = []
const makePrefetcher = (views, options) => {
  const prefetcher = new ViewPrefetcher(views, options)
  prefetchers.push(prefetcher)
  return prefetcher
}
const triggersFor = names => {
  const node = document.createElement('div')
  for (const name of names) {
    const trigger = document.createElement('div')
    trigger.className = 'zoom-me'
    trigger.dataset.to = name
    trigger.textContent = name
    node.append(trigger)
  }
  return node
}
const deferredFetch = () => {
  const pending = new Map()
  const fetch = vi.fn(url => new Promise(resolve => {
    const finish = () => resolve({ ok: true, text: async () => `<div>${url}</div>` })
    pending.set(url, finish)
    pendingResponses.push(finish)
  }))
  vi.stubGlobal('fetch', fetch)
  return { fetch, pending }
}

afterEach(async () => {
  for (const prefetcher of prefetchers.splice(0)) prefetcher.destroy()
  for (const finish of pendingResponses.splice(0)) finish()
  await Promise.resolve()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('prefetch avoids unused DOM work', () => {
  it('creates no clones for cold or warm prefetches, but isolates every actual consumer', async () => {
    const cloneNode = Node.prototype.cloneNode
    const countedClones = vi.fn()
    vi.spyOn(Node.prototype, 'cloneNode').mockImplementation(function (deep) {
      if (this.matches?.('[data-count-clones]')) countedClones()
      return cloneNode.call(this, deep)
    })
    const prefetcher = makePrefetcher({ view: '<div data-count-clones><p>Original</p></div>' })
    for (let i = 0; i < 100; i++) prefetcher.prefetch('view')
    await prefetcher.preloadEager(['view', 'view'])
    expect(countedClones).not.toHaveBeenCalled()

    for (let i = 0; i < 100; i++) prefetcher.prefetch('view')
    expect(countedClones).not.toHaveBeenCalled()
    const nodes = await Promise.all(Array.from({ length: 5 }, () => prefetcher.get('view')))
    expect(countedClones).toHaveBeenCalledTimes(5)
    expect(new Set(nodes).size).toBe(5)
    nodes[0].textContent = 'Changed'
    expect(nodes[1].textContent).toBe('Original')
    expect((await prefetcher.get('view')).textContent).toBe('Original')
  })

  it('queries triggers once, prepares all controls, and queues each target once after yielding', async () => {
    vi.useFakeTimers()
    const resolve = vi.spyOn(ViewResolver.prototype, 'resolve')
    const prefetcher = makePrefetcher({ detail: '<div>Detail</div>' })
    const node = triggersFor(Array(100).fill('detail'))
    const query = vi.spyOn(node, 'querySelectorAll')
    prefetcher.scanAndPrefetch(node)
    expect(query).toHaveBeenCalledOnce()
    expect(resolve).not.toHaveBeenCalled()
    for (const trigger of node.children) {
      expect(trigger.getAttribute('tabindex')).toBe('0')
      expect(trigger.getAttribute('role')).toBe('button')
    }
    await vi.advanceTimersToNextTimerAsync()
    expect(resolve).toHaveBeenCalledOnce()
    expect((await prefetcher.get('detail')).textContent).toBe('Detail')
    expect(resolve).toHaveBeenCalledOnce()
  })

  it('limits speculative concurrency and lets navigation promote a queued target immediately', async () => {
    vi.useFakeTimers()
    const pending = new Map()
    const resolve = vi.spyOn(ViewResolver.prototype, 'resolve').mockImplementation(source => new Promise(finish => {
      const release = () => {
        const node = document.createElement('div')
        node.textContent = source
        finish(node)
      }
      pending.set(source, release)
      pendingResponses.push(release)
    }))
    const prefetcher = makePrefetcher({ a: '/a.html', b: '/b.html', c: '/c.html' }, { prefetchConcurrency: 2 })
    prefetcher.scanAndPrefetch(triggersFor(['a', 'b', 'c']))
    // Drain every queued task while both resolutions are pending. No third
    // speculative resolution may begin until a slot is released.
    await vi.runAllTimersAsync()
    expect(resolve.mock.calls.map(([source]) => source)).toEqual(['a', 'b'])

    const firstConsumer = prefetcher.get('c')
    const simultaneousConsumer = prefetcher.get('c')
    expect(resolve.mock.calls.map(([source]) => source)).toEqual(['a', 'b', 'c'])
    pending.get('c')()
    const [first, second] = await Promise.all([firstConsumer, simultaneousConsumer])
    expect(first).not.toBe(second)
    pending.get('a')()
    pending.get('b')()
    await prefetcher.preloadEager(['a', 'b', 'c'])
    await vi.runOnlyPendingTimersAsync()
    expect(resolve).toHaveBeenCalledTimes(3)
  })

  it('joins an in-flight speculative resolution when its view is requested', async () => {
    vi.useFakeTimers()
    const { fetch, pending } = deferredFetch()
    const prefetcher = makePrefetcher({ a: '/a.html' })
    prefetcher.scanAndPrefetch(triggersFor(['a']))
    await vi.advanceTimersToNextTimerAsync()
    const consumer = prefetcher.get('a')
    expect(fetch).toHaveBeenCalledOnce()
    pending.get('/a.html')()
    expect((await consumer).textContent).toBe('/a.html')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('releases a failed scan slot, continues the queue, and permits a fresh retry', async () => {
    vi.useFakeTimers()
    let failedOnce = false
    const fetch = vi.fn(async url => {
      if (url === '/a.html' && !failedOnce) {
        failedOnce = true
        throw new Error('temporary failure')
      }
      return { ok: true, text: async () => `<div>${url}</div>` }
    })
    vi.stubGlobal('fetch', fetch)
    const prefetcher = makePrefetcher({ a: '/a.html', b: '/b.html' }, { prefetchConcurrency: 1 })
    prefetcher.scanAndPrefetch(triggersFor(['a', 'b']))
    await vi.runAllTimersAsync()
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/a.html', '/b.html'])
    expect((await prefetcher.get('b')).textContent).toBe('/b.html')
    expect((await prefetcher.get('a')).textContent).toBe('/a.html')
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/a.html', '/b.html', '/a.html'])
  })

  it('pauses scan and hover work while eager preload and navigation remain immediate', async () => {
    vi.useFakeTimers()
    const resolve = vi.spyOn(ViewResolver.prototype, 'resolve')
    const prefetcher = makePrefetcher({ scan: '<div>Scan</div>', hover: '<div>Hover</div>', eager: '<div>Eager</div>' })
    prefetcher.scanAndPrefetch(triggersFor(['scan']))
    prefetcher.pause()
    prefetcher.prefetch('hover')
    await vi.runOnlyPendingTimersAsync()
    expect(resolve).not.toHaveBeenCalled()
    await prefetcher.preloadEager(['eager'])
    expect(resolve.mock.calls.map(([source]) => source)).toEqual(['eager'])
    expect((await prefetcher.get('scan')).textContent).toBe('Scan')
    expect(resolve.mock.calls.map(([source]) => source)).toEqual(['eager', 'scan'])
    prefetcher.resume()
    await vi.advanceTimersToNextTimerAsync()
    expect(resolve.mock.calls.map(([source]) => source)).toEqual(['eager', 'scan', 'hover'])
  })

  it('bounds pending scan work without preventing navigation to omitted targets', async () => {
    vi.useFakeTimers()
    const resolve = vi.spyOn(ViewResolver.prototype, 'resolve')
    const prefetcher = makePrefetcher({ a: '<div>A</div>', b: '<div>B</div>', c: '<div>C</div>' }, { maxPendingPrefetch: 1 })
    prefetcher.scanAndPrefetch(triggersFor(['a', 'b', 'c']))
    await vi.runAllTimersAsync()
    expect(resolve.mock.calls.map(([source]) => source)).toEqual(['a'])
    expect((await prefetcher.get('c')).textContent).toBe('C')
    expect(resolve.mock.calls.map(([source]) => source)).toEqual(['a', 'c'])
  })

  it('drops stale queued targets when a new view is scanned', async () => {
    vi.useFakeTimers()
    const resolve = vi.spyOn(ViewResolver.prototype, 'resolve')
    const prefetcher = makePrefetcher({ old: '<div>Old</div>', current: '<div>Current</div>' })
    prefetcher.scanAndPrefetch(triggersFor(['old']))
    prefetcher.scanAndPrefetch(triggersFor(['current']))
    await vi.runAllTimersAsync()
    expect(resolve.mock.calls.map(([source]) => source)).toEqual(['current'])
  })

  it('skips a queued target if its source becomes dynamic before the task starts', async () => {
    vi.useFakeTimers()
    const render = vi.fn(() => '<div>Dynamic</div>')
    const views = { view: '<div>Static</div>' }
    const prefetcher = makePrefetcher(views)
    prefetcher.scanAndPrefetch(triggersFor(['view']))
    views.view = render
    await vi.runAllTimersAsync()
    expect(render).not.toHaveBeenCalled()
    await prefetcher.get('view', { props: { id: '42' } })
    expect(render).toHaveBeenCalledOnce()
    expect(render.mock.calls[0][0].props).toEqual({ id: '42' })
  })

  it('cancels queued work on destroy and does not start later hover requests', async () => {
    vi.useFakeTimers()
    const resolve = vi.spyOn(ViewResolver.prototype, 'resolve')
    const prefetcher = makePrefetcher({ a: '<div>A</div>' })
    prefetcher.scanAndPrefetch(triggersFor(['a']))
    prefetcher.destroy()
    prefetcher.resume()
    prefetcher.prefetch('a')
    await vi.runAllTimersAsync()
    expect(resolve).not.toHaveBeenCalled()
  })

  it('returns independent in-flight results even if another completion evicts their cache entry', async () => {
    const prefetcher = makePrefetcher({ a: '<div>A</div>', b: '<div>B</div>' }, { maxCacheEntries: 1 })
    const [a, secondA, b] = await Promise.all([prefetcher.get('a'), prefetcher.get('a'), prefetcher.get('b')])
    expect(a.textContent).toBe('A')
    expect(secondA.textContent).toBe('A')
    expect(a).not.toBe(secondA)
    expect(b.textContent).toBe('B')
  })
})

describe('bounded view cache', () => {
  it('evicts least recently consumed entries without invalidating existing DOM consumers', () => {
    const cache = new ViewCache({ maxEntries: 2 })
    const a = document.createElement('div'); a.textContent = 'A'
    const b = document.createElement('div'); b.textContent = 'B'
    const c = document.createElement('div'); c.textContent = 'C'
    cache.set('a', a)
    cache.set('b', b)
    const consumer = cache.get('a')
    expect(cache.has('b')).toBe(true) // Speculative checks do not refresh recency.
    cache.set('c', c)
    expect(cache.has('a')).toBe(true)
    expect(cache.has('b')).toBe(false)
    expect(cache.has('c')).toBe(true)
    cache.clear()
    expect(consumer.textContent).toBe('A')
  })

  it('removes expired, never-revisited entries before evicting a live entry', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100)
    const cache = new ViewCache({ maxEntries: 2 })
    const node = document.createElement('div')
    cache.set('live', node, 100)
    cache.set('expired', node, 10)
    now.mockReturnValue(110)
    cache.set('new', node)
    expect(cache.has('live')).toBe(true)
    expect(cache.has('expired')).toBe(false)
    expect(cache.has('new')).toBe(true)
  })

  it('keeps public set snapshot semantics and supports explicitly disabling retention', () => {
    const cache = new ViewCache()
    const node = document.createElement('div'); node.textContent = 'Before'
    cache.set('view', node)
    node.textContent = 'After'
    expect(cache.get('view').textContent).toBe('Before')
    const disabled = new ViewCache({ maxEntries: 0 })
    disabled.set('view', node)
    expect(disabled.has('view')).toBe(false)
  })
})
