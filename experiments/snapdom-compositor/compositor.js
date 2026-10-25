/**
 * Experimental Zumly plugin: composite background views with SnapDOM.
 *
 *   app.use(compositor, { snapdom, stream, depth: true, flatten: true })
 *
 * Two independent features, so each can be measured on its own:
 *
 * - depth: Zumly keeps three views in the DOM (current, previous, last) and detaches the
 *   rest, so past level 3 the outer rings of the zoom tunnel vanish. With depth on, every
 *   view that leaves the DOM is first drawn into one canvas-sized bitmap, the backdrop,
 *   which sits behind the views and moves rigidly with the last view. One layer stands for
 *   every ancestor, however deep.
 *
 * - flatten: the previous and last views are shown as bitmaps instead of live DOM while
 *   they are in the background. The view element stays laid out (geometry and sibling
 *   hit-testing still read it); its children are hidden and a canvas child shows the
 *   capture. The capture of the current view is kept ready ahead of the next zoom-in, by a
 *   snapdom stream (source: 'stream') or a one-shot capture redone when the view mutates
 *   (source: 'snapshot').
 *
 * The plugin wraps the instance's transition driver, so it works with any driver. It reads
 * Zumly internals (transitionDriver, canvas, storedViews); a real version would want a hook.
 */

const FLAT = 'z-flat'
const LAYER = 'z-flat-layer'
const BACKDROP = 'z-backdrop'

const css = `
.z-view.${FLAT} > :not(.${LAYER}) { visibility: hidden; }
.z-view > .${LAYER} { position: absolute; pointer-events: none; }
.${BACKDROP} { position: absolute; left: 0; top: 0; transform-origin: 0 0; pointer-events: none; }
`

const idle = (fn) => (typeof requestIdleCallback === 'function'
  ? requestIdleCallback(fn, { timeout: 500 })
  : setTimeout(fn, 50))

/** Element → canvas matrix for a view at a given transform/origin. */
function viewMatrix (el, transform, origin) {
  const [ox, oy] = (origin || '0 0').split(/\s+/).map(v => parseFloat(v) || 0)
  return new DOMMatrix()
    .translate(el.offsetLeft + ox, el.offsetTop + oy)
    .multiply(new DOMMatrix(transform && transform !== 'none' ? transform : undefined))
    .translate(-ox, -oy)
}

function restMatrix (el) {
  const cs = getComputedStyle(el)
  return viewMatrix(el, cs.transform, cs.transformOrigin)
}

/** Copy of a canvas (or image) as a standalone canvas. */
function cloneBitmap (src, w, h) {
  const c = document.createElement('canvas')
  c.width = w ?? src.width
  c.height = h ?? src.height
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height)
  return c
}

