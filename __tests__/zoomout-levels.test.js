/**
 * Tests for multi-level zoomOut (zoomOut(n), zoomOut({ to })), view titles,
 * getViewStack() and the labels option.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'

const chain = ['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6']
const view = (name, next) => `<div class="z-view" style="width:400px;height:300px">
  <p>${name}</p>${next ? `<span class="zoom-me" data-to="${next}" style="position:absolute;left:${40 + chain.indexOf(name) * 10}px;top:60px;width:80px;height:60px">${next}</span>` : ''}
</div>`
const views = Object.fromEntries(chain.map((name, i) => [name, view(name, chain[i + 1])]))

function createApp (opts = {}) {
  const mount = document.createElement('div')
  mount.className = 'zumly-canvas'
  mount.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px'
  document.body.appendChild(mount)
  return new Zumly({
    mount,
    initialView: 'v0',
    views,
    transitions: { driver: 'none', duration: '0s', effects: ['blur(2px)', 'blur(4px)'] },
    ...opts
  })
}

async function zoomDown (app, depth) {
  for (let i = 1; i <= depth; i++) {
    await app.zoomIn(app.canvas.querySelector(`.is-current-view .zoom-me[data-to="v${i}"]`))
  }
}

/** Views in the canvas, in DOM order, with role and pose. */
function canvasState (app) {
  return [...app.canvas.querySelectorAll(':scope > .z-view')].map(el => ({
    name: el.dataset.viewName,
    classes: ['is-current-view', 'is-previous-view', 'is-last-view', 'hide', 'has-effect'].filter(c => el.classList.contains(c)),
    origin: el.style.transformOrigin,
    transform: el.style.transform
  }))
}

describe('zoomOut over several levels', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  for (const [depth, levels] of [[2, 2], [3, 2], [3, 3], [4, 3], [5, 2], [6, 4], [6, 6]]) {
    it(`zoomOut(${levels}) from depth ${depth} ends as ${levels} single zoomOuts`, async () => {
      const single = createApp()
      await single.init()
      await zoomDown(single, depth)
      for (let i = 0; i < levels; i++) await single.zoomOut()

      const multi = createApp()
      await multi.init()
      await zoomDown(multi, depth)
      await multi.zoomOut(levels)

      expect(multi.getCurrentViewName()).toBe(single.getCurrentViewName())
      expect(multi.zoomLevel()).toBe(depth + 1 - levels)
      expect(canvasState(multi)).toEqual(canvasState(single))
      // The stack keeps working afterwards
      await multi.zoomOut()
      await single.zoomOut()
      expect(canvasState(multi)).toEqual(canvasState(single))
      single.destroy(); multi.destroy()
    })
  }

  for (const levels of [2, 3, 4, 5]) {
    it(`zoomOut(${levels}) starts from where every view is`, async () => {
      const app = createApp()
      await app.init()
      await zoomDown(app, 5)
      const rect = el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }
      const visible = [...app.canvas.querySelectorAll(':scope > .z-view')].map(el => [el, rect(el)])
      let measured
      const none = app.transitionDriver
      app.transitionDriver = {
        runTransition (spec, done) {
          const trigger = spec.previousView.querySelector(`.zoom-me[data-to="${spec.currentView.dataset.viewName}"]`)
          measured = { trigger: rect(trigger), child: rect(spec.currentView), visible: visible.map(([el]) => rect(el)) }
          none.runTransition(spec, done)
        }
      }
      await app.zoomOut(levels)
      // Nothing on screen jumps when the transition starts...
      measured.visible.forEach((r, i) => r.forEach((v, j) => expect(v).toBeCloseTo(visible[i][1][j], 0)))
      // ...and views brought back sit around their child: the trigger frames it
      // (within the offset Zumly's own zoom-in geometry leaves between them).
      const [tx, ty, tw, th] = measured.trigger
      const [cx, cy, cw, ch] = measured.child
      expect(tw / cw).toBeCloseTo(1, 2)
      expect(Math.abs(tx + tw / 2 - (cx + cw / 2)) / cw).toBeLessThan(0.1)
      expect(Math.abs(ty + th / 2 - (cy + ch / 2)) / ch).toBeLessThan(0.1)
      app.destroy()
    })
  }

  it('zoomOut({ to }) climbs to the named ancestor in one navigation', async () => {
    const app = createApp()
    await app.init()
    await zoomDown(app, 4)
    const before = vi.fn()
    const after = vi.fn()
    const changed = vi.fn()
    app.on('beforeZoomOut', before).on('afterZoomOut', after).on('viewChanged', changed)
    await app.zoomOut({ to: 'v1' })
    expect(app.getCurrentViewName()).toBe('v1')
    expect(before).toHaveBeenCalledTimes(1)
    expect(before.mock.calls[0][0]).toMatchObject({ viewName: 'v1', from: 'v4', levels: 3 })
    expect(after).toHaveBeenCalledTimes(1)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(app.canvas.querySelectorAll(':scope > .z-view')).toHaveLength(2)
    app.destroy()
  })

  it('clamps to the root and ignores unknown targets', async () => {
    const app = createApp({ debug: true })
    await app.init()
    await zoomDown(app, 3)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await app.zoomOut({ to: 'nope' })
    expect(app.getCurrentViewName()).toBe('v3')
    await app.zoomOut(0)
    expect(app.getCurrentViewName()).toBe('v3')
    warn.mockRestore()
    await app.zoomOut(99)
    expect(app.getCurrentViewName()).toBe('v0')
    expect(app.zoomLevel()).toBe(1)
    app.destroy()
  })

  it('disposes every dropped view', async () => {
    const app = createApp()
    await app.init()
    await zoomDown(app, 5)
    const cleaned = []
    for (const entry of app.getViewStack().slice(2)) {
      const node = app._viewNodeAt(entry.depth)
      node.addEventListener('zumly:test', () => {})
      cleaned.push(node)
    }
    await app.zoomOut({ to: 'v1' })
    for (const node of cleaned) expect(node.isConnected).toBe(false)
    app.destroy()
  })

  it('animates with the css driver and leaves no passengers behind', async () => {
    const app = createApp({ transitions: { driver: 'css', duration: '120ms' } })
    await app.init()
    await zoomDown(app, 4)
    await app.zoomOut(3)
    expect(app.getCurrentViewName()).toBe('v1')
    expect([...app.canvas.querySelectorAll(':scope > .z-view')].map(el => el.dataset.viewName)).toEqual(['v0', 'v1'])
    expect(app.canvas.querySelector('.is-current-view').dataset.viewName).toBe('v1')
    app.destroy()
  })

  it('walks the router back several levels in a single transition', async () => {
    const app = createApp()
    await app.init()
    await zoomDown(app, 3)
    const runs = []
    const driver = app.transitionDriver
    app.transitionDriver = { runTransition (spec, done) { runs.push(spec.type); driver.runTransition(spec, done) } }
    await app.zoomOut({ to: 'v0' })
    expect(runs).toEqual(['zoomOut'])
    app.destroy()
  })
})

