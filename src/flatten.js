/**
 * flatten: background views shown as a still photo while they are behind.
 *
 * Scaling and blurring a view with thousands of nodes, or with backdrop-filter, costs a lot
 * every frame. With the `flatten` option, Zumly keeps a photo of the current view with
 * SnapDOM while the user is in it. When the view moves behind, its content is hidden (it
 * keeps its layout) and a canvas with the photo stands in for it. The view element itself
 * still moves, takes the effects filter and answers hit-tests, so geometry, sibling detection
 * and every driver work as before. Back in front, the real view returns.
 *
 * The photo must show the view as it is when the zoom starts, or the zoom opens on old
 * content. With SnapDOM's stream plugin the photo follows the view, repainting only what
 * changed; a stream that costs too much (transparent animations force full frames) is turned
 * off and that view moves as itself. Without stream there is one photo, taken again once the
 * view stops changing, and a view that changed after its photo moves as itself.
 *
 * SnapDOM is not a dependency: it is passed in (`flatten: { snapdom, stream }`) or read from
 * the global `snapdom` of its script build.
 */

const FLAT = 'z-flat'
const LAYER = 'z-flat-layer'
/** Input, and the view itself, must be this quiet (ms) before a capture starts; also right after arriving. */
const QUIET_MS = 300
/** Repaints per second of a stream: the photo is at most this old when a zoom starts. */
const STREAM_FPS = 10
/** A stream may use at most this share of the main thread, over the last STREAM_WINDOW ms. */
const STREAM_BUDGET = 0.5
const STREAM_WINDOW = 2000
/** A full frame slower than this means the device cannot keep the photo current. */
const STREAM_SLOW_MS = 250
/** Without stream, captures use at most 1/DUTY of the main thread. */
const DUTY = 10
/** Without stream, a view that changed during this many photos in a row is left live. */
const MAX_STALE = 3
/** Crossfade from the photo to the real view when a view comes back to the front. */
const FADE_MS = 160
const INPUTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel']

/**
 * SnapDOM options for a photo. fast: false pauses about every frame, so taps and drags still
 * answer. Outlines are left out (a focus ring would stay frozen); as a function, the rule
 * also turns off SnapDOM's memo, whose watchers redo a capture in one task when anything on
 * the page changes while it pauses, which in a live UI is always.
 */
const CAPTURE = {
  outerTransforms: false,
  outerShadows: false,
  fast: false,
  excludeStyleProps: prop => prop.startsWith('outline')
}

const now = () => performance.now()
const requestIdle = (fn) => typeof requestIdleCallback === 'function'
  ? { idle: requestIdleCallback(fn, { timeout: 1000 }) }
  : { timer: setTimeout(fn, 50) }
const cancelIdle = (handle) => {
  if (!handle) return
  if (handle.idle != null) cancelIdleCallback(handle.idle)
  else clearTimeout(handle.timer)
}

/** Zumly's own changes to a view, which do not make its photo stale. */
function isOwnMutation (record, view) {
  if (record.type === 'attributes') {
    if (record.target === view) return true
    if (record.target.classList?.contains('zoom-me') && (record.attributeName === 'class' || record.attributeName === 'style')) return true
  }
  if (record.type === 'childList') {
    const nodes = [...record.addedNodes, ...record.removedNodes]
    if (nodes.length && nodes.every(node => node.classList?.contains(LAYER))) return true
  }
  return false
}

/** A canvas of its own with the same pixels: a stream keeps drawing into its canvas. */
function copyCanvas (source) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  canvas.getContext('2d')?.drawImage(source, 0, 0)
  return canvas
}

