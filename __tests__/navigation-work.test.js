import { afterEach, describe, expect, it, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { hideViewContent, showViewContent, restoreViewContent } from '../src/view-visibility.js'
import '../src/style.css'

let app
afterEach(() => {
  app?.destroy()
  app = null
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.replaceChildren()
})

const view = (content = '', policy = '') => `<div class="z-view" style="width:600px;height:400px;${policy}">${content}</div>`
const trigger = name => `<button class="zoom-me" data-to="${name}" style="position:absolute;left:60px;top:50px;width:150px;height:100px">${name}</button>`

async function createApp (views, driver = 'none') {
  document.body.innerHTML = '<div id="host"><div id="work-canvas" class="zumly-canvas" style="width:800px;height:600px;left:20px;top:30px"></div></div>'
  app = new Zumly({
    mount: '#work-canvas', initialView: 'home', views,
    transitions: { driver, duration: '40ms', ease: 'linear', effects: ['none', 'none'] },
    depthNav: false, lateralNav: false,
  })
  await app.init()
  return app
}

describe('navigation work and rendering policy', () => {
  it('restores inline content visibility and priority after repeated temporary overrides', () => {
    const node = document.createElement('div')
    node.style.setProperty('content-visibility', 'auto', 'important')
    hideViewContent(node)
    showViewContent(node)
    hideViewContent(node)
    showViewContent(node)
    restoreViewContent(node)
    expect(node.style.contentVisibility).toBe('auto')
    expect(node.style.getPropertyPriority('content-visibility')).toBe('important')
    // A subsequent transition remembers the latest author policy.
    node.style.contentVisibility = 'visible'
    hideViewContent(node)
    restoreViewContent(node)
    expect(node.style.contentVisibility).toBe('visible')
  })

  for (const driver of ['none', 'css', 'waapi']) {
    it(`restores CSS auto and authored visibility across detach/back with ${driver}`, async () => {
      await createApp({
        home: view(trigger('a')),
        a: view('<input value="original">' + trigger('b'), 'content-visibility:visible!important'),
        b: view(trigger('c')),
        c: view('End'),
      }, driver)
      const home = app.canvas.querySelector('.is-current-view')
      expect(getComputedStyle(home).contentVisibility).toBe('visible')
      await app.zoomIn(home.querySelector('.zoom-me'))
      const a = app.canvas.querySelector('.is-current-view')
      const input = a.querySelector('input')
      input.value = 'edited'
      expect(getComputedStyle(home).contentVisibility).toBe('auto')
      expect(a.style.contentVisibility).toBe('visible')
      expect(a.style.getPropertyPriority('content-visibility')).toBe('important')
      await app.zoomIn(a.querySelector('.zoom-me'))
      await app.zoomIn(app.canvas.querySelector('.is-current-view .zoom-me'))
      expect(home.isConnected).toBe(false)
      await app.zoomOut()
      expect(home.isConnected).toBe(true)
      expect(home.style.contentVisibility).toBe('')
      expect(getComputedStyle(home).contentVisibility).toBe('auto')
      await app.zoomOut()
      expect(app.canvas.querySelector('.is-current-view')).toBe(a)
      expect(input.value).toBe('edited')
      expect(document.activeElement).toBe(input)
      expect(a.style.getPropertyPriority('content-visibility')).toBe('important')
      await app.zoomOut()
      expect(getComputedStyle(home).contentVisibility).toBe('visible')
    })
  }

  it('does not treat an ancestor scale as a canvas resize', async () => {
    await createApp({ home: view(trigger('detail')), detail: view('Detail') })
    await app.zoomIn(app.canvas.querySelector('.zoom-me'))
    app._resizeObserver?.disconnect()
    const before = JSON.stringify(app.storedViews)
    document.querySelector('#host').style.transform = 'scale(0.5)'
    expect(app.canvas.getBoundingClientRect().width).toBe(400)
    vi.useFakeTimers()
    app._handleResize()
    await vi.advanceTimersByTimeAsync(100)
    expect(JSON.stringify(app.storedViews)).toBe(before)
    expect(app._lastCanvasWidth).toBe(800)
    expect(app._lastCanvasHeight).toBe(600)
    // A real layout resize must still update the stored poses.
    app.canvas.style.width = '1000px'
    app._handleResize()
    await vi.advanceTimersByTimeAsync(100)
    expect(app._lastCanvasWidth).toBe(1000)
    expect(JSON.stringify(app.storedViews)).not.toBe(before)
  })

  it('uses canvas position after async mounting changes layout', async () => {
    await createApp({
      home: view(trigger('detail')),
      detail: {
        render: async () => view('Detail'),
        mounted: async () => {
          app.canvas.style.left = '140px'
          app.canvas.style.top = '110px'
        },
      },
    })
    await app.zoomIn(app.canvas.querySelector('.zoom-me'))
    const canvas = app.canvas.getBoundingClientRect()
    const current = app.canvas.querySelector('.is-current-view').getBoundingClientRect()
    expect(current.x + current.width / 2).toBeCloseTo(canvas.x + canvas.width / 2, 1)
    expect(current.y + current.height / 2).toBeCloseTo(canvas.y + canvas.height / 2, 1)
  })

  it('focuses the first usable control without gathering an entire large form', async () => {
    await createApp({ home: view('<button>First</button>' + '<input>'.repeat(1500)) })
    const current = app.canvas.querySelector('.is-current-view')
    const scan = vi.spyOn(current, 'querySelectorAll')
    app._manageFocus()
    expect(document.activeElement).toBe(current.querySelector('button'))
    expect(scan).not.toHaveBeenCalled()
    current.querySelector('button').hidden = true
    app._manageFocus()
    expect(document.activeElement).toBe(current.querySelector('input'))
  })
})
