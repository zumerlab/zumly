# Zumly: analysis and improvement topics

Working document to prioritize and design improvements. Not a closed task list but a map of topics to analyze.

**Product framing:** [README](../README.md) — *Z over XY* · focus-driven navigation · zoom into what matters.

**Related:** [README](../README.md) · **[Writing a transition driver](DRIVER_API.md)** (`runTransition`, helpers, lateral spec) · [Geometry optimization](geometry-optimization.md) (reflow reduction in zoom-out planning)

---

## 1. Architecture

### Current state
- **Single module**: `Zumly` orchestrates state (`storedViews`, scales), geometry (transforms), inputs, navigation UI, plugins, and hands transitions to **drivers** (`src/drivers/`).
- **`renderView`** in `utils.js` is **deprecated**; the live path is **ViewPrefetcher** + **ViewResolver** + **`prepareAndInsertView()`** (see §3).
- **Snapshot** (snapShoot): built inside `zoomIn` with data for the 3–4 views; structure is coupled to the zoom flow.

### Decisions to make
- **Separation of concerns**: ZUI state engine vs transition orchestrator vs render layer? That would allow swapping animation (CSS vs JS vs SnapDOM) without touching the view model.
- **Source of truth**: Is state just `storedViews` + `storedPreviousScale`, or should we have an explicit state (e.g. stack of viewIds + transforms) that is then "projected" to DOM/animation?
- **Events**: Public **`on` / `off`** hooks exist for lifecycle events; internal flow still calls instance methods. Whether to add an internal bus remains open.
- **Multiple instances**: Already supported via mount selector; ensure there is no global state (e.g. unique IDs per instance if needed).

---

## 2. ZUI model (consolidate)

### Current state
- **Navigation**: in/out (zoom, back) + ~~lateral~~ done. `goTo(viewName, { mode: 'depth'|'lateral' })`, `zoomTo()`, `back()`, `getCurrentViewName()`, `getZoomLevel()`. Lateral uses `lateralHistory`; back() pops laterally first, then zoomOut.
- **View**: unit shown at one zoom level; identified by name (`viewName`) and stored in snapshot with `backwardState` / `forwardState`.
- **Trigger**: `.zoom-me` + `data-to="viewName"`. Optional `data-with-duration`, `data-with-ease`, etc. (camelCased on `dataset` as `withDuration`, `withEase`, …).

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

### Current state (implemented)
- **Drivers**: Pluggable **`transitions.driver`**: built-in **`css`**, **`waapi`**, **`none`**, plus **`anime`**, **`gsap`**, **`motion`** (globals) or a **custom function** `(spec, onComplete) => void`. Default remains CSS keyframes + `animationend`.
- **CSS driver**: keyframes `zoom-current-view`, `zoom-previous-view`, `zoom-last-view` (and `-reverse`); variables `--zoom-duration`, `--zoom-ease`, `--*-transform-start`, `--*-transform-end`; **effects** applied as filters on background layers.
- **WAAPI driver**: `element.animate()` for the same states; **lateral** transitions are animated (not only instant).
- **Real DOM nodes** are animated (several views at once with transforms).

### Topics to analyze
- **Performance**: for very heavy DOM trees, a **SnapDOM** (or similar) snapshot layer may still be worth a dedicated strategy (see §8).
- **Idle / dynamic parallax**: engine currently keeps **`parallax` fixed off**; revisiting animated parallax is a product decision.

### Historical note: decoupling from CSS-only (achieved)

Previously the core was tightly coupled to CSS animations and their events:

1. **Computation** (in `zoomIn` / `zoomOut`): transforms and snapshot are computed; then the code sets CSS variables (`--zoom-duration`, `--zoom-ease`, `--*-transform-start`, `--*-transform-end`) and adds classes (`zoom-current-view`, `zoom-previous-view`, `zoom-last-view`, and `-reverse` for zoom out).
2. **Execution**: the browser runs the keyframes defined in `style.css`; no way to swap for WAAPI, GSAP, or instant transitions.
3. **Lifecycle**: the engine relies on `animationstart` and `animationend` to set `blockEvents = true` at start and, at end, remove the old current view from DOM, apply final transforms, clear classes, set `blockEvents = false`.

That old shape made it hard to swap animation engines or disable motion.

**Implemented: animation driver abstraction**

- The core (1) computes the snapshot, (2) calls **`runTransition(spec, onComplete)`** on the selected driver, (3) on `onComplete`, performs DOM cleanup as before.
- **Default**: CSS driver (variables + classes + `animationend`).
- **Also built-in**: **WAAPI**, **none**, **anime**, **gsap**, **motion**, or a **custom** function. Spec includes `type: 'zoomIn' | 'zoomOut' | 'lateral'` and lateral-only fields when relevant.

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
- **mounted()**: `prepareAndInsertView` uses `typeof views[viewName].mounted === 'function'` before invoking.

### DX and project
- **Scripts**: `package.json` has `dev`, `compile`, `test` (Vitest + browser), etc.
- **README**: kept in sync with the public API; links this doc and DRIVER_API / geometry notes.
- **Tests**: Vitest + Playwright; extend coverage for edge cases (zoomOut reattach, resolver types) as needed.

