<p align="center">
  <a href="https://zumly.org">
    <img src="https://raw.githubusercontent.com/zumly/website/gh-pages/images/logo-zumly.png" width="200">
  </a>
</p>

<p align="center">
  Zumly is a JavaScript library for building hierarchical zoom navigation interfaces. Create spatial, zoom-driven view transitions using web standards.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/zumly"><img src="https://img.shields.io/npm/v/zumly.svg"></a>
</p>

## Status

Zumly is under active development and **not yet ready for production**. It’s a great time for curious developers to experiment: view preloading, prefetch on hover, and multiple view sources (HTML, URL, async functions, web components) are supported.

**Docs:** [Roadmap & topics](docs/roadMap.md) · [Custom transition drivers (`spec`, `onComplete`, helpers)](docs/DRIVER_API.md)

## Overview

Zumly is a frontend library for creating **zoom-based navigation interfaces** inspired by **zoomable user interfaces** ([ZUI](https://en.wikipedia.org/wiki/Zooming_user_interface)).

Unlike free-pan, infinite-canvas ZUI systems, Zumly focuses on **discrete, hierarchical navigation between views**. Users zoom into interactive elements to move deeper into nested content, preserving spatial context while keeping navigation structured and intentional.

Zumly can be understood as a **hierarchical zoom navigation engine**: a way to move between related views through spatially continuous transitions, without requiring freeform map-like navigation.

The library focuses on **zoom transitions** and stays **UI-agnostic**—you bring your own CSS and layout. Any design system or custom styling works with Zumly.

## What Zumly is

Zumly is not a freeform zooming canvas or map-like navigation system.

It is a **discrete, hierarchical zoom interface** for moving between nested views. Instead of abruptly switching screens, users zoom into elements to reveal the next level of content.

This makes Zumly especially useful for:

* immersive navigation
* storytelling interfaces
* visual menus
* structured exploration
* any UI where preserving context between views matters

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
| `transitions` | object | No | Duration, ease, cover, and driver for zoom transitions. |
| `debug` | boolean | No | Enable debug messages (default: `false`). |
| `componentContext` | object | No | Context passed to component-style views. |

**Transitions (optional):**

```js
transitions: {
  driver: 'css',   // 'css' | 'waapi' | 'anime' | 'gsap' | 'motion' | 'none' or custom function(spec, onComplete)
  cover: 'width',  // or 'height' — how the previous view scales to cover the trigger
  duration: '1s',
  ease: 'ease-in-out',
}
```

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

**Zoomable elements:**

- Give the view root the class `z-view`.
- Add class `zoom-me` and `data-to="viewName"` to the element that triggers zoom-in.
- Optional per-trigger: `data-with-duration`, `data-with-ease`.

```html
<div class="z-view">
  <div class="zoom-me" data-to="detail" data-with-duration="2s" data-with-ease="ease-in">
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

### Limitations and non-goals

- **Lateral navigation:** Supported via `goTo(name, { mode: 'lateral' })` and `back()`.
- **No router/URL sync:** Deep views are not reflected in the URL; no built-in back/forward history.
- **Resize handling:** Cheap correction when canvas resizes—translate and origin scaled by ratio; scale preserved. Correction is deferred if a transition is running.
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

- Additional view/template adapters
- ~~Lateral navigation (same zoom level)~~ done: `goTo(name, { mode: 'lateral' })`
- Navigation widget (~~programmatic navigation~~ done)
- Router integration (e.g. URL sync)
- ~~Resize correction~~ done: cheap translate/origin scaling when canvas size changes

Details and more topics: [docs/roadMap.md](docs/roadMap.md). Driver contract and helpers: [docs/DRIVER_API.md](docs/DRIVER_API.md).

## Community

- [Telegram group](https://t.me/ZumlyCommunity)

## Origin

Zumly is a reimagined, framework-agnostic zoom engine inspired by [Zircle UI](https://github.com/zircleUI/zircleUI). It can be used together with [Orbit](https://github.com/zumerlab/orbit) for radial layouts.

## License

MIT. See [LICENSE](LICENSE).
