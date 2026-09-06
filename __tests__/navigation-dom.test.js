import { afterEach, describe, expect, it, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import '../src/style.css'

const apps = []
afterEach(() => {
  for (const app of apps.splice(0).reverse()) app.destroy()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

async function createApp (parent = document.body, options = {}) {
  const canvas = document.createElement('div')
  canvas.id = `navigation-canvas-${apps.length}`
  canvas.className = 'zumly-canvas'
  canvas.style.cssText = 'position:relative;width:800px;height:600px'
  parent.append(canvas)
  const app = new Zumly({
    mount: `#${canvas.id}`,
    initialView: 'home',
    views: {
      home: '<div class="z-view" style="width:800px;height:600px"><div class="zoom-me" data-to="a" style="width:80px;height:60px">A</div></div>',
      a: '<div class="z-view" style="width:400px;height:300px">A</div>',
      b: '<div class="z-view" style="width:400px;height:300px">B</div>',
      c: '<div class="z-view" style="width:400px;height:300px">C</div>',
    },
    transitions: { driver: 'none' },
    lateralNav: { mode: 'always', siblings: ['a', 'b', 'c'] },
    inputs: { wheel: false },
    ...options,
  })
  apps.push(app)
  await app.init()
  await app.zoomTo('a')
  return app
}

const ownNav = (app, type) => app.canvas.querySelector(`:scope > .z-${type}-nav`)
async function clickTo (app, button, name) {
  button.click()
  await vi.waitFor(() => {
    expect(app.getCurrentViewName()).toBe(name)
    expect(app.blockEvents).toBe(false)
  })
}

describe('navigation DOM reuse', () => {
  it('keeps depth, lateral and button identities across repeated lateral navigation', async () => {
    const app = await createApp()
    const depth = ownNav(app, 'depth')
    const lateral = ownNav(app, 'lateral')
    const buttons = [...lateral.querySelectorAll('button')]
    for (const name of ['b', 'c', 'b', 'a']) {
      await app.goTo(name, { mode: 'lateral' })
      expect(ownNav(app, 'depth')).toBe(depth)
      expect(ownNav(app, 'lateral')).toBe(lateral)
      lateral.querySelectorAll('button').forEach((button, index) => expect(button).toBe(buttons[index]))
      expect(lateral.querySelector('[aria-current="true"]').dataset.to).toBe(name)
      expect(lateral.querySelectorAll('.is-active')).toHaveLength(1)
    }
    const mutations = new MutationObserver(() => {})
    mutations.observe(app.canvas, { subtree: true, childList: true, attributes: true })
    app._updateNav()
    app._updateNav()
    expect(mutations.takeRecords()).toHaveLength(0)
    mutations.disconnect()
    await app.zoomOut()
    expect(ownNav(app, 'depth')).toBeNull()
    expect(ownNav(app, 'lateral')).toBeNull()
    await app.zoomTo('a')
    expect(ownNav(app, 'depth')).toBe(depth)
    expect(ownNav(app, 'lateral')).toBe(lateral)
  })

  it('reused arrows and dots navigate from the latest current index and ignore blocked input', async () => {
    const app = await createApp()
    const lateral = ownNav(app, 'lateral')
    const previous = lateral.querySelector('.z-nav-prev')
    const next = lateral.querySelector('.z-nav-next')
    const first = lateral.querySelector('[data-to="a"]')
    expect(previous.disabled).toBe(true)
    await clickTo(app, next, 'b')
    expect(previous.disabled).toBe(false)
    await clickTo(app, next, 'c')
    expect(next.disabled).toBe(true)
    await clickTo(app, previous, 'b')
    expect(next.disabled).toBe(false)
    await clickTo(app, first, 'a')
    const navigate = vi.spyOn(app, '_doLateral')
    first.click()
    app.blockEvents = true
    next.click()
    expect(navigate).not.toHaveBeenCalled()
    app.blockEvents = false
    const back = ownNav(app, 'depth').querySelector('button')
    await clickTo(app, back, 'home')
  })

  it('updates configuration and sibling order without retaining stale click targets', async () => {
    const app = await createApp()
    const lateral = ownNav(app, 'lateral')
    const obsoleteNext = lateral.querySelector('.z-nav-next')
    app.lateralNav.position = 'top-center'
    app.depthNav.position = 'top-left'
    app._updateNav()
    expect(ownNav(app, 'lateral')).toBe(lateral)
    expect(lateral.classList.contains('z-lateral-nav--top-center')).toBe(true)
    expect(ownNav(app, 'depth').classList.contains('z-depth-nav--top-left')).toBe(true)
    app.lateralNav.siblings.reverse()
    app._updateNav()
    const reordered = ownNav(app, 'lateral')
    expect([...reordered.querySelectorAll('.z-nav-lat-dot')].map(dot => dot.dataset.to)).toEqual(['c', 'b', 'a'])
    expect(reordered.querySelector('.z-nav-next').disabled).toBe(true)
    const navigate = vi.spyOn(app, '_doLateral')
    obsoleteNext.click()
    expect(navigate).not.toHaveBeenCalled()
    await clickTo(app, reordered.querySelector('.z-nav-prev'), 'b')
    app.lateralNav.arrows = false
    app._updateNav()
    const dotsOnly = ownNav(app, 'lateral')
    expect(dotsOnly.querySelector('.z-nav-arrow')).toBeNull()
    await clickTo(app, dotsOnly.querySelector('[data-to="c"]'), 'c')
    app.depthNav = false
    app.lateralNav = false
    app._updateNav()
    expect(ownNav(app, 'depth')).toBeNull()
    expect(ownNav(app, 'lateral')).toBeNull()
  })

  it('updates and removes only owned navigation, keeping nested controls functional', async () => {
    const outer = await createApp()
    const outerLateral = ownNav(outer, 'lateral')
    const current = outer.canvas.querySelector(':scope > .is-current-view')
    const inner = await createApp(current)
    const innerDepth = ownNav(inner, 'depth')
    const innerLateral = ownNav(inner, 'lateral')
    outer._updateNav()
    expect(ownNav(outer, 'depth')).toBeNull()
    expect(ownNav(outer, 'lateral')).toBe(outerLateral)
    expect(ownNav(inner, 'depth')).toBe(innerDepth)
    expect(ownNav(inner, 'lateral')).toBe(innerLateral)
    await clickTo(inner, innerLateral.querySelector('.z-nav-next'), 'b')
    expect(outer.getCurrentViewName()).toBe('a')
    outer._removeNav()
    expect(ownNav(outer, 'lateral')).toBeNull()
    expect(ownNav(inner, 'depth')).toBe(innerDepth)
    expect(ownNav(inner, 'lateral')).toBe(innerLateral)
    await clickTo(inner, innerDepth.querySelector('button'), 'home')
  })

  it('measures auto visibility before adding navigation and reuses temporarily suppressed controls', async () => {
    const app = await createApp(document.body, { lateralNav: { mode: 'auto', siblings: ['a', 'b', 'c'] } })
    const depth = ownNav(app, 'depth')
    const lateral = ownNav(app, 'lateral')
    const current = app.canvas.querySelector(':scope > .is-current-view')
    depth.remove()
    lateral.remove()
    const reads = []
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth').get
    Object.defineProperty(current, 'offsetWidth', { configurable: true, get () {
      reads.push([ownNav(app, 'depth'), ownNav(app, 'lateral')])
      return offsetWidth.call(this)
    } })
    app._updateNav()
    delete current.offsetWidth
    expect(reads).toEqual([[null, null]])
    expect(ownNav(app, 'depth')).toBe(depth)
    expect(ownNav(app, 'lateral')).toBe(lateral)
    current.style.width = '800px'
    current.style.height = '600px'
    app._updateNav()
    expect(ownNav(app, 'lateral')).toBeNull()
    current.style.width = '400px'
    current.style.height = '300px'
    app._updateNav()
    expect(ownNav(app, 'lateral')).toBe(lateral)
  })
})
