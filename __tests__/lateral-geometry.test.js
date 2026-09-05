import { afterEach, describe, expect, it } from 'vitest'
import { Zumly } from '../src/zumly.js'
import '../src/style.css'

let app

afterEach(() => {
  app?.destroy()
  app = null
  document.body.replaceChildren()
})

const view = (width, height, content = '') =>
  `<div class="z-view" style="left:0;top:0;width:${width}px;height:${height}px">${content}</div>`

const trigger = (name, left, top, width, height) =>
  `<div class="zoom-me" data-to="${name}" style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px">${name}</div>`

async function createApp (driver, { withTriggers = true, hideTrigger = false } = {}) {
  document.body.innerHTML = '<div id="geometry-canvas" class="zumly-canvas" style="position:fixed;left:24px;top:32px;width:800px;height:600px"></div>'
  app = new Zumly({
    mount: '#geometry-canvas',
    initialView: 'home',
    views: {
      home: view(800, 600, withTriggers ? trigger('parent', 170, 110, 140, 105) : ''),
      parent: view(560, 420, withTriggers
        ? trigger('a', 35, 55, 80, 55) + trigger('b', 365, 245, 104, 68)
        : ''),
      a: view(320, 220, 'A'),
      b: view(520, 340, 'B'),
    },
    transitions: { driver, duration: '40ms', ease: 'linear', effects: ['none', 'none'], hideTrigger },
    depthNav: false,
    lateralNav: { arrows: false, dots: false },
    inputs: { wheel: false },
  })
  await app.init()
  return app
}

function getView (name) {
  return app.canvas.querySelector(`.z-view[data-view-name="${name}"]`)
}

function getTrigger (name) {
  return app.canvas.querySelector(`.zoom-me[data-to="${name}"]`)
}

function rectOf (element) {
  const { x, y, width, height } = element.getBoundingClientRect()
  return { x, y, width, height }
}

function poseOf (element) {
  return {
    rect: rectOf(element),
    transform: element.style.transform,
    origin: element.style.transformOrigin,
  }
}

function expectRect (actual, expected) {
  for (const field of ['x', 'y', 'width', 'height']) {
    expect(Math.abs(actual[field] - expected[field]), `rect.${field}`).toBeLessThan(0.1)
  }
}

function expectPose (element, expected) {
  const actual = poseOf(element)
  expectRect(actual.rect, expected.rect)
  expect(actual.transform).toBe(expected.transform)
  expect(actual.origin).toBe(expected.origin)
}

function expectCenter (element, expectedRect) {
  const actual = rectOf(element)
  expect(Math.abs(actual.x + actual.width / 2 - expectedRect.x - expectedRect.width / 2)).toBeLessThan(0.1)
  expect(Math.abs(actual.y + actual.height / 2 - expectedRect.y - expectedRect.height / 2)).toBeLessThan(0.1)
}

// Measure the public driver snapshot's backward pose with browser layout. The
// probe is a sibling of the views, so no current ancestor transform affects it.
function backwardRect () {
  const state = app.currentStage.views[0].backwardState
  const probe = app.canvas.querySelector('.is-current-view').cloneNode(false)
  probe.className = 'z-view'
  probe.removeAttribute('data-view-name')
  probe.style.visibility = 'hidden'
  probe.style.transform = state.transform
  probe.style.transformOrigin = state.origin
  app.canvas.appendChild(probe)
  try {
    return rectOf(probe)
  } finally {
    probe.remove()
  }
}

describe.each(['none', 'css', 'waapi'])('lateral browser geometry (%s)', driver => {
  it('restores the initial root view after a lateral round trip with one current view', async () => {
    await createApp(driver)
    const original = poseOf(getView('home'))
    await app.goTo('b', { mode: 'lateral' })
    expect(app.getCurrentViewName()).toBe('b')
    expect(app.getZoomLevel()).toBe(1)
    expectCenter(getView('b'), original.rect)
    await app.back()
    expect(app.getCurrentViewName()).toBe('home')
    expect(app.getZoomLevel()).toBe(1)
    expect(app.canvas.querySelectorAll('.is-current-view')).toHaveLength(1)
    expect(app.canvas.querySelectorAll('.z-view')).toHaveLength(1)
    expectPose(getView('home'), original)
  })

  it('centers differently sized siblings and preserves the original target pose through repeated A → B → A cycles', async () => {
    await createApp(driver)
    await app.zoomIn(getTrigger('parent'))
    const targetA = rectOf(getTrigger('a'))
    const targetB = rectOf(getTrigger('b'))
    await app.zoomIn(getTrigger('a'))
    const initialA = poseOf(getView('a'))
    const initialParent = poseOf(getView('parent'))
    const initialGrandparent = poseOf(getView('home'))

    for (let cycle = 0; cycle < 3; cycle++) {
      await app.goTo('b', { mode: 'lateral' })
      expect(app.getCurrentViewName()).toBe('b')
      expect(app.getZoomLevel()).toBe(3)
      expectCenter(getView('b'), initialA.rect)
      expectRect(backwardRect(), targetB)

      await app.goTo('a', { mode: 'lateral' })
      expect(app.getCurrentViewName()).toBe('a')
      expectPose(getView('a'), initialA)
      expectRect(backwardRect(), targetA)
      expectRect(rectOf(getView('parent')), initialParent.rect)
      expectRect(rectOf(getView('home')), initialGrandparent.rect)
    }
  })

  it('back() restores exact parent and grandparent poses without real triggers or accumulated drift', async () => {
    await createApp(driver, { withTriggers: false })
    const homeAtRoot = poseOf(getView('home'))
    await app.zoomTo('parent')
    const parentBeforeDepth = poseOf(getView('parent'))
    const homeBeforeDepth = poseOf(getView('home'))
    await app.zoomTo('a')
    const initialA = poseOf(getView('a'))
    const parentBeforeLateral = poseOf(getView('parent'))
    const homeBeforeLateral = poseOf(getView('home'))

    for (let cycle = 0; cycle < 3; cycle++) {
      await app.goTo('b', { mode: 'lateral' })
      expectCenter(getView('b'), initialA.rect)
      await app.back()
      expect(app.getCurrentViewName()).toBe('a')
      expect(app.getZoomLevel()).toBe(3)
      expectPose(getView('a'), initialA)
      expectPose(getView('parent'), parentBeforeLateral)
      expectPose(getView('home'), homeBeforeLateral)
    }

    await app.back()
    expect(app.getCurrentViewName()).toBe('parent')
    expectPose(getView('parent'), parentBeforeDepth)
    expectPose(getView('home'), homeBeforeDepth)
    await app.back()
    expect(app.getCurrentViewName()).toBe('home')
    expectPose(getView('home'), homeAtRoot)
    expect(app.canvas.querySelectorAll('.z-view')).toHaveLength(1)
  })
})

