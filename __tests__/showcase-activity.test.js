import { afterEach, describe, expect, it, vi } from 'vitest'
import activitySource from '../docs/js/showcase-activity.js?raw'
import playgroundSource from '../docs/js/playground.js?raw'
import playgroundHTML from '../docs/views/playground.html?raw'
import mercedesHTML from '../docs/showcases/mercedes-line.html?raw'
import homeAssistantHTML from '../docs/showcases/home-assistant.html?raw'
import missionControlHTML from '../docs/showcases/mission-control.html?raw'
import docsHTML from '../docs/index.html?raw'
import { Zumly } from '../src/zumly.js'
import { prepareAndInsertView } from '../src/utils.js'

const frames = []
const hostApps = []
const hostMounts = []

afterEach(() => {
  hostApps.splice(0).forEach(app => app.destroy())
  hostMounts.splice(0).forEach(mount => mount.remove())
  vi.restoreAllMocks()
  frames.splice(0).forEach(frame => frame.remove())
})

async function createDocument () {
  const frame = document.createElement('iframe')
  frame.srcdoc = '<!doctype html><html><head></head><body><div class="canvas"></div></body></html>'
  frames.push(frame)
  const loaded = new Promise(resolve => { frame.onload = resolve })
  document.body.appendChild(frame)
  await loaded
  return { frame, doc: frame.contentDocument }
}

async function createActivity (preview = false) {
  const { frame, doc } = await createDocument()
  // Use a real isolated document while selecting the query string explicitly;
  // srcdoc has no query string and the test needs no server-side fixture route.
  const hostWindow = {
    parent: window,
    location: { search: preview ? '?preview=1' : '', origin: window.location.origin },
    addEventListener: frame.contentWindow.addEventListener.bind(frame.contentWindow),
  }
  new Function('window', 'document', activitySource)(hostWindow, doc)
  const activity = hostWindow.ShowcaseActivity
  const sendActivity = (active, origin = window.location.origin, source = window) => {
    frame.contentWindow.dispatchEvent(new MessageEvent('message', {
      source, origin, data: { type: 'zumly:showcase-activity', active },
    }))
  }
  return { frame, doc, hostWindow, activity, sendActivity }
}

describe('showcase activity', () => {
  it('keeps ordinary embeds active, accepts their host pause, and ignores unrelated messages', async () => {
    const { frame, doc, activity, sendActivity } = await createActivity()
    const changed = vi.fn()
    activity.subscribe(changed)
    expect(activity.active).toBe(true)
    expect(doc.documentElement.classList.contains('showcase-paused')).toBe(false)

    sendActivity(false)
    expect(activity.active).toBe(false)
    sendActivity(true, 'https://unrelated.invalid')
    sendActivity(true, window.location.origin, frame.contentWindow)
    expect(activity.active).toBe(false)
    sendActivity(true)
    expect(activity.active).toBe(true)

    const hidden = vi.spyOn(doc, 'hidden', 'get').mockReturnValue(true)
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(activity.active).toBe(false)
    hidden.mockReturnValue(false)
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(activity.active).toBe(true)
    expect(changed.mock.calls.map(([active]) => active)).toEqual([true, false, true, false, true])
  })

  it('keeps previews paused without pausing Zumly transition animations', async () => {
    const { doc, activity, sendActivity } = await createActivity(true)
    activity.renderPreview('<div class="z-view"><div class="rotate-orbit" style="animation-play-state:running"></div><div class="zoom-current-view" style="animation-play-state:running"></div></div>')
    sendActivity(true)
    expect(activity.active).toBe(false)
    expect(doc.querySelector('.canvas').inert).toBe(true)
    expect(getComputedStyle(doc.querySelector('.rotate-orbit')).animationPlayState).toBe('paused')
    expect(getComputedStyle(doc.querySelector('.zoom-current-view')).animationPlayState).toBe('running')
  })

  it.each([
    ['Mercedes', mercedesHTML, 'Production Line'],
    ['Home Assistant', homeAssistantHTML, 'Devices'],
    ['Mission Control', missionControlHTML, 'Mission Control'],
  ])('%s renders its actual preview HTML without constructing a Zumly instance', async (_name, html, heading) => {
    const { doc, activity, hostWindow } = await createActivity(true)
    hostWindow.Zumly = vi.fn(function () { throw new Error('Preview started a Zumly instance') })
    const mainScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .find(([, source]) => source.includes('const ZumlyLib'))[1]
    new Function('window', 'document', 'ShowcaseActivity', mainScript)(hostWindow, doc, activity)
    expect(hostWindow.Zumly).not.toHaveBeenCalled()
    expect(doc.querySelectorAll('.z-view')).toHaveLength(1)
    expect(doc.querySelector('.is-current-view').textContent).toContain(heading)
    expect(doc.querySelector('.canvas').inert).toBe(true)
  })

  it('keeps preview roots at the same size and position as normal initial view preparation', async () => {
    const { doc, activity } = await createActivity(true)
    doc.head.insertAdjacentHTML('beforeend', '<style>body{margin:0}.canvas{position:absolute;left:17px;top:23px;width:280px;height:180px}.z-view{width:100%;height:100%;display:flex;align-items:center;justify-content:center}</style>')
    const html = '<div class="z-view"><span>Centered content</span></div>'
    activity.renderPreview(html)
    const bounds = element => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    const previewRoot = bounds(doc.querySelector('.z-view'))
    const previewContent = bounds(doc.querySelector('span'))
    const canvas = doc.querySelector('.canvas')
    canvas.replaceChildren()
    const template = doc.createElement('template')
    template.innerHTML = html
    await prepareAndInsertView(template.content.firstElementChild, 'home', canvas, true, {}, {})
    expect(bounds(doc.querySelector('.z-view'))).toEqual(previewRoot)
    expect(bounds(doc.querySelector('span'))).toEqual(previewContent)
  })
})

