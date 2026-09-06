import { afterEach, describe, expect, it, vi } from 'vitest'
import { animeTransition, motionTransition } from '../src/drivers/index.js'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function controlDriver (name) {
  let update
  let finish
  if (name === 'anime') {
    vi.stubGlobal('anime', options => {
      update = value => { options.targets.value = value; options.update() }
      finish = options.complete
    })
  } else {
    vi.stubGlobal('motion', { animate: (_from, _to, options) => {
      update = options.onUpdate
      return new Promise(resolve => { finish = resolve })
    } })
  }
  return { update: value => update(value), finish: async () => { finish(); await Promise.resolve() } }
}

function view (role) {
  const element = document.createElement('div')
  element.className = role
  element.style.cssText = 'position:absolute;left:19px;top:23px;width:217px;height:139px'
  return element
}

function expectBounds (actual, reference) {
  const a = actual.getBoundingClientRect()
  const b = reference.getBoundingClientRect()
  for (const property of ['x', 'y', 'width', 'height']) {
    expect(a[property]).toBeCloseTo(b[property], 3)
  }
}

describe.each([
  ['anime', animeTransition],
  ['motion', motionTransition],
])('%s matrix driver', (name, runTransition) => {
  it.each(['zoomIn', 'zoomOut'])('preserves origins, staggered trajectories and completion for %s without layout reads', async type => {
    const controls = controlDriver(name)
    const canvas = document.createElement('div')
    const elements = [view(type === 'zoomIn' ? 'is-new-current-view' : 'is-current-view'), view('is-previous-view'), view('is-last-view')]
    const references = elements.map(() => view('reference'))
    canvas.append(...elements, ...references)
    document.body.append(canvas)
    const views = [
      { backwardState: { origin: '17.25px 29.5px', transform: 'translate(-31.2345678px, 45.3456789px) scale(0.123456789)' }, forwardState: { origin: '0 0', transform: 'translate(61.2345678px, -37.3456789px)' } },
      { backwardState: { origin: '0 0', transform: 'translate(5.12345678px, 17.23456789px) scale(1.25)' }, forwardState: { origin: '91.75px 63.125px', transform: 'translate(-73.1234567px, 38.7654321px) scale(3.7654321)' } },
      { backwardState: { origin: '23px 41px', transform: 'translate(35.2345678px, -12.3456789px) scale(1.87654321)' }, forwardState: { origin: '113px 7px', transform: 'translate(-21.2345678px, 18.7654321px) scale(7.12345678)' } },
    ]
    const computed = vi.spyOn(window, 'getComputedStyle')
    const bounds = elements.map(element => vi.spyOn(element, 'getBoundingClientRect'))
    const complete = vi.fn()
    runTransition({ type, currentView: elements[0], previousView: elements[1], lastView: elements[2], currentStage: { views, stagger: 20 }, duration: '100ms', ease: 'linear', canvas }, complete)
    expect(computed).not.toHaveBeenCalled()
    for (const read of bounds) expect(read).not.toHaveBeenCalled()

    for (const progress of [0, 0.375, 0.75, 1]) {
      controls.update(progress)
      elements.forEach((element, index) => {
        const start = views[index][type === 'zoomIn' ? 'backwardState' : 'forwardState']
        const end = views[index][type === 'zoomIn' ? 'forwardState' : 'backwardState']
        const from = new DOMMatrix(start.transform)
        const to = new DOMMatrix(end.transform)
        const local = Math.min(1, Math.max(0, (progress * 140 - index * 20) / 100))
        const matrix = ['a', 'b', 'c', 'd', 'e', 'f'].map(key => from[key] + (to[key] - from[key]) * local)
        references[index].style.transformOrigin = start.origin
        references[index].style.transform = `matrix(${matrix.join(',')})`
        expectBounds(element, references[index])
      })
    }
    await controls.finish()
    expect(complete).toHaveBeenCalledOnce()
    if (type === 'zoomIn') expect(elements[0].classList.contains('is-current-view')).toBe(true)
    else expect(elements[0].isConnected).toBe(false)
    elements.forEach((element, index) => {
      if (type === 'zoomOut' && index === 0) return
      const end = views[index][type === 'zoomIn' ? 'forwardState' : 'backwardState']
      references[index].style.transformOrigin = type === 'zoomOut' && index === 1 ? '0 0' : end.origin
      references[index].style.transform = end.transform
      expectBounds(element, references[index])
    })
  })
})
