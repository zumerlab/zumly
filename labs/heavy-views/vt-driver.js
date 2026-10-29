/**
 * Experiment 8: a Zumly driver on the View Transitions API (option 1 of the report).
 *
 * The views take the zoom's start state, and document.startViewTransition() applies the end
 * state. The browser captures each view as an image (at its own size, without its transform) and
 * animates that image with the view's transform: the scaling is of a texture, as with flatten's
 * photos, without SnapDOM. The root gets no capture (view-transition-name: none), so the rest of
 * the page stays live, and each view's new image is live too: what changes in it moves.
 *
 * Zoom-in and zoom-out only; a move to a sibling, or a browser without the API, goes to waapi.
 * onReady(spec): when the animation starts, after the browser captured the old state.
 * one: only each view's new image, without the crossfade from the old one.
 */
import {
  parseDurationMs, showViews, applyZoomInEndState, applyZoomOutPreviousState, applyZoomOutLastState,
  removeViewFromCanvas, createFinishGuard, SAFETY_BUFFER_MS
} from '/src/drivers/driver-helpers.js'
import { runTransition as waapi } from '/src/drivers/waapi-transition.js'

const NAMES = ['z-vt-0', 'z-vt-1', 'z-vt-2']

const CSS = `
:root { view-transition-name: none; }
${NAMES.map(n => `::view-transition-group(${n})`).join(', ')} {
  animation-duration: var(--z-vt-ms, 1s);
  animation-timing-function: var(--z-vt-ease, ease);
}
${NAMES.map(n => `::view-transition-old(${n}), ::view-transition-new(${n})`).join(', ')} {
  animation-duration: var(--z-vt-ms, 1s);
}
`
// The old and new images of a view are the same view: crossfading them draws it twice, with
// the live blur of the one behind. Only the new image, without a fade (?vt=one in the demo).
const ONE = `
${NAMES.map(n => `::view-transition-old(${n})`).join(', ')} { display: none; }
${NAMES.map(n => `::view-transition-new(${n})`).join(', ')} { animation: none; }
`

let styled = false
function style (one) {
  if (styled) return
  styled = true
  const el = document.createElement('style')
  el.textContent = CSS + (one ? ONE : '')
  document.head.append(el)
}

function name (views) {
  views.forEach((view, i) => { if (view) view.style.viewTransitionName = NAMES[i] })
}

function unname (views) {
  for (const view of views) view?.style.removeProperty('view-transition-name')
}

export function createViewTransitionDriver ({ onReady, one = false } = {}) {
  return function runTransition (spec, done) {
    const { type, currentView, previousView, lastView, currentStage, duration, ease, canvas } = spec
    if (typeof document.startViewTransition !== 'function' || (type !== 'zoomIn' && type !== 'zoomOut') ||
      !currentView || !previousView || !currentStage) return waapi(spec, done)
    style(one)
    const ms = parseDurationMs(duration)
    document.documentElement.style.setProperty('--z-vt-ms', `${ms}ms`)
    document.documentElement.style.setProperty('--z-vt-ease', ease || 'ease')
    const views = [currentView, previousView, lastView]
    const [v0, v1, v2] = currentStage.views
    let end
    if (type === 'zoomIn') {
      showViews(currentView, previousView, lastView)
      views.forEach((view, i) => {
        const state = currentStage.views[i]?.backwardState
        if (!view || !state) return
        view.style.transformOrigin = state.origin
        view.style.transform = state.transform
      })
      end = () => {
        applyZoomInEndState(currentView, currentStage)
        applyZoomInEndState(previousView, currentStage)
        if (lastView) applyZoomInEndState(lastView, currentStage)
      }
    } else {
      currentView.style.transformOrigin = v0.forwardState.origin
      currentView.style.transform = v0.forwardState.transform
      end = () => {
        currentView.style.transformOrigin = v0.backwardState.origin
        currentView.style.transform = v0.backwardState.transform
        applyZoomOutPreviousState(previousView, v1.backwardState)
        if (lastView && v2) applyZoomOutLastState(lastView, v2.backwardState)
      }
    }
    name(views)
    const { finish } = createFinishGuard(() => {
      unname(views)
      if (type === 'zoomOut') removeViewFromCanvas(currentView, canvas)
      done()
    }, ms + 1000 + SAFETY_BUFFER_MS)
    let transition
    try {
      transition = document.startViewTransition(end)
    } catch (error) {
      end()
      return finish()
    }
    transition.ready.then(() => onReady?.(spec), () => {})
    transition.finished.then(finish, finish)
  }
}