export function compositor (app, options = {}) {
  const {
    snapdom,
    stream,
    depth = true,
    flatten = true,
    source = stream ? 'stream' : 'snapshot',
    scale = 1,
    capture: captureOptions = {},
  } = options
  if (!snapdom) throw new Error('compositor: pass { snapdom }')

  const dpr = globalThis.devicePixelRatio || 1
  const opts = { outerTransforms: false, outerShadows: false, fast: 'auto', scale, ...captureOptions }
  const stats = { captures: 0, captureMs: [], streamFrames: 0, streamFull: 0, streamMs: 0, fallbacks: 0, backdropComposes: 0, composeMs: [] }
  app.compositorStats = stats

  if (!document.getElementById('z-compositor-css')) {
    const style = document.createElement('style')
    style.id = 'z-compositor-css'
    style.textContent = css
    document.head.append(style)
  }

  const canvas = app.canvas
  const inner = app.transitionDriver
  // view → { canvas, x, y, w, h, filtered }: its capture and where it sits in the view's own
  // CSS px (a filtered root bleeds past its box). filtered: the view's filter is baked in.
  const bitmaps = new WeakMap()
  const dirty = new WeakSet()
  let live = null // { view, stream | observer }

  // ── Captures ────────────────────────────────────────────────────────

  async function captureView (view, extra) {
    const t0 = performance.now()
    // outerTransforms: false strips translate/rotate but keeps the root's scale, so a
    // background view (scaled 4x, 16x, ...) would come out 4x, 16x larger. Scale it back.
    const m = new DOMMatrix(getComputedStyle(view).transform)
    const s = Math.hypot(m.a, m.b) || 1
    const res = await snapdom(view, { ...opts, ...extra, scale: opts.scale / s })
    const bmp = await res.toCanvas()
    stats.captures++
    stats.captureMs.push(performance.now() - t0)
    const { vbW = view.offsetWidth * s, vbH = view.offsetHeight * s, contentX = 0, contentY = 0 } = res.meta || {}
    return { canvas: bmp, x: -contentX / s, y: -contentY / s, w: vbW / s, h: vbH / s, filtered: getComputedStyle(view).filter !== 'none' }
  }

  /** Keep a fresh bitmap of the current view, ahead of the next zoom-in. */
  function watchCurrent () {
    stopWatching()
    const view = canvas.querySelector('.is-current-view')
    if (!view) return
    if (source === 'stream') {
      const t0 = performance.now()
      const s = stream(view, {
        ...opts,
        onFrame: (f) => { stats.streamFrames++; stats.streamMs += f.ms; if (f.full && f.reason !== 'start') stats.streamFull++ },
      })
      live = { view, stream: s }
      s.ready.then(() => {
        stats.captures++
        stats.captureMs.push(performance.now() - t0)
        if (live?.view === view) bitmaps.set(view, { canvas: s.canvas, x: 0, y: 0, w: view.offsetWidth, h: view.offsetHeight, filtered: false })
      })
    } else {
      const refresh = () => idle(async () => {
        if (live?.view !== view) return
        dirty.delete(view)
        const bmp = await captureView(view)
        if (live?.view === view && !dirty.has(view)) bitmaps.set(view, bmp)
      })
      const observer = new MutationObserver(() => {
        if (dirty.has(view)) return
        dirty.add(view)
        bitmaps.delete(view)
        refresh()
      })
      observer.observe(view, { subtree: true, childList: true, attributes: true, characterData: true })
      live = { view, observer }
      refresh()
    }
  }

  function stopWatching () {
    if (!live) return
    if (live.stream) {
      live.stream.stop()
      // Freeze what the stream last painted: the stream canvas is ours from here on.
      const rec = bitmaps.get(live.view)
      if (rec?.canvas === live.stream.canvas) bitmaps.set(live.view, { ...rec, canvas: cloneBitmap(live.stream.canvas) })
    }
    live.observer?.disconnect()
    live = null
  }

  // ── Flattening ──────────────────────────────────────────────────────

  function flat (view) {
    if (!view || view.classList.contains(FLAT)) return true
    const rec = bitmaps.get(view)
    // A baked filter would apply twice under the view's own CSS filter.
    if (!rec || rec.filtered) { stats.fallbacks++; return false }
    const layer = rec.canvas.isConnected ? cloneBitmap(rec.canvas) : rec.canvas
    layer.classList.add(LAYER)
    Object.assign(layer.style, { left: rec.x + 'px', top: rec.y + 'px', width: rec.w + 'px', height: rec.h + 'px' })
    view.append(layer)
    view.classList.add(FLAT)
    return true
  }

  function unflat (view) {
    if (!view) return
    view.classList.remove(FLAT)
    view.querySelectorAll(`:scope > .${LAYER}`).forEach(l => l.remove())
  }

  /** Ensure the view has a bitmap (used for the last view, captured lazily at rest). */
  async function ensureBitmap (view) {
    if (!view || bitmaps.has(view)) return
    bitmaps.set(view, await captureView(view))
  }

  // ── Depth backdrop ──────────────────────────────────────────────────
  //
  // stack[i] = { bitmap, rest } for the backdrop at zoom level i (rest = its matrix at rest).
  // pending = what the backdrop becomes on the next zoom-in: the current last view drawn at
  // its rest matrix over the current backdrop, in canvas space.

  const backdropEl = document.createElement('canvas')
  backdropEl.className = BACKDROP
  let backdrop = null // { bitmap, rest: DOMMatrix at rest, frame } currently shown
  const stack = []
  let pending = null
  let pendingFor = null

  function sizeBackdrop () {
    const r = canvas.getBoundingClientRect()
    backdropEl.style.width = r.width + 'px'
    backdropEl.style.height = r.height + 'px'
    return { w: Math.round(r.width * dpr), h: Math.round(r.height * dpr), r }
  }

  function showBackdrop (b, matrix) {
    backdrop = b
    if (!b) { backdropEl.remove(); return }
    const { w, h } = sizeBackdrop()
    if (backdropEl.width !== w || backdropEl.height !== h) { backdropEl.width = w; backdropEl.height = h }
    const ctx = backdropEl.getContext('2d')
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(b.bitmap, 0, 0)
    backdropEl.style.transform = (matrix || b.rest).toString()
    canvas.prepend(backdropEl)
  }

  async function preparePending () {
    if (!depth) return
    const last = canvas.querySelector('.is-last-view')
    const level = app.storedViews.length
    pending = null
    pendingFor = level
    if (!last) return
    await ensureBitmap(last)
    if (pendingFor !== level || !last.isConnected) return
    const t0 = performance.now()
    const { w, h } = sizeBackdrop()
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')
    ctx.scale(dpr, dpr)
    if (backdrop) {
      ctx.save()
      const m = backdrop.rest
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f)
      ctx.drawImage(backdropEl, 0, 0, w / dpr, h / dpr)
      ctx.restore()
    }
    const rec = withFilter(bitmaps.get(last), getComputedStyle(last).filter)
    const m = restMatrix(last)
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f)
    ctx.drawImage(rec.canvas, rec.x, rec.y, rec.w, rec.h)
    stats.backdropComposes++
    stats.composeMs.push(performance.now() - t0)
    pending = { bitmap: out }
  }

  /** The record with the view's CSS filter baked in, in the view's local space (as CSS does). */
  function withFilter (rec, filter) {
    if (rec.filtered || !filter || filter === 'none') return rec
    const k = rec.canvas.width / rec.w
    const blur = Math.max(0, ...[...filter.matchAll(/blur\(([\d.]+)px\)/g)].map(x => +x[1]))
    const pad = Math.ceil(blur * 3)
    const out = document.createElement('canvas')
    out.width = Math.round((rec.w + 2 * pad) * k)
    out.height = Math.round((rec.h + 2 * pad) * k)
    const ctx = out.getContext('2d')
    // Canvas filters work in canvas pixels; CSS blur radii are in the view's CSS px.
    ctx.filter = filter.replace(/blur\(([\d.]+)px\)/g, (_, r) => `blur(${r * k}px)`)
    ctx.drawImage(rec.canvas, pad * k, pad * k, rec.w * k, rec.h * k)
    return { canvas: out, x: rec.x - pad, y: rec.y - pad, w: rec.w + 2 * pad, h: rec.h + 2 * pad, filtered: true }
  }

  function animate (el, from, to, duration, ease) {
    const ms = parseFloat(duration) * (/ms$/.test(duration) ? 1 : 1000)
    return el.animate([{ transform: from.toString() }, { transform: to.toString() }],
      { duration: ms || 0, easing: ease || 'linear', fill: 'forwards' })
  }

  // ── Driver wrapper ──────────────────────────────────────────────────

  function runTransition (spec, onComplete) {
    const { type, currentView, previousView, lastView, currentStage, duration, ease } = spec
    let backdropAnim = null

    if (type === 'zoomIn') {
      stopWatching()
      if (flatten) {
        flat(previousView)
        flat(lastView)
      }
      if (depth && lastView) {
        const v = currentStage.views[2]
        const delta = viewMatrix(lastView, v.forwardState.transform, v.forwardState.origin)
          .multiply(viewMatrix(lastView, v.backwardState.transform, v.backwardState.origin).inverse())
        const level = app.storedViews.length
        // pending was built at level - 1; a zoom that arrives before it is ready keeps the
        // old backdrop (the last view's ring is lost for this level).
        // backdrop.frame maps the backdrop below into this bitmap's space (zoomOut needs it).
        if (pending && pendingFor === level - 1) {
          stack.push(backdrop)
          showBackdrop({ bitmap: pending.bitmap, rest: delta, frame: backdrop ? backdrop.rest : null }, new DOMMatrix())
          backdropAnim = animate(backdropEl, new DOMMatrix(), delta, duration, ease)
        } else if (backdrop) {
          stats.fallbacks++
          stack.push(backdrop)
          const from = backdrop.rest
          backdrop = { bitmap: backdrop.bitmap, rest: delta.multiply(from), frame: new DOMMatrix() }
          backdropAnim = animate(backdropEl, from, backdrop.rest, duration, ease)
        } else {
          stack.push(null)
        }
        pending = null
      }
    }

    if (type === 'zoomOut') {
      stopWatching()
      if (flatten) flat(lastView)
      // previousView becomes current: keep its bitmap during the motion, go live at the end.
      if (flatten && !previousView.classList.contains(FLAT)) flat(previousView)
      if (depth) {
        const prev = stack.pop()
        if (backdrop) {
          const now = new DOMMatrix(backdropEl.style.transform || undefined)
          if (prev) {
            // Back to the backdrop of the level below, animated from where it sits inside
            // the bitmap being dropped.
            const from = now.multiply(backdrop.frame)
            showBackdrop(prev, from)
            backdropAnim = animate(backdropEl, from, prev.rest, duration, ease)
          } else {
            // The bitmap fades out: the view it stood for is back in the DOM.
            const fade = backdropEl.animate([{ opacity: 1 }, { opacity: 0 }],
              { duration: parseFloat(duration) * (/ms$/.test(duration) ? 1 : 1000), fill: 'forwards' })
            fade.finished.then(() => { fade.cancel(); showBackdrop(null) }, () => {})
          }
        }
        // The detached view came back in front of the backdrop: put the backdrop behind it.
        if (backdropEl.isConnected) canvas.prepend(backdropEl)
        pending = null
      }
    }

    if (type === 'lateral') stopWatching()

    inner.runTransition(spec, () => {
      if (backdropAnim && backdrop) {
        backdropAnim.cancel()
        backdropEl.style.transform = backdrop.rest.toString()
      }
      const current = canvas.querySelector('.is-current-view')
      unflat(current)
      if (flatten) {
        flat(canvas.querySelector('.is-previous-view'))
        flat(canvas.querySelector('.is-last-view'))
      }
      onComplete()
      idle(async () => {
        watchCurrent()
        preparePending()
      })
    })
  }

  app.transitionDriver = { runTransition }
  app.on('destroy', () => { stopWatching(); backdropEl.remove() })
  idle(watchCurrent)

  return { stats, stop: stopWatching }
}

export default { install: compositor }
