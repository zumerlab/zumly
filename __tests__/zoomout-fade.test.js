/**
 * A zoom-out ends with the view fading into its trigger: over the last third of the motion,
 * whatever the driver, so the trigger takes its place instead of the view vanishing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Zumly } from '../src/zumly.js'
import '../src/style.css'

const box = 'width:400px;height:300px'
const trigger = to => `<div class="zoom-me" data-to="${to}" style="position:absolute;left:40px;top:40px;width:80px;height:60px">${to}</div>`
const views = {
  home: `<div class="z-view" style="${box}">${trigger('a')}</div>`,
  a: `<div class="z-view" style="${box}">${trigger('b')}</div>`,
  b: `<div class="z-view" style="${box}">b</div>`
}

let app

beforeEach(() => {
  document.body.innerHTML = '<div class="canvas zumly-canvas" style="width:800px;height:600px"></div>'
})

afterEach(() => {
  app?.destroy()
  app = null
  document.body.innerHTML = ''
})

async function start (transitions = {}) {
  app = new Zumly({ mount: '.canvas', initialView: 'home', views, transitions: { duration: '200ms', ...transitions } })
  await app.init()
}

const current = () => app.canvas.querySelector(':scope > .is-current-view')
const named = name => app.canvas.querySelector(`:scope > .z-view[data-view-name="${name}"]`)
/** The fade Zumly adds to a view, as [offset, opacity] pairs, or undefined. */
const fadeOf = el => el.getAnimations()
  .map(animation => animation.effect.getKeyframes())
  .find(frames => frames.at(-1)?.opacity === '0')
  ?.map(k => [+k.computedOffset.toFixed(3), k.opacity])

describe('zoom-out', () => {
  it.each(['css', 'waapi'])('fades the view into its trigger over the last third (%s driver)', async (driver) => {
    await start({ driver })
    await app.zoomIn(current().querySelector('.zoom-me'))
    const a = current()
    const out = app.zoomOut()
    expect(fadeOf(a)).toEqual([[0, '1'], [0.667, '1'], [1, '0']])
    await out
    expect(a.isConnected).toBe(false)
  })

  it('leaves the fade to hideTrigger: "fade", which crossfades over the whole zoom-out', async () => {
    await start({ hideTrigger: 'fade' })
    await app.zoomIn(current().querySelector('.zoom-me'))
    const a = current()
    const out = app.zoomOut()
    const thirds = a.getAnimations().filter(animation => animation.effect.getKeyframes().some(k => k.computedOffset > 0.6 && k.computedOffset < 0.7))
    expect(thirds).toHaveLength(0)
    await out
  })

  it('fades the views riding along when it climbs several levels', async () => {
    await start()
    await app.zoomIn(current().querySelector('.zoom-me'))
    await app.zoomIn(current().querySelector('.zoom-me'))
    const a = named('a')
    const b = named('b')
    const out = app.zoomOut(2)
    expect(fadeOf(a)).toBeTruthy()
    expect(fadeOf(b)).toBeTruthy()
    await out
    expect(app.getCurrentViewName()).toBe('home')
  })

  it('does not fade an instant zoom-out', async () => {
    await start({ driver: 'none' })
    await app.zoomIn(current().querySelector('.zoom-me'))
    const a = current()
    await app.zoomOut({ duration: 0 })
    expect(a.isConnected).toBe(false)
    expect(a.getAnimations()).toHaveLength(0)
  })
})
