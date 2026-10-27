/**
 * Parametric siblings: triggers with the same data-to and different data
 * params (data-id, …) are separate siblings; plain triggers work as before.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { ZumlyRouter } from '../src/plugins/router.js'
import { identityParams, viewKey, parseViewKey } from '../src/view-identity.js'
import '../src/style.css'

const box = (left, extra) => `class="zoom-me" style="position:absolute;left:${left}px;top:100px;width:60px;height:40px" ${extra}`
const house = `<div class="z-view" style="width:400px;height:300px">
  <div ${box(20, 'data-to="room" data-id="kitchen" data-title="Kitchen"')}>Kitchen</div>
  <div ${box(120, 'data-to="room" data-id="bedroom" data-title="Bedroom"')}>Bedroom</div>
  <div ${box(220, 'data-to="room" data-id="bath" data-title="Bath"')}>Bath</div>
  <div ${box(320, 'data-to="room" data-id="attic" data-sibling="false"')}>Attic</div>
</div>`
// The room view renders the props it receives, so each room is visibly its own.
const room = ({ props }) => `<div class="z-view room" style="width:200px;height:150px"><p class="which">${props.id ?? '-'}</p></div>`

let app

beforeEach(() => {
  document.body.innerHTML = '<div style="position:relative;width:400px;height:300px"><div class="canvas zumly-canvas"></div></div>'
  window.history.replaceState(null, '', '#')
})

afterEach(() => {
  app?.destroy()
  app = null
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '#')
  document.body.replaceChildren()
})

function create (options = {}) {
  app = new Zumly({
    mount: '.canvas',
    initialView: 'house',
    views: { house, room },
    transitions: { driver: 'none', duration: '0s' },
    ...options
  })
  return app
}

const trigger = id => app.canvas.querySelector(`.is-current-view [data-id="${id}"], .is-previous-view [data-id="${id}"]`)
const shown = () => app.canvas.querySelector(':scope > .is-current-view .which')?.textContent
const dots = () => [...app.canvas.querySelectorAll('.z-lateral-nav .z-nav-lat-dot')]

describe('view identity helpers', () => {
  it('keeps data params and leaves out Zumly attributes, empty and non-scalar values', () => {
    expect(identityParams({ to: 'room', id: 'kitchen', title: 'Kitchen', withDuration: '1s', sibling: 'true', hideTrigger: '', v1a2b: '', item: { a: 1 } })).toEqual({ id: 'kitchen' })
    expect(identityParams({ to: 'room' })).toBe(null)
    expect(identityParams({ id: 3, open: true })).toEqual({ id: '3', open: 'true' })
  })

  it('builds stable keys and parses them back', () => {
    expect(viewKey('room', null)).toBe('room')
    expect(viewKey('room', { id: 'kitchen', floor: '1' })).toBe('room?floor=1&id=kitchen')
    const key = viewKey('room', { id: 'a/b.c?&=' })
    expect(key).not.toMatch(/[/.]/)
    expect(parseViewKey(key)).toEqual({ name: 'room', params: { id: 'a/b.c?&=' } })
    expect(parseViewKey('room')).toEqual({ name: 'room', params: null })
  })
})

describe('parametric siblings', () => {
  it('groups each trigger as its own sibling and leaves data-sibling="false" out', async () => {
    create()
    await app.init()
    await app.zoomIn(trigger('kitchen'))
    expect(shown()).toBe('kitchen')
    expect(app._getSiblings()).toEqual({ siblings: ['room?id=kitchen', 'room?id=bedroom', 'room?id=bath'], currentIndex: 0 })
    expect(dots()).toHaveLength(3)
  })

  it('names the sibling dots by the triggers\' data-title', async () => {
    create()
    await app.init()
    await app.zoomIn(trigger('kitchen'))
    expect(dots().map(dot => dot.getAttribute('aria-label'))).toEqual(['Go to Kitchen', 'Go to Bedroom', 'Go to Bath'])
    expect(dots()[0].classList.contains('is-active')).toBe(true)
  })

  it('moves between parametric siblings with the bar, the arrows and back()', async () => {
    create()
    await app.init()
    await app.zoomIn(trigger('kitchen'))

    dots()[1].click()
    await vi.waitFor(() => expect(shown()).toBe('bedroom'))
    expect(app.getCurrentViewName()).toBe('room')
    expect(app.canvas.querySelectorAll(':scope > .z-view')).toHaveLength(2)
    expect(dots()[1].classList.contains('is-active')).toBe(true)
    expect(trigger('bedroom').classList.contains('zoomed')).toBe(true)
    expect(trigger('kitchen').classList.contains('zoomed')).toBe(false)

    app.canvas.querySelector('.z-nav-next').click()
    await vi.waitFor(() => expect(shown()).toBe('bath'))
    expect(app.canvas.querySelector('.z-nav-next').disabled).toBe(true)

    await app.back()
    expect(shown()).toBe('bedroom')
    await app.back()
    expect(shown()).toBe('kitchen')
    expect(dots()[0].classList.contains('is-active')).toBe(true)
    await app.back()
    expect(app.getCurrentViewName()).toBe('house')
  })

  it('passes the trigger\'s data to the view on a lateral move, as a click does', async () => {
    const seen = []
    create({ views: { house, room: ctx => { seen.push({ ...ctx.props, trigger: ctx.trigger?.dataset.id }); return room(ctx) } } })
    await app.init()
    await app.zoomIn(trigger('kitchen'))
    await app.goTo('room', { mode: 'lateral', props: { id: 'bath' } })
    expect(shown()).toBe('bath')
    dots()[1].click()
    await vi.waitFor(() => expect(shown()).toBe('bedroom'))
    expect(seen.at(-1)).toMatchObject({ to: 'room', id: 'bedroom', title: 'Bedroom', trigger: 'bedroom' })
  })

  it('switches siblings by clicking another trigger in the parent', async () => {
    create()
    await app.init()
    await app.zoomIn(trigger('kitchen'))
    const rect = trigger('bath').getBoundingClientRect()
    app.canvas.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }))
    await vi.waitFor(() => expect(shown()).toBe('bath'))
    expect(app.getZoomLevel()).toBe(2)
  })

  it('offers parametric siblings to a swipe', async () => {
    create({ lateralNav: { swipe: true } })
    await app.init()
    await app.zoomIn(trigger('bedroom'))
    expect(app._lateralSwipe()).toEqual({ prev: 'room?id=kitchen', next: 'room?id=bath' })
  })

  // Desktop Firefox and WebKit cannot construct Touch events.
  const canTouch = (() => { try { return !!new Touch({ identifier: 0, target: document.documentElement }) } catch { return false } })()
  it.skipIf(!canTouch)('swipes to the next parametric sibling', async () => {
    create({ lateralNav: { swipe: true } })
    await app.init()
    await app.zoomIn(trigger('bedroom'))
    const target = app.canvas.querySelector('.is-current-view')
    const send = (type, x) => {
      const t = new Touch({ identifier: 0, target, screenX: x, screenY: 200, clientX: x, clientY: 200 })
      target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] }))
    }
    send('touchstart', 300)
    send('touchend', 200)
    await vi.waitFor(() => expect(shown()).toBe('bath'))
  })

  it('round-trips the hash with the router, also on browser back', async () => {
    create()
    app.use(ZumlyRouter)
    await app.init()
    await app.zoomIn(trigger('kitchen'))
    expect(window.location.hash).toBe('#/house/room?id=kitchen')
    await app.goTo('room', { mode: 'lateral', props: { id: 'bedroom' } })
    expect(window.location.hash).toBe('#/house/room?id=bedroom')
    await app.goTo('room', { mode: 'lateral', props: { id: 'bath' } })
    expect(window.location.hash).toBe('#/house/room?id=bath')

    window.history.replaceState(null, '', '#/house/room?id=kitchen')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vi.waitFor(() => expect(shown()).toBe('kitchen'))
    expect(app.lateralHistory).toHaveLength(0)

    window.history.replaceState(null, '', '#/house')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vi.waitFor(() => expect(app.getCurrentViewName()).toBe('house'))
  })

  it('reaches a sibling the router has no history for by its params', async () => {
    create()
    app.use(ZumlyRouter)
    await app.init()
    await app.zoomIn(trigger('kitchen'))
    window.history.replaceState(null, '', '#/house/room?id=bath')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await vi.waitFor(() => expect(shown()).toBe('bath'))
    expect(dots()[2].classList.contains('is-active')).toBe(true)
  })

  it('reports the params in getViewStack()', async () => {
    create()
    await app.init()
    await app.zoomIn(trigger('bath'))
    expect(app.getViewStack()[1]).toMatchObject({ name: 'room', params: { id: 'bath' } })
    expect(app.getViewStack()[0]).not.toHaveProperty('params')
  })

  it('keeps each parametric sibling alive on its own with keepAlive', async () => {
    create({ lateralNav: { keepAlive: true } })
    await app.init()
    await app.zoomIn(trigger('kitchen'))
    const kitchen = app.canvas.querySelector('.is-current-view')
    await app.goTo('room', { mode: 'lateral', props: { id: 'bedroom' } })
    await app.goTo('room', { mode: 'lateral', props: { id: 'kitchen' } })
    expect(app.canvas.querySelector('.is-current-view')).toBe(kitchen)
    expect(shown()).toBe('kitchen')
  })
})

describe('plain siblings keep working as before', () => {
  const home = `<div class="z-view" style="width:400px;height:300px">
    <div ${box(20, 'data-to="a"')}>A</div>
    <div ${box(120, 'data-to="b"')}>B</div>
    <div ${box(220, 'data-to="c" data-id="7"')}>C</div>
  </div>`
  const leaf = name => `<div class="z-view" style="width:200px;height:150px"><p class="which">${name}</p></div>`

  it('groups by name, keeps the hash, and goTo() by name finds a trigger with params', async () => {
    app = new Zumly({ mount: '.canvas', initialView: 'home', views: { home, a: leaf('a'), b: leaf('b'), c: leaf('c') }, transitions: { driver: 'none' } })
    app.use(ZumlyRouter)
    await app.init()
    await app.zoomTo('a')
    expect(app._getSiblings()).toEqual({ siblings: ['a', 'b', 'c?id=7'], currentIndex: 0 })
    expect(window.location.hash).toBe('#/home/a')
    await app.goTo('b', { mode: 'lateral' })
    expect(window.location.hash).toBe('#/home/b')
    await app.goTo('c', { mode: 'lateral' })
    expect(shown()).toBe('c')
    expect(app._getSiblings().currentIndex).toBe(2)
    expect(app.canvas.querySelector('[data-to="c"]').classList.contains('zoomed')).toBe(true)
    await app.goTo('c', { mode: 'lateral' })
    expect(app.lateralHistory.map(entry => entry.name)).toEqual(['a', 'b'])
  })
})
