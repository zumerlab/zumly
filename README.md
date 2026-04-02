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
  <a href="https://zumerlab.github.io/zumly/"><strong>Live Demo</strong></a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/zumly"><img src="https://img.shields.io/npm/v/zumly.svg" alt="npm version"></a>
</p>

<p align="center">
  <strong>Zumly</strong> is a JavaScript library for <strong>hierarchical zoom navigation</strong>: you move in <strong>Z</strong> (depth) through discrete views laid out in the <strong>XY</strong> plane, with spatial transitions instead of flat screen swaps. It is inspired by <a href="https://en.wikipedia.org/wiki/Zooming_user_interface">zoomable user interfaces (ZUI)</a> but targets <strong>structured, trigger-driven</strong> zoom—not infinite pan/zoom canvases.
</p>

## Status

Zumly is under active development. The core stack is stable: depth and lateral navigation, pluggable transition drivers (CSS, WAAPI, none, Anime.js, GSAP, Motion, custom), unified nav UI (depth + lateral, eight positions), view resolver and prefetch cache, optional **plugin** API (<code>.use()</code>), and the **hash router** plugin. View sources include HTML strings, URLs, async functions, objects with <code>render()</code>, DOM nodes, and web component tags.

Zoom-out geometry uses batched DOM reads plus pure math where possible to cut layout thrash before animations (see [Geometry optimization](docs/geometry-optimization.md)).

**Docs:** [Roadmap & topics](docs/roadMap.md) · [Transition drivers](docs/DRIVER_API.md) · [Geometry notes](docs/geometry-optimization.md)

## Overview

Unlike free-pan ZUIs, Zumly focuses on **discrete, hierarchical navigation**: users zoom into a focused element (<code>.zoom-me</code>) to open the next view, so **attention** (focus) and **depth** (Z) stay aligned with **layout** (XY).

The engine is **UI-agnostic**—you supply markup and CSS. Transforms and timing are handled for you; design systems and frameworks integrate by resolving each view to a DOM subtree (see **View sources** and **Framework integration** below).

## What Zumly is

Zumly is **not** a freeform zooming canvas or map-like navigation system. It is a **discrete, hierarchical zoom interface**: screens are **views** at different depths, connected by **triggers**, with continuous motion between them.

It fits especially well when:

* you want **focus-driven** flow (zoom into what matters)
* **spatial context** between parent and child should persist
* you are building menus, stories, dashboards, or exploratory UIs without a classic router-only metaphor

## Installation

### NPM

```sh
npm install zumly

# or

yarn add zumly
```

### CDN

