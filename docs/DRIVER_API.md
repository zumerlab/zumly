# Writing a Zumly Transition Driver

**Zumly** (*Z over XY* — focus-driven navigation, zoom into what matters) delegates animation to **transition drivers**. A driver controls **how** views move during zoom-in, zoom-out, and lateral navigation. The engine computes **what** moves where (transforms, origins, snapshot); the driver applies motion — CSS keyframes, WAAPI, GSAP, Motion, Anime.js, or a custom timeline.

**See also:** [README.md](../README.md) (options, built-in drivers, plugins) · [geometry-optimization.md](geometry-optimization.md) (how zoom-out layout reads are batched before the driver runs).

## Quick start

A driver is an object with a single method:

```js
const myDriver = {
  runTransition(spec, onComplete) {
    // Animate views from spec.currentStage backward → forward states
    // Call onComplete() when done — this is mandatory.
  }
}
```

Register it in the constructor:

```js
new Zumly({
  mount: '.canvas',
  initialView: 'home',
  views: { home, detail },
  transitions: {
    driver: myDriver.runTransition, // pass the function directly
    duration: '600ms',
    ease: 'ease-in-out',
  },
})
```

Or as a factory function:

```js
transitions: {
  driver: (spec, onComplete) => myDriver.runTransition(spec, onComplete),
}
```

---

## The `spec` object

Your `runTransition(spec, onComplete)` receives a spec with everything needed:

### Common fields (all transition types)

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'zoomIn' \| 'zoomOut' \| 'lateral'` | What kind of transition |
| `currentView` | `HTMLElement` | The incoming view (zoom-in) or outgoing view (zoom-out) |
| `previousView` | `HTMLElement` | The parent view |
| `lastView` | `HTMLElement \| null` | Grandparent view (null at depth ≤ 2) |
| `currentStage` | `object` | Snapshot with computed states (see below) |
| `duration` | `string` | e.g. `'500ms'`, `'1s'` |
| `ease` | `string` | CSS easing, e.g. `'ease-in-out'` |
| `canvas` | `HTMLElement` | The canvas container (zoom-out and lateral only) |

### `currentStage.views[]` — The animation data

An array of view entries, indexed by role:

```
views[0] → current view  (the one zooming in/out)
views[1] → previous view (the parent)
views[2] → last view     (grandparent, when depth > 2)
```

Each entry has:

```js
{
  viewName: 'detail',
  backwardState: {
    origin: '125px 100px',    // CSS transform-origin
    transform: 'translate(50px, 60px) scale(0.25)',  // "start" for zoom-in, "end" for zoom-out
    duration: '500ms',
    ease: 'ease-in-out',
  },
  forwardState: {
    origin: '125px 100px',
    transform: 'translate(100px, 50px)',  // "end" for zoom-in, "start" for zoom-out
    duration: '500ms',
    ease: 'ease-in-out',
  }
}
```

**For zoom-in:** animate from `backwardState.transform` → `forwardState.transform`.
**For zoom-out:** animate from `forwardState.transform` → `backwardState.transform`.

### Lateral-specific fields

| Field | Type | Description |
|-------|------|-------------|
| `backView` | `HTMLElement \| null` | The parent view behind current depth |
| `backViewState` | `{ transformStart, transformEnd }` | Slide transforms for backView |
| `lastViewState` | `{ transformStart, transformEnd }` | Slide transforms for lastView |
| `incomingTransformStart` | `string` | Incoming view start transform |
| `incomingTransformEnd` | `string` | Incoming view final transform |
| `outgoingTransform` | `string` | Outgoing view current transform |
| `outgoingTransformEnd` | `string` | Outgoing view exit transform |
| `slideDeltaX` | `number` | Horizontal slide distance |
| `slideDeltaY` | `number` | Vertical slide distance |

---

## What your driver MUST do

### 1. Call `onComplete()` — always, exactly once

This is the #1 rule. The engine sets `blockEvents = true` before calling your driver and only resets it in `onComplete`. If you never call it, the UI freezes permanently.

Use the `createFinishGuard` helper to guarantee this:

```js
import { createFinishGuard, SAFETY_BUFFER_MS, parseDurationMs } from 'zumly/driver-helpers'

