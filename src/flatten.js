/**
 * flatten: background views shown as a still photo while they are behind.
 *
 * Scaling and blurring a view with thousands of nodes, or with backdrop-filter, costs a lot
 * every frame. With the `flatten` option, Zumly takes a photo of the current view with
 * SnapDOM while the user is still in it, at idle. When the view moves behind, its content is
 * hidden (it keeps its layout) and a canvas with the photo stands in for it. The view element
 * itself still moves, takes the effects filter and answers hit-tests, so geometry, sibling
 * detection and every driver work as before. Back in front, the real view returns.
 *
 * SnapDOM is not a dependency: it is passed in (`flatten: { snapdom }`) or read from the
 * global `snapdom` of its script build.
 */

const FLAT = 'z-flat'
const LAYER = 'z-flat-layer'
/** Input must be this quiet (ms) before a capture starts, also right after arriving. */
const QUIET_MS = 300
/** A change this soon (ms) after a touch inside the view is the user's own. */
const TOUCH_MS = 1000
/** With refresh on, captures use at most 1/DUTY of the main thread. */
const DUTY = 10
/** Crossfade from the photo to the real view when a view comes back to the front. */
const FADE_MS = 160
const INPUTS = ['pointerdown', 'pointermove', 'keydown', 'touchstart', 'wheel']

