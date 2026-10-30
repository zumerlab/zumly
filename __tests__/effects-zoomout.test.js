import { afterEach, beforeEach, expect, it } from 'vitest'
import { Zumly } from '../src/zumly.js'
import '../src/style.css'

let app
const view = (content = '') => `<div class="z-view" style="width:400px;height:300px">${content}</div>`
const trigger = (to, attrs = '') => `<div class="zoom-me" data-to="${to}" ${attrs} style="width:80px;height:60px">${to}</div>`

beforeEach(() => {
  document.body.innerHTML = '<div class="canvas zumly-canvas" style="width:800px;height:600px"></div>'
})

afterEach(() => {
  app?.destroy()
  app = null
  document.body.innerHTML = ''
})

async function createApp (driver, bTrigger = '') {
  app = new Zumly({
    mount: '.canvas',
    initialView: 'home',
    views: {
      home: view(trigger('a')),
      a: view(trigger('b', bTrigger)),
      b: view(trigger('c')),
      c: view('c'),
    },
    transitions: { driver, duration: '20ms', ease: 'linear', effects: ['blur(3px)', 'blur(8px) saturate(0)'] },
  })
  await app.init()
  return app
}

async function zoomThrough (...names) {
  for (const name of names) {
    await app.zoomIn(app.canvas.querySelector(`.is-current-view .zoom-me[data-to="${name}"]`))
    await expect.poll(() => app.blockEvents).toBe(false)
  }
}

const role = name => app.canvas.querySelector(`.is-${name}-view`)
const filterOf = name => getComputedStyle(role(name)).filter

it.each(['none', 'css', 'waapi'])('keeps background effects after zoom-out with the %s driver', async driver => {
  await createApp(driver)
  await zoomThrough('a', 'b', 'c')
  await expect.poll(() => filterOf('previous')).toBe('blur(3px)')
  // The last view carries the scale of the level before: its blur radius is divided by it.
  await expect.poll(() => filterOf('last')).toBe(`blur(${8 / app.storedViews[2].scale}px) saturate(0)`)

  await app.zoomOut()
  await expect.poll(() => app.blockEvents).toBe(false)
  expect(app.getCurrentViewName()).toBe('b')
  expect(role('previous').dataset.viewName).toBe('a')
  // The view that went from last to previous keeps a background effect, now the previous one.
  await expect.poll(() => filterOf('previous')).toBe('blur(3px)')
  expect(filterOf('current')).toBe('none')

  // Same state a fresh zoom-in into this level produces.
  await app.zoomOut()
  await expect.poll(() => app.blockEvents).toBe(false)
  expect(app.getCurrentViewName()).toBe('a')
  await expect.poll(() => filterOf('previous')).toBe('blur(3px)')
  expect(filterOf('current')).toBe('none')
})

it('restores the per-trigger effects of the level it returns to', async () => {
  await createApp('none', 'data-with-effects="blur(1px) | blur(2px)"')
  await zoomThrough('a', 'b', 'c')
  await app.zoomOut()
  await expect.poll(() => app.blockEvents).toBe(false)
  expect(app.getCurrentViewName()).toBe('b')
  // Level b was entered through a trigger with its own effects: its previous view uses them.
  await expect.poll(() => filterOf('previous')).toBe('blur(1px)')
})