function runTransition(spec, onComplete) {
  const durationMs = parseDurationMs(spec.duration)

  const { finish } = createFinishGuard(() => {
    // cleanup work here...
    onComplete()
  }, durationMs + SAFETY_BUFFER_MS)

  // Your animation...
  myAnimation.onfinish = finish
  // If the animation fails/gets cancelled, the safety timer calls finish() anyway.
}
```

*(In this repo, you can import from `../src/drivers/driver-helpers.js` from your own source files.)*

### 2. Apply final DOM state after animation

When the animation ends, the DOM must reflect the final state — the engine does NOT do this for you. Use the shared helpers:

```js
import {
  applyZoomInEndState,
  applyZoomOutPreviousState,
  applyZoomOutLastState,
  removeViewFromCanvas,
  showViews
} from 'zumly/driver-helpers'

// Before animating — make views visible:
showViews(spec.currentView, spec.previousView, spec.lastView)

// After zoom-in animation completes:
applyZoomInEndState(currentView, currentStage)
applyZoomInEndState(previousView, currentStage)
if (lastView) applyZoomInEndState(lastView, currentStage)

// After zoom-out animation completes:
removeViewFromCanvas(currentView, canvas)
applyZoomOutPreviousState(previousView, currentStage.views[1].backwardState)
if (lastView) applyZoomOutLastState(lastView, currentStage.views[2].backwardState)
```

### 3. Handle all three types

Your driver receives `spec.type` which is one of:
- `'zoomIn'` — drill deeper
- `'zoomOut'` — go back
- `'lateral'` — same-level swap

For lateral, the built-in **`waapi`** driver runs a **slide animation**. If you author a minimal custom driver and want **no** lateral motion, call the instant helper:

```js
import { runLateralInstant } from 'zumly/driver-helpers'

if (spec.type === 'lateral') {
  runLateralInstant(spec, onComplete)
  return
}
```

---

## Available helpers

Import from `zumly/driver-helpers` (published) or `src/drivers/driver-helpers.js` (monorepo):

| Helper | Purpose |
|--------|---------|
| `parseDurationMs(duration)` | Parse `'1s'`/`'500ms'`/number → ms |
| `parseDurationSec(duration)` | Same but returns seconds |
| `applyZoomInEndState(el, stage)` | Apply final classes + transforms after zoom-in |
| `applyZoomOutPreviousState(el, state)` | Final state for previous view after zoom-out |
| `applyZoomOutLastState(el, state)` | Final state for last view after zoom-out |
| `removeViewFromCanvas(el, canvas)` | Safe removal (handles wrapped elements) |
| `showViews(...elements)` | Remove `hide` class + set `contentVisibility: auto` |
| `runLateralInstant(spec, onComplete)` | Instant lateral transition (no animation) |
| `createFinishGuard(cleanup, timeoutMs)` | Once-only finish + safety timeout |
| `SAFETY_BUFFER_MS` | Default safety buffer (150ms) |

### Matrix interpolation toolkit

For drivers that need to interpolate through computed CSS matrices (e.g. when transform-origin varies between states):

| Helper | Purpose |
|--------|---------|
| `readComputedMatrix(el, origin, transform)` | Read browser-computed matrix (⚠️ forces reflow) |
| `interpolateMatrix(from, to, t)` | Lerp between two matrix objects |
| `matrixToString(m)` | `{ a,b,c,d,e,f }` → `"matrix(...)"` |
| `parseMatrixString(str)` | `"matrix(...)"` → `{ a,b,c,d,e,f }` |
| `identityMatrix()` | Returns `{ a:1, b:0, c:0, d:1, e:0, f:0 }` |
| `lerp(a, b, t)` | Linear interpolation |

---

## Example: minimal custom driver

A complete, minimal driver that does a simple opacity crossfade instead of zoom:

```js
import {
  parseDurationMs,
  showViews,
  applyZoomInEndState,
  applyZoomOutPreviousState,
  applyZoomOutLastState,
  removeViewFromCanvas,
  runLateralInstant,
  createFinishGuard,
  SAFETY_BUFFER_MS,
} from 'zumly/driver-helpers'

