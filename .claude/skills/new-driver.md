---
name: new-driver
description: Create a new custom Zumly transition driver with guided boilerplate and testing setup.
user-invocable: true
allowed-tools: Read Grep Glob Bash Write Edit
argument-hint: [animation-library]
---

# Create a Custom Zumly Transition Driver

You are helping the developer create a custom transition driver for Zumly.

## Step 1: Understand What They Want

Ask the developer:
1. **What animation library** are they using? (WAAPI, GSAP, Anime.js, Motion, CSS transitions,
   or something else?) If none, suggest WAAPI -- native, performant, no dependencies.
2. **What kind of transition** do they want? (zoom with scale, crossfade, slide, 3D perspective,
   blur transition, morph, or custom?)
3. **Do they need animated lateral transitions?** If not, delegate to `runLateralInstant`.
4. **Where should the driver file live?** Suggest a path relative to their project.

If the user passed an argument (e.g. `/new-driver gsap`), use that as the animation library
choice and skip that question.

## Step 2: The Driver Contract

A Zumly driver is a single function:

```js
function runTransition(spec, onComplete) {
  // Animate views based on spec
  // MUST call onComplete() exactly once when done
}
```

### The Three Rules

1. **Call `onComplete()` exactly once, always.** The engine blocks all events until you do.
   If you never call it, the UI freezes permanently. Use `createFinishGuard` to guarantee this.

2. **Apply final DOM state after animation.** The engine does NOT apply final transforms.
   Use helper functions (`applyZoomInEndState`, `applyZoomOutPreviousState`, etc.).

3. **Handle all three transition types:** `zoomIn`, `zoomOut`, and `lateral`.

### The spec Object

```typescript
interface TransitionSpec {
  type: 'zoomIn' | 'zoomOut' | 'lateral'
  currentView: HTMLElement      // Incoming (zoom-in) or outgoing (zoom-out)
  previousView: HTMLElement     // Parent view
  lastView: HTMLElement | null  // Grandparent (null at depth <= 2)
  currentStage: {
    views: [
      { viewName, backwardState, forwardState },  // [0] current
      { viewName, backwardState, forwardState },  // [1] previous
      { viewName, backwardState, forwardState } | null,  // [2] last
    ],
    stagger?: number,
  }
  duration: string    // e.g. '500ms', '1s'
  ease: string        // CSS easing
  canvas: HTMLElement  // Canvas container (zoom-out and lateral)

  // Lateral-only fields:
  backView?: HTMLElement | null
  backViewState?: { transformStart: string, transformEnd: string }
  lastViewState?: { transformStart: string, transformEnd: string }
  incomingTransformStart?: string
  incomingTransformEnd?: string
  outgoingTransform?: string
  outgoingTransformEnd?: string
  slideDeltaX?: number
  slideDeltaY?: number
  keepAlive?: boolean  // When true, do NOT remove outgoing view from DOM
}
```

### backwardState vs forwardState

Each view in `currentStage.views[]` has two states:
```js
{
  backwardState: { origin, transform, duration, ease },  // "zoomed out" position
  forwardState: { origin, transform, duration, ease },   // "zoomed in" position
}
```

- **Zoom-in:** animate `backwardState.transform` -> `forwardState.transform`
- **Zoom-out:** animate `forwardState.transform` -> `backwardState.transform`

## Step 3: Generate the Driver

Use the appropriate template based on the developer's animation library choice.

### Template: WAAPI (Web Animations API)

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
  const { type, currentView, previousView, lastView, currentStage, duration, ease, canvas } = spec

  if (!currentView || !previousView || !currentStage) { onComplete(); return }

  const ms = parseDurationMs(duration)

  if (type === 'lateral') {
    runLateralInstant(spec, onComplete)
    return
  }

  if (type === 'zoomIn') {
    runZoomIn(currentView, previousView, lastView, currentStage, ms, ease, onComplete)
    return
  }

  if (type === 'zoomOut') {
    runZoomOut(currentView, previousView, lastView, currentStage, ms, ease, canvas, onComplete)
    return
  }

  onComplete()
}

