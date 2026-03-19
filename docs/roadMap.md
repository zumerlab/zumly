# Zumly: analysis and improvement topics

Working document to prioritize and design improvements. Not a closed task list but a map of topics to analyze.

**Related:** [README](../README.md) · **[Writing a transition driver](DRIVER_API.md)** (`runTransition`, helpers, lateral spec)

---

## 1. Architecture

### Current state
- **Single module**: `Zumly` does everything: state (storedViews, scales), geometry (transforms), events (click, touch, wheel, key), and orchestrates render + animation.
- **renderView** in `utils.js`: mixes view type detection (string / object / function), DOM creation, and class assignment; it's async but "wait for render/mounted" is still a TODO.
- **Snapshot** (snapShoot): built inside `zoomIn` with data for the 3–4 views; the structure is good but coupled to the zoom flow.

### Decisions to make
- **Separation of concerns**: ZUI state engine vs transition orchestrator vs render layer? That would allow swapping animation (CSS vs JS vs SnapDOM) without touching the view model.
- **Source of truth**: Is state just `storedViews` + `storedPreviousScale`, or should we have an explicit state (e.g. stack of viewIds + transforms) that is then "projected" to DOM/animation?
- **Events**: Everything currently goes to instance methods. Internal event bus, hooks (onBeforeZoomIn, onAfterZoomOut), or both?
- **Multiple instances**: Already supported via mount selector; ensure there is no global state (e.g. unique IDs per instance if needed).

---

## 2. ZUI model (consolidate)

### Current state
- **Navigation**: in/out (zoom, back) + ~~lateral~~ done. `goTo(viewName, { mode: 'depth'|'lateral' })`, `zoomTo()`, `back()`, `getCurrentViewName()`, `getZoomLevel()`. Lateral uses `lateralHistory`; back() pops laterally first, then zoomOut.
- **View**: unit shown at one zoom level; identified by name (`viewName`) and stored in snapshot with `backwardState` / `forwardState`.
- **Trigger**: `.zoom-me` + `data-to="viewName"`. Optional `data-with-duration`, `data-with-ease` (current typo in code: `data-with-eease`).

### Topics to consolidate
- **Formal definition of "view"**: minimum contract (name, how content is resolved, optional metadata for preload/animation).
- **Navigation graph**: Does Zumly know a graph (which views exist, where you can go from each) or keep it implicit via `data-to`? An explicit model helps for router or preload.
- **Levels and "back"**: the `storedViews` stack is the history; zoomOut does pop. Always "one step back" or in the future "go to level N" or "go to view X"?
- **Lateral / same level**: ~~done~~ `goTo(name, { mode: 'lateral' })` swaps current view at same depth; `lateralHistory` tracks undo; back() restores lateral before zoomOut.

---

## 3. View rendering

### Current state (implemented)
- **ViewResolver** (`view-resolver.js`): Detects type (string/url/function/object/element/webcomponent), resolves to DOM node. Prioritizes `views[name]` so hyphenated view names are not mistaken for web components.
- **Pipeline**: (1) Resolve via ViewPrefetcher.get() → ViewResolver; (2) prepareAndInsertView normalizes `.z-view`, sets dataset, classes, appends to canvas; (3) `mounted()` called only after insertion.
- **renderView** in utils: deprecated; delegates to ViewResolver + prepareAndInsertView.

### Topics to analyze
- **"View source" contract**: abstract "give me the content of this view" behind an adapter:
  - `string` (static HTML)
  - `() => string | Promise<string>` (dynamic HTML)
  - `(ctx) => HTMLElement | Promise<HTMLElement>` (direct DOM)
  - `{ url }` → fetch + innerHTML (remote views)
  - For "PHP" or other SSR: server returns HTML or JSON; client only needs an adapter that returns string or node.
- **Where `.z-view` lives**: sometimes the user injects it in HTML, sometimes Zumly adds it (constructor). Unify: e.g. "adapter result must be a single root element" and Zumly either always wraps or always expects the class.
- **Security**: `innerHTML` with remote or dynamic content implies XSS; document and/or offer "sanitize" or "trusted template" option.
- **Preload**: see section 5.

---

## 4. Animation