export function runTransition(spec, onComplete) {
  const { type, currentView, previousView, lastView, currentStage, duration, canvas } = spec

  if (type === 'lateral') {
    runLateralInstant(spec, onComplete)
    return
  }

  const ms = parseDurationMs(duration)
  showViews(currentView, previousView, lastView)

  if (type === 'zoomIn') {
    // Simple crossfade: incoming fades in, outgoing fades out
    currentView.style.opacity = '0'
    currentView.style.transition = `opacity ${ms}ms ease`
    previousView.style.transition = `opacity ${ms}ms ease`

    requestAnimationFrame(() => {
      currentView.style.opacity = '1'
      previousView.style.opacity = '0.3'
    })

    const { finish } = createFinishGuard(() => {
      currentView.style.transition = ''
      previousView.style.transition = ''
      previousView.style.opacity = ''
      applyZoomInEndState(currentView, currentStage)
      applyZoomInEndState(previousView, currentStage)
      if (lastView) applyZoomInEndState(lastView, currentStage)
      onComplete()
    }, ms + SAFETY_BUFFER_MS)

    currentView.addEventListener('transitionend', finish, { once: true })
    return
  }

  if (type === 'zoomOut') {
    currentView.style.transition = `opacity ${ms}ms ease`
    requestAnimationFrame(() => {
      currentView.style.opacity = '0'
      previousView.style.opacity = '1'
    })

    const { finish } = createFinishGuard(() => {
      currentView.style.transition = ''
      removeViewFromCanvas(currentView, canvas)
      applyZoomOutPreviousState(previousView, currentStage.views[1].backwardState)
      if (lastView) applyZoomOutLastState(lastView, currentStage.views[2].backwardState)
      onComplete()
    }, ms + SAFETY_BUFFER_MS)

    currentView.addEventListener('transitionend', finish, { once: true })
    return
  }

  onComplete()
}
```

---

## Testing your driver

Use `driver: 'none'` as a reference — it applies final state instantly and calls `onComplete()` synchronously. Your driver should produce the same final DOM state, just animated.

Key things to test:
1. After zoom-in: `.is-current-view` exists with correct `dataset.viewName`
2. After zoom-out: previous view is now `.is-current-view`, old current is removed from DOM
3. `onComplete()` is always called, even if elements are removed mid-animation
4. `blockEvents` is reset (the engine handles this in `onComplete`, but verify your driver calls it)

```js
const app = new Zumly({
  mount: '.canvas',
  initialView: 'home',
  views: { home, detail },
  transitions: { driver: myDriver, duration: '100ms' },
})
await app.init()
await app.zoomTo('detail')
expect(app.getCurrentViewName()).toBe('detail')
app.back()
expect(app.getCurrentViewName()).toBe('home')
```

---

## Registering with `getDriver()`

Built-in drivers are resolved by name (`'css'`, `'waapi'`, `'none'`, etc.) in [`src/drivers/index.js`](../src/drivers/index.js). Community drivers are passed as functions — no registration needed:

```js
// Direct function — works out of the box:
transitions: { driver: myDriver.runTransition }

// If you want to publish as a package:
// npm: zumly-driver-lottie
import { runTransition } from 'zumly-driver-lottie'
new Zumly({ transitions: { driver: runTransition } })
```

---

## See also

- [README.md](../README.md) — installation and transition driver table
- [roadMap.md](roadMap.md) — architecture notes and animation driver history