describe('view titles', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  const titled = {
    home: '<div class="z-view"><span class="zoom-me" data-to="sys">Sys</span></div>',
    sys: { title: 'Seguridad', render: () => '<div class="z-view"><span class="zoom-me" data-to="log">Log</span></div>' },
    log: '<div class="z-view" data-title="Registro"><p>log</p></div>'
  }
  const createTitled = (opts = {}) => createApp({ initialView: 'home', views: titled, ...opts })

  it('reads titles from the definition and from data-title', async () => {
    const app = createTitled()
    await app.init()
    await app.zoomTo('sys')
    await app.zoomTo('log')
    expect(app.getViewStack()).toEqual([
      { name: 'home', title: 'home', depth: 0 },
      { name: 'sys', title: 'Seguridad', depth: 1 },
      { name: 'log', title: 'Registro', depth: 2 }
    ])
    expect(app.getViewTitle('sys')).toBe('Seguridad')
    expect(app.canvas.querySelector('[data-view-name="sys"]').dataset.title).toBe('Seguridad')
    expect(app.canvas.querySelector('[data-view-name="sys"]').getAttribute('aria-label')).toBe('View: Seguridad')
    app.destroy()
  })

  it('labels the back button with the title of the view above', async () => {
    const app = createTitled()
    await app.init()
    await app.zoomTo('sys')
    await app.zoomTo('log')
    expect(app.canvas.querySelector('.z-nav-back').getAttribute('aria-label')).toBe('Back to Seguridad')
    await app.zoomOut()
    expect(app.canvas.querySelector('.z-nav-back').getAttribute('aria-label')).toBe('Back to home')
    app.destroy()
  })

  it('takes custom labels, functions, and false', async () => {
    const app = createTitled({ labels: { back: view => `Volver a ${view.title}` } })
    await app.init()
    await app.zoomTo('sys')
    expect(app.canvas.querySelector('.z-nav-back').getAttribute('aria-label')).toBe('Volver a home')
    app.destroy()

    const quiet = createTitled({ labels: false })
    await quiet.init()
    await quiet.zoomTo('sys')
    expect(quiet.canvas.querySelector('.z-nav-back').hasAttribute('aria-label')).toBe(false)
    quiet.destroy()

    const template = createTitled({ labels: { back: '↑ {title} ({name})' } })
    await template.init()
    await template.zoomTo('sys')
    await template.zoomTo('log')
    expect(template.canvas.querySelector('.z-nav-back').getAttribute('aria-label')).toBe('↑ Seguridad (sys)')
    template.destroy()
  })
})
