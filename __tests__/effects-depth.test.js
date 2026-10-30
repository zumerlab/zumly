/**
 * Background effects past the second level: the last view's blur does not grow
 * with the scale it carries, and the view two levels back comes back visible
 * after a zoom-out, where it sat when its level was entered.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Zumly } from '../src/zumly.js'
import { parseTranslateScale } from '../src/geometry.js'
import { scaleBlur } from '../src/utils.js'
import '../src/style.css'

const chain = ['v0', 'v1', 'v2', 'v3', 'v4']
const view = (name, next) => `<div class="z-view" style="width:400px;height:300px">
  <p>${name}</p>${next ? `<span class="zoom-me" data-to="${next}" style="position:absolute;left:40px;top:60px;width:80px;height:60px">${next}</span>` : ''}
</div>`
const views = Object.fromEntries(chain.map((name, i) => [name, view(name, chain[i + 1])]))

let app
beforeEach(() => { document.body.innerHTML = '' })
afterEach(() => { app?.destroy(); app = null })

function createApp (opts = {}) {
  const mount = document.createElement('div')
  mount.className = 'zumly-canvas'
  mount.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:600px'
  document.body.appendChild(mount)
  app = new Zumly({
    mount,
    initialView: 'v0',
    views,
    transitions: { driver: 'none', duration: '0s', effects: ['blur(3px)', 'blur(8px) saturate(0)'] },
    ...opts
  })
  return app
}

async function zoomDown (app, depth) {
  for (let i = 1; i <= depth; i++) {
    await app.zoomIn(app.canvas.querySelector(`.is-current-view .zoom-me[data-to="v${i}"]`))
  }
}

const node = name => app.canvas.querySelector(`[data-view-name="${name}"]`)
const classes = el => ['is-current-view', 'is-previous-view', 'is-last-view', 'hide', 'has-effect'].filter(c => el.classList.contains(c))
const pose = el => ({ origin: el.style.transformOrigin, transform: el.style.transform, filter: el.style.getPropertyValue('--z-effect-filter'), classes: classes(el) })

describe('scaleBlur', () => {
  it('divides every blur radius and leaves the rest', () => {
    expect(scaleBlur('blur(8px) saturate(0)', 4)).toBe('blur(2px) saturate(0)')
    expect(scaleBlur('brightness(.5) blur( 9px )', 3)).toBe('brightness(.5) blur(3px)')
    expect(scaleBlur('blur(8px)', 1)).toBe('blur(8px)')
    expect(scaleBlur('blur(8px)', 0.5)).toBe('blur(8px)')
    expect(scaleBlur('none', 10)).toBe('none')
    expect(scaleBlur('saturate(0)', 10)).toBe('saturate(0)')
  })
})

describe('the last view behind a zoom', () => {
  it('keeps its blur radius divided by the scale it already carries', async () => {
    createApp()
    await app.init()
    await zoomDown(app, 1)
    // v0 is the previous view: its blur is the one written.
    expect(node('v0').style.getPropertyValue('--z-effect-filter')).toBe('blur(3px)')
    const scale1 = app.storedViews[1].scale
    expect(scale1).toBeGreaterThan(1)

    await zoomDown(app, 2)
    // v0 is now the last view, scaled by level 1 on top of level 2.
    const last = node('v0')
    const carried = parseTranslateScale(last.style.transform).scale / app.storedViews[2].scale
    expect(carried).toBeCloseTo(scale1, 3)
    expect(last.style.getPropertyValue('--z-effect-filter')).toBe(`blur(${Math.round(8 / scale1 * 1e4) / 1e4}px) saturate(0)`)
    expect(parseFloat(getComputedStyle(last).filter.match(/blur\(([\d.]+)px\)/)[1]) * scale1).toBeCloseTo(8, 2)

    // Deeper: the same rule with the scale of the level before.
    await zoomDown(app, 3)
    const scale2 = app.storedViews[2].scale
    expect(node('v1').style.getPropertyValue('--z-effect-filter')).toBe(`blur(${Math.round(8 / scale2 * 1e4) / 1e4}px) saturate(0)`)
  })

  it('comes back visible, in place and with its effect, after a zoom-out', async () => {
    createApp()
    await app.init()
    await zoomDown(app, 2)
    const entered = pose(node('v0'))
    expect(entered.classes).toEqual(['is-last-view', 'has-effect'])

    await zoomDown(app, 3)
    expect(node('v0')).toBeNull() // out of the canvas past the third level

    await app.zoomOut()
    const back = node('v0')
    expect(back).not.toBeNull()
    expect(pose(back)).toEqual(entered)
    await expect.poll(() => getComputedStyle(back).opacity).toBe('1')

    // And the stack keeps working: in again, out twice, and down to the root.
    await zoomDown(app, 3)
    await app.zoomOut()
    await app.zoomOut()
    expect(app.getCurrentViewName()).toBe('v1')
    expect(classes(node('v0'))).toEqual(['is-previous-view', 'has-effect'])
    await app.zoomOut()
    expect(classes(node('v0'))).toEqual(['is-current-view'])
  })

  it('comes back the same after zoomOut(2) as after two zoomOuts', async () => {
    createApp()
    await app.init()
    await zoomDown(app, 4)
    await app.zoomOut(2)
    const multi = pose(node('v0'))
    expect(multi.classes).toEqual(['is-last-view', 'has-effect'])
    app.destroy()

    createApp()
    await app.init()
    await zoomDown(app, 4)
    await app.zoomOut()
    await app.zoomOut()
    expect(pose(node('v0'))).toEqual(multi)
  })
})
