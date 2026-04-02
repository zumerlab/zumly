---
name: zumly-guide
description: >
  Comprehensive guide for building applications with Zumly (zoom-based hierarchical navigation).
  Covers architecture, view design, triggers, navigation hierarchy, framework integration,
  performance, styling, and common pitfalls.
user-invocable: false
---

# Zumly Application Architecture Guide

You are helping a developer build an application with **Zumly**, a JavaScript library for
zoom-based hierarchical navigation. Zumly navigates in Z (depth) through discrete views
in the XY plane with spatial transitions.

Read `docs/llms-full.txt` in the Zumly repo for the full API reference. This skill provides
**architectural opinions and practical patterns** that go beyond the API docs.

---

## Core Mental Model

Zumly is NOT a router, NOT a carousel, NOT a freeform canvas. It is a **focus-driven spatial
hierarchy**. Each view occupies the full canvas. The user zooms into a trigger element, and
the new view appears to emerge from that trigger. This creates a spatial relationship:
the child view is "inside" the trigger.

**Design with this spatial metaphor:** every zoom-in should feel like drilling into a specific
region of the current view. The trigger element's position and size determine the animation
origin. If triggers are scattered randomly, the spatial continuity breaks.

---

## Architecture Decision: Depth vs Lateral

**Use depth (zoom-in/out) when:**
- The relationship is parent-to-child (overview to detail)
- The user is "going deeper" into something
- There is a clear containment relationship (a card contains its detail view)
- The trigger is a visible region the user focuses on

**Use lateral navigation when:**
- Items are siblings at the same level (tabs, pages in a set, slides)
- The user is browsing alternatives, not drilling down
- You want left/right or swipe-style navigation between peers
- Views share the same parent context

**Depth limits:** Zumly performs well to 5-7 levels deep. Beyond that, the accumulated
transforms and detached DOM nodes create memory pressure. If your hierarchy is deeper,
consider flattening: use a hub-and-spoke pattern where depth 2 views can zoom into
their own sub-hierarchies, effectively resetting the stack.

---

## View Source Selection Guide

Choose the right view source type based on your needs:

### HTML Strings -- Use for simple, static content
```js
views: {
  home: '<div class="z-view"><h1>Welcome</h1><div class="zoom-me" data-to="about">About</div></div>'
}
```
Best for: prototypes, static pages, content that does not change between visits.
Cached after first resolution -- subsequent zooms reuse the cached DOM.

### Functions -- Use for dynamic, data-driven views
```js
views: {
  profile: (ctx) => {
    return `<div class="z-view">
      <h1>Profile ${ctx.props.id}</h1>
      <p>Triggered from: ${ctx.trigger?.textContent}</p>
    </div>`
  }
}
```
Best for: views that depend on which trigger was clicked, views that fetch data,
views that need different content each time. Functions are called fresh each time
(never cached) -- this is correct for dynamic content.

**Key patterns with function views:**
- `ctx.props` contains ALL `data-*` attributes from the trigger. Use `data-id="42"` on
  the trigger and access it as `ctx.props.id`.
- `ctx.context` is the `componentContext` from the constructor -- use it to share
  services (API clients, stores, auth state).
- Return a string, return an HTMLElement, or mount into `ctx.target` and return void.
- Functions can be async -- Zumly awaits the result.

### Objects with render() -- Use when you need a mounted() lifecycle hook
```js
views: {
  chart: {
    render(ctx) {
      return `<div class="z-view"><canvas id="chart-${ctx.props.id}"></canvas></div>`
    },
    mounted() {
      // Called AFTER the element is in the DOM -- safe to query it
      new Chart(document.getElementById('chart-' + this.lastId), { ... })
    }
  }
}
```
Best for: views that need post-insertion setup (charts, maps, third-party widgets).
Note: `mounted()` fires after the view is appended to the canvas but BEFORE the zoom
animation runs.

### URLs -- Use for server-rendered or external content
```js
views: {
  terms: '/views/terms.html',
  help: 'https://api.example.com/help-widget'
}
```
The HTML file should contain a single root element with class `z-view`.
URL views are fetched and cached. 10-second timeout by default.

### Web Components -- Use for encapsulated, reusable views
```js
views: {
  dashboard: 'my-dashboard'  // Must contain a hyphen
}
```
Zumly calls `customElements.whenDefined(tagName)` before creating the element.
The component's `connectedCallback` should add `.z-view` to itself.

---

## Trigger Design Patterns

Triggers are the heart of Zumly's spatial metaphor. Every `.zoom-me` element defines
a spatial origin for the zoom transition.

### Pattern 1: Card Grid (most common)
```html
<div class="z-view" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
  <div class="zoom-me" data-to="project-detail" data-id="1">
    <h3>Project Alpha</h3>
    <p>Click to explore</p>
  </div>
  <div class="zoom-me" data-to="project-detail" data-id="2">
    <h3>Project Beta</h3>
  </div>
</div>
```
Multiple triggers can point to the SAME view name -- differentiate via `data-*` props.
The child view reads `ctx.props.id` to know which item was clicked.

