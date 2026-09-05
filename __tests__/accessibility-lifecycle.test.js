import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { userEvent } from '@vitest/browser/context'
import { Zumly } from '../src/zumly.js'
import '../src/style.css'

let app
const view = content => `<div class="z-view" style="width:400px;height:300px">${content}</div>`
const home = view('<div class="zoom-me" data-to="detail">Open detail</div>')
const detail = view('<input aria-label="Name" value="text"><div contenteditable="true">Editable</div>')

beforeEach(() => {
  document.body.innerHTML = '<div class="canvas zumly-canvas" style="width:800px;height:600px"></div>'
})

afterEach(() => {
  app?.destroy()
  app = null
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function createApp (options = {}) {
  app = new Zumly({ mount: '.canvas', initialView: 'home', views: { home, detail }, transitions: { driver: 'none' }, ...options })
  return app
}

it('operates a generic trigger with Enter and Space, and the back button with keyboard', async () => {
  createApp()
  await app.init()
  const trigger = app.canvas.querySelector('.zoom-me')
  expect(trigger.tabIndex).toBe(0)
  expect(trigger.getAttribute('role')).toBe('button')
  expect(trigger.hasAttribute('aria-label')).toBe(false)
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await expect.poll(() => app.getCurrentViewName()).toBe('detail')
  app.canvas.querySelector('.z-nav-back').focus()
  await userEvent.keyboard(' ')
  await expect.poll(() => app.getCurrentViewName()).toBe('home')
  trigger.focus()
  await userEvent.keyboard(' ')
  await expect.poll(() => app.getCurrentViewName()).toBe('detail')
})

it('handles native button keyboard activation once without submitting its form', async () => {
  createApp({ views: { home: view('<form><button type="button" class="zoom-me" data-to="detail">Open</button></form>'), detail } })
  await app.init()
  const onNavigation = vi.fn()
  app.on('afterZoomIn', onNavigation)
  const button = app.canvas.querySelector('.zoom-me')
  expect(button.hasAttribute('role')).toBe(false)
  button.focus()
  await userEvent.keyboard('{Enter}')
  await expect.poll(() => app.getCurrentViewName()).toBe('detail')
  expect(onNavigation).toHaveBeenCalledTimes(1)
})

it('lets touch activate lateral controls without first zooming out', async () => {
  createApp({
    views: { home: view('<div class="zoom-me" data-to="detail">Detail</div><div class="zoom-me" data-to="other">Other</div>'), detail, other: view('Other') },
    lateralNav: { mode: 'always' },
  })
  await app.init()
  await app.zoomTo('detail')
  const dot = app.canvas.querySelector('.z-nav-lat-dot[data-to="other"]')
  const zoomOut = vi.spyOn(app, 'zoomOut')
  for (const type of ['touchstart', 'touchend']) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'changedTouches', { value: [{ screenX: 20, screenY: 20 }] })
    dot.dispatchEvent(event)
  }
  expect(zoomOut).not.toHaveBeenCalled()
  expect(app.getCurrentViewName()).toBe('detail')
  dot.click()
  await expect.poll(() => app.getCurrentViewName()).toBe('other')
  expect(app.getZoomLevel()).toBe(2)
})

it('keeps arrow navigation out of text fields and editable content', async () => {
  createApp()
  await app.init()
  await app.zoomTo('detail')
  for (const target of app.canvas.querySelectorAll('input, [contenteditable]')) {
    target.focus()
    const key = new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true, cancelable: true })
    target.dispatchEvent(key)
    expect(key.defaultPrevented).toBe(false)
    expect(app.getCurrentViewName()).toBe('detail')
  }
})

it('makes background views inert and restores them on return and destroy', async () => {
  createApp()
  await app.init()
  const parent = app.canvas.querySelector('.is-current-view')
  await app.zoomTo('detail')
  expect(parent.inert).toBe(true)
  expect(parent.getAttribute('aria-hidden')).toBe('true')
  parent.querySelector('.zoom-me').focus()
  expect(parent.contains(document.activeElement)).toBe(false)
  await app.back()
  expect(parent.inert).toBe(false)
  expect(parent.hasAttribute('aria-hidden')).toBe(false)
  await app.zoomTo('detail')
  app.destroy()
  expect(parent.inert).toBe(false)
  expect(parent.hasAttribute('aria-hidden')).toBe(false)
})

it('respects existing canvas accessibility attributes on destroy', async () => {
  const canvas = document.querySelector('.canvas')
  canvas.setAttribute('role', 'region')
  canvas.setAttribute('tabindex', '-1')
  createApp()
  await app.init()
  app.destroy()
  expect(canvas.getAttribute('role')).toBe('region')
  expect(canvas.getAttribute('tabindex')).toBe('-1')
})

