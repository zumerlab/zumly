/**
 * Hybrid navigation: depth and lateral moves mixed at random, with real user
 * events (trigger mouseup, nav buttons, depth back button) and the API.
 * After every step the DOM, the API and a model of the expected stack must
 * agree, and the zoomed trigger must stay aligned with the current view.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { ZumlyRouter } from '../src/plugins/router.js'
import '../src/style.css'

const W = 800, H = 600, L = 24, T = 32
const view = (name, content = '') => `<div class="z-view" style="left:0;top:0;width:${W}px;height:${H}px">${name}${content}</div>`
const trig = (to, i, n) => { const w = 160, h = 120, gap = (W - n * w) / (n + 1); return `<div class="zoom-me" data-to="${to}" style="position:absolute;left:${gap + i * (w + gap)}px;top:${240}px;width:${w}px;height:${h}px">${to}</div>` }
const kids = { home: ['a', 'b', 'c'], a: ['a1', 'a2'], b: ['b1', 'b2'], c: ['c1', 'c2'], a1: ['d'], a2: ['d'], b1: ['d'], b2: ['d'], c1: ['d'], c2: ['d'], d: [] }
const views = Object.fromEntries(Object.entries(kids).map(([n, ks]) => [n, view(n, ks.map((k, i) => trig(k, i, ks.length)).join(''))]))
function sizedViews (seed, close = false) {
  const r = rng(seed * 7 + 3)
  return Object.fromEntries(Object.entries(kids).map(([n, ks]) => {
    // close: big triggers and small views, so the parent stays visible around the current view
    const w = n === 'home' ? W : Math.round(close ? 200 + r() * 60 : 260 + r() * 520), h = n === 'home' ? H : Math.round(close ? 150 + r() * 50 : 200 + r() * 380)
    const tw = close ? Math.round(w * 0.28) : Math.round(60 + r() * 100), th = close ? Math.round(h * 0.3) : Math.round(40 + r() * 90)
    const trig2 = (to, i) => `<div class="zoom-me" data-to="${to}" style="position:absolute;left:${Math.round(10 + i * (w - tw - 20) / Math.max(1, ks.length - 1))}px;top:${Math.round(r() * (h - th))}px;width:${tw}px;height:${th}px">${to}</div>`
    return [n, `<div class="z-view" style="left:0;top:0;width:${w}px;height:${h}px">${n}${ks.map(trig2).join('')}</div>`]
  }))
}
const parentOf = n => Object.keys(kids).find(p => kids[p].includes(n) && p !== 'd')

let app
afterEach(() => { app?.destroy(); app = null; document.body.replaceChildren() })

function rng (seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 } }
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol
const rectStr = r => `${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`

function check (model, opLog) {
  const errs = []
  const c = app.canvas
  const all = [...c.children].filter(e => e.classList.contains('z-view'))
  const cur = all.filter(e => e.classList.contains('is-current-view'))
  const visible = all.filter(e => !e.classList.contains('is-lateral-hidden'))
  if (cur.length !== 1) errs.push(`current views: ${cur.length}`)
  const cv = cur[0]
  if (app.blockEvents) errs.push('blockEvents stuck')
  if (cv) {
    if (cv.dataset.viewName !== app.getCurrentViewName()) errs.push(`DOM current ${cv.dataset.viewName} != api ${app.getCurrentViewName()}`)
    for (const cls of ['hide', 'has-no-events', 'is-new-current-view', 'is-previous-view']) if (cv.classList.contains(cls)) errs.push(`current has .${cls}`)
    if (cv.inert || cv.getAttribute('aria-hidden') === 'true') errs.push('current inert/aria-hidden')
    if (cv.style.display === 'none' || getComputedStyle(cv).opacity !== '1') errs.push(`current not visible (display=${cv.style.display} opacity=${getComputedStyle(cv).opacity})`)
    const r = cv.getBoundingClientRect()
    if (!model.sized && !(near(r.x, L) && near(r.y, T) && near(r.width, W) && near(r.height, H))) errs.push(`current rect ${rectStr(r)} != canvas`)
  }
  if (app.getCurrentViewName() !== model.cur) errs.push(`name ${app.getCurrentViewName()} != model ${model.cur}`)
  if (app.zoomLevel() !== model.stack.length) errs.push(`level ${app.zoomLevel()} != model ${model.stack.length}`)
  const lvl = app.zoomLevel()
  const prev = all.filter(e => e.classList.contains('is-previous-view'))
  const last = all.filter(e => e.classList.contains('is-last-view'))
  if (prev.length !== (lvl >= 2 ? 1 : 0)) errs.push(`previous views: ${prev.length} at level ${lvl}`)
  if (last.length !== (lvl >= 3 ? 1 : 0)) errs.push(`last views: ${last.length} at level ${lvl}`)
  if (visible.length !== Math.min(lvl, 3)) errs.push(`visible views ${visible.length} (${visible.map(v => v.dataset.viewName + ':' + [...v.classList].filter(k => k.startsWith('is-')).join('.')).join(' ')}) at level ${lvl}`)
  if (prev[0] && cv) {
    if (prev[0].dataset.viewName !== model.stack[model.stack.length - 2]) errs.push(`previous is ${prev[0].dataset.viewName}, model ${model.stack[model.stack.length - 2]}`)
    const zoomed = prev[0].querySelectorAll('.zoomed')
    if (zoomed.length !== 1) errs.push(`previous has ${zoomed.length} .zoomed`)
    const t = prev[0].querySelector(`.zoom-me[data-to="${cv.dataset.viewName}"]`)
    if (zoomed[0] && zoomed[0] !== t) errs.push(`.zoomed is ${zoomed[0].dataset.to}, current is ${cv.dataset.viewName}`)
    if (t) {
      const r = t.getBoundingClientRect(), c2 = cv.getBoundingClientRect()
      if (!(near(r.x + r.width / 2, c2.x + c2.width / 2, 2) && near(r.y + r.height / 2, c2.y + c2.height / 2, 2) && near(r.width, c2.width, 2))) errs.push(`trigger ${t.dataset.to} ${rectStr(r)} not aligned with current ${rectStr(c2)}`)
    }
    if (getComputedStyle(prev[0]).visibility === 'hidden' && !t?.classList.contains('z-trigger-hidden')) errs.push('previous hidden')
  }
  if (lvl === 1 && cv && cv.style.transform && !/^(translate\(0px, 0px\) )?(scale\(1\))?$|^none$/.test(cv.style.transform.trim())) errs.push(`root transform ${cv.style.transform}`)
  return errs.length ? `after [${opLog.slice(-6).join(' | ')}]: ${errs.join('; ')}` : null
}

async function runScenario (seed, cfg, steps = 250) {
  document.body.innerHTML = `<div id="cv" class="zumly-canvas" style="position:fixed;left:${L}px;top:${T}px;width:${W}px;height:${H}px"></div>`
  app = new Zumly({ mount: '#cv', initialView: 'home', views: cfg.sized ? sizedViews(seed, cfg.close) : views,
    transitions: { driver: cfg.driver || 'none', duration: cfg.duration || '0s', ease: 'linear', effects: ['none', 'none'], hideTrigger: cfg.hideTrigger ?? false },
    depthNav: true, lateralNav: { mode: 'always', keepAlive: cfg.keepAlive ?? false, siblings: cfg.siblings ? { home: ['a', 'b', 'c'], a: ['a1', 'a2'], b: ['b1', 'b2'], c: ['c1', 'c2'] } : undefined },
    inputs: { wheel: false } })
  await app.init()
  const model = { cur: 'home', stack: ['home'], hist: [], histStack: [], sized: !!cfg.sized }
  const r = rng(seed); const log = []; const stats = cfg.stats
  const keepAlive = cfg.keepAlive ?? false
  const lateral = (t, viaBack) => {
    if (viaBack) { model.cur = t; model.stack[model.stack.length - 1] = t; return }
    if (keepAlive) { const i = model.hist.findLastIndex(e => e.name === t && e.node); if (i !== -1) model.hist.splice(i, 1) }
    model.hist.push({ name: model.cur, node: !!keepAlive }); model.cur = t; model.stack[model.stack.length - 1] = t
  }
  const zoomOutModel = () => { if (model.stack.length < 2) return; model.stack.pop(); model.cur = model.stack[model.stack.length - 1]; model.hist = model.histStack.pop() || [] }
  for (let i = 0; i < steps; i++) {
    const cur = model.cur
    const p = parentOf(cur)
    const sibs = model.stack.length > 1 && p ? kids[p].filter(k => k !== cur) : []
    const roll = r()
    let op
    if (roll < 0.3 && kids[cur].length) {
      const to = kids[cur][Math.floor(r() * kids[cur].length)]
      op = `click ${to}`
      const t = app.canvas.querySelector(`.is-current-view .zoom-me[data-to="${to}"]`)
      await app.zoomIn(t)
      model.histStack.push(model.hist.map(e => ({ ...e, node: false }))); model.hist = []; model.stack.push(to); model.cur = to
    } else if (roll < 0.55 && sibs.length) {
      const to = sibs[Math.floor(r() * sibs.length)]
      op = `lateral ${to}`
      await app.goTo(to, { mode: 'lateral' }); lateral(to)
    } else if (roll < 0.65 && sibs.length) {
      const btns = [...app.canvas.querySelectorAll('.z-lateral-nav button:not([disabled])')].filter(b => !b.classList.contains('is-active'))
      if (!btns.length) { op = 'navbtn (none)'; stats.noNav = (stats.noNav || 0) + 1; log.push(op); continue }
      const btn = btns[Math.floor(r() * btns.length)]
      op = `navbtn ${btn.dataset.to || btn.className.split(' ').pop()}`
      const before = app.getCurrentViewName()
      btn.click(); await app._navigationTask?.promise
      const after = app.getCurrentViewName()
      if (after !== before) lateral(after)
    } else if (roll < 0.68 && model.sized && sibs.length) {
      // Click a sibling trigger that is visible in the parent around the current view.
      const cvRect = app.canvas.querySelector('.is-current-view').getBoundingClientRect()
      const canvasRect = app.canvas.getBoundingClientRect()
      const visibleSibling = sibs.map(to => app.canvas.querySelector(`.is-previous-view .zoom-me[data-to="${to}"]`)).find(t => {
        if (!t) return false
        const r = t.getBoundingClientRect(); const x = r.x + r.width / 2; const y = r.y + r.height / 2
        const inCanvas = x > canvasRect.left && x < canvasRect.right && y > canvasRect.top && y < canvasRect.bottom
        return inCanvas && !(x >= cvRect.left && x <= cvRect.right && y >= cvRect.top && y <= cvRect.bottom)
      })
      if (!visibleSibling) { op = 'parentclick (none)'; log.push(op); continue }
      const r = visibleSibling.getBoundingClientRect()
      op = `parentclick ${visibleSibling.dataset.to}`
      app.canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }))
      await app._navigationTask?.promise
      lateral(visibleSibling.dataset.to)
    } else if (roll < 0.7 && kids[cur].length) {
      const to = kids[cur][Math.floor(r() * kids[cur].length)]
      op = `mouseup ${to}`
      const t = app.canvas.querySelector(`.is-current-view .zoom-me[data-to="${to}"]`)
      t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }))
      await app._navigationTask?.promise
      model.histStack.push(model.hist.map(e => ({ ...e, node: false }))); model.hist = []; model.stack.push(to); model.cur = to
    } else if (roll < 0.75) {
      const b = app.canvas.querySelector('.z-depth-nav button')
      op = 'depthbtn'
      if (b) { b.click(); await app._navigationTask?.promise; zoomOutModel() } else if (model.stack.length > 1) { const e = 'no depth button at level ' + model.stack.length; return `seed ${seed} step ${i}: ${e}` }
    } else if (roll < 0.85) {
      op = 'back'
      if (model.hist.length) { const t = model.hist.pop().name; await app.back(); lateral(t, true) } else { await app.back(); zoomOutModel() }
    } else {
      op = 'zoomOut'
      await app.zoomOut(); zoomOutModel()
    }
    log.push(op)
    stats[op.split(' ')[0]] = (stats[op.split(' ')[0]] || 0) + 1
    stats.maxDepth = Math.max(stats.maxDepth || 0, model.stack.length)
    const e = check(model, log)
    if (e) return `seed ${seed} step ${i}: ${e}`
  }
  return null
}

const settle = async () => { for (let i = 0; i < 50; i++) { await new Promise(r => setTimeout(r, 20)); if (!app._navigationTask && !app.blockEvents) { await new Promise(r => setTimeout(r, 20)); if (!app._navigationTask) return } } }

function structural () {
  const model = { cur: app.getCurrentViewName(), stack: Array(app.zoomLevel()).fill(null), sized: true }
  // derive stack names from snapshots
  model.stack = app.storedViews.map(s => s.views[0].viewName)
  return check(model, ['concurrent'])
}

async function chaos (seed, cfg, steps = 60) {
  document.body.innerHTML = `<div id="cv" class="zumly-canvas" style="position:fixed;left:${L}px;top:${T}px;width:${W}px;height:${H}px"></div>`
  history.pushState(null, '', '#start')
  app = new Zumly({ mount: '#cv', initialView: 'home', views: cfg.sized ? sizedViews(seed) : views,
    transitions: { driver: cfg.driver, duration: '60ms', ease: 'linear', effects: ['none', 'none'] },
    lateralNav: { mode: 'always', keepAlive: cfg.keepAlive ?? false }, inputs: { wheel: false } })
  if (cfg.router) app.use(ZumlyRouter)
  await app.init()
  const r = rng(seed); const log = []
  for (let i = 0; i < steps; i++) {
    const burst = 1 + Math.floor(r() * 3)
    for (let b = 0; b < burst; b++) {
      const cur = app.getCurrentViewName(); const p = parentOf(cur)
      const sibs = app.zoomLevel() > 1 && p ? kids[p].filter(k => k !== cur) : []
      const roll = r()
      if (roll < 0.35 && kids[cur]?.length) { const to = kids[cur][Math.floor(r() * kids[cur].length)]; log.push('in ' + to); app.canvas.querySelector(`.is-current-view .zoom-me[data-to="${to}"]`)?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })) }
      else if (roll < 0.6 && sibs.length) { const to = sibs[Math.floor(r() * sibs.length)]; log.push('lat ' + to); app.goTo(to, { mode: 'lateral' }) }
      else if (roll < 0.8) { if (cfg.router) { if (app.canGoBack()) { log.push('history.back'); history.back() } } else { log.push('back'); app.back() } }
      else { log.push('out'); app.zoomOut() }
      if (r() < 0.5) await new Promise(res => setTimeout(res, r() * 40))
    }
    await settle()
    const e = structural()
    if (e) return `seed ${seed} step ${i}: ${e.replace('[concurrent]', '[' + log.slice(-6).join(' | ') + ']')}`
    if (cfg.router) {
      const expected = '#/' + app.storedViews.map(s => s.views[0].viewName).join('/')
      if (location.hash !== expected && location.hash !== '#start') return `seed ${seed} step ${i}: hash ${location.hash} != ${expected} after [${log.slice(-6).join(' | ')}]`
    }
  }
  return null
}


const depthConfigs = [
  { name: 'equal sizes' },
  { name: 'keepAlive', keepAlive: true },
  { name: "keepAlive 'visible'", keepAlive: 'visible' },
  { name: 'declared siblings', siblings: true },
  { name: "hideTrigger 'fade'", hideTrigger: 'fade' },
  { name: 'mixed sizes', sized: true },
  { name: 'mixed sizes + keepAlive', sized: true, keepAlive: true },
  { name: 'mixed sizes + siblings', sized: true, siblings: true },
  { name: 'parent visible around small views', sized: true, close: true },
  { name: 'parent visible + keepAlive', sized: true, close: true, keepAlive: true },
  { name: 'waapi driver', driver: 'waapi', duration: '20ms' },
  { name: 'css driver, mixed sizes', driver: 'css', duration: '20ms', sized: true }
]

describe('hybrid depth + lateral navigation', () => {
  for (const cfg of depthConfigs) {
    it(`keeps DOM, API and geometry consistent: ${cfg.name}`, async () => {
      cfg.stats = {}
      const animated = !!cfg.driver
      const fails = []
      for (let seed = 1; seed <= (animated ? 2 : 3); seed++) {
        const failure = await runScenario(seed, cfg, animated ? 50 : 150)
        if (failure) fails.push(failure)
      }
      expect(fails).toEqual([])
      if (cfg.close) expect(cfg.stats.parentclick).toBeGreaterThan(0)
    }, 120000)
  }

  const chaosConfigs = [
    { name: 'waapi', driver: 'waapi' },
    { name: 'css, mixed sizes, keepAlive', driver: 'css', sized: true, keepAlive: true },
    { name: 'router + browser back', driver: 'waapi', router: true },
    { name: 'router, mixed sizes, keepAlive', driver: 'css', router: true, sized: true, keepAlive: true }
  ]
  for (const cfg of chaosConfigs) {
    it(`settles consistently after overlapping calls: ${cfg.name}`, async () => {
      const fails = []
      for (let seed = 1; seed <= 2; seed++) {
        const failure = await chaos(seed, cfg, 30)
        if (failure) fails.push(failure)
        app?.destroy()
        app = null
      }
      expect(fails).toEqual([])
    }, 180000)
  }

  it('restores the lateral history of a level after zooming back out to it', async () => {
    await runScenario(0, {}, 0)
    await app.zoomIn(app.canvas.querySelector('.zoom-me[data-to="a"]'))
    await app.goTo('b', { mode: 'lateral' })
    await app.zoomIn(app.canvas.querySelector('.is-current-view .zoom-me[data-to="b1"]'))
    expect(app.canGoBack()).toBe(true)
    await app.back()
    expect(app.getCurrentViewName()).toBe('b')
    await app.back()
    expect(app.getCurrentViewName()).toBe('a')
    expect(app.zoomLevel()).toBe(2)
    await app.back()
    expect(app.getCurrentViewName()).toBe('home')
    expect(app.canGoBack()).toBe(false)
  })

  it('router ignores hash entries it did not write', async () => {
    document.body.innerHTML = `<div id="cv" class="zumly-canvas" style="position:fixed;left:${L}px;top:${T}px;width:${W}px;height:${H}px"></div>`
    history.pushState(null, '', '#other-widget')
    history.pushState(null, '', '#start')
    app = new Zumly({ mount: '#cv', initialView: 'home', views, transitions: { driver: 'none' } })
    app.use(ZumlyRouter)
    await app.init()
    await app.zoomIn(app.canvas.querySelector('.zoom-me[data-to="a"]'))
    history.back()
    await new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }))
    await settle()
    expect(app.getCurrentViewName()).toBe('home')
    history.back()
    await new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }))
    await settle()
    expect(location.hash).toBe('#other-widget')
    expect(app.getCurrentViewName()).toBe('home')
    expect(app.zoomLevel()).toBe(1)
  })
})