function runZoomIn(currentView, previousView, lastView, currentStage, ms, ease, onComplete) {
  showViews(currentView, previousView, lastView)

  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null
  const stagger = currentStage.stagger || 0

  // --- YOUR ANIMATION ---
  const anims = []

  anims.push(currentView.animate(
    [{ transform: v0.backwardState.transform }, { transform: v0.forwardState.transform }],
    { duration: ms, easing: ease, fill: 'forwards' }
  ))

  anims.push(previousView.animate(
    [{ transform: v1.backwardState.transform }, { transform: v1.forwardState.transform }],
    { duration: ms, delay: stagger, easing: ease, fill: 'forwards' }
  ))

  if (v2) {
    anims.push(lastView.animate(
      [{ transform: v2.backwardState.transform }, { transform: v2.forwardState.transform }],
      { duration: ms, delay: stagger * 2, easing: ease, fill: 'forwards' }
    ))
  }
  // ----------------------

  const maxDelay = v2 ? stagger * 2 : stagger

  const { finish } = createFinishGuard(() => {
    for (const a of anims) { try { a.cancel() } catch {} }
    applyZoomInEndState(currentView, currentStage)
    applyZoomInEndState(previousView, currentStage)
    if (lastView) applyZoomInEndState(lastView, currentStage)
    onComplete()
  }, ms + maxDelay + SAFETY_BUFFER_MS)

  Promise.all(anims.map(a => a.finished)).then(finish).catch(finish)
}

function runZoomOut(currentView, previousView, lastView, currentStage, ms, ease, canvas, onComplete) {
  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null
  const stagger = currentStage.stagger || 0

  // --- YOUR ANIMATION (reverse direction) ---
  const anims = []

  anims.push(currentView.animate(
    [{ transform: v0.forwardState.transform }, { transform: v0.backwardState.transform }],
    { duration: ms, easing: ease, fill: 'forwards' }
  ))

  anims.push(previousView.animate(
    [{ transform: v1.forwardState.transform }, { transform: v1.backwardState.transform }],
    { duration: ms, delay: stagger, easing: ease, fill: 'forwards' }
  ))

  if (v2) {
    anims.push(lastView.animate(
      [{ transform: v2.forwardState.transform }, { transform: v2.backwardState.transform }],
      { duration: ms, delay: stagger * 2, easing: ease, fill: 'forwards' }
    ))
  }
  // -------------------------------------------

  const maxDelay = v2 ? stagger * 2 : stagger

  const { finish } = createFinishGuard(() => {
    for (const a of anims) { try { a.cancel() } catch {} }
    removeViewFromCanvas(currentView, canvas)
    applyZoomOutPreviousState(previousView, v1.backwardState)
    if (v2) applyZoomOutLastState(lastView, v2.backwardState)
    onComplete()
  }, ms + maxDelay + SAFETY_BUFFER_MS)

  Promise.all(anims.map(a => a.finished)).then(finish).catch(finish)
}
```

### Template: CSS Transitions (no WAAPI)

```js
import {
  parseDurationMs, showViews, applyZoomInEndState,
  applyZoomOutPreviousState, applyZoomOutLastState,
  removeViewFromCanvas, runLateralInstant,
  createFinishGuard, SAFETY_BUFFER_MS,
} from 'zumly/driver-helpers'

export function runTransition(spec, onComplete) {
  const { type, currentView, previousView, lastView, currentStage, duration, canvas } = spec

  if (!currentView || !previousView || !currentStage) { onComplete(); return }
  if (type === 'lateral') { runLateralInstant(spec, onComplete); return }

  const ms = parseDurationMs(duration)
  showViews(currentView, previousView, lastView)

  const v0 = currentStage.views[0]
  const v1 = currentStage.views[1]
  const v2 = lastView && currentStage.views[2] ? currentStage.views[2] : null

  const elements = [currentView, previousView]
  if (lastView) elements.push(lastView)

  for (const el of elements) {
    el.style.transition = `transform ${ms}ms ${spec.ease}`
  }

  if (type === 'zoomIn') {
    currentView.style.transform = v0.backwardState.transform
    previousView.style.transform = v1.backwardState.transform
    if (v2) lastView.style.transform = v2.backwardState.transform

    requestAnimationFrame(() => {
      currentView.style.transform = v0.forwardState.transform
      previousView.style.transform = v1.forwardState.transform
      if (v2) lastView.style.transform = v2.forwardState.transform
    })

    const { finish } = createFinishGuard(() => {
      for (const el of elements) el.style.transition = ''
      applyZoomInEndState(currentView, currentStage)
      applyZoomInEndState(previousView, currentStage)
      if (lastView) applyZoomInEndState(lastView, currentStage)
      onComplete()
    }, ms + SAFETY_BUFFER_MS)

    currentView.addEventListener('transitionend', finish, { once: true })
    return
  }

  if (type === 'zoomOut') {
    currentView.style.transform = v0.forwardState.transform
    previousView.style.transform = v1.forwardState.transform
    if (v2) lastView.style.transform = v2.forwardState.transform

    requestAnimationFrame(() => {
      currentView.style.transform = v0.backwardState.transform
      previousView.style.transform = v1.backwardState.transform
      if (v2) lastView.style.transform = v2.backwardState.transform
    })

    const { finish } = createFinishGuard(() => {
      for (const el of elements) el.style.transition = ''
      removeViewFromCanvas(currentView, canvas)
      applyZoomOutPreviousState(previousView, v1.backwardState)
      if (v2) applyZoomOutLastState(lastView, v2.backwardState)
      onComplete()
    }, ms + SAFETY_BUFFER_MS)

    currentView.addEventListener('transitionend', finish, { once: true })
    return
  }

  onComplete()
}
```

### Template: Opacity Crossfade (simplest possible)

```js
import {
  parseDurationMs, showViews, applyZoomInEndState,
  applyZoomOutPreviousState, applyZoomOutLastState,
  removeViewFromCanvas, runLateralInstant,
  createFinishGuard, SAFETY_BUFFER_MS,
} from 'zumly/driver-helpers'