### Pattern 2: Spatial Dashboard Regions
```html
<div class="z-view" style="display: grid; grid-template: 'header header' auto 'sidebar main' 1fr / 250px 1fr;">
  <div style="grid-area: header" class="zoom-me" data-to="notifications">
    Notifications (12)
  </div>
  <div style="grid-area: sidebar" class="zoom-me" data-to="navigation">
    Navigation Menu
  </div>
  <div style="grid-area: main" class="zoom-me" data-to="content">
    Main Content Area
  </div>
</div>
```
Each region zooms into its own detail view. The animation origin matches the region
position, creating a natural "expanding" effect.

### Pattern 3: Inline Trigger with hideTrigger
```html
<div class="z-view">
  <p>Read about our <span class="zoom-me" data-to="feature" data-hide-trigger="fade"
     style="color: blue; cursor: zoom-in;">advanced features</span> in detail.</p>
</div>
```
Using `hideTrigger: 'fade'` or `data-hide-trigger="fade"` on inline triggers prevents
the visual artifact of the trigger text being visible behind the zoomed view.

### Trigger Sizing Matters
The trigger's size directly affects the zoom animation. A trigger that fills 80% of the
canvas will produce a subtle zoom. A small 50x50 trigger will produce a dramatic zoom.
**Design trigger sizes intentionally** -- they are not just clickable areas, they are
animation parameters.

### Per-Trigger Overrides
Any trigger can override global transition settings:
```html
<div class="zoom-me" data-to="detail"
     data-with-duration="300ms"
     data-with-ease="ease-out"
     data-with-cover="height"
     data-with-stagger="50"
     data-with-effects="blur(5px) | blur(10px)"
     data-hide-trigger="fade"
     data-deferred>
```

---

## Navigation Hierarchy Design

### The Three-View Window
Zumly maintains at most 3 views in the DOM at any time:
- `.is-current-view` -- the active, interactive view
- `.is-previous-view` -- the parent (visible behind, zoomed out)
- `.is-last-view` -- the grandparent (far background)

Views beyond depth 3 are detached from the DOM and stored as references. They are
re-attached on zoom-out. This is automatic -- you do not need to manage it.

### Hub-and-Spoke Pattern (recommended for most apps)
```
Home (hub)
 |-- Projects  --> Project Detail --> Task Detail
 |-- Settings  --> Setting Category
 +-- Profile   --> Edit Profile
```
Depth 1 is the hub. Depth 2 are section overviews. Depth 3+ are details.
Lateral navigation at depth 2 lets users switch between sections without
zooming all the way out.

### Flat + Lateral Pattern (for content-browsing apps)
```
Gallery (root)
 +-- Photo 1 <-> Photo 2 <-> Photo 3  (lateral siblings)
          +-- Photo Detail / Metadata (depth)
```
Zoom into the gallery, then navigate laterally between photos.
Each photo can have its own zoom-in for details.

### Using goTo() for Programmatic Navigation
```js
// Depth navigation (zoom-in to a view using a centered synthetic trigger)
await app.goTo('detail')
await app.goTo('detail', { mode: 'depth', props: { id: '42' } })

// Lateral navigation (swap to a sibling at the same depth)
await app.goTo('settings', { mode: 'lateral' })

// back() pops lateral history first, then zooms out
app.back()
```
Programmatic navigation via `zoomTo()` or `goTo()` uses a centered synthetic trigger.
The zoom animation originates from the canvas center, which is less spatially meaningful
than clicking a real trigger. Use real triggers when spatial context matters.

---

## Framework Integration Patterns

### The Key Insight
Zumly does not wrap your framework -- your framework renders INTO Zumly views.
Use function views that mount framework components into `ctx.target`.

### React
```jsx
import Zumly from 'zumly'
import 'zumly/style.css'
import { createRoot } from 'react-dom/client'

function App() {
  const ref = useRef(null)
  useEffect(() => {
    const app = new Zumly({
      mount: '#zumly-app',
      initialView: 'home',
      componentContext: { theme: 'dark' },
      views: {
        home: '<div class="z-view">...<button class="zoom-me" data-to="detail" data-id="42">Open</button></div>',
        detail: (ctx) => {
          const root = createRoot(ctx.target)
          root.render(<DetailView id={ctx.props.id} theme={ctx.context.theme} />)
          // void return -- Zumly uses ctx.target
        }
      }
    })
    app.init()
    ref.current = app
    return () => app.destroy()  // CRITICAL: always destroy on unmount
  }, [])
  return <div className="zumly-canvas" id="zumly-app" style={{ width: '100%', height: '100vh' }} />
}
```

**React pitfalls:**
- Never create a Zumly instance inside a component that re-renders frequently.
  Use `useEffect` with `[]` deps and store in a ref.
- Always call `app.destroy()` in the cleanup function.
- React roots created in view functions will unmount when Zumly removes the view
  from the DOM on zoom-out, but calling `root.unmount()` explicitly in a `destroy`
  event handler is cleaner.

