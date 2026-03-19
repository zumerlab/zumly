import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { ViewPrefetcher } from '../src/view-prefetcher.js'

describe('prefetch on focus (accessibility)', () => {
  let app
  let prefetchSpy

  beforeEach(() => {
    document.body.innerHTML = `
      <div class="canvas"></div>
    `
    const homeView = `<div class="z-view">
      <a href="#" class="zoom-me" data-to="detail">Detail</a>
      <span class="plain">Not zoomable</span>
    </div>`
    const detailView = '<div class="z-view"><p>Detail</p></div>'
    app = new Zumly({
      mount: '.canvas',
      initialView: 'homeView',
      views: { homeView, detailView }
    })
    prefetchSpy = vi.spyOn(app.prefetcher, 'prefetch')
  })

  it('focusing a .zoom-me[data-to] element triggers prefetch', async () => {
    await app.init()
    prefetchSpy.mockClear()

    const zoomMe = app.canvas.querySelector('.zoom-me')
    zoomMe.setAttribute('tabindex', '0')
    zoomMe.focus()
    const focusEvent = new FocusEvent('focusin', { bubbles: true })
    zoomMe.dispatchEvent(focusEvent)

    expect(prefetchSpy).toHaveBeenCalledWith('detail', expect.objectContaining({ trigger: zoomMe }))
  })

  it('focusing a non-zoomable element does nothing', async () => {
    await app.init()
    prefetchSpy.mockClear()

    const plain = app.canvas.querySelector('.plain')
    plain.setAttribute('tabindex', '0')
    plain.focus()
    const focusEvent = new FocusEvent('focusin', { bubbles: true })
    plain.dispatchEvent(focusEvent)

    expect(prefetchSpy).not.toHaveBeenCalled()
  })

  it('mouseover on .zoom-me still triggers prefetch', async () => {
    await app.init()
    prefetchSpy.mockClear()

    const zoomMe = app.canvas.querySelector('.zoom-me')
    const mouseoverEvent = new MouseEvent('mouseover', { bubbles: true })
    zoomMe.dispatchEvent(mouseoverEvent)

    expect(prefetchSpy).toHaveBeenCalledWith('detail', expect.objectContaining({ trigger: zoomMe }))
  })
})

describe('prefetch deduplication', () => {
  it('repeated prefetch for cached target does not cause duplicate fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<div class="z-view">Remote</div>')
    }))

    const views = { remote: 'https://example.com/page.html' }
    const prefetcher = new ViewPrefetcher(views)

    prefetcher.prefetch('remote')
    prefetcher.prefetch('remote')
    prefetcher.prefetch('remote')

    await new Promise(r => setTimeout(r, 20))

    expect(fetch).toHaveBeenCalledTimes(1)

    vi.unstubAllGlobals()
  })

  it('repeated prefetch for static view does not cause duplicate resolve', async () => {
    const views = { home: '<div class="z-view">Static</div>' }
    const prefetcher = new ViewPrefetcher(views)

    const a = await prefetcher.get('home')
    const b = await prefetcher.get('home')
    const c = await prefetcher.get('home')

    expect(a).not.toBe(b)
    expect(b).not.toBe(c)
    expect(a.innerHTML).toBe(b.innerHTML)
  })
})
