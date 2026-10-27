<p align="center">
  <a href="https://github.com/zumerlab/zumly">
    <!-- Built from docs/zumly-logo.png in this repo; raw URL so the image works on npm too -->
    <img src="https://raw.githubusercontent.com/zumerlab/zumly/main/docs/zumly-logo.png" alt="Zumly" width="200">
  </a>
</p>

<h1 align="center">ZUMLY</h1>
<p align="center"><em>Z over XY</em></p>

<p align="center"><strong>Focus-driven navigation. Zoom into what matters.</strong></p>

<p align="center">
  <a href="https://zumerlab.github.io/zumly/"><strong>Live demo</strong></a> ·
  <a href="https://zumerlab.github.io/zumly/learn/"><strong>Learn in six steps</strong></a> ·
  <a href="demos/">Demos</a> ·
  <a href="https://www.npmjs.com/package/zumly"><img src="https://img.shields.io/npm/v/zumly.svg" alt="npm version" align="center"></a>
</p>

Zumly is a JavaScript library for **hierarchical zoom navigation**. Your interface is a set of screens called **views**. Clicking an element in one view zooms into it, and the next view grows out of that element. Zooming out returns along the same path. Moving between sibling views at the same level slides sideways.

Zumly is not an infinite pan-and-zoom canvas. Movement happens in discrete steps, through elements you mark as triggers. You write the HTML and CSS, Zumly computes and animates the transforms. It works with plain HTML, React, Vue, Svelte and Angular, and pairs with [Orbit](https://github.com/zumerlab/orbit) for radial layouts.

## Why Zumly

- **Zoom from the element.** The next screen grows out of what you clicked and shrinks back into it, so you always know where you came from.
- **Context stays.** The screens you came from wait behind the current one, dimmed. Click one, scroll, swipe or press ← to go back.
- **Depth and siblings.** A back button at every level (it can show the parent's name or jump several levels), arrows and swipe between siblings, and browser history with the router.
- **Gestures.** Pinch, swipe or the trackpad drive the zoom-out as you move. Let go past the middle and it finishes; otherwise it goes back.
- **Any animation engine.** CSS by default, or Web Animations, GSAP, Anime.js, Motion or a driver of your own. The same ease gives the same curve on all of them.
- **Your views, your framework.** HTML strings, URLs, functions, or React, Vue, Svelte and Angular components. No dependencies.
- **Accessible.** Keyboard, focus and screen-reader labels work out of the box.

## Install

```sh
npm install zumly
```

```js
import Zumly from 'zumly'
import 'zumly/style.css'
```

For a plain HTML page, load the files from a CDN as in the next example.

## A first app

Save this as `index.html` and open it in a browser. Click the Earth, the O of WORLD, to zoom into it. To come back, click outside it, press the back button at the bottom left, or scroll down.

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hello Zumly</title>
  <link rel="stylesheet" href="https://unpkg.com/zumly/dist/zumly.css">
  <script src="https://unpkg.com/zumly/dist/zumly.js"></script>
  <style>
    body { margin: 0; font: 20px system-ui, sans-serif; }
    /* The canvas fills its nearest positioned ancestor: give it a size. */
    .stage { position: relative; height: 100vh; }
    .z-view { display: grid; place-items: center; }
    .hello { width: 100%; height: 100%; }
    /* The O and the view it opens are both the Earth, so one grows into the other */
    .earth { border-radius: 50%; background: #000 url(https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Earth_seen_from_Apollo_17.jpg/500px-The_Earth_seen_from_Apollo_17.jpg) center / 108%; }
    .zoom-me { display: inline-block; width: 0.9em; height: 0.9em; vertical-align: -0.12em; cursor: zoom-in; }
    .world { width: 320px; height: 320px; color: white; font-weight: 600; text-shadow: 0 1px 8px #000; }
  </style>
</head>
<body>
  <div class="stage">
    <div class="canvas zumly-canvas"></div>
  </div>
  <script>
    const app = new Zumly({
      mount: '.canvas',
      initialView: 'hello',
      views: {
        hello: `<div class="z-view hello">
                  <p>H E L L O &nbsp; W <span class="zoom-me earth" data-to="world" aria-label="O"></span> R L D</p>
                </div>`,
        world: `<div class="z-view world earth">Hi from inside the O</div>`
      }
    })
    app.init()
  </script>
</body>
</html>
```

That is the whole contract: a canvas, a map of named views, and triggers with `class="zoom-me"` and `data-to="viewName"`. Open the browser console while you build: Zumly explains mistakes such as a `data-to` that names no view, an unknown option or a canvas with no size.

## The model

| Piece | What it is |
| --- | --- |
| **Canvas** | The element in `mount`, with class `zumly-canvas`. It clips the views and receives clicks, keys, wheel and touch. It is `position: absolute` and fills its nearest positioned ancestor, so that ancestor needs a size. |
| **View** | One screen, rendered from an entry in `views`. Its root gets the class `z-view`. A view has its own size: full canvas, a card, a circle. |
| **Trigger** | Any element in a view with `class="zoom-me"` and `data-to="name"`. Zooming in scales the current view until the trigger covers the new view, so the new view seems to come out of the trigger. Its `data-*` attributes reach the new view as `props`. |
| **Depth** | Zooming in adds a level, zooming out removes one. Zumly keeps three levels on screen (current, previous and the one before it); deeper levels are detached and restored on the way back. |
| **Lateral** | Moving to a sibling: another view whose trigger is in the same parent. The current view is replaced at the same depth, and the parent slides so that the sibling's trigger is under the focus. |
| **Back** | `back()` undoes the last lateral move at the current level, and zooms out when there is none. Each level keeps its own lateral history, also after zooming in and out again. |

```
canvas.zumly-canvas
├── .z-view.is-last-view        ← two levels up (dimmed)
├── .z-view.is-previous-view    ← the parent, scaled up so its trigger fills the screen
│   └── .zoom-me.zoomed         ← the trigger you came through
└── .z-view.is-current-view     ← the view you are in
```

Rules:

- The canvas is the only element Zumly writes classes and transforms to, besides the views. Do not scroll it or its ancestors: use `overflow: clip` (not `hidden`) on containers around it.
- A view should have one root element. If a template has several roots, Zumly wraps them in a `.z-view`.
- View names are the keys of `views`. A `data-to` with a hyphen that is not a key is treated as a custom element tag.
- Background views are inert: they do not take clicks or focus until they are current again. Clicking the visible parent around the current view zooms out.

## Views

Each entry in `views` is a view source. Zumly resolves it to a DOM node when the view is needed.

| Source | Example | Cached |
| --- | --- | --- |
| HTML string | `'<div class="z-view">…</div>'` | Yes |
| URL | `'/views/detail.html'`, `'https://…'` | Yes, 5 minutes |
| Function | `(ctx) => '<div>…</div>'`, or fill `ctx.target` | No |
| Object | `{ render (ctx) { … }, mounted (node) { … } }` | No |
| Element | `document.querySelector('#tpl')` (cloned) | No |
| Custom element | `'my-view'` (a tag, not a key in `views`) | No |

Cached views are prefetched in the background: on hover or focus over a trigger, and for every trigger of a view when it becomes current. Functions, objects and custom elements are never rendered speculatively. `preload: ['a', 'b']` resolves views during `init()`.

### Function and object views

A function or `render()` receives a context:

| Field | Purpose |
| --- | --- |
| `target` | A fresh `<div>` you can render into. If the function returns nothing, `target` is the view: give it your classes (`target.className = 'z-view card'`) and put only the content inside. Without classes it fills the canvas. |
| `props` | The trigger's `data-*` attributes: `data-id="42"` → `props.id === '42'`. From `goTo()` and `zoomTo()`, the `props` option. |
| `trigger` | The trigger element, when the navigation came from one. |
| `context` | The `componentContext` option, shared by every view: a store, a router, an API client. |
| `onCleanup(fn)` | Runs `fn` once when the view is discarded. Unmount components and stop timers here. |
| `onActivate(fn)` | Runs `fn` each time the view becomes current again without being rendered anew: after zooming back out to it, or when a kept-alive sibling returns. |

Views behind the current one stay in the DOM and are not rendered again. If something changes while the user is deeper, keep the state outside the view and repaint in `onActivate`:

```js
const state = { temperature: 21 }

const views = {
  room: ({ target, onActivate }) => {
    target.className = 'z-view room'   // target is the view: style it, fill it with content
    const paint = () => {
      target.innerHTML = `<h1>${state.temperature}°</h1>
        <button class="zoom-me" data-to="thermostat">Adjust</button>`
    }
    paint()
    onActivate(paint)
  },
  thermostat: ({ target }) => {
    target.className = 'z-view thermostat'
    target.innerHTML = '<input type="range" min="15" max="30">'
    target.querySelector('input').addEventListener('input', e => { state.temperature = e.target.value })
  }
}
```

Object views call `mounted(node)` after the view is in the canvas, which is the place to measure it.

A view can carry a human-readable name for the navigation UI: `title: 'Security'` in an object view, or `data-title="Security"` on the view's root element. Without one, the view name is used.

### Frameworks

Mount a component into `ctx.target` and unmount it in `onCleanup`:

```jsx
import { createRoot } from 'react-dom/client'

views: {
  dashboard: ({ target, props, onCleanup }) => {
    const root = createRoot(target)
    onCleanup(() => root.unmount())
    root.render(<Dashboard id={props.id} />)
  }
}
```

The same pattern works with Vue (`createApp(...).mount(target)` / `unmount()`), Svelte (`new Component({ target })` / `$destroy()` or `mount` / `unmount`) and Angular (`createComponent` / `destroy()`). `mount` also accepts an element, such as a React ref. Guides: [React](https://zumerlab.github.io/zumly/integrations/react.html) · [Vue](https://zumerlab.github.io/zumly/integrations/vue.html) · [Svelte](https://zumerlab.github.io/zumly/integrations/svelte.html) · [Angular](https://zumerlab.github.io/zumly/integrations/angular.html).

## Navigating

Users navigate with clicks or taps on triggers, Enter or Space on a focused trigger, the wheel or ArrowLeft to zoom out, a swipe to the left, and the built-in back button and sibling bar. From code:

| Method | Does |
| --- | --- |
| `zoomIn(triggerElement)` | Zoom into the trigger's view, from the trigger. Use it to open a view from code while keeping its origin. |
| `zoomTo(name, { props, duration, ease })` | Zoom into a view from the center of the canvas. |
| `goTo(name, { mode: 'lateral' })` | Move to a sibling at the same level. `goTo(name)` without `mode` is `zoomTo`. |
| `zoomOut()`, `zoomOut(2)`, `zoomOut({ to: 'home' })` | Zoom out one level, several, or up to an ancestor, in one transition. |
| `back()` | Undo the last lateral move at this level, or zoom out. |
| `canGoBack()` | Whether `back()` would do anything. |
| `getCurrentViewName()`, `zoomLevel()` | Where the user is. Level 1 is the initial view. |
| `getViewStack()`, `getViewTitle(name)` | The views from the root down, with their titles (and `params` for a view opened from a trigger with data). |

Every method returns a promise that settles when the transition ends. A call made while another navigation runs is ignored, so await calls you chain:

```js
await app.zoomTo('settings')
await app.goTo('profile', { mode: 'lateral' })
await app.back()
```

### Triggers

| Attribute | Purpose |
| --- | --- |
| `data-to` | **Required.** The view to open. |
| `data-with-duration`, `data-with-ease` | This transition's duration and easing. |
| `data-with-cover` | `"width"` or `"height"`: which side of the trigger covers the new view. |
| `data-with-stagger` | Delay in ms between layers. |
| `data-with-effects` | Filters for the background layers, separated by `\|`. |
| `data-hide-trigger` | Hide the trigger during the zoom; `"fade"` crossfades it. |
| `data-deferred` | Insert the view's content after the zoom instead of before. |
| `data-*` | Anything else reaches the view as `props`. |

Triggers that are not buttons or links get `role="button"` and `tabindex="0"`.

### Siblings

The siblings of the current view are the other triggers in its parent. The sibling bar (`lateralNav`) shows arrows and dots for them, and the slide direction follows where the triggers are. A trigger with `data-sibling="false"` (a settings button, say) stays out of the group. To set the order yourself, declare it:

```js
lateralNav: { siblings: { home: ['today', 'tomorrow', 'week'] } }
```

Triggers can share a view and tell it apart with their data. Each one is its own sibling, its dot is named by its `data-title`, and the view gets the trigger's data as `props`:

```html
<div class="zoom-me" data-to="room" data-id="kitchen" data-title="Kitchen">Kitchen</div>
<div class="zoom-me" data-to="room" data-id="bedroom" data-title="Bedroom">Bedroom</div>
```

From code, name the sibling by its props: `app.goTo('room', { mode: 'lateral', props: { id: 'bedroom' } })`. With the router the hash carries them too: `#/house/room?id=kitchen`.

The bar appears whenever there are siblings. `mode: 'auto'` hides it on views that cover the canvas. `keepAlive: true` keeps siblings you leave in the DOM, hidden, so their state survives while you stay at that level. `swipe: true` lets a horizontal swipe move between siblings (left: next, right: previous); where a view has no siblings, a swipe left still zooms out.

The bar, the back button and its bands share a translucent material that reads on dark and light views. To restyle them, set these on the canvas (or on `.z-lateral-nav` / `.z-depth-nav` for just one): `--z-nav-bg`, `--z-nav-color` (glyphs, rings, arrows and dots), `--z-nav-active` (current dot), `--z-nav-border`, `--z-nav-shadow`, `--z-nav-blur` (its `backdrop-filter`) and `--z-nav-hover` (hover overlay).

```css
.zumly-canvas { --z-nav-bg: rgba(255, 255, 255, 0.7); --z-nav-color: #123; }
```

### Back button

`depthNav` places the back button (`position: 'bottom-left'` or `'top-left'`) and picks its `style`:

- `'button'` (default): a dot in its ring, the zoom-out mark. Chevrons belong to the sibling bar.
- `'title'`: a dot in its ring and the title of the view above.
- `'rings'`: a dot inside one ring per level above. A tap goes up one level; hovering, a long press or an arrow key opens a band per level, so you can jump several at once.

Each ring and band has classes per level (`z-depth-ring--up-1` is the view right above, `z-depth-ring--depth-0` the root) and `data-view`, so your CSS can mark a level:

```css
.z-depth-ring[data-view="security"] { stroke: tomato; opacity: 1; }
```

With `gestures.follow`, the dot grows into its ring as a zoom-out gesture reaches the threshold (`--z-grow` on `.z-depth-nav`). When the back button and the sibling bar share an edge, the bar moves aside, or above the button when there is no room.

### Labels

The back button, arrows and dots get accessible names from `labels`. Each one is a template with `{title}` and `{name}`, a function that receives `{ name, title }`, or `false` for none. `labels: false` turns them all off.

```js
labels: { back: 'Volver a {title}', goTo: view => `Ir a ${view.title}`, prev: false, next: false }
```

### Gestures

A swipe to the left zooms out, except when it starts on a text field, a slider, an element that scrolls horizontally, or inside an element with `data-no-swipe`. Use `data-no-swipe` on your own drag areas (a knob, a carousel). `inputs: { wheel: false, touch: false, keyboard: false, click: false }` turns an input off, and `inputs: { pinch: true }` adds closing two fingers to zoom out.

By default a gesture fires the whole zoom-out at once. With `gestures: { follow: true }`, the trackpad, a swipe and a pinch move it as they go: the current view shrinks toward its trigger (rounding to its shape) while the one behind loses its blur. Releasing past `threshold` (default `0.5`) or flicking finishes it; otherwise everything returns. A mouse wheel notch still zooms out at once. `zoomOutProgress` reports the progress, so your own back button can follow along:

```js
app.on('zoomOutProgress', ({ phase, progress }) => {
  backButton.style.setProperty('--progress', progress)
})
```

## Events

```js
app.on('viewChanged', ({ type, viewName, from, zoomLevel, node }) => {
  document.title = viewName
})
```

| Event | Data |
| --- | --- |
| `viewChanged` | After every navigation and after `init()`: `type` (`'init'`, `'zoomIn'`, `'zoomOut'`, `'lateral'`), `viewName`, `from`, `zoomLevel`, `node`. |
| `viewMounted` | A view was inserted: `viewName`, `node`. |
| `beforeZoomIn` / `afterZoomIn` | `viewName`, and `zoomLevel` after. |
| `beforeZoomOut` / `afterZoomOut` | `viewName` (the view returned to), `from`, `zoomLevel`, and `levels` when climbing several. |
| `zoomOutProgress` | A followed gesture: `phase` (`'start'`, `'move'`, `'commit'`, `'cancel'`, `'end'`), `progress` 0–1, `duration` on release, `viewName`, `from`, `source`. |
| `beforeLateral` / `afterLateral` | `viewName`, `from`, `isBack`. |
| `destroy` | The instance is being destroyed. |

`on()` and `off()` are chainable; `off(event)` removes every handler for that event.

## Transitions

```js
transitions: {
  duration: '800ms',             // CSS time, or a number of milliseconds
  ease: 'cubic-bezier(.2,.8,.2,1)',
  effects: ['blur(3px) brightness(.6)', 'blur(8px) brightness(.3)'], // filters for the previous and the older view
  animateEffects: true,          // false applies the filters at once: much smoother zooms with heavy views
  cover: 'width',                // which side of the trigger covers the new view
  stagger: 0,                    // ms between layers
  hideTrigger: false,            // true, or 'fade'
  driver: 'css'
}
```

The driver animates the transforms that Zumly computes. Every driver follows the same curve for the same CSS `ease`, so you can switch drivers without retuning motion.

| Driver | Notes |
| --- | --- |
| `'css'` (default) | CSS keyframes. |
| `'waapi'` | Web Animations API. |
| `'none'` | No animation. Used automatically when the user prefers reduced motion. |
| `'anime'` | [Anime.js](https://animejs.com/) v4 or v3, from the global `anime`. Also accepts Anime.js ease names (`'outExpo'`). |
| `'gsap'` | [GSAP](https://gsap.com/), from the global `gsap`. Also accepts GSAP ease names (`'power3.inOut'`). |
| `'motion'` | [Motion](https://motion.dev/), from the global `Motion`. Also accepts Motion easings (`'backOut'`). |
| a function | Your own driver: `(spec, onComplete) => { … }`. See [docs/DRIVER_API.md](docs/DRIVER_API.md). |

With a bundler there is no global. Pass the library instead:

```js
import { gsap } from 'gsap'
import { gsapDriver } from 'zumly'      // also animeDriver, motionDriver

new Zumly({ /* … */ transitions: { driver: gsapDriver(gsap) } })
```

Every driver but `none` slides between siblings, with the same motion as `css` and `waapi`.

## With Orbit

[Orbit](https://github.com/zumerlab/orbit) places elements around a center. Its arcs, rings and satellites work inside Zumly views without glue code: put a `.bigbang` in a view, and make satellites (or their capsules) triggers.

```html
<div class="z-view dial">
  <div class="bigbang">
    <div class="gravity-spot">
      <div class="orbit-7">
        <div class="satellite"><div class="capsule zoom-me" data-to="lights">Lights</div></div>
        <div class="satellite"><div class="capsule zoom-me" data-to="climate">Climate</div></div>
        <div class="satellite"><div class="capsule zoom-me" data-to="security">Security</div></div>
      </div>
      <div class="orbit-10"><o-arc></o-arc><o-arc></o-arc><o-arc></o-arc></div>
    </div>
  </div>
</div>
```

The satellites become siblings, so the sibling bar moves around the ring. The [Orbit integration guide](https://zumerlab.github.io/zumly/integrations/orbit-css.html) covers sizing, state, depth layers and touch, and [demos/orbit-dial.html](demos/orbit-dial.html) is a working example.

## Router

```js
app.use(Zumly.Router)              // script tag
// import { ZumlyRouter } from 'zumly'; app.use(ZumlyRouter)
```

The router writes the path to the hash (`#/home/rooms/kitchen`; a view opened from a trigger with data, such as `data-id`, carries it: `#/house/room?id=kitchen`) and makes the browser back button navigate back, laterally or out. Forward and opening a deep URL directly are not supported: a zoom needs the trigger it comes from. Options: `prefix` (default `'/'`) and `separator` (default `'/'`). Hash entries the router did not write are left alone.

## Troubleshooting

| You see | Fix |
| --- | --- |
| Nothing, and "the canvas is W×0px" in the console | The canvas fills its nearest positioned ancestor. Give that container `position: relative` and a height. |
| `data-to="x": view "x" is not defined` | A typo in `data-to`, or a view missing from `views`. The message suggests the closest name. |
| Zooms land displaced after a while | Something scrolled the canvas or an ancestor. Use `overflow: clip` on those containers. |
| "unknown option 'x' is ignored" | A misspelled option; the message suggests the right one. |
| A view looks stale after zooming out | Views behind are not rendered again. Repaint in `onActivate`. |
| A slider or carousel zooms out when dragged | Add `data-no-swipe` to it, or turn off `inputs.touch`. |
| The anime, gsap or motion driver does not animate | The library is not loaded as a global. Load it before Zumly, or pass it with `animeDriver(anime)`, `gsapDriver(gsap)` or `motionDriver({ animate })`. |

`debug: true` also logs each navigation step.

## Accessibility

Triggers are keyboard reachable. Background views are `inert` and hidden from assistive technology. After each navigation, focus moves to the first control of the new view. With `prefers-reduced-motion: reduce`, transitions are instant. If you build custom controls, give them labels and keyboard behavior.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `mount` | — | **Required.** Selector or element of the canvas. |
| `initialView` | — | **Required.** Name of the first view. |
| `views` | — | **Required.** Map of names to view sources. |
| `transitions` | see above | Duration, easing, effects, `animateEffects`, driver. |
| `lateralNav` | `{ mode: 'always' }` | Sibling bar: `mode`, `arrows`, `dots`, `position` (`'bottom-center'`, `'top-center'`), `keepAlive`, `siblings`. `false` hides it. |
| `depthNav` | `{ position: 'bottom-left' }` | Back button; `position` is `'bottom-left'` or `'top-left'`. `false` hides it. It always zooms out. |
| `inputs` | all `true` | `click`, `keyboard`, `wheel`, `touch`. `false` turns all off. |
| `preload` | `[]` | Views to resolve during `init()`. |
| `componentContext` | `new Map()` | Shared `context` for function and object views. |
| `deferred` | `false` | Insert view content after the zoom. |
| `debug` | `false` | Log navigation steps. |

Full types are in [types/zumly.d.ts](types/zumly.d.ts). `destroy()` removes listeners, navigation UI and the views it put in the canvas, so a new instance can start there at once (React StrictMode, hot reload). Anything else in the canvas stays yours.

## Limitations

- No cold deep links: the router cannot open `#/a/b/c` from scratch.
- URL views are inserted with `innerHTML` and their scripts do not run. Sanitize remote HTML.
- Zumly animates three levels at a time; deeper levels reappear on the way back.

## Development

```sh
npm run compile                  # build dist/
npm run dev                      # build and serve at http://localhost:9090 (demos at /demos/)
npm run test:install-browsers    # once
npm test                         # Vitest in Chromium
npm run test:browsers            # Chromium, Firefox and WebKit
npm run test:pack                # check the published package
```

Use Node.js 22 for development; the package supports Node.js 18 and later. See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).

## Origin

Zumly is a reimagined, framework-agnostic zoom engine inspired by [Zircle UI](https://github.com/zircleUI/zircleUI). It is part of [Zumerlab](https://github.com/zumerlab), with [Orbit](https://github.com/zumerlab/orbit) for radial layouts, [SnapDOM](https://github.com/zumerlab/snapdom) for DOM capture and [SnapDIFF](https://github.com/zumerlab/snapdiff) for visual comparison. Community: [Telegram](https://t.me/ZumlyCommunity).

## License

MIT. See [LICENSE](LICENSE).