### Vue 3
```js
import { createApp as createVueApp, h } from 'vue'
import DetailComponent from './Detail.vue'

views: {
  detail: (ctx) => {
    const vueApp = createVueApp({
      render: () => h(DetailComponent, { id: ctx.props.id })
    })
    vueApp.mount(ctx.target)
  }
}
```

### Svelte
```js
import Detail from './Detail.svelte'

views: {
  detail: (ctx) => {
    new Detail({ target: ctx.target, props: { id: ctx.props.id } })
  }
}
```

### Shared Services via componentContext
Pass shared state through `componentContext` instead of module globals:
```js
const app = new Zumly({
  componentContext: {
    api: myApiClient,
    store: myStateStore,
    auth: authService,
  },
  views: {
    dashboard: async (ctx) => {
      const data = await ctx.context.api.getDashboard()
      return `<div class="z-view">...</div>`
    }
  }
})
```

---

## Performance Optimization

### Preloading
```js
new Zumly({
  preload: ['dashboard', 'settings'],  // Resolve and cache on init()
})
```
Preload views the user is most likely to visit first. String and URL views are cached;
function views run fresh each time regardless of preload.

Zumly also auto-prefetches on hover/focus of `.zoom-me` triggers, so explicit preload
is mainly useful for views reachable via `zoomTo()` (no trigger to hover).

### Deferred Rendering
```js
new Zumly({
  deferred: true,  // Global: all views render after zoom animation
})
// Or per trigger: data-deferred
```
When deferred, the view's content is detached before the zoom animation and re-attached
after it completes. This ensures smooth 60fps animations even with heavy DOM trees.

**Use deferred for:** views with 500+ DOM nodes, views that load heavy assets,
views that run expensive `mounted()` hooks.

### keepAlive for Lateral Navigation
```js
lateralNav: { keepAlive: true }
```
Keeps laterally-navigated views in the DOM instead of removing and re-creating them.
Use `keepAlive: 'visible'` to keep them visible (for CSS crossfade effects).

### Animation Driver Selection
- `'css'` (default): Zero JS animation overhead. Best for most apps.
- `'waapi'`: Use when you need JS control over animations. Smoother lateral transitions.
- `'none'`: Instant transitions. Use for testing and prefers-reduced-motion.
- `'anime'` / `'gsap'` / `'motion'`: Use only if your app already depends on them.

### Responsive Design
Views should use responsive CSS (%, vw/vh, flexbox, grid) rather than fixed pixel widths.
Zumly applies resize corrections automatically when the window resizes.

```css
.z-view {
  width: 100%;
  height: 100%;
  padding: clamp(16px, 4vw, 48px);
  display: grid;
  place-items: center;
}
```

---

## Common Pitfalls and Solutions

### 1. "Nothing happens when I click"
- Trigger must have class `zoom-me` AND `data-to="viewName"`
- View name in `data-to` must exactly match a key in the `views` object
- Canvas must have class `zumly-canvas`
- `init()` must be called and awaited

### 2. "View appears but has no styling"
- View root must have class `z-view`
- If using function views, return a string with `<div class="z-view">` as root
- If mounting into `ctx.target`, the target gets `.z-view` automatically

### 3. "Animation stutters on first zoom"
- Use `preload` for the most common first-zoom targets
- Use `deferred: true` for heavy views
- Avoid synchronous layout-triggering operations in `mounted()`

### 4. "UI is frozen / nothing responds"
- A driver failed to call `onComplete()`. Zumly has an 8-second safety timer that
  force-resets, but check console for driver errors.
- If using a custom driver, always use `createFinishGuard` from `zumly/driver-helpers`.

### 5. "Framework component state is lost on zoom-out"
- Expected: when you zoom out, the child view is removed from the DOM.
- Solution: lift state to `componentContext`, or use `keepAlive` for lateral views.

### 6. "Multiple Zumly instances conflict"
- Each instance must have its own canvas element with a unique selector.
- Input handlers are scoped to the canvas, so separate canvases work fine.

---

## Styling z-views

### Base Pattern
```css
.z-view {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
```

### Scrollable Content Inside a View
```css
.z-view.scrollable {
  overflow-y: auto;
}
```
Zumly will NOT intercept wheel events inside scrollable containers.

### Effects for Depth Perception
```js
transitions: {
  effects: ['blur(2px) brightness(0.8)', 'blur(6px) brightness(0.5) saturate(0.5)']
}
```
First filter applies to previous view, second to grandparent. Creates depth-of-field.

---

## Events for Analytics and Side Effects

```js
app.on('afterZoomIn', ({ viewName, zoomLevel }) => {
  analytics.track('view_entered', { view: viewName, depth: zoomLevel })
})

app.on('viewMounted', ({ viewName, node }) => {
  if (viewName === 'map') initializeMap(node.querySelector('#map-container'))
})
```

---

When helping the developer, prioritize:
1. Getting the spatial metaphor right (triggers as meaningful regions)
2. Choosing the correct view source type for their use case
3. Proper cleanup (destroy on unmount, event handler removal)
4. Performance for their specific view complexity