it('reactivates the surviving showcase after a view source fails without an after-navigation hook', async () => {
  const mount = document.createElement('div')
  mount.id = 'showcase-host-test'
  mount.style.cssText = 'position:absolute;width:400px;height:300px'
  document.body.appendChild(mount)
  hostMounts.push(mount)
  let app
  class HostZumly extends Zumly {
    constructor () {
      super({
        mount: '#showcase-host-test', initialView: 'showcase',
        views: {
          showcase: '<div class="z-view" style="width:400px;height:300px"><iframe src="about:blank"></iframe></div>',
          broken: () => Promise.reject(new Error('View source failed')),
        },
        transitions: { driver: 'none' }, depthNav: false, lateralNav: false,
      })
      app = this
      hostApps.push(this)
    }
  }
  HostZumly.Router = { install () {} }
  const hostWindow = {
    Zumly: HostZumly, location: window.location,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
  }
  const mainScript = [...docsHTML.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .find(([, source]) => source.includes('var viewHome'))[1]
  new Function('window', 'document', 'fetch', mainScript)(hostWindow, document,
    () => Promise.resolve({ json: () => Promise.resolve({}) }))
  await expect.poll(() => app.getCurrentViewName()).toBe('showcase')
  const frame = mount.querySelector('iframe')
  const activityMessages = vi.spyOn(frame.contentWindow, 'postMessage')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await app.goTo('broken', { mode: 'lateral' })
  expect(activityMessages.mock.calls.some(([data]) => data.active === false)).toBe(true)
  await expect.poll(() => activityMessages.mock.lastCall?.[0].active).toBe(true)
  expect(app.getCurrentViewName()).toBe('showcase')
  expect(mount.querySelector('iframe')).toBe(frame)
})

it('updates range labels while dragging and rebuilds the playground once on committed change', async () => {
  const { doc } = await createDocument()
  doc.body.innerHTML = playgroundHTML
  const initialize = vi.fn()
  const destroy = vi.fn()
  const hostWindow = {
    innerWidth: 1000,
    Zumly: vi.fn(function () { this.init = initialize; this.destroy = destroy }),
  }
  new Function('window', 'document', playgroundSource)(hostWindow, doc)
  hostWindow.Playground.bind()
  hostWindow.Playground.setup()

  const range = doc.getElementById('pg-dur')
  for (let value = 750; value <= 1000; value += 50) {
    range.value = String(value)
    range.dispatchEvent(new Event('input'))
  }
  expect(doc.getElementById('pg-dur-val').textContent).toBe('1000ms')
  expect(initialize).toHaveBeenCalledTimes(1)
  expect(destroy).not.toHaveBeenCalled()
  range.dispatchEvent(new Event('change'))
  expect(initialize).toHaveBeenCalledTimes(2)
  expect(destroy).toHaveBeenCalledTimes(1)
  expect(hostWindow.Zumly.mock.calls[1][0].transitions.duration).toBe('1000ms')
  hostWindow.Playground.destroy()
})
