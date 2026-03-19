<p align="center">
  <a href="https://zumly.org">
    <img src="https://raw.githubusercontent.com/zumly/website/gh-pages/images/logo-zumly.png" width="200">
  </a>
</p>

<p align="center">
  Zumly is a JavaScript library for building zooming user interfaces. Create zooming experiences using web standards.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/zumly"><img src="https://img.shields.io/npm/v/zumly.svg"></a>
</p>

## Status

Zumly is under active development and **not yet ready for production**. It’s a great time for curious developers to experiment: view preloading, prefetch on hover, and multiple view sources (HTML, URL, async functions, web components) are supported. See [docs/roadMap.md](docs/roadMap.md) for improvement topics and roadmap.

## Overview

Zumly is a frontend library for creating **zoomable user interfaces** ([ZUI](https://en.wikipedia.org/wiki/Zooming_user_interface)). Instead of hyperlinks and windows, Zumly uses zooming as the main way to move through information: an infinite virtual canvas where you zoom into elements to reveal more detail.

The library focuses on **zoom transitions** and stays **UI-agnostic**—you bring your own CSS and layout. Any design system or custom styling works with Zumly.

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
| `transitions` | object | No | Duration, ease, cover, and effects for zoom transitions. |
| `debug` | boolean | No | Enable debug messages (default: `false`). |
| `componentContext` | object | No | Context passed to component-style views. |

**Transitions (optional):**

```js
transitions: {
  driver: 'css',   // 'css' | 'waapi' | 'anime' | 'gsap' | 'motion' | 'none' or custom function(spec, onComplete)
  effects: ['blur', 'sepia', 'saturate'],  // background view effects
  cover: 'width',   // or 'height' — how the previous view scales to cover the trigger
  duration: '1s',
  ease: 'ease-in-out',
}
```

**Transition drivers:** Zoom animations are handled by a pluggable driver so you can swap the implementation without changing app logic.

| Driver | Description |
|--------|-------------|
| `'css'` (default) | CSS keyframes and `animationend`; uses `zumly.css` variables. |
| `'waapi'` | Web Animations API (`element.animate()`). |
| `'anime'` | [Anime.js](https://animejs.com/) — load the library (e.g. from CDN) before use. |
| `'gsap'` | [GSAP](https://greensock.com/gsap/) — load the library (e.g. from CDN) before use. |
| `'motion'` | [Motion](https://motion.dev/) (motion.dev) — load the library (e.g. from CDN) before use. |
| `'none'` | No animation; applies final state immediately. Useful for tests or instant UX. |
| `function(spec, onComplete)` | Custom driver. Receives a transition spec and must call `onComplete()` when done. |

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

Views can be:

- **HTML string** — static markup.
- **Async function** — `(context) => string | Promise<string>` or return an `HTMLElement`.
- **Object with `render()`** — `{ render(): string | Promise<string>, mounted?(): void }`.
- **URL** — path or full URL to an HTML file (fetched and cached).
- **Web component tag name** — string containing a hyphen (e.g. `'my-view'`); the custom element is created after it is defined.

Preloading: use `preload: ['viewA', 'viewB']` to resolve those views on init. Hovering over a `zoom-me` trigger prefetches its target view; when a view becomes current, its `zoom-me` targets are prefetched in the background.

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
- Lateral navigation (same zoom level)
- Navigation widget and programmatic navigation
- Router integration (e.g. URL sync)
- Recalculate zoom on window resize

Details and more topics: [docs/roadMap.md](docs/roadMap.md).

## Community

- [Telegram group](https://t.me/ZumlyCommunity)

## Origin

Zumly is a reimagined, framework-agnostic zoom engine inspired by [Zircle UI](https://github.com/zircleUI/zircleUI). It can be used together with [Orbit](https://github.com/zumerlab/orbit) for radial layouts.

## License

MIT. See [LICENSE](LICENSE).