export class Flattener {
  /**
   * @param {object} app - The Zumly instance
   * @param {{ snapdom?: Function, stream?: Function, minNodes: number, scale: number }} options
   */
  constructor (app, options) {
    this.app = app
    this.canvas = app.canvas
    this.snapdom = options.snapdom
    this.stream = options.stream
    this.minNodes = options.minNodes
    this.scale = options.scale
    /** view → { canvas, width, height, streaming }: the view as it was in front. */
    this.photos = new WeakMap()
    /** Views that changed after their photo was taken (without stream). */
    this.stale = new WeakSet()
    /** Views whose stream cost too much, or that never hold still, this visit: they move as themselves. */
    this.live = new WeakSet()
    /** Photos in a row of the current view that it outdated while they were taken (without stream). */
    this.misses = 0
    /** The stream following the current view: { view, handle, frames }. */
    this.streaming = null
    this.timer = null
    this.idle = null
    this.watched = null
    this.fades = new Set()
    this.lastInput = -Infinity
    /** Last change in the current view (without stream). */
    this.lastChange = -Infinity
    this.settledAt = 0
    this.nextCapture = 0
    this.destroyed = false
    this.observer = typeof MutationObserver === 'function'
      ? new MutationObserver(records => this._onMutation(records))
      : null
    this._onInput = (event) => {
      if (event.type === 'pointermove' && !event.buttons) return
      this.lastInput = now()
    }
    for (const type of INPUTS) window.addEventListener(type, this._onInput, { capture: true, passive: true })
  }

  // ─── Hooks called by the engine ──────────────────────────────────

  /**
   * A transition is about to run: show photos for the views that grow behind. On a zoom-out
   * the view that shrinks away stays live: shrinking is cheap, and hiding its content would
   * restyle it right before the first frame. The view coming back stays a photo until the
   * motion ends.
   */
  before (spec) {
    if (this.destroyed) return
    this._pause()
    if (spec.type === 'zoomIn') {
      this._flat(spec.previousView)
      this._flat(spec.lastView)
    } else if (spec.type === 'lateral') {
      this._unflat(spec.currentView)
      this._flat(spec.previousView)
    }
  }

  /** A followed zoom-out gesture starts: no photo is taken while the finger moves. */
  beginGesture () {
    if (this.destroyed) return
    this._pause()
  }

  /** Navigation finished (or a gesture was put back): views behind become photos. */
  settle () {
    if (this.destroyed || !this.canvas) return
    this.settledAt = now()
    const current = this._current()
    for (const view of this.canvas.children) {
      if (!view.classList.contains('z-view')) continue
      if (view.classList.contains('is-previous-view') || view.classList.contains('is-last-view')) this._flat(view)
      else this._unflat(view, view === current)
    }
    if (!current) return
    // A photo is of one visit: a view seen again gets a fresh one, and a fresh chance.
    this.photos.delete(current)
    this.stale.delete(current)
    this.live.delete(current)
    this.misses = 0
    this.lastChange = -Infinity
    this._watch(current)
    this._schedule()
  }

  /** The canvas was resized: photos of views whose box changed no longer fit. */
  resized () {
    if (this.destroyed || !this.canvas) return
    for (const view of this.canvas.children) {
      if (!view.classList.contains('z-view')) continue
      const photo = this.photos.get(view)
      if (photo && !this._fits(photo, view)) {
        this._unflat(view)
        this.photos.delete(view)
      }
    }
    const current = this._current()
    if (current && !this.app.blockEvents && !this.streaming && !this.photos.has(current)) this._schedule()
  }

  destroy () {
    if (this.destroyed) return
    this.destroyed = true
    this._pause()
    this.observer = null
    for (const type of INPUTS) window.removeEventListener(type, this._onInput, { capture: true })
    if (this.canvas) for (const view of this.canvas.children) this._unflat(view)
    this.photos = new WeakMap()
  }

  // ─── Photos ──────────────────────────────────────────────────────

  _current () {
    return this.canvas?.querySelector(':scope > .z-view.is-current-view') || null
  }

  /** Stop watching, streaming and capturing: the views are about to move. */
  _pause () {
    this._cancelCapture()
    this._stopStream()
    this._unwatch()
    this._finishFades()
  }

  /** Whether a photo pays off: heavy views (many nodes, backdrop-filter), unless the view opts out. */
  _eligible (view) {
    const flag = view.dataset.flatten
    if (flag === 'false') return false
    if (flag === 'true') return true
    // SnapDOM can only draw a placeholder for an iframe.
    if (view.querySelector('iframe')) return false
    const nodes = view.getElementsByTagName('*')
    if (nodes.length >= this.minNodes) return true
    for (const node of nodes) {
      const style = getComputedStyle(node)
      const backdrop = style.backdropFilter || style.webkitBackdropFilter
      if (backdrop && backdrop !== 'none') return true
    }
    return false
  }