### Navigation and product
- ~~**Programmatic**~~ **Done**: `zoomTo(viewName)`, `back()`, `getCurrentViewName()`, `getZoomLevel()`.
- **Router**: **hash router plugin** shipped (`Zumly.Router` / `ZumlyRouter`) — syncs hash, browser back, forward blocked; **deep-linking** (cold load at depth) still planned.
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
6. ~~**Router, resize, lateral navigation**~~ — largely done; remaining: deep-linking, a11y polish.

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
  transitions: { cover: 'width', duration: '1s', ease: 'ease-in-out' },
  debug: false
})
app.init()
```

### Target file layout (implemented)
```
src/
├── zumly.js           (orchestrates init, zoomIn, zoomOut, nav UI, plugins; uses prefetcher + drivers)
├── utils.js           (prepareAndInsertView, checkParameters; renderView deprecated)
├── geometry.js        (transform math; includes reflow-saving helpers for zoom-out)
├── view-resolver.js   type detection and resolve to DOM node
├── view-cache.js      cache with TTL; clone on get, has() without cloning
├── view-prefetcher.js orchestrates A+B+C; get, preloadEager, prefetch, scanAndPrefetch
├── drivers/           css, waapi, none, anime, gsap, motion, driver-helpers
└── plugins/           e.g. router.js (hash sync)
```

### Left for later (from that analysis)
- Per-element TTL via `data-ttl` on `.zoom-me`.
- Global TTL override in config via `remoteTTL`.
- For now use a fixed internal TTL (e.g. 5 minutes) for remote URLs.

---

## 8. Transition physics and depth effects

### Parallax (reserved)
- **Current engine behavior**: `checkParameters` forces **`parallax` to `0`**; the option is reserved for a future design. Older docs describing non-zero parallax reflect intent, not active behavior.
- **Future**: dynamic motion during the transition or idle parallax would need a dedicated spec and driver cooperation.

### Stagger delay (implemented)
- `transitions.stagger: N` (ms) adds progressive delay between view layers during zoom transitions.
- Current view starts immediately, previous view starts after `1 * stagger` ms, last view after `2 * stagger` ms.
- Creates an elastic "spring chain" feel where deeper views lag behind, reinforcing depth and physicality.
- Works across all drivers via the snapshot `stagger` field.

### snapDOM integration (planned — game changer)
- **Problem**: Complex views with many internal DOM elements suffer heavy performance when scaled/transformed. No animation engine handles this well because it's a DOM limitation.
- **Solution**: Use [snapDOM](https://github.com/zumerlab/snapdom) to rasterize previous/last views as SVG images before animating. Animating a single image element is orders of magnitude faster than animating a full DOM tree.
- **Pipeline change**: Before zoom-in animation, capture previousView with snapDOM → replace live DOM node with SVG snapshot → animate the snapshot. On zoom-out, animate snapshot back → restore live DOM when view becomes current again.
- **Implications**: Touches the core engine (view lifecycle), snapshot system, and potentially drivers. Requires careful design to preserve scroll position, event listeners, and interactive state when swapping between live DOM and snapshot.
- **Status**: Requires dedicated exploration session. snapDOM has a known Safari `<foreignObject>` bug being worked on.

---

## 9. Framework wrappers and TypeScript

### Framework wrappers (planned)

Thin wrapper packages (`@zumly/react`, `@zumly/vue`, `@zumly/svelte`, `@zumly/angular`) that expose Zumly as a native component within each framework. The core API is already framework-friendly:

- **Lifecycle**: Constructor → `init()` → `destroy()` maps cleanly to framework mount/unmount hooks.
- **Events**: `on()`/`off()` pub/sub maps to React callbacks, Vue emits, Svelte dispatchers, Angular EventEmitters.
- **Views as functions**: The `({ target, props, context }) => void` pattern lets each framework mount components into the target div.
- **componentContext**: Passes framework-specific shared state (React context, Vue provide/inject, stores).
- **Clean destroy()**: Idempotent, removes all listeners/timers/observers, nullifies references — safe for SPA unmount.

Each wrapper would be ~100-200 lines:

| Framework | Component | Hook/Composable |
|-----------|-----------|-----------------|
| React | `<Zumly>` | `useZumly()` with `useEffect` → init/destroy, `useRef` for canvas |
| Vue 3 | `<Zumly>` | `useZumly()` composable, `onMounted` → init, `onUnmounted` → destroy |
| Svelte | `<Zumly>` | `use:action` or `onMount`/`onDestroy` |
| Angular | `ZumlyComponent` + `ZumlyService` | `ngOnInit` → init, `ngOnDestroy` → destroy |

**Limitations to document**: No SSR/hydration support (Zumly requires real DOM). Custom drivers within frameworks may need access to framework context.

### TypeScript definitions (**shipped**)

Public typings live in [`types/zumly.d.ts`](../types/zumly.d.ts): `ZumlyOptions`, `TransitionOptions`, `ViewContext`, `TransitionSpec`, plugins (`ZumlyRouter`), and the `Zumly` class API. Regenerate or extend when the public surface changes.