export function runTransition(spec, onComplete) {
  const { type, currentView, previousView, lastView, currentStage, duration, canvas } = spec

  if (!currentView || !previousView || !currentStage) { onComplete(); return }
  if (type === 'lateral') { runLateralInstant(spec, onComplete); return }

  const ms = parseDurationMs(duration)
  showViews(currentView, previousView, lastView)

  if (type === 'zoomIn') {
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

## Step 4: Available Helpers

All importable from `zumly/driver-helpers`:

| Helper | Purpose |
|--------|---------|
| `parseDurationMs(duration)` | Parse `'1s'`/`'500ms'`/number to ms |
| `parseDurationSec(duration)` | Same but returns seconds (useful for GSAP) |
| `applyZoomInEndState(el, stage)` | Apply final classes + transforms after zoom-in |
| `applyZoomOutPreviousState(el, state)` | Final state for previous view after zoom-out |
| `applyZoomOutLastState(el, state)` | Final state for last view after zoom-out |
| `removeViewFromCanvas(el, canvas)` | Safe DOM removal |
| `showViews(...elements)` | Remove `hide` class + set `contentVisibility: visible` |
| `runLateralInstant(spec, onComplete)` | Instant lateral transition (no animation) |
| `createFinishGuard(cleanup, timeoutMs)` | Once-only finish + safety timeout |
| `SAFETY_BUFFER_MS` | Default safety buffer (150ms) |

**Matrix interpolation** (for libraries that don't handle CSS transforms natively):

| Helper | Purpose |
|--------|---------|
| `readComputedMatrix(el, origin, transform)` | Read browser-computed matrix |
| `interpolateMatrix(from, to, t)` | Lerp between two matrices |
| `matrixToString(m)` | Object to `"matrix(...)"` |
| `parseMatrixString(str)` | `"matrix(...)"` to object |
| `identityMatrix()` | Returns identity matrix |
| `lerp(a, b, t)` | Linear interpolation |

## Step 5: Register the Driver

```js
import { runTransition } from './my-driver.js'

const app = new Zumly({
  transitions: {
    driver: runTransition,
    duration: '600ms',
    ease: 'ease-in-out',
  },
})
```

No registration or naming needed. Custom drivers are passed as functions.

To publish as npm package:
```js
// npm: zumly-driver-lottie
import { runTransition } from 'zumly-driver-lottie'
new Zumly({ transitions: { driver: runTransition } })
```

## Step 6: Testing

### Use driver: 'none' as Reference

The `'none'` driver applies final state instantly. Your driver should produce
the same final DOM state, just animated. Verify:

1. After zoom-in: `.is-current-view` exists with correct `dataset.viewName`
2. After zoom-out: previous view is `.is-current-view`, old current removed from DOM
3. `onComplete()` always called, even if elements removed mid-animation
4. No leftover inline styles from animation

### Basic Test

```js
const app = new Zumly({
  mount: '.test-canvas',
  initialView: 'home',
  views: {
    home: '<div class="z-view"><div class="zoom-me" data-to="detail">Go</div></div>',
    detail: '<div class="z-view"><p>Detail</p></div>',
  },
  transitions: { driver: runTransition, duration: '100ms' },
})
await app.init()
await app.zoomTo('detail')
expect(app.getCurrentViewName()).toBe('detail')
app.back()
await new Promise(r => setTimeout(r, 300))
expect(app.getCurrentViewName()).toBe('home')
app.destroy()
```

### Edge Cases
- `duration: '0ms'` -- handle gracefully
- Rapid zoom-in then zoom-out -- blockEvents prevents double-fire
- `lastView` is null at depth <= 2 -- always guard with `if (lastView)`
- `createFinishGuard` catches failures even if DOM node is removed mid-animation

---

After gathering requirements (Step 1), generate the driver file with their specific
animation approach, place it where they specify, and offer to create a test file.