/**
 * SnapDOM options for a photo. fast: false pauses about every frame, so taps and drags right
 * after arriving still answer. Outlines are left out (a focus ring would stay frozen); as a
 * function, the rule also turns off SnapDOM's memo, whose watchers redo a capture in one task
 * when anything on the page changes while it pauses, which in a live UI is always.
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

export class Flattener {
  /**
   * @param {object} app - The Zumly instance
   * @param {{ snapdom: Function, minNodes: number, scale: number, refresh: number|false }} options
   *   refresh: also follow changes nobody made by hand (live data), photographing again at
   *   most every `refresh` ms. With false, the photo taken on arrival stays until the user
   *   changes something in the view.
   */
  constructor (app, options) {
    this.app = app
    this.canvas = app.canvas
    this.snapdom = options.snapdom
    this.minNodes = options.minNodes
    this.scale = options.scale
    this.refresh = options.refresh
    /**
     * view → { canvas, width, height, at, outdated }: the view as it was in front. outdated:
     * the user changed it afterwards, so the photo would show the old state.
     */
    this.photos = new WeakMap()
    /** Views that changed after their photo was taken (what refresh follows). */
    this.stale = new WeakSet()
    this.timer = null
    this.idle = null
    this.watched = null
    this.fades = new Set()
    this.lastInput = -Infinity
    /** Last input inside the current view that was not a navigation (a toggle, a drag). */
    this.lastTouch = -Infinity
    /** Last change the user made by hand in the current view. */
    this.touchedAt = -Infinity
    this.settledAt = 0
    this.nextCapture = 0
    this.destroyed = false
    this.observer = typeof MutationObserver === 'function'
      ? new MutationObserver(records => this._onMutation(records))
      : null
    this._onInput = (event) => {
      if (event.type === 'pointermove' && !event.buttons) return
      this.lastInput = now()
      if (event.type === 'wheel') return
      const view = this.watched
      const target = event.target
      if (view && target instanceof Node && view.contains(target) && !target.closest?.('.zoom-me')) {
        this.lastTouch = this.lastInput
      }
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
    // A photo is of one visit: a view seen again gets a fresh one.
    this.photos.delete(current)
    this.stale.delete(current)
    this.touchedAt = -Infinity
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
    if (this._current() && !this.app.blockEvents) this._schedule()
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

  /** Stop watching and capturing: the views are about to move. */
  _pause () {
    this._cancelCapture()
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

  /** Whether the current view needs a (new) photo. */
  _wantsPhoto (view) {
    const photo = this.photos.get(view)
    return !photo || photo.outdated || (this.refresh !== false && this.stale.has(view))
  }

  /** Take a photo of the current view once input has been quiet for a while, at idle. */
  _schedule () {
    this._cancelCapture()
    const view = this._current()
    if (!view || this.destroyed) return
    const at = Math.max(this.settledAt + QUIET_MS, this.lastInput + QUIET_MS, this.nextCapture)
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.destroyed || view !== this._current()) return
      if (now() - this.lastInput < QUIET_MS || this.app.blockEvents || this.app._scrub) {
        this._schedule()
        return
      }
      this.idle = requestIdle(() => {
        this.idle = null
        this._capture(view)
      })
    }, Math.max(0, at - now()))
  }

  _cancelCapture () {
    clearTimeout(this.timer)
    this.timer = null
    cancelIdle(this.idle)
    this.idle = null
  }

  async _capture (view) {
    // Never start one during a transition or a gesture.
    if (this.destroyed || this.app.blockEvents || this.app._scrub || view !== this._current()) return
    if (!this._wantsPhoto(view) || !this._eligible(view)) return
    const started = now()
    this.stale.delete(view)
    let photo = null
    try {
      // outerTransforms: false drops the view's translate but keeps a scale: undo it.
      const matrix = new DOMMatrix(getComputedStyle(view).transform)
      const scale = Math.hypot(matrix.a, matrix.b) || 1
      const result = await this.snapdom(view, { ...CAPTURE, scale: this.scale / scale })
      const canvas = await result.toCanvas()
      photo ={ canvas, width: view.offsetWidth, height: view.offsetHeight, at: started, outdated: false }
    } catch (error) {
      this.app.notify(`flatten: no photo of view "${view.dataset.viewName}": ${error.message}`, 'info')
    }
    this.nextCapture = now() + (this.refresh === false ? 0 : Math.max(this.refresh, (now() - started) * DUTY))
    if (this.destroyed || !photo || !view.isConnected) return
    // The user changed the view while the photo was being taken.
    photo.outdated = this.touchedAt > started
    this.photos.set(view, photo)
    if (!this.app.blockEvents && !this.app._scrub &&
      (view.classList.contains('is-previous-view') || view.classList.contains('is-last-view'))) {
      // The user moved on while the photo was being taken: use it now.
      this._flat(view)
    } else if (view === this._current() && this._wantsPhoto(view)) {
      this._schedule()
    }
  }

  _fits (photo, view) {
    return photo.width === view.offsetWidth && photo.height === view.offsetHeight
  }

  /** Show the photo in place of the view's content, when there is one that still fits. */
  _flat (view) {
    if (!view || view.classList.contains(FLAT) || view.dataset.flatten === 'false') return
    const photo = this.photos.get(view)
    if (!photo || photo.outdated || !this._fits(photo, view)) return
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

  // ─── Changes in the current view ─────────────────────────────────

  _watch (view) {
    this._unwatch()
    this.watched = view
    this.observer?.observe(view, { subtree: true, childList: true, attributes: true, characterData: true })
  }

  _unwatch () {
    this.observer?.disconnect()
    this.watched = null
  }

  _onMutation (records) {
    const view = this.watched
    if (!view || this.destroyed) return
    if (records.every(record => isOwnMutation(record, view))) return
    this.stale.add(view)
    if (now() - this.lastTouch < TOUCH_MS) {
      // The user's own change (a toggle, a drag): the photo would show the old state.
      this.touchedAt = now()
      const photo = this.photos.get(view)
      if (photo) photo.outdated = true
    }
    if (this._wantsPhoto(view) && !this.timer && !this.idle) this._schedule()
  }
}

/**
 * Start flattening for an instance, or explain why it cannot.
 * @returns {Flattener|null}
 */
export function createFlattener (app, options) {
  const snapdom = options.snapdom || globalThis.snapdom
  if (typeof snapdom !== 'function') {
    app.notify('flatten needs SnapDOM: pass flatten: { snapdom }, or load SnapDOM before Zumly. Views stay live.', 'warn')
    return null
  }
  if (typeof DOMMatrix !== 'function') return null
  return new Flattener(app, { ...options, snapdom })
}
