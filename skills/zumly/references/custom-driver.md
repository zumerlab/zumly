# Writing a custom Zumly transition driver

For Zumly 1.2.x. Read this before writing a driver. The full guide is `docs/DRIVER_API.md` in the package (https://github.com/zumerlab/zumly/blob/main/docs/DRIVER_API.md).

## Do you need one?

The built-in drivers cover a zoom animated with CSS, the Web Animations API, GSAP, Anime.js or Motion. Duration, easing, background filters and stagger are options, not driver work. Write a driver only when the move itself is different (a crossfade, a flip, a library that is not on the list) or to wrap a built-in one.

## Contract

```js
new Zumly({ /* … */ transitions: { driver: myDriver, duration: '400ms' } })

function myDriver (spec, onComplete) { /* … */ }
```

Zumly inserts the views, computes every transform and calls the driver. The driver:

1. Handles the three values of `spec.type`: `'zoomIn'`, `'zoomOut'`, `'lateral'`.
2. Leaves the DOM in the final state. The engine does not do it. Use the helpers below; do not write view classes or final transforms by hand.
3. Calls `onComplete()` exactly once, always. Navigation stays locked until it does (Zumly forces it after about 8 seconds and warns). If the driver throws, Zumly finishes with the `none` driver.

Under `prefers-reduced-motion: reduce` Zumly uses the `none` driver and does not call yours.

## The spec

| Field | Value |
| --- | --- |
| `type` | `'zoomIn'`, `'zoomOut'` or `'lateral'` |
| `currentView` | The view coming in (zoom-in) or leaving (zoom-out) |
| `previousView` | The parent |
| `lastView` | The grandparent, or `null` |
| `currentStage` | The snapshot: `{ zoomLevel, views: [current, previous, last, …] }` |
| `duration`, `ease` | Strings: `'400ms'`, `'ease-in-out'` (or a library ease name the user chose) |
| `canvas` | The canvas element |

Each entry of `currentStage.views` has `viewName`, `backwardState` and `forwardState`, each `{ origin, transform, duration, ease }`. Zoom-in animates a view from `backwardState.transform` to `forwardState.transform`; zoom-out goes the other way.

For `'lateral'` the spec also has `backView`, `backViewState` and `lastViewState` (`{ transformStart, transformEnd }`), `incomingTransformStart`, `incomingTransformEnd`, `outgoingTransform`, `outgoingTransformEnd`, `slideDeltaX`, `slideDeltaY` and `keepAlive`. Unless you want to animate the slide yourself, hand lateral moves to `runLateralInstant(spec, onComplete)`.

## Helpers

```js
import { /* … */ } from 'zumly/driver-helpers'
```

ESM only. From a script-tag page there is no global for them; use a bundler or an import map.

| Helper | Purpose |
| --- | --- |
| `showViews(...views)` | Make views visible before animating (nulls are skipped) |
| `applyZoomInEndState(view, currentStage)` | Final classes and transform after a zoom-in; call it for current, previous and last |
| `removeViewFromCanvas(view, canvas)` | Remove the view that zoomed out |
| `applyZoomOutPreviousState(view, currentStage.views[1].backwardState)` | Final state of the parent after a zoom-out |
| `applyZoomOutLastState(view, currentStage.views[2].backwardState)` | Final state of the grandparent after a zoom-out |
| `runLateralInstant(spec, onComplete)` | A lateral move with no animation |
| `createFinishGuard(cleanup, timeoutMs)` | Returns `{ finish, extend }`. `finish` runs `cleanup` once; a timer runs it if the animation never ends. `extend(ms)` re-arms the timer |
| `SAFETY_BUFFER_MS` | 150, the usual margin for the guard |
| `parseDurationMs(d)`, `parseDurationSec(d)` | `'1s'` → `1000` / `1` |
| `cssEasing(ease)` | A CSS timing function as `t => eased`, or `null` for a non-CSS name |
| `readComputedMatrix`, `interpolateMatrix`, `matrixToString`, `parseMatrixString`, `identityMatrix`, `lerp` | Matrix interpolation, for drivers that tween transforms themselves |

## A complete driver

A crossfade: nothing scales. Every view is put in its final place and the current one fades. This driver was run against 1.2.3 (zoom-in to three levels, zoom-out, lateral).

```js
import {
  parseDurationMs, showViews, applyZoomInEndState, applyZoomOutPreviousState,
  applyZoomOutLastState, removeViewFromCanvas, runLateralInstant,
  createFinishGuard, SAFETY_BUFFER_MS
} from 'zumly/driver-helpers'

export function fadeDriver (spec, onComplete) {
  const { type, currentView, previousView, lastView, currentStage, canvas } = spec
  if (type === 'lateral') return runLateralInstant(spec, onComplete)

  const ms = parseDurationMs(spec.duration)
  showViews(currentView, previousView, lastView)

  if (type === 'zoomIn') {
    // Put every layer in its final place, then fade the new view in.
    applyZoomInEndState(currentView, currentStage)
    applyZoomInEndState(previousView, currentStage)
    if (lastView) applyZoomInEndState(lastView, currentStage)
    const fade = currentView.animate({ opacity: [0, 1] }, { duration: ms, easing: 'ease' })
    const { finish } = createFinishGuard(() => { fade.cancel(); onComplete() }, ms + SAFETY_BUFFER_MS)
    fade.onfinish = finish
    return
  }

  // zoomOut: fade the current view out, then restore the layers behind it.
  const fade = currentView.animate({ opacity: [1, 0] }, { duration: ms, easing: 'ease', fill: 'forwards' })
  const { finish } = createFinishGuard(() => {
    removeViewFromCanvas(currentView, canvas)
    applyZoomOutPreviousState(previousView, currentStage.views[1].backwardState)
    if (lastView) applyZoomOutLastState(lastView, currentStage.views[2].backwardState)
    onComplete()
  }, ms + SAFETY_BUFFER_MS)
  fade.onfinish = finish
}
```

## Wrapping a built-in driver

`zumly/drivers` exports the built-in ones as `cssTransition`, `waapiTransition`, `noneTransition`, `animeTransition`, `gsapTransition`, `motionTransition`, plus `getDriver(name)` which returns `{ runTransition }`.

```js
import { cssTransition } from 'zumly/drivers'

const logged = (spec, onComplete) => {
  console.time(spec.type)
  cssTransition(spec, () => { console.timeEnd(spec.type); onComplete() })
}
```

## Checking it

Compare with `driver: 'none'`, which applies the final state at once. After a zoom-in there is one `.is-current-view` with the new `data-view-name`; after a zoom-out the parent is `.is-current-view` and the old view is gone from the canvas; and `await app.zoomTo('x')` resolves, which proves `onComplete` ran.
