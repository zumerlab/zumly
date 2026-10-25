import { afterEach, beforeEach, expect, it } from 'vitest'
import { Zumly } from '../src/zumly.js'
import '../src/style.css'

let app
const view = (content = '') => `<div class="z-view" style="width:400px;height:300px">${content}</div>`

beforeEach(() => {
  document.body.innerHTML = '<div class="canvas zumly-canvas" style="width:800px;height:600px"></div>'
})

afterEach(() => {
  app?.destroy()
  app = null
  document.body.innerHTML = ''
})

async function createApp (transitions) {
  app = new Zumly({
    mount: '.canvas',
    initialView: 'home',
    views: {
      home: view('<div class="zoom-me" data-to="detail" style="width:80px;height:60px">detail</div>'),
      detail: view('detail'),
    },
    transitions: { driver: 'css', duration: '300ms', effects: ['blur(3px)', 'blur(8px)'], ...transitions },
  })
  await app.init()
}

const home = () => app.canvas.querySelector('[data-view-name="home"]')

it('applies background effects at once with animateEffects: false', async () => {
  await createApp({ animateEffects: false })
  expect(app.animateEffects).toBe(false)
  const zoom = app.zoomIn(app.canvas.querySelector('.zoom-me'))
  await expect.poll(() => home().classList.contains('has-effect')).toBe(true)
  // No filter transition: the blur is already at its final value while the zoom runs.
  expect(getComputedStyle(home()).filter).toBe('blur(3px)')
  await zoom
  await expect.poll(() => app.blockEvents).toBe(false)

  const back = app.zoomOut()
  // Back to current: the blur is gone at once, without a reverse transition.
  expect(home().classList.contains('has-effect-reverse')).toBe(false)
  expect(getComputedStyle(home()).filter).toBe('none')
  await back
})

it('animates background effects with the zoom by default', async () => {
  await createApp({})
  expect(app.animateEffects).toBe(true)
  app.zoomIn(app.canvas.querySelector('.zoom-me'))
  await expect.poll(() => home().classList.contains('has-effect')).toBe(true)
  expect(getComputedStyle(home()).transitionProperty).toContain('filter')
  expect(parseFloat(getComputedStyle(home()).transitionDuration)).toBeGreaterThan(0)
  await expect.poll(() => app.blockEvents).toBe(false)
})
