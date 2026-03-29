# Geometry Computation Optimization

## Technical Report: Eliminating Forced Reflows in Zoom Transitions

### Context

Zumly is a Zoomable User Interface (ZUI) engine that manages stacked views at different zoom depths. When the user clicks a `.zoom-me` trigger, the engine computes CSS transforms for up to three view layers — **currentView** (incoming), **previousView** (zooming out), and **lastView** (deepest background) — so that each view animates smoothly to its target position.

These transforms must be geometrically precise: the incoming view must appear to emerge from the trigger element, the previous view must zoom out centered on the trigger, and the last view must maintain spatial coherence with the previous view's zoomed-out position. Getting any of these coordinates wrong breaks the illusion of a continuous spatial canvas.

---

### The Original Approach

The geometry computation relied on a **read-write-read** pattern with the DOM. To compute where each view should end up, the engine needed to know where child elements land *after* a parent view is transformed. The only way to get this information was to:

1. Temporarily apply a CSS transform to the parent
2. Read the child's `getBoundingClientRect()` (forcing the browser to recompute layout)
3. Revert the transform

This had to be done multiple times because each view layer's target position depends on measurements from the previous layer's transformed state.

#### Reflow Sequence (3-level zoom)

```
READ    cc = currentView.getBoundingClientRect()           ← Reflow 1
WRITE   currentView.style.transform = startTransform
WRITE   previousView class swap
READ    previousViewRect = previousView.getBoundingClientRect()  ← Reflow 2
WRITE   previousView.style.transformOrigin = origin
WRITE   previousView.style.transform = endTransform       ← Temporary mutation
READ    triggerRect = trigger.getBoundingClientRect()       ← Reflow 3
READ    prevRectAtEnd = previousView.getBoundingClientRect()  ← Reflow 4
WRITE   lastView.style.transform = intermediate            ← Temporary mutation
READ    zoomedElRect = lastZoomedEl.getBoundingClientRect()   ← Reflow 5
WRITE   lastView.style.transform = restore
WRITE   previousView.style.transform = restore
READ    prevRectAtBase = previousView.getBoundingClientRect()  ← Reflow 6
```

**Total: 6 synchronous layout recalculations** before the animation starts.

Each `getBoundingClientRect()` call after a DOM write forces the browser to synchronously recompute the layout of the affected subtree. With complex views containing hundreds of DOM nodes, each reflow can take 20–50ms, producing **120–300ms of main-thread blocking** before any animation frame is painted.

#### Why This Causes Stuttering on Desktop

The bottleneck is proportional to DOM complexity, not screen resolution. A view with 500+ nodes (typical for data-rich dashboards, card grids, or nested components) triggers expensive style recalculation and layout on each forced reflow. The interleaved read-write-read pattern defeats the browser's optimization of batching layout work, because each read invalidates the pending write queue.

On desktop browsers, this manifests as a visible pause between the click and the start of the zoom animation. On successive zooms (2+ levels), the problem compounds because both previousView and lastView carry complex subtrees.

---

### The Optimization: Mathematical Transform Inversion

The key insight is that all the intermediate `getBoundingClientRect()` calls answer the same fundamental question:

> *Where does a child element end up when its parent's CSS transform changes?*

This can be answered with pure math if we understand the CSS transform model:

#### CSS Transform Model

When a parent element has `transform: translate(tx, ty) scale(s)` with `transform-origin: ox oy`, the browser computes screen positions as:

```
screen_pos = layout_pos + origin + translate + scale × (layout_pos - layout_pos - origin)
```

More precisely, for a point at `layout_pos` relative to the viewport:

```
screen_x = layout_x + ox + tx + s × (layout_x - parent_layout_x - ox)
```

The challenge is that `getBoundingClientRect()` returns *screen* coordinates (after transform), not *layout* coordinates (before transform). And in a ZUI, views already carry transforms from prior zoom levels.

#### The Solution: Inverse-then-Forward Computation

`computeChildRectAfterParentTransformChange()` solves this in three steps:

**Step 1 — Recover the layout box** from the parent's current screen rect and its known old transform:

```javascript
// Invert: screen → layout
layoutX = parentScreenX - oldOrigin.x × (1 - oldScale) - oldTx
layoutY = parentScreenY - oldOrigin.y × (1 - oldScale) - oldTy
```

**Step 2 — Recover the child's layout position** from its current screen rect using the same inverse:

```javascript
childLayoutX = layoutX + oldOrigin.x + (childScreenX - layoutX - oldOrigin.x - oldTx) / oldScale
```

**Step 3 — Apply the new transform** to get the child's new screen position:

```javascript
newScreenX = layoutX + newOrigin.x + newTx + newScale × (childLayoutX - layoutX - newOrigin.x)
```

This works regardless of what the old transform was — identity (first zoom), a prior zoom's `translate + scale` (second zoom), or any accumulated state (deeper zooms).

#### New Reflow Sequence

```
WRITE   previousView class swap
WRITE   lastView class swap
READ    cc = currentView.getBoundingClientRect()           ┐
READ    previousViewRect = previousView.getBoundingClientRect()  │ Single
READ    lastViewRect = lastView.getBoundingClientRect()          │ batched
READ    zoomedElRect = lastZoomedEl.getBoundingClientRect()      ┘ reflow

COMPUTE triggerRectAfterTransform = math(triggerRect, prevOld → prevNew)
COMPUTE prevRectAtEnd = math(previousViewRect, prevOld → prevNew)
COMPUTE zoomedElRectAfterIntermediate = math(zoomedElRect, lastOld → lastIntermediate)
COMPUTE lastViewEndTransform = f(above results)

WRITE   currentView.style.transform = startTransform
WRITE   previousView.style.transformOrigin = newOrigin
```

**Total: 1 batched reflow.** All reads happen before any writes, so the browser computes layout exactly once.

---

### Performance Impact

| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| First zoom (2 views) | 4 reflows | 1 reflow | 75% |
| Second+ zoom (3 views) | 6 reflows | 1 reflow | 83% |
| Estimated blocking time (500-node views) | 120–300ms | 20–50ms | ~80% |

The improvement is most significant on deeper zoom levels and with complex views, which is exactly where users experience stuttering.

### Architectural Notes

- All geometry functions remain pure: they accept plain numbers and return plain objects. No DOM access.
- `parseOrigin()` and `parseTranslateScale()` extract numeric components from CSS transform strings produced by the engine itself, so the format is always predictable (`translate(Xpx, Ypx) scale(S)`).
- The helper covers the general case of changing both origin and transform simultaneously, which happens when previousView transitions from its current state to the zoom-out position.
- The existing rollback mechanism in the `catch` block still works correctly: since no transforms are applied until the write phase, an error during computation leaves the DOM untouched except for class swaps (which the rollback already handles).