### Current state
- **CSS only**: keyframes `zoom-current-view`, `zoom-previous-view`, `zoom-last-view` (and `-reverse`); variables `--zoom-duration`, `--zoom-ease`, `--*-transform-start`, `--*-transform-end`.
- **Flow**: in `zoomIn` start/end transforms are computed, variables are set, classes are added to trigger animation; on `animationend` final states are applied and classes cleared.
- **Real DOM nodes** are animated (several views at once with transforms).

### Topics to analyze
- **Performance**: animating many nodes with transform is fine, but for heavy views the SnapDOM idea (capture view → animate image) still holds. Options:
  - Keep current DOM animation as default.
  - "Snapshot" plugin or strategy: before animating, capture view to canvas/image, animate that layer, then show real DOM (or not, depending on design).
- **Animation engine**: Always CSS or allow JS (Web Animations API, libraries)? An abstract "animation driver" (set start/end, duration, ease, return Promise or onEnd callback) would allow trying WAAPI or SnapDOM without rewriting the core.
- **Easing and duration**: already supported per transition (`data-with-duration`, `data-with-ease`) and global (`transitions`); fix typo `withEease` and document.
- **Effects (blur, sepia, saturate)**: declared in options but not clearly used in current CSS variable flow; check if they are wired and whether to keep in core or as optional "effect layer".

### Decoupling from CSS animations (recommended direction)

Today Zumly is tightly coupled to CSS animations and their events:

1. **Computation** (in `zoomIn` / `zoomOut`): transforms and snapshot are computed; then the code sets CSS variables (`--zoom-duration`, `--zoom-ease`, `--*-transform-start`, `--*-transform-end`) and adds classes (`zoom-current-view`, `zoom-previous-view`, `zoom-last-view`, and `-reverse` for zoom out).
2. **Execution**: the browser runs the keyframes defined in `style.css`; no way to swap for WAAPI, GSAP, or instant transitions.
3. **Lifecycle**: the engine relies on `animationstart` and `animationend` to set `blockEvents = true` at start and, at end, remove the old current view from DOM, apply final transforms, clear classes, set `blockEvents = false`.

This removes freedom to use other animation systems or no animation.

**Proposed approach: animation driver**

- Introduce a **transition driver** abstraction. The core only: (1) computes the snapshot (current, previous, last views and their from/to transforms, duration, ease), (2) calls `driver.runTransition(spec, onComplete)` instead of setting CSS vars and adding classes, (3) in `onComplete`, performs the same cleanup as today.
- **Default driver**: current CSS-based implementation (set variables + classes, listen to `animationend`), so behavior stays the same.
- **Alternative drivers** (pluggable via e.g. `transitions.driver`): **CSS** (default), **WAAPI** (`element.animate()` per view, then `onComplete`), **none** (set final transforms immediately + `onComplete`), or **custom** function `(spec, onComplete) => void`.
- **Spec shape**: e.g. `{ type: 'zoomIn'|'zoomOut', currentView, previousView, lastView, currentStage, duration, ease }` with `currentStage.views[i].forwardState`/`backwardState` (transform, origin). Driver applies from/to and calls `onComplete()` when done.

**Implementation steps** (done)

1. ~~Extract "set CSS vars + add classes" and "animationend cleanup" into e.g. `drivers/css-transition.js` with `runTransition(spec, onComplete)`.~~ **Done:** `src/drivers/css-transition.js`.
2. ~~In `zumly.js`, after building the snapshot, call `this.transitionDriver.runTransition(spec, onComplete)` instead of inlining CSS/events.~~ **Done.**
3. ~~Add `transitions.driver: 'css' | 'waapi' | 'none'` or a custom function.~~ **Done:** `utils.checkParameters` normalizes `transitions.driver`; `getDriver()` in `src/drivers/index.js` returns the driver.
4. ~~Implement WAAPI and "none" drivers; keep CSS as default.~~ **Done:** `src/drivers/waapi-transition.js`, `src/drivers/none-transition.js`. Also: `anime`, `gsap`, `motion` (require global lib).
5. Optionally support per-trigger override (e.g. `data-driver="none"`) later.

Authoring guide: [DRIVER_API.md](DRIVER_API.md).

---

## 5. View preloading