it('skips hidden controls when moving focus into the current view', async () => {
  createApp({ views: { home, detail: view('<input type="hidden"><button hidden>Hidden</button><button>Visible</button>') } })
  await app.init()
  await app.zoomTo('detail')
  expect(document.activeElement.textContent).toBe('Visible')
})

it('runs destroy hooks once even when a hook calls destroy again', async () => {
  createApp()
  await app.init()
  const hook = vi.fn(() => app.destroy())
  app.on('destroy', hook)
  app.destroy()
  expect(hook).toHaveBeenCalledTimes(1)
  expect(app.isValid).toBe(false)
})

it('honors reduced motion without running the configured animation driver', async () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true })
  const driver = vi.fn()
  createApp({ transitions: { driver, duration: '2s', effects: ['blur(3px)', 'blur(5px)'] } })
  await app.init()
  await app.zoomTo('detail')
  expect(app.getCurrentViewName()).toBe('detail')
  expect(app.canvas.querySelector('.is-current-view').dataset.viewName).toBe('detail')
  await app.back()
  expect(app.getCurrentViewName()).toBe('home')
  expect(driver).not.toHaveBeenCalled()
})

it.each(['css', 'waapi'])('completes sequential navigation with the real %s driver and stylesheet', async driver => {
  createApp({ transitions: { driver, duration: '25ms' } })
  await app.init()
  await app.zoomTo('detail')
  expect(app.canvas.querySelector('.is-current-view').dataset.viewName).toBe('detail')
  expect(app.canvas.querySelector('.is-current-view').classList.contains('hide')).toBe(false)
  expect(app.blockEvents).toBe(false)
  await app.back()
  expect(app.canvas.querySelectorAll('.z-view')).toHaveLength(1)
  expect(app.canvas.querySelector('.is-current-view').dataset.viewName).toBe('home')
  expect(app.blockEvents).toBe(false)
})

it('supports disabling every input with inputs:false', async () => {
  createApp({ inputs: false })
  await app.init()
  const trigger = app.canvas.querySelector('.zoom-me')
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  trigger.click()
  trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  expect(app.getCurrentViewName()).toBe('home')
})

it('passes props and shared context to the initial view and initializes only once', async () => {
  const shared = { message: 'hello' }
  let resolve
  const render = vi.fn(ctx => {
    expect(ctx.context).toBe(shared)
    expect(ctx.props).toEqual({})
    return new Promise(done => { resolve = done })
  })
  createApp({ componentContext: shared, views: { home: render } })
  const first = app.init()
  const second = app.init()
  resolve(home)
  await Promise.all([first, second])
  await app.init()
  expect(render).toHaveBeenCalledTimes(1)
  expect(app.canvas.querySelectorAll('.is-current-view')).toHaveLength(1)
  expect(app.getZoomLevel()).toBe(1)
})

it('disposes a late initial view without inserting it after destroy', async () => {
  let resolve
  const cleanup = vi.fn()
  createApp({ views: { home: ({ onCleanup }) => {
    onCleanup(cleanup)
    return new Promise(done => { resolve = done })
  } } })
  const pending = app.init()
  app.destroy()
  await pending
  expect(cleanup).toHaveBeenCalledTimes(1)
  resolve(home)
  await expect.poll(() => cleanup.mock.calls.length).toBe(1)
  expect(app.canvas.children).toHaveLength(0)
  expect(app.getZoomLevel()).toBe(0)
})

it('disposes an initial view destroyed while mounted is pending', async () => {
  let finishMount
  const cleanup = vi.fn()
  const mounted = vi.fn(() => new Promise(resolve => { finishMount = resolve }))
  createApp({ views: { home: { render: ({ onCleanup }) => { onCleanup(cleanup); return home }, mounted } } })
  const pending = app.init()
  await expect.poll(() => mounted.mock.calls.length).toBe(1)
  app.destroy()
  finishMount()
  await pending
  await expect.poll(() => app.canvas.children.length).toBe(0)
  expect(cleanup).toHaveBeenCalledTimes(1)
})

it('keeps detached depth views alive and disposes every view exactly once on destroy', async () => {
  const cleaned = []
  const views = Object.fromEntries(['home', 'a', 'b', 'c', 'd'].map(name => [name, ({ onCleanup }) => {
    onCleanup(() => cleaned.push(name))
    return view(name)
  }]))
  createApp({ views })
  await app.init()
  for (const name of ['a', 'b', 'c', 'd']) await app.zoomTo(name)
  expect(cleaned).toEqual([])
  await app.back()
  expect(cleaned).toEqual(['d'])
  app.destroy()
  expect(cleaned.sort()).toEqual(['a', 'b', 'c', 'd', 'home'])
})
