import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cssTransition } from '../src/drivers/index.js'

/**
 * Regression tests for the CSS driver's completion handling.
 *
 * Two real-world failure modes (seen on the docs site showcases):
 * 1. When animationend never arrives in time (heavy incoming view delays the
 *    render frame past the safety timeout, hidden tab, element removed), the
 *    safety path used to complete WITHOUT applying the end state — views were
 *    left stuck with `is-new-current-view has-no-events zoom-current-view`,
 *    blocking pointer events and breaking subsequent zoomOut.
 * 2. animation events bubble: a one-shot CSS animation ending on content
 *    INSIDE a view (e.g. Orbit CSS intros) used to be mistaken for the view's
 *    own zoom animation, cutting the transition short.
 */

function makeStage () {
  return {
    stagger: 0,
    views: [
      { forwardState: { origin: '0 0', transform: 'translate(0px, 0px)' }, backwardState: { origin: '0 0', transform: 'translate(10px, 10px) scale(0.2)' } },
      { forwardState: { origin: '0 0', transform: 'translate(-5px, -5px) scale(4)' }, backwardState: { origin: '0 0', transform: 'translate(0px, 0px)' } },
      { forwardState: { origin: '0 0', transform: 'translate(-9px, -9px) scale(16)' }, backwardState: { origin: '0 0', transform: 'translate(-5px, -5px) scale(4)' } },
    ],
  }
}

function makeZoomInDom () {
  document.body.innerHTML = `
    <div class="zumly-canvas">
      <div class="z-view is-previous-view zoom-previous-view has-no-events" data-view-name="home"></div>
      <div class="z-view is-new-current-view has-no-events zoom-current-view" data-view-name="detail"></div>
    </div>`
  const canvas = document.querySelector('.zumly-canvas')
  return {
    canvas,
    previousView: canvas.querySelector('[data-view-name="home"]'),
    currentView: canvas.querySelector('[data-view-name="detail"]'),
  }
}

describe('css driver safety completion', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('applies the zoom-in end state when animationend never fires', async () => {
    const { canvas, previousView, currentView } = makeZoomInDom()
    // No zumly stylesheet is loaded in this test DOM, so no CSS animation ever
    // starts and animationend never fires — the safety timeout is the only exit.
    const done = new Promise(resolve => {
      cssTransition({
        type: 'zoomIn',
        currentView,
        previousView,
        lastView: null,
        currentStage: makeStage(),
        duration: '50ms',
        ease: 'linear',
        canvas,
      }, resolve)
    })
    await done
    expect(currentView.classList.contains('is-current-view')).toBe(true)
    expect(currentView.classList.contains('is-new-current-view')).toBe(false)
    expect(currentView.classList.contains('zoom-current-view')).toBe(false)
    expect(currentView.classList.contains('has-no-events')).toBe(false)
    expect(previousView.classList.contains('zoom-previous-view')).toBe(false)
    expect(previousView.classList.contains('has-no-events')).toBe(false)
  })

  it('applies the zoom-out end state when animationend never fires', async () => {
    document.body.innerHTML = `
      <div class="zumly-canvas">
        <div class="z-view is-previous-view zoom-previous-view-reverse" data-view-name="home"></div>
        <div class="z-view is-current-view zoom-current-view-reverse" data-view-name="detail"></div>
      </div>`
    const canvas = document.querySelector('.zumly-canvas')
    const previousView = canvas.querySelector('[data-view-name="home"]')
    const currentView = canvas.querySelector('[data-view-name="detail"]')
    const done = new Promise(resolve => {
      cssTransition({
        type: 'zoomOut',
        currentView,
        previousView,
        lastView: null,
        currentStage: makeStage(),
        duration: '50ms',
        ease: 'linear',
        canvas,
      }, resolve)
    })
    await done
    // Outgoing view removed, previous restored without reverse classes
    expect(canvas.querySelector('[data-view-name="detail"]')).toBeNull()
    expect(previousView.classList.contains('zoom-previous-view-reverse')).toBe(false)
  })

  it('ignores animationend bubbling from view content', async () => {
    const { canvas, previousView, currentView } = makeZoomInDom()
    // One-shot animation on CONTENT inside the incoming view (like an
    // Orbit CSS intro). Its animationend bubbles up to the view element.
    const style = document.createElement('style')
    style.textContent = '@keyframes child-pop { from { opacity: 0 } to { opacity: 1 } } .child-pop { animation: child-pop 30ms linear; }'
    document.head.appendChild(style)
    const child = document.createElement('div')
    child.textContent = 'content'
    currentView.appendChild(child)

    let completed = false
    const done = new Promise(resolve => {
      cssTransition({
        type: 'zoomIn',
        currentView,
        previousView,
        lastView: null,
        currentStage: makeStage(),
        duration: '400ms',
        ease: 'linear',
        canvas,
      }, () => { completed = true; resolve() })
    })
    child.classList.add('child-pop')
    // Wait for the child animation to finish and bubble
    await new Promise(r => setTimeout(r, 150))
    // The bubbled child animationend must NOT have completed the transition
    // nor applied the end state prematurely.
    expect(completed).toBe(false)
    expect(currentView.classList.contains('is-new-current-view')).toBe(true)
    await done
    expect(currentView.classList.contains('is-current-view')).toBe(true)
    style.remove()
  })
})