### Current state (implemented)
- **ViewResolver** resolves view sources to DOM nodes; prioritizes `views[name]` so hyphenated names are not mistaken for web components.
- **ViewCache** stores resolved nodes with optional TTL; static HTML no expiry, remote URLs 5 min; returns clone on get; `has()` does not clone.
- **ViewPrefetcher** orchestrates: (A) eager on `init()` for `preload: []`, (B) on `mouseover`/`focusin` over `.zoom-me`, (C) scan on view activation (prefetch `.zoom-me` targets). In-flight deduplication for cacheable views.
- **Caching policy**: string views (HTML or URL) cached; function/object views not cached (context-dependent).

### Topics to analyze (future)
- **Limits**: don't preload 50 views at once; priority or queue.
- Per-element TTL via `data-ttl`; global `remoteTTL` override.

---

## 6. Other topics

### Code and robustness
- **zoomOut and reAttachView**: `this.currentStage.views[3]` is used and `canvas.prepend(reAttachView.viewName)`. In the snapshot, `gonev = { viewName: removeView }` stores the **DOM node** in the property named `viewName`, so prepend does reattach the node. The logic is **fragile**: the detached node loses scroll position and event listeners when reattached; it should be redesigned (e.g. keep node reference or re-render view by name).
- **Typo**: `data-with-ease` vs `dataset.withEease`; unify.
- **console.log** in `storeViews`; remove or gate with `debug`.
- **mounted()**: in utils, check that `views[viewName].mounted` is a function before calling it; currently `typeof views[viewName].mounted() === 'function'` is wrong (it checks the return of `mounted()`, not `mounted`).

### DX and project
- **Scripts**: add `dev` (watch + serve) and `test` (jest) in `package.json`.
- **README**: update status ("under improvement" instead of "outdated / from scratch" if current code is the base); link to this doc or a ROADMAP.
- **Tests**: extend for zoomOut (with/without lastView, reAttach); and for renderView (string, object with render, mounted).

### Navigation and product
- ~~**Programmatic**~~ **Done**: `zoomTo(viewName)`, `back()`, `getCurrentViewName()`, `getZoomLevel()`.
- **Router**: sync URL with level/view (hash or history) so deep views can be shared; depends on state model.
- ~~**Resize**~~ **Done**: cheap resize correction via translate/origin scaling; scale preserved; deferred when transitioning.

### Accessibility and SEO
- **Focus**: on zoom in/out, manage focus (which element should receive focus).
- **Semantics**: if views are "screens", consider landmarks (role, aria) for screen readers.
- **Static content**: if views come from static HTML or SSR, content can be indexable; document good practices.

---

## Suggested order to tackle

1. **Quick fixes**: ease typo, console.log, mounted check, and clarify/fix zoomOut (reAttach or remove until redesign).
2. **Minimal architecture**: separate "ZUI state" (stack of levels, current view) from "apply transition" (compute transforms and trigger animation), so animation can be swapped later.
3. **View contract**: define "view source" adapters (string, async render, URL, etc.) and unify who creates `.z-view`.
4. **Preload**: API design and policy (what/when) using that contract.
5. **Animation**: abstract driver and/or "snapshot" strategy (SnapDOM) as a performance option.
6. **Router, resize, lateral navigation**: once the model and API are stable.

---

## 7. Notes from Claude AI analysis (external review)

Summary of an external analysis and how it fits this doc, plus corrections and nuances to keep in mind when implementing.

### What matches the codebase
- **Engine state**: Three layers (current / previous / last), `zoomIn` flow (renderView → getBoundingClientRect twice for trigger → compute transforms → CSS vars → classes → snapshot), `zoomOut` using `backwardState`. Correct.
- **Known issues**: `storedPreviousScale` as a parallel array (should live inside each snapshot); fourth view stored as node and reattached with `prepend` (fragile: scroll and listeners); `contentVisibility: hidden` as a performance hack; no `cover: 'auto'` (only `width` / `height`).

