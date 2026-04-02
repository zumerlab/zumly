# Zumly roadmap

Working document to guide next improvements.

**Related:** [README](../README.md) · [DRIVER_API.md](DRIVER_API.md) · [geometry-optimization.md](geometry-optimization.md)

---

## 1) Architecture

### Current structure
- `Zumly` orchestrates state, geometry, inputs, UI controls, plugins, and transitions.
- Rendering path is `ViewPrefetcher` -> `ViewResolver` -> `prepareAndInsertView()`.
- Transition execution is delegated to drivers in `src/drivers/`.

### Open decisions
- Separate core pieces more clearly: state engine, render pipeline, transition orchestration.
- Define a single source of truth for navigation state and transforms.
- Decide whether to add an internal event bus beyond `on()` / `off()`.

---

## 2) Navigation model

### Current behavior
- Depth navigation: `zoomIn`, `zoomOut`, `zoomTo`, `back`.
- Lateral navigation: `goTo(name, { mode: 'lateral' })` with lateral history.
- Back behavior: lateral undo first, then depth zoom-out.

### Open decisions
- Formal view contract (id, source, metadata).
- Keep navigation graph implicit (`data-to`) or support explicit graph metadata.
- Define whether future APIs should support jump-to-depth and jump-to-node.

---

## 3) View rendering and data sources

### Current behavior
- Supported view sources: HTML string, URL, function, object with `render()`, DOM element, web component tag.
- Hyphenated names are resolved as keys first, then as web components.
- `mounted()` runs only after insertion into canvas.

### Open work
- Tighten and document the view source contract.
- Clarify `.z-view` ownership (caller vs engine wrapping).
- Improve remote HTML safety guidance (`innerHTML` + sanitization strategy).

---

## 4) Transitions and animation

### Current behavior
- Driver-based transitions via `transitions.driver`.
- Built-in drivers: `css`, `waapi`, `none`, `anime`, `gsap`, `motion`.
- Custom driver function is supported.
- Lateral transitions are animated in WAAPI driver.

### Open work
- Add optional per-trigger driver override if needed.
- Evaluate snapshot-based transitions for heavy DOM trees using [snapDOM](https://github.com/zumerlab/snapdom).
- Keep driver API stable and well-tested.

---

## 5) Prefetch and cache

### Current behavior
- Eager preload from `preload`.
- Hover/focus prefetch for `.zoom-me[data-to]`.
- Scan prefetch for triggers inside the active view.
- Cache policy: string sources cached, function/object sources resolved fresh.

### Open work
- Add queue/priority limits for large preload sets.
- Consider per-trigger TTL (`data-ttl`) and configurable remote TTL.

---

## 6) Code quality and robustness

### Key issues
- Reattach path in `zoomOut` is still fragile for complex DOM state.
- Remove remaining debug-only logs or gate them strictly behind `debug`.
- Keep resolver/prefetch/insert contracts explicit in tests.

### Testing focus
- Zoom-out edge cases (with and without detached views).
- Resolver detection order and view source combinations.
- Driver completion guarantees (`onComplete` exactly once).

---

## 7) Product and UX

### Current behavior
- Nav UI supports depth + lateral controls.
- Nav position presets available.
- Hash router plugin supports sync + browser back.

### Open work
- Router deep-linking on cold load.
- Accessibility improvements (focus flow, ARIA semantics).
- Better docs for SEO/static content setups.

---

## 8) Motion depth effects

### Current behavior
- `stagger` is active and works across drivers.
- `parallax` is reserved and currently forced to `0`.

### Open work
- Define a real parallax model (transition-time and/or idle motion).
- Evaluate optional snapshot layer for very heavy views using [snapDOM](https://github.com/zumerlab/snapdom).

---

## 9) Ecosystem

### Open work
- Framework wrapper packages (`@zumly/react`, `@zumly/vue`, `@zumly/svelte`, `@zumly/angular`).
- Wrapper docs: lifecycle, cleanup, SSR limitations.
- Keep `types/zumly.d.ts` aligned with public API and plugin exports.

---

## Suggested order

1. Hardening: zoom-out reattach path, debug cleanup, edge-case tests.
2. State model clarity: explicit contracts between state/render/driver layers.
3. Rendering contract and safety docs for remote HTML.
4. Prefetch controls (limits, TTL configuration).
5. Router deep-linking and accessibility improvements.