  /** Start the photo of the current view once input has been quiet for a while, at idle. */
  _schedule () {
    this._cancelCapture()
    const view = this._current()
    if (!view || this.destroyed) return
    const at = Math.max(this.settledAt + QUIET_MS, this.lastInput + QUIET_MS, this.lastChange + QUIET_MS, this.nextCapture)
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.destroyed || view !== this._current()) return
      const busy = now() - Math.max(this.lastInput, this.lastChange) < QUIET_MS
      if (busy || this.app.blockEvents || this.app._scrub) {
        this._schedule()
        return
      }
      this.idle = requestIdle(() => {
        this.idle = null
        if (this.stream) this._startStream(view)
        else this._capture(view)
      })
    }, Math.max(0, at - now()))
  }

  _cancelCapture () {
    clearTimeout(this.timer)
    this.timer = null
    cancelIdle(this.idle)
    this.idle = null
  }

  /** Never start a capture during a transition or a gesture, or for a view that does not pay off. */
  _canCapture (view) {
    return !this.destroyed && !this.app.blockEvents && !this.app._scrub && view === this._current() &&
      !this.live.has(view) && this._eligible(view)
  }

  /** The SnapDOM scale for a view: outerTransforms: false keeps a root scale, so undo it. */
  _scaleFor (view) {
    const matrix = new DOMMatrix(getComputedStyle(view).transform)
    return this.scale / (Math.hypot(matrix.a, matrix.b) || 1)
  }

  /** Keep the photo of the current view current with SnapDOM's stream plugin. */
  _startStream (view) {
    if (!this._canCapture(view) || this.streaming) return
    const state = { view, frames: [], handle: null }
    const off = (why) => {
      this.app.notify(`flatten: view "${view.dataset.viewName}" stays live (${why}).`, 'info')
      this.live.add(view)
      this.photos.delete(view)
      this._stopStream()
    }
    try {
      state.handle = this.stream(view, {
        ...CAPTURE,
        scale: this._scaleFor(view),
        fps: STREAM_FPS,
        // A spinner's angle does not matter in a photo behind; following it would make every
        // frame a full one when it spins over nothing opaque.
        animations: false,
        onFrame: (frame) => {
          if (this.streaming !== state) return
          const t = now()
          if (frame.reason !== 'start') state.frames.push({ t, ms: frame.ms })
          state.frames = state.frames.filter(f => t - f.t < STREAM_WINDOW)
          const busy = state.frames.reduce((sum, f) => sum + f.ms, 0)
          if (frame.full && frame.reason !== 'start' && frame.ms > STREAM_SLOW_MS) off(`full frames take ${Math.round(frame.ms)} ms`)
          else if (busy > STREAM_BUDGET * STREAM_WINDOW) off('keeping its photo current costs too much')
        }
      })
    } catch (error) {
      this.app.notify(`flatten: no stream of view "${view.dataset.viewName}": ${error.message}`, 'info')
      this.live.add(view)
      return
    }
    this.streaming = state
    state.handle.ready.then(() => {
      if (this.streaming !== state) return
      this.photos.set(view, { canvas: state.handle.canvas, width: view.offsetWidth, height: view.offsetHeight, streaming: true })
    }, (error) => {
      if (this.streaming === state) off(error.message)
    })
  }

  /** Stop the stream; its last frame becomes the photo, in a canvas of its own. */
  _stopStream () {
    const state = this.streaming
    if (!state) return
    this.streaming = null
    state.handle?.stop()
    const photo = this.photos.get(state.view)
    if (photo?.streaming) this.photos.set(state.view, { ...photo, canvas: copyCanvas(photo.canvas), streaming: false })
  }

  /** One photo of the current view (without stream). */
  async _capture (view) {
    if (!this._canCapture(view)) return
    if (this.photos.has(view) && !this.stale.has(view)) return
    const started = now()
    this.stale.delete(view)
    let photo = null
    try {
      const result = await this.snapdom(view, { ...CAPTURE, scale: this._scaleFor(view) })
      const canvas = await result.toCanvas()
      photo = { canvas, width: view.offsetWidth, height: view.offsetHeight, streaming: false }
    } catch (error) {
      this.app.notify(`flatten: no photo of view "${view.dataset.viewName}": ${error.message}`, 'info')
    }
    this.nextCapture = now() + (now() - started) * DUTY
    if (this.destroyed || !photo || !view.isConnected) return
    this.photos.set(view, photo)
    if (!this.app.blockEvents && !this.app._scrub &&
      (view.classList.contains('is-previous-view') || view.classList.contains('is-last-view'))) {
      // The user moved on while the photo was being taken: use it now.
      this._flat(view)
    } else if (view === this._current() && this.stale.has(view)) {
      // It changed while the photo was being taken: try again once it settles, or give up on
      // a view that never holds still (live data).
      if (++this.misses >= MAX_STALE) this.live.add(view)
      else this._schedule()
    } else {
      this.misses = 0
    }
  }

  _fits (photo, view) {
    return photo.width === view.offsetWidth && photo.height === view.offsetHeight
  }

  /** Show the photo in place of the view's content, when there is one that still shows it. */
  _flat (view) {
    if (!view || view.classList.contains(FLAT) || view.dataset.flatten === 'false') return
    const photo = this.photos.get(view)
    if (!photo || photo.streaming || this.stale.has(view) || !this._fits(photo, view)) return
    const layer = photo.canvas
    layer.classList.add(LAYER)
    layer.setAttribute('aria-hidden', 'true')
    // Absolute children start inside the border; the photo covers the border box.
    Object.assign(layer.style, {
      left: -view.clientLeft + 'px',
      top: -view.clientTop + 'px',
      width: photo.width + 'px',
      height: photo.height + 'px',
      opacity: ''
    })
    view.append(layer)
    view.classList.add(FLAT)
  }

  /** Bring the real content back; with fade, the photo crossfades out over it. */
  _unflat (view, fade = false) {
    if (!view?.classList?.contains(FLAT)) return
    view.classList.remove(FLAT)
    const layer = [...view.children].find(child => child.classList.contains(LAYER))
    if (!layer) return
    if (!fade || typeof layer.animate !== 'function') {
      layer.remove()
      return
    }
    const animation = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out', fill: 'forwards' })
    const done = () => {
      this.fades.delete(animation)
      layer.remove()
    }
    animation.addEventListener('finish', done)
    animation.addEventListener('cancel', done)
    this.fades.add(animation)
  }

  _finishFades () {
    for (const animation of [...this.fades]) animation.cancel()
    this.fades.clear()
  }

  // ─── Changes in the current view (without stream) ────────────────

  _watch (view) {
    this._unwatch()
    this.watched = view
    if (!this.stream) this.observer?.observe(view, { subtree: true, childList: true, attributes: true, characterData: true })
  }

  _unwatch () {
    this.observer?.disconnect()
    this.watched = null
  }

  _onMutation (records) {
    const view = this.watched
    if (!view || this.destroyed) return
    if (records.every(record => isOwnMutation(record, view))) return
    // The photo no longer shows the view: it is not used until a new one is taken, once the
    // view holds still.
    this.stale.add(view)
    this.lastChange = now()
    if (!this.live.has(view) && !this.timer && !this.idle) this._schedule()
  }
}

/**
 * Start flattening for an instance, or explain why it cannot.
 * @returns {Flattener|null}
 */
export function createFlattener (app, options) {
  const snapdom = options.snapdom || globalThis.snapdom
  const stream = options.stream || null
  if (typeof snapdom !== 'function' && typeof stream !== 'function') {
    app.notify('flatten needs SnapDOM: pass flatten: { snapdom, stream }, or load SnapDOM before Zumly. Views stay live.', 'warn')
    return null
  }
  if (typeof DOMMatrix !== 'function') return null
  return new Flattener(app, { ...options, snapdom, stream })
}