### snapDOM integration (from that analysis)
- **snapDOM** (https://github.com/zumerlab/snapdom): captures any HTML element as a high-fidelity SVG image (styles, fonts, pseudo-elements, background images, shadow DOM). Built with Zumly in mind.
- **Idea**: When a view becomes previous/last, it stays as live DOM (memory, layout, events). With snapDOM: before animating, freeze `previousView` as an SVG image, replace the live node in the canvas with that image, apply the same transforms/classes, animate the image. On zoom-out, animate the image back; when the user returns to that view, restore the real DOM.
- **Order in `zoomIn()`**:
  1. Capture trigger coords **before** touching the DOM.
  2. Render new view.
  3. Compute all transforms.
  4. **Freeze previousView with snapDOM** — after computing, before animating.
  5. Replace `previousView` with the image in the canvas, then run the same animation flow.
- **Caveat**: snapDOM has a known Safari bug with `<foreignObject>` in SVG (images don't render on first load). Being worked on; may affect Zumly when integrated.

### View system: resolver, cache, prefetcher (from that analysis)
- **ViewResolver**: Detects type and resolves to a DOM node. Types: `name` (key in `views`), `html` (string with `<`), `url` (starts with `http`/`/` or ends in `.html`/`.php`), `function` (async, returns string or HTMLElement), `element` (clone node), `webcomponent` (string with `-`, then `customElements.whenDefined` + create).
- **ViewCache**: Store resolved nodes with optional TTL; return `cloneNode(true)` on get; `has()` checks existence/expiry without cloning.
- **ViewPrefetcher**: Three strategies — (A) eager on `init()` for `preload: []`, (B) on hover/focus of `.zoom-me` (silent fetch; not on mobile), (C) on view activation: scan `.zoom-me` children and prefetch their targets in background (works on mobile). TTL: static views no expiry, remote URLs e.g. 5 min, function views no cache. Use an `#inFlight` Map to avoid duplicate concurrent fetches.
- **Integration**: Constructor wires prefetcher and `mouseover` for hover prefetch; `init()` calls `preloadEager` if `preload` is set; `zoomIn()` uses `prefetcher.get(source)` instead of `renderView()`, then `prefetcher.scanAndPrefetch(node)` for (C).

### Corrections and nuances to apply
1. **ViewResolver type detection**: If `#detectType(source)` is called with the **view name** (e.g. `'my-dashboard'`), the rule `source.includes('-')` → `'webcomponent'` would treat a **view name with a hyphen** as a web component and call `document.createElement('my-dashboard')` instead of resolving `views['my-dashboard']`. **Fix**: Treat "is a key in `views`" first. If `this.#views[source] !== undefined`, return `'name'` and then `resolve(this.#views[source], context)`. Apply url/html/webcomponent rules to the **value** from `views[name]`, not to the key.
2. **"Rest of engine unchanged" after `prefetcher.get()`**: Current `renderView()` also adds `.z-view`, `dataset.viewName`, classes (`is-new-current-view`, etc.), appends to canvas, and optionally calls `mounted()`. So after `prefetcher.get()` returns the node, something must still do "wrap + classes + append + mounted". Either the resolver/prefetcher always return a node that already has `.z-view` and the engine only adds classes and appends, or the engine keeps a step like `prepareAndInsert(node, viewName, init)` (classes, dataset, append, mounted). Make this explicit in the design.
3. **`mounted()` hook**: The new design does not mention calling `mounted()` after the view is in the canvas. If we keep that contract (for object views with `render` + `mounted`), `mounted()` must run in the engine when the view becomes current, not during prefetch, because it depends on the DOM already in the canvas.

### Resulting public config (from that analysis)
```js
const app = new Zumly({
  mount: '.canvas',
  initialView: 'home',
  preload: ['home', 'menu'],
  views: {
    home: `<div class="z-view">...</div>`,
    profile: async (ctx) => { /* fetch + return HTML */ },
    contact: '/views/contact.html',
    dashboard: 'my-dashboard',  // web component
  },
  transitions: { effects: ['blur'], cover: 'width', duration: '1s', ease: 'ease-in-out' },
  debug: false
})
app.init()
```

### Target file layout (implemented)
```
src/
├── zumly.js           (orchestrates init, zoomIn, zoomOut; uses prefetcher)
├── utils.js           (prepareAndInsertView, checkParameters; renderView deprecated)
├── view-resolver.js   type detection and resolve to DOM node
├── view-cache.js      cache with TTL; clone on get, has() without cloning
└── view-prefetcher.js orchestrates A+B+C; get, preloadEager, prefetch, scanAndPrefetch
```

### Left for later (from that analysis)
- Per-element TTL via `data-ttl` on `.zoom-me`.
- Global TTL override in config via `remoteTTL`.
- For now use a fixed internal TTL (e.g. 5 minutes) for remote URLs.
