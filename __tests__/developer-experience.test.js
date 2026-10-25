/**
 * Diagnostics, option normalization, view connectors and lifecycle hooks
 * that make mistakes visible and integrations (Orbit, frameworks) simpler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { ViewResolver } from '../src/view-resolver.js'
import { ViewPrefetcher } from '../src/view-prefetcher.js'
import { suggest } from '../src/diagnostics.js'
import '../src/style.css'

const view = (content = '') => `<div class="z-view" style="width:400px;height:300px">${content}</div>`
const trigger = to => `<div class="zoom-me" data-to="${to}" style="position:absolute;left:20px;top:20px;width:80px;height:60px">${to}</div>`

let app
let warn
let error

beforeEach(() => {
  document.body.innerHTML = '<div style="position:relative;width:400px;height:300px"><div class="canvas zumly-canvas"></div></div>'
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  app?.destroy()
  app = null
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

const messages = spy => spy.mock.calls.map(call => call.join(' '))
const create = (options = {}) => new Zumly({
  mount: '.canvas',
  initialView: 'home',
  views: { home: view(trigger('detail')), detail: view('detail') },
  transitions: { driver: 'none' },
  ...options
})

describe('option diagnostics', () => {
  it('rejects a mistyped initialView with a suggestion', () => {
    app = create({ initialView: 'hom' })
    expect(app.isValid).toBe(false)
    expect(messages(error).join('\n')).toMatch(/view "hom" is not defined in views\. Did you mean "home"\?/)
  })

  it('warns about unknown option keys, with the closest known key', () => {
    app = create({ lateralnav: false, transitions: { drivr: 'none' }, inputs: { wheels: false } })
    const text = messages(warn).join('\n')
    expect(text).toMatch(/unknown option 'lateralnav' is ignored\. Did you mean "lateralNav"\?/)
    expect(text).toMatch(/'transitions\.drivr'.*"driver"/)
    expect(text).toMatch(/'inputs\.wheels'.*"wheel"/)
  })

  it('accepts durations in milliseconds and warns about invalid ones', () => {
    expect(create({ transitions: { duration: 600 } }).duration).toBe('600ms')
    app = create({ transitions: { duration: 'fast' } })
    expect(app.duration).toBe('1s')
    expect(messages(warn).join('\n')).toMatch(/'transitions\.duration'.*"fast"/)
  })

  it('validates CSS easing for the css and waapi drivers but passes library ease names through', () => {
    app = create({ transitions: { driver: 'waapi', ease: 'ease-inn' } })
    expect(app.ease).toBe('ease-in-out')
    expect(messages(warn).join('\n')).toMatch(/"ease-inn" is not a valid CSS easing/)
    expect(create({ transitions: { driver: 'gsap', ease: 'power3.inOut' } }).ease).toBe('power3.inOut')
    expect(create({ transitions: { ease: 'cubic-bezier(.2,.8,.2,1)' } }).ease).toBe('cubic-bezier(.2,.8,.2,1)')
  })

  it('accepts an element as mount and adds the canvas class when missing', async () => {
    const element = document.createElement('div')
    element.style.cssText = 'position:absolute;width:400px;height:300px'
    document.body.append(element)
    app = create({ mount: element })
    expect(app.isValid).toBe(true)
    expect(element.classList.contains('zumly-canvas')).toBe(true)
    await app.init()
    expect(app.getCurrentViewName()).toBe('home')
  })

  it('does not report a canvas that gets its size shortly after init', async () => {
    document.body.innerHTML = '<div id="host" style="position:relative"><div class="canvas zumly-canvas"></div></div>'
    app = create()
    await app.init()
    document.getElementById('host').style.height = '300px'
    await new Promise(resolve => setTimeout(resolve, 1100))
    expect(messages(warn).join('\n')).not.toMatch(/the canvas is/)
  })

  it('explains a canvas without size', async () => {
    document.body.innerHTML = '<div style="position:relative"><div class="canvas zumly-canvas"></div></div>'
    app = create()
    await app.init()
    expect(messages(warn).join('\n')).not.toMatch(/the canvas is/)
    await new Promise(resolve => setTimeout(resolve, 1100))
    expect(messages(warn).join('\n')).toMatch(/the canvas is \d+×0px/)
  })

  it('reports triggers that point at missing views once, when their view becomes current', async () => {
    app = create({ views: { home: view(trigger('detial') + trigger('detial') + '<div class="zoom-me">x</div>'), detail: view() } })
    await app.init()
    const text = messages(warn).join('\n')
    expect(text.match(/data-to="detial"/g)).toHaveLength(1)
    expect(text).toMatch(/Did you mean "detail"\?/)
    expect(text).toMatch(/\.zoom-me element has no data-to/)
  })

  it('suggests only close names', () => {
    expect(suggest('setings', ['settings', 'home'])).toBe('settings')
    expect(suggest('xyz', ['settings', 'home'])).toBe(null)
  })
})

describe('view connectors', () => {
  it('fails an undefined custom element tag instead of locking navigation', async () => {
    app = create({ views: { home: view(trigger('user-detial')), ok: view('ok') } })
    app.prefetcher = new ViewPrefetcher(app.views, { customElementTimeoutMs: 50 })
    await app.init()
    await app.zoomIn(app.canvas.querySelector('[data-to="user-detial"]'))
    expect(app.blockEvents).toBe(false)
    expect(messages(error).join('\n')).toMatch(/view "user-detial" is not defined in views/)
    await app.zoomTo('ok')
    expect(app.getCurrentViewName()).toBe('ok')
  })

  it('keeps every root of a multi-root HTML template', async () => {
    const resolver = new ViewResolver({ cards: '<h1>Title</h1><p>Body</p>', text: 'Hello <b>world</b>', single: '<div class="z-view">one</div>' })
    const cards = await resolver.resolve('cards')
    expect(cards.classList.contains('z-view')).toBe(true)
    expect(cards.querySelector('h1') && cards.querySelector('p')).toBeTruthy()
    expect((await resolver.resolve('text')).textContent).toBe('Hello world')
    expect((await resolver.resolve('single')).textContent).toBe('one')
  })

  it('names the view when a source is not supported', async () => {
    await expect(new ViewResolver({ home: 42 }).resolve('home')).rejects.toThrow(/view "home" has an unsupported source \(a number\)/)
    await expect(new ViewResolver({ home: 'Hello' }).resolve('home')).rejects.toThrow(/unsupported source \(the string "Hello"\)/)
  })

  it('warns when a function view nests another .z-view inside ctx.target', async () => {
    const resolver = new ViewResolver({ nested: ({ target }) => { target.innerHTML = '<div class="z-view card">x</div>' }, styled: ({ target }) => { target.className = 'z-view card'; target.innerHTML = 'x' } })
    await resolver.resolve('nested', {})
    expect(messages(warn).join('\n')).toMatch(/view "nested" filled ctx\.target with another \.z-view/)
    warn.mockClear()
    await resolver.resolve('styled', {})
    expect(warn).not.toHaveBeenCalled()
  })

  it('passes the inserted node to mounted()', async () => {
    let mountedNode
    app = create({ views: { home: { render: () => view('<span>hi</span>'), mounted (node) { mountedNode = node } } } })
    await app.init()
    expect(mountedNode).toBe(app.canvas.querySelector('.is-current-view'))
    expect(mountedNode.isConnected).toBe(true)
  })

  it('runs onActivate when a view becomes current again', async () => {
    const activations = []
    app = create({
      views: {
        home: ({ target, onActivate }) => {
          target.innerHTML = trigger('detail')
          onActivate(() => activations.push('home'))
        },
        detail: view('detail')
      }
    })
    await app.init()
    expect(activations).toEqual([])
    await app.zoomIn(app.canvas.querySelector('[data-to="detail"]'))
    await app.zoomOut()
    expect(activations).toEqual(['home'])
  })
})

describe('navigation events and state', () => {
  it('emits viewChanged for every navigation and names views on zoom-out', async () => {
    app = create({ views: { home: view(trigger('a') + trigger('b')), a: view(), b: view() }, lateralNav: { mode: 'always' } })
    const changes = []
    const zoomOuts = []
    app.on('viewChanged', ({ type, viewName, from, zoomLevel, node }) => changes.push([type, from, viewName, zoomLevel, node?.dataset.viewName]))
    app.on('afterZoomOut', event => zoomOuts.push(event))
    await app.init()
    await app.zoomIn(app.canvas.querySelector('[data-to="a"]'))
    await app.goTo('b', { mode: 'lateral' })
    await app.zoomOut()
    expect(changes).toEqual([
      ['init', null, 'home', 1, 'home'],
      ['zoomIn', 'home', 'a', 2, 'a'],
      ['lateral', 'a', 'b', 2, 'b'],
      ['zoomOut', 'b', 'home', 1, 'home']
    ])
    expect(zoomOuts).toEqual([{ zoomLevel: 1, viewName: 'home', from: 'b' }])
  })

  it('canGoBack() reflects lateral history and depth', async () => {
    app = create({ views: { home: view(trigger('a') + trigger('b')), a: view(), b: view() } })
    await app.init()
    expect(app.canGoBack()).toBe(false)
    await app.zoomIn(app.canvas.querySelector('[data-to="a"]'))
    expect(app.canGoBack()).toBe(true)
    app.destroy()
    expect(app.canGoBack()).toBe(false)
  })

  it('scales the safety reset with long transitions', async () => {
    const delays = []
    const realSetTimeout = window.setTimeout
    vi.spyOn(window, 'setTimeout').mockImplementation((fn, ms, ...rest) => { delays.push(ms); return realSetTimeout(fn, ms, ...rest) })
    app = create({ transitions: { driver: (spec, done) => done(), duration: '20s' } })
    await app.init()
    await app.zoomTo('detail')
    expect(Math.max(...delays.filter(Number.isFinite))).toBeGreaterThanOrEqual(20000)
  })

  it('does not warn on routine no-ops outside debug mode', async () => {
    app = create()
    await app.init()
    app.canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }))
    expect(messages(warn).join('\n')).not.toMatch(/level zero/)
  })
})