Include Zumly in your project via a `<script>` tag from [unpkg.com/zumly](https://unpkg.com/zumly).

### Direct download

Download the built files from [unpkg.com/zumly](https://unpkg.com/zumly/) (see the `dist` folder).

## Setup

### Browser bundle (global)

1. Add the CSS in your `<head>`:

```html
<link rel="stylesheet" href="zumly/dist/zumly.css">
<!-- or https://unpkg.com/zumly/dist/zumly.css -->
```

2. Load the JS bundle (it exposes `window.Zumly`):

```html
<script src="zumly/dist/zumly.js"></script>
<!-- or https://unpkg.com/zumly/dist/zumly.js -->
```

## Hello World

1. Add a container with the class `zumly-canvas`:

```html
<div class="example zumly-canvas"></div>
```

2. Create your views and start Zumly:

```js
const hello = `
<div class="z-view">
  H E L L O <br>
  W <span class="zoom-me" data-to="world">O</span> R L D!
</div>
`;

const world = `
<div class="z-view">
  <img src="https://raw.githubusercontent.com/zumly/website/gh-pages/images/world.png" alt="World">
</div>
`;

const app = new Zumly({
  mount: '.example',
  initialView: 'hello',
  views: { hello, world },
});

await app.init();
```

- Live example: [CodePen](https://codepen.io/zircle/pen/yyaXvRN)

### Options

**Zumly constructor:**

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mount` | string | Yes | CSS selector for the canvas element (must have class `zumly-canvas`). |
| `initialView` | string | Yes | Name of the first view to show. |
| `views` | object | Yes | Map of view names to view sources (see View sources below). |
| `preload` | string[] | No | View names to resolve and cache when the app initializes. |
| `transitions` | object | No | Duration, ease, cover, driver, effects, stagger, hideTrigger for zoom transitions. |
| `deferred` | boolean | No | Defer content rendering until after animation completes (default: `false`). |
| `debug` | boolean | No | Enable debug messages (default: `false`). |
| `lateralNav` | boolean \| object | No | Lateral navigation UI: `{ mode, arrows, dots, keepAlive, position }`. |
| `depthNav` | boolean \| object | No | Depth back button: `{ position }`. Default: `'bottom-left'`. |
| `inputs` | boolean \| object | No | Input methods: `{ click, keyboard, wheel, touch }`. |
| `componentContext` | object | No | Context passed to component-style views. |

**Transitions (optional):**

```js
transitions: {
  driver: 'css',       // 'css' | 'waapi' | 'anime' | 'gsap' | 'motion' | 'none' or custom function(spec, onComplete)
  cover: 'width',      // or 'height' — how the previous view scales to cover the trigger
  duration: '1s',
  ease: 'ease-in-out',
  effects: ['blur(3px) brightness(0.7)', 'blur(8px) saturate(0)'],  // CSS filters for [previous, last] background views
  stagger: 0,          // delay (ms) between layers during transition
  hideTrigger: false,  // false | true (visibility:hidden) | 'fade' (opacity crossfade)
  // threshold: { enabled: true, duration: 300, commitAt: 0.5 }  // parsed but not wired in the engine yet
}
```

`transitions.parallax` is accepted for compatibility but **not applied** (reserved; intensity is fixed to `0` in the engine).

**Transition drivers:** Zoom animations are handled by a pluggable driver (`transitions.driver`). You can swap implementations without changing app logic. To author your own, see [docs/DRIVER_API.md](docs/DRIVER_API.md) and the `zumly/driver-helpers` export.

| Driver | Description |
|--------|-------------|
| `'css'` (default) | CSS keyframes and `animationend`; uses `zumly.css` variables. |
| `'waapi'` | Web Animations API (`element.animate()`). No extra dependency. |
| `'none'` | No animation; applies final state immediately. Useful for tests or instant UX. |
| `'anime'` | [Anime.js](https://animejs.com/) — requires global `anime` (load from CDN before use). |
| `'gsap'` | [GSAP](https://greensock.com/gsap/) — requires global `gsap` (load from CDN before use). |
| `'motion'` | [Motion](https://motion.dev/) — requires global `Motion` (load from CDN before use). |
| `function(spec, onComplete)` | Custom driver. Receives `{ type, currentView, previousView, lastView, currentStage, duration, ease }` and must call `onComplete()` when done. |

Example with instant transitions (e.g. for tests):

```js
const app = new Zumly({
  mount: '.canvas',
  initialView: 'home',
  views: { home, detail },
  transitions: { driver: 'none', duration: '0s' },
});
```

**Lateral navigation (arrows + dots bar):**

```js
lateralNav: true                            // mode: 'auto' (default), bottom-center
lateralNav: false                           // disabled
lateralNav: { mode: 'always' }              // always show when siblings exist
lateralNav: { mode: 'auto', dots: false }   // auto mode, no dots
lateralNav: { position: 'top-center' }      // top instead of bottom
```

| Mode | Description |
|------|-------------|
| `'auto'` (default) | Shows lateral nav only when the current view doesn't cover the full canvas — preserving spatial context. |
| `'always'` | Always shows lateral nav when siblings exist, regardless of coverage. |

Position: `'bottom-center'` (default) or `'top-center'`.

**Depth navigation (back button):**

```js
depthNav: true                              // default: back button at bottom-left
depthNav: false                             // disabled
depthNav: { position: 'top-left' }          // top instead of bottom
```

Position: `'bottom-left'` (default) or `'top-left'`. The depth and lateral nav are separate, independently positioned components.

**Zoomable elements:**

- Give the view root the class `z-view`.
- Add class `zoom-me` and `data-to="viewName"` to the element that triggers zoom-in.
- Per-trigger overrides via `data-*` attributes:

| Attribute | Description |
|-----------|-------------|
| `data-to` | **Required.** Target view name. |
| `data-with-duration` | Override transition duration (e.g. `"2s"`). |
| `data-with-ease` | Override easing function. |
| `data-with-cover` | Override cover dimension (`"width"` or `"height"`). |
| `data-with-stagger` | Override stagger delay in ms (e.g. `"100"`). |
| `data-with-effects` | Override effects (pipe-separated: `"blur(5px)\|blur(10px)"`). |
| `data-hide-trigger` | Override hideTrigger (`"fade"` or presence = hide). |
| `data-deferred` | Override deferred rendering (presence = true). |
| `data-*` | Any other data attribute becomes a prop in `ViewContext.props`. |

```html
<div class="z-view">
  <div class="zoom-me" data-to="detail"
       data-with-duration="2s"
       data-with-ease="ease-in"
       data-with-cover="height"
       data-with-stagger="100"
       data-id="42">
    Zoom in
  </div>
</div>
```

### View sources

Each entry in `views` is a **view source**. The resolver detects the type and resolves to a DOM node. Hyphenated view names (e.g. `'my-dashboard'`) are resolved as keys in `views` first; only raw template strings with a hyphen are treated as web components.

| Type | Example | Cached? |
|------|---------|---------|
| **HTML string** | `'<div class="z-view">…</div>'` | Yes (indefinitely) |
| **URL** | `'/views/detail.html'`, `https://…` | Yes (5 min TTL) |
| **Async function** | `(ctx) => fetch(...).then(r => r.text())` or return `HTMLElement` | No |
| **Object with `render()`** | `{ render(ctx) { return '<div>…</div>' }, mounted?() }` | No |
| **Web component** | `'my-view'` (string with hyphen, not a key in `views`) | No |

**View pipeline:** Resolve → normalize `.z-view` → insert into canvas → call `mounted()` (if present). Static/URL views are cloned from cache on each `get()` so consumers cannot mutate the stored node.

### Framework integration

Zumly is framework-agnostic. Since views resolve to DOM elements, any framework that can mount into a container works out of the box. Use **function views** or **object views** to bridge your framework:

**React**

```jsx
import { createRoot } from 'react-dom/client'
import Dashboard from './Dashboard'

const app = new Zumly({
  mount: '.canvas',
  initialView: 'home',
  views: {
    home: '<div class="z-view"><div class="zoom-me" data-to="dashboard" data-id="42">Open</div></div>',
    dashboard: ({ target, props }) => {
      const root = createRoot(target)
      root.render(<Dashboard id={props.id} />)
    }
  }
})
```

**Vue**

```js
import { createApp } from 'vue'
import Dashboard from './Dashboard.vue'

views: {
  dashboard: ({ target, props }) => {
    createApp(Dashboard, { id: props.id }).mount(target)
  }
}
```

**Svelte**

```js
import Dashboard from './Dashboard.svelte'

views: {
  dashboard: ({ target, props }) => {
    new Dashboard({ target, props: { id: props.id } })
  }
}
```

**Angular**

```ts
views: {
  dashboard: ({ target, props }) => {
    const compRef = viewContainerRef.createComponent(DashboardComponent)
    compRef.instance.id = props.id
    target.appendChild(compRef.location.nativeElement)
  }
}
```

**Key points:**

- The `target` parameter is a fresh `<div>` created by Zumly — mount your component there.
- `props` contains data attributes from the trigger element (`data-id="42"` → `props.id`).
- `componentContext` (constructor option) is passed as `context` to all function/object views — use it for shared state (router, store, API client).
- Function views are **never cached** — they resolve fresh each time, so framework components get proper lifecycle management.
- Use `mounted()` (object views) for post-insertion setup — it runs after the node is in the DOM.
- Zumly handles wrapped elements (e.g. Svelte's extra parent div) in its cleanup logic.

### Preload and prefetch

- **Eager preload:** `preload: ['viewA', 'viewB']` — those views are resolved and cached during `init()`.
- **Hover prefetch:** `mouseover` on a `.zoom-me[data-to]` trigger prefetches its target in the background.
- **Focus prefetch:** `focusin` on a `.zoom-me[data-to]` also prefetches (for keyboard/accessibility).
- **Scan prefetch:** When a view becomes current, all `.zoom-me[data-to]` targets inside it are prefetched in the background. This works on touch devices where hover is unavailable.

### Plugins

Zumly has a lightweight plugin system. Register plugins with `.use()` before or after `init()`:

```js
app.use(plugin, options)
```

A plugin is an object with `install(instance, options)` or a plain function `(instance, options) => void`.

#### Router plugin

Syncs the browser URL hash with Zumly's navigation state. Browser back triggers zoom-out or lateral navigation. Forward is intentionally blocked — in a ZUI, zoom-in requires a trigger element for proper origin and animation context.

```js
// Script tag
const app = new Zumly({ ... })
app.use(Zumly.Router)
await app.init()

// ES Module (named export from the package entry)
import { Zumly, ZumlyRouter } from 'zumly'
const app = new Zumly({ ... })
app.use(ZumlyRouter)
await app.init()
```

The UMD/IIFE bundle attaches the same plugin as `Zumly.Router`. There is no separate published subpath for the router; import it from `'zumly'` or use `Zumly.Router` on `window` when using a script tag.

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `separator` | string | `'/'` | Character used to join view path segments in the hash. |
| `prefix` | string | `'/'` | Prefix before the path in the hash. |

**Behavior:**

| Action | Hash update | History |
|--------|-------------|---------|
| Zoom in | `pushState` | Enables browser back |
| Lateral | `pushState` | Enables browser back |
| Zoom out | `replaceState` | No forward entry |
| Browser back | Triggers `zoomOut()` or lateral `goTo()` | — |
| Browser forward | Blocked (`history.back()`) | — |

**Example URL:** `#/home/showcases/mercedes`

### Limitations and non-goals

- **No deep-linking:** The router plugin syncs hash on navigation and supports browser back, but does not support forward or deep-linking (entering a multi-level URL directly). In a ZUI, zoom-in requires a trigger element for proper spatial context.
- **Resize handling:** Cheap correction when canvas resizes — translate and origin scaled by ratio; scale preserved. Correction is deferred if a transition is running.
- **Remote views:** URL-backed views use `innerHTML`; sanitize external content to avoid XSS.

## Development

### Requirements

- Node.js >= 18 (or 16+ with ES module support)

### Commands

```sh
# Build the library
npm run compile

# Build and serve the demo at http://localhost:9090
npm run dev

# Run tests (Vitest + Playwright). Install browsers first:
npm run test:install-browsers
npm run test

# Run tests with coverage
npm run test:coverage

# Build and pack for publish
npm run build
```

Tests use [Vitest](https://vitest.dev/) with the browser provider ([Playwright](https://playwright.dev/)), same setup as [SnapDOM](https://github.com/zumerlab/snapdom). Run `npm run test:install-browsers` once (or after upgrading Playwright) to install Chromium.

### Building

```sh
npm run compile
```

Output is in the `dist/` folder.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Roadmap

**Done:**
- Depth and lateral navigation (`zoomIn`, `zoomOut`, `goTo`, `back`, `zoomTo`)
- Lateral nav bar (`lateralNav`: `mode` auto/always, arrows, dots, `keepAlive`, `position`)
- Depth back button (`depthNav`: `position` bottom-left/top-left)
- Inputs toggles (`inputs`: wheel, keyboard, click, touch)
- Plugin system (`use()`), router plugin (hash sync, back, forward blocked)
- Resize correction (translate/origin scaling; deferred while transitioning)
- Pluggable drivers (CSS, WAAPI, none, Anime.js, GSAP, Motion, custom)
- Batched zoom-out reads + math helpers to reduce reflow (see [geometry-optimization.md](docs/geometry-optimization.md))

**Planned:**
- Router deep-linking (open a multi-level hash cold)
- Accessibility (focus moves, broader ARIA)

Details and more topics: [docs/roadMap.md](docs/roadMap.md). Driver contract and helpers: [docs/DRIVER_API.md](docs/DRIVER_API.md).

## Community

- [Telegram group](https://t.me/ZumlyCommunity)

## Origin

Zumly is a reimagined, framework-agnostic zoom engine inspired by [Zircle UI](https://github.com/zircleUI/zircleUI). Part of the [Zumerlab](https://github.com/zumerlab) ecosystem — use it with [Orbit](https://github.com/zumerlab/orbit) for radial layouts and [SnapDOM](https://github.com/zumerlab/snapdom) for lightweight DOM diffing.

## License

MIT. See [LICENSE](LICENSE).