it('keeps programmatic lateral navigation centered inside a scaled canvas', async () => {
  await createApp('none', { withTriggers: false })
  app.canvas.style.transform = 'scale(0.5)'
  const original = poseOf(getView('home'))
  await app.goTo('b', { mode: 'lateral' })
  expectCenter(getView('b'), original.rect)
  await app.back()
  expectPose(getView('home'), original)
})

it('resizes lateral history so back() restores the same poses as resizing the original view', async () => {
  const enterA = async () => {
    await createApp('none', { withTriggers: false })
    await app.zoomTo('parent')
    await app.zoomTo('a')
  }
  const resizeCanvas = async () => {
    const current = app.canvas.querySelector('.is-current-view')
    const before = current.style.transform
    app.canvas.style.width = '960px'
    app.canvas.style.height = '720px'
    window.dispatchEvent(new Event('resize'))
    await expect.poll(() => current.style.transform).not.toBe(before)
  }

  await enterA()
  await resizeCanvas()
  const resizedA = poseOf(getView('a'))
  const resizedParent = poseOf(getView('parent'))
  const resizedGrandparent = poseOf(getView('home'))
  app.destroy()

  await enterA()
  await app.goTo('b', { mode: 'lateral' })
  await resizeCanvas()
  await app.back()
  expect(app.getCurrentViewName()).toBe('a')
  expectPose(getView('a'), resizedA)
  expectPose(getView('parent'), resizedParent)
  expectPose(getView('home'), resizedGrandparent)
})

describe.each([true, 'fade'])('lateral trigger visibility (hideTrigger: %s)', hideTrigger => {
  it('moves the zoomed and hidden markers to the current sibling and restores them on back()', async () => {
    await createApp('css', { hideTrigger })
    await app.zoomIn(getTrigger('parent'))
    await app.zoomIn(getTrigger('a'))
    const parent = getView('parent')
    const triggerA = getTrigger('a')
    const triggerB = getTrigger('b')
    const hiddenClass = hideTrigger === 'fade' ? 'z-trigger-fade' : 'z-trigger-hidden'
    const hiddenProperty = hideTrigger === 'fade' ? 'opacity' : 'visibility'
    const hiddenValue = hideTrigger === 'fade' ? '0' : 'hidden'
    const visibleValue = hideTrigger === 'fade' ? '1' : 'visible'

    expect(triggerA.classList.contains('zoomed')).toBe(true)
    expect(triggerA.classList.contains(hiddenClass)).toBe(true)
    const visibilityDuringAnimation = []
    const isHidden = element => {
      const style = getComputedStyle(element)
      return style.visibility === 'hidden' || Number(style.opacity) <= 0.01
    }
    const recordVisibility = event => {
      if (event.animationName !== 'zoom-lateral-in' || event.target.dataset.viewName !== 'b') return
      visibilityDuringAnimation.push({ a: isHidden(triggerA), b: isHidden(triggerB) })
    }
    app.canvas.addEventListener('animationstart', recordVisibility)
    try {
      await app.goTo('b', { mode: 'lateral' })
    } finally {
      app.canvas.removeEventListener('animationstart', recordVisibility)
    }
    expect(visibilityDuringAnimation).toEqual([{ a: true, b: true }])
    expect(parent.querySelectorAll('.zoomed')).toHaveLength(1)
    expect(parent.querySelector('.zoomed')).toBe(triggerB)
    expect(triggerA.classList.contains(hiddenClass)).toBe(false)
    expect(triggerB.classList.contains(hiddenClass)).toBe(true)
    await expect.poll(() => getComputedStyle(triggerA)[hiddenProperty]).toBe(visibleValue)
    await expect.poll(() => getComputedStyle(triggerB)[hiddenProperty]).toBe(hiddenValue)

    await app.back()
    expect(parent.querySelector('.zoomed')).toBe(triggerA)
    expect(triggerA.classList.contains(hiddenClass)).toBe(true)
    expect(triggerB.classList.contains(hiddenClass)).toBe(false)
    await expect.poll(() => getComputedStyle(triggerB)[hiddenProperty]).toBe(visibleValue)

    await app.back()
    expect(app.getCurrentViewName()).toBe('parent')
    expect(parent.querySelectorAll('.zoomed, .z-trigger-hidden, .z-trigger-fade')).toHaveLength(0)
    await expect.poll(() => getComputedStyle(triggerA)[hiddenProperty]).toBe(visibleValue)
  })
})
