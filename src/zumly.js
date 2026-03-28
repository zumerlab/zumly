import { prepareAndInsertView, notification, checkParameters } from './utils.js'
import {
  computeCoverScale,
  computeCurrentViewStartTransform,
  computeCurrentViewEndTransform,
  computePreviousViewOrigin,
  computePreviousViewEndTransform,
  computeLastViewEndTransform,
  computeLastViewIntermediateTransform
} from './geometry.js'
import { createViewEntry, createRemovedViewEntry, createZoomSnapshot, getDetachedNode, INDEX_CURRENT, INDEX_PREVIOUS, INDEX_LAST } from './snapshots.js'
import { ViewPrefetcher } from './view-prefetcher.js'
import { getDriver } from './drivers/index.js'
import { applyResizeCorrection } from './resize-correction.js'
import { hideViewContent, showViewContent } from './view-visibility.js'

/**
 * Maximum time (ms) that blockEvents can stay true before being force-reset.
 * Prevents permanent UI freeze if a driver never calls onComplete (bug, error, removed element).
 * @type {number}
 */
const BLOCK_EVENTS_SAFETY_MS = 8000

/**
 * Zumly
 * Powers your apps with a zoomable user interface (ZUI) taste.
 * @class
 */
export class Zumly {
  /**
  * Creates a Zumly instance
  * @constructor
  * @param {Object} options
  * @example
  *  new Zumly({
  *  mount: '.mount',
  *  initialView: 'home',
  *  views: {
  *   home,
  *   contact,
  *   ...
  *  }
  */
  constructor (options) {
    // Internal state
    this.storedViews = []
    this.currentStage = null
    this.debug = false
    this.trace = []
    this.blockEvents = false
    /** @type {number|null} Safety timer that resets blockEvents if a driver hangs */
    this._blockEventsSafetyTimer = null
    this.touchstartX = 0
    this.touchstartY = 0
    this.touchendX = 0
    this.touchendY = 0
    this.touching = false
    /** Lateral history: view names at current depth. back() pops before zoomOut. */
    this.lateralHistory = []
    /** Canvas size tracking for resize correction. */
    this._lastCanvasWidth = 0
    this._lastCanvasHeight = 0
    /** Pending resize correction when resize occurred during transition. */
    this._pendingResizeCorrection = false
    /** Whether this instance has been destroyed. */
    this._destroyed = false
    /** Lifecycle hooks: { eventName: [fn, ...] } */
    this._hooks = {}

    // Validate options
    checkParameters(options, this)
    if (!this.isValid) {
      this.notify('is unable to start: invalid or missing required options (mount, initialView, views).', 'error')
      return
    }
    this.canvas = document.querySelector(this.mount)
    if (!this.canvas) {
      this.notify(`mount selector "${this.mount}" did not match any element.`, 'error')
      this.isValid = false
      return
    }
    this.transitionDriver = getDriver(this.transitionDriver)

    // Event bindings (stored for cleanup in destroy())
    this._onZoom = this.onZoom.bind(this)
    this._onTouchStart = this.onTouchStart.bind(this)
    this._onTouchEnd = this.onTouchEnd.bind(this)
    this._onKeyUp = this.onKeyUp.bind(this)
    this._onWheel = this.onWheel.bind(this)
    this._onPrefetchTrigger = (e) => {
      if (e.target.classList.contains('zoom-me') && e.target.dataset.to) {
        this.prefetcher.prefetch(e.target.dataset.to, { trigger: e.target, ...e.target.dataset })
      }
    }
    this._onResize = this._handleResize.bind(this)
    this._resizeDebounceTimer = null
    this._RESIZE_DEBOUNCE_MS = 80

    // View prefetcher
    this.prefetcher = new ViewPrefetcher(this.views)

    // Bind events
    this._bindEvents()
  }

  // ─── Event binding / unbinding ───────────────────────────────────

  /**
   * Attach all event listeners. Called once in constructor.
   * @private
   */
  _bindEvents () {
    const canvas = this.canvas
    if (!canvas) return

    canvas.setAttribute('tabindex', '0')
    canvas.setAttribute('role', 'application')
    canvas.setAttribute('aria-roledescription', 'zoomable interface')
    canvas.setAttribute('aria-live', 'polite')
    canvas.addEventListener('mouseup', this._onZoom, false)
    canvas.addEventListener('touchend', this._onZoom, false)
    canvas.addEventListener('touchstart', this._onTouchStart, { passive: true })
    canvas.addEventListener('touchend', this._onTouchEnd, false)
    canvas.addEventListener('keyup', this._onKeyUp, false)
    canvas.addEventListener('wheel', this._onWheel, { passive: true })
    canvas.addEventListener('mouseover', this._onPrefetchTrigger, { passive: true })
    canvas.addEventListener('focusin', this._onPrefetchTrigger, { passive: true })

    window.addEventListener('resize', this._onResize, { passive: true })

    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._handleResize())
      this._resizeObserver.observe(canvas)
    }
  }

  /**
   * Remove all event listeners. Called by destroy().
   * @private
   */
  _unbindEvents () {
    const canvas = this.canvas
    if (canvas) {
      canvas.removeEventListener('mouseup', this._onZoom, false)
      canvas.removeEventListener('touchend', this._onZoom, false)
      canvas.removeEventListener('touchstart', this._onTouchStart)
      canvas.removeEventListener('touchend', this._onTouchEnd, false)
      canvas.removeEventListener('keyup', this._onKeyUp, false)
      canvas.removeEventListener('wheel', this._onWheel)
      canvas.removeEventListener('mouseover', this._onPrefetchTrigger)
      canvas.removeEventListener('focusin', this._onPrefetchTrigger)
    }

    window.removeEventListener('resize', this._onResize)

    if (this._resizeObserver) {
      this._resizeObserver.disconnect()
      this._resizeObserver = null
    }
  }

  // ─── blockEvents safety ──────────────────────────────────────────

  /**
   * Set blockEvents = true with a safety timeout.
   * If the driver never calls onComplete, blockEvents is force-reset
   * after BLOCK_EVENTS_SAFETY_MS to prevent permanent UI freeze.
   * @private
   */
  _setBlockEvents () {
    this.blockEvents = true
    this._clearBlockEventsSafety()
    this._blockEventsSafetyTimer = setTimeout(() => {
      if (this.blockEvents && !this._destroyed) {
        this.notify('blockEvents safety timeout: driver did not call onComplete. Force-resetting.', 'warn')
        this.blockEvents = false
        this._onTransitionComplete()
      }
    }, BLOCK_EVENTS_SAFETY_MS)
  }

  /**
   * Clear the blockEvents safety timeout (called when driver completes normally).
   * @private
   */
  _clearBlockEventsSafety () {
    if (this._blockEventsSafetyTimer !== null) {
      clearTimeout(this._blockEventsSafetyTimer)
      this._blockEventsSafetyTimer = null
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  storeViews (data) {
    this.tracing('storedViews()')
    this.storedViews.push(data)
    if (this.debug) {
      console.debug('Zumly storedViews', data) // eslint-disable-line no-console
    }
  }


  tracing (data) {
    if (this.debug) {
      if (data === 'ended') {
        const parse = this.trace.map((task, index) => `${index === 0 ? `Instance ${this.instance}: ${task}` : `${task}`}`).join(' > ')
        this.notify(parse)
        this.trace = []
      } else {
        this.trace.push(data)
      }
    }
  }

  notify (msg, type) {
    return notification(this.debug, msg, type)
  }

  _recordCanvasSize () {
    if (!this.canvas) return
    const r = this.canvas.getBoundingClientRect()
    this._lastCanvasWidth = r.width
    this._lastCanvasHeight = r.height
  }

  _handleResize () {
    if (this._destroyed) return
    if (this._resizeDebounceTimer) clearTimeout(this._resizeDebounceTimer)
    this._resizeDebounceTimer = setTimeout(() => {
      this._resizeDebounceTimer = null
      if (!this.isValid || !this.canvas || this._lastCanvasWidth === 0) return
      const r = this.canvas.getBoundingClientRect()
      const newW = r.width
      const newH = r.height
      if (newW === this._lastCanvasWidth && newH === this._lastCanvasHeight) return
      if (this.blockEvents) {
        this._pendingResizeCorrection = true
        return
      }
      applyResizeCorrection(this, this._lastCanvasWidth, this._lastCanvasHeight, newW, newH)
      this._lastCanvasWidth = newW
      this._lastCanvasHeight = newH
    }, this._RESIZE_DEBOUNCE_MS)
  }

  _onTransitionComplete () {
    this._clearBlockEventsSafety()
    if (this._pendingResizeCorrection && !this.blockEvents) {
      this._pendingResizeCorrection = false
      const r = this.canvas?.getBoundingClientRect()
      if (r && this._lastCanvasWidth > 0) {
        const newW = r.width
        const newH = r.height
        if (newW !== this._lastCanvasWidth || newH !== this._lastCanvasHeight) {
          applyResizeCorrection(this, this._lastCanvasWidth, this._lastCanvasHeight, newW, newH)
        }
        this._lastCanvasWidth = newW
        this._lastCanvasHeight = newH
      }
    } else {
      this._recordCanvasSize()
    }
    this._manageFocus()
  }

  /**
   * Move focus to the current view after a transition completes.
   * Finds the first focusable element inside the view, or the view itself.
   * @private
   */
  _manageFocus () {
    if (!this.canvas) return
    const currentView = this.canvas.querySelector('.is-current-view')
    if (!currentView) return
    const focusable = currentView.querySelector(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (focusable) {
      focusable.focus({ preventScroll: true })
    } else {
      currentView.setAttribute('tabindex', '-1')
      currentView.focus({ preventScroll: true })
    }
  }

  // ─── Lifecycle hooks ─────────────────────────────────────────────

  /**
   * Register a lifecycle hook.
   * Events: 'beforeZoomIn', 'afterZoomIn', 'beforeZoomOut', 'afterZoomOut',
   *         'beforeLateral', 'afterLateral', 'viewMounted', 'destroy'
   * @param {string} event
   * @param {function} fn
   * @returns {this} For chaining
   */
  on (event, fn) {
    if (typeof fn !== 'function') return this
    ;(this._hooks[event] ||= []).push(fn)
    return this
  }

  /**
   * Remove a lifecycle hook. If fn is omitted, removes all hooks for that event.
   * @param {string} event
   * @param {function} [fn]
   * @returns {this}
   */
  off (event, fn) {
    if (!fn) {
      delete this._hooks[event]
    } else if (this._hooks[event]) {
      this._hooks[event] = this._hooks[event].filter(f => f !== fn)
    }
    return this
  }

  /**
   * Emit a lifecycle event. Hooks receive a data object with event details.
   * @private
   * @param {string} event
   * @param {object} [data={}]
   */
  _emit (event, data = {}) {
    const hooks = this._hooks[event]
    if (!hooks || hooks.length === 0) return
    for (const fn of hooks) {
      try { fn(data) } catch (e) {
        if (this.debug) console.error(`Zumly hook "${event}" threw:`, e) // eslint-disable-line no-console
      }
    }
  }

  // ─── Public methods ──────────────────────────────────────────────

  zoomLevel () {
    return this.storedViews.length
  }

  /**
   * Returns the current zoom level (alias for zoomLevel).
   * @returns {number}
   */
  getZoomLevel () {
    return this.zoomLevel()
  }

  /**
   * Returns the currently active view name, or null if not initialized.
   * @returns {string|null}
   */
  getCurrentViewName () {
    if (!this.storedViews || this.storedViews.length === 0) return null
    const latest = this.storedViews[this.storedViews.length - 1]
    const current = latest?.views?.[INDEX_CURRENT]
    return current?.viewName ?? null
  }

  /**
   * Navigate back. If there is lateral history at current depth, goes back laterally first.
   * Otherwise zooms out one level. Safe no-op at root with no lateral history.
   * Returns a Promise when lateral (so callers can await); otherwise returns undefined.
   */
  back () {
    if (this._destroyed) return
    if (this.lateralHistory && this.lateralHistory.length > 0) {
      const popped = this.lateralHistory.pop()
      const targetViewName = popped && typeof popped === 'object' ? popped.name : popped
      const savedEntry = popped && typeof popped === 'object' ? popped.entry : undefined
      return this._doLateral(targetViewName, true, { savedEntry })
    }
    this.zoomOut()
  }

  /**
   * Navigate to a view by name. Unified API for depth and lateral navigation.
   * @param {string} viewName - Target view (must exist in views)
   * @param {{ mode?: 'depth'|'lateral', duration?: string, ease?: string, props?: object }} [options]
   */
  async goTo (viewName, options = {}) {
    if (this._destroyed) return
    const mode = options.mode === 'lateral' ? 'lateral' : 'depth'
    if (mode === 'depth') {
      return this.zoomTo(viewName, options)
    }
    return this._doLateral(viewName, false, options)
  }

  /**
   * Programmatic zoom to a named view without a real DOM trigger.
   * Uses a centered synthetic origin for the transition.
   * @param {string} viewName - Target view name (must exist in views)
   * @param {{ duration?: string, ease?: string, props?: object }} [options]
   */
  async zoomTo (viewName, options = {}) {
    if (this._destroyed) return
    if (!this.isValid || !this.canvas) {
      this.notify('zoomTo() cannot run: instance is invalid or canvas not found.', 'error')
      return
    }
    if (typeof viewName !== 'string' || !viewName) {
      this.notify('zoomTo() requires a non-empty view name.', 'warn')
      return
    }
    if (!Object.prototype.hasOwnProperty.call(this.views, viewName)) {
      this.notify(`zoomTo("${viewName}"): view not found in views. Available: ${Object.keys(this.views).join(', ')}`, 'warn')
      return
    }
    const current = this.getCurrentViewName()
    if (current === viewName) return

    const cr = this.canvas.getBoundingClientRect()
    const w = Math.max(40, cr.width * 0.1)
    const h = Math.max(40, cr.height * 0.1)
    const syntheticRect = {
      x: cr.left + (cr.width - w) / 2,
      y: cr.top + (cr.height - h) / 2,
      width: w,
      height: h
    }
    const descriptor = {
      rect: syntheticRect,
      duration: options.duration ?? this.duration,
      ease: options.ease ?? this.ease,
      props: options.props ?? {}
    }
    await this._doZoomIn(viewName, descriptor)
  }

  async init () {
    if (this._destroyed) return
    if (!this.isValid || !this.canvas) {
      this.notify('init() cannot run: instance is invalid or canvas element was not found.', 'error')
      return
    }
    this.tracing('init()')
    if (this.preload && this.preload.length) {
      await this.prefetcher.preloadEager(this.preload, null)
    }
    const node = await this.prefetcher.get(this.initialView, null)
    const currentView = await prepareAndInsertView(node, this.initialView, this.canvas, true, this.views, this.componentContext)
    this._emit('viewMounted', { viewName: this.initialView, node: currentView })
    this.prefetcher.scanAndPrefetch(currentView, null)
    this.storeViews({
      zoomLevel: this.storedViews.length,
      scale: 1,
      views: [{
        viewName: this.initialView,
        backwardState: {
          origin: '0 0',
          transform: ''
        }
      }]
    })
    this.currentStage = this.storedViews[this.storedViews.length - 1]
    this._recordCanvasSize()
  }

  /**
   * Destroy the instance: remove all event listeners, observers, timers,
   * and clear internal state. After calling destroy(), the instance is inert
   * and cannot be reused. Call this when unmounting in a SPA.
   *
   * Does NOT remove DOM content from the canvas — the consumer owns the DOM.
   * If you want a clean slate, clear canvas.innerHTML after destroy().
   */
  destroy () {
    if (this._destroyed) return
    this._emit('destroy')
    this._destroyed = true

    // Clear blockEvents safety timer
    this._clearBlockEventsSafety()

    // Clear resize debounce timer
    if (this._resizeDebounceTimer) {
      clearTimeout(this._resizeDebounceTimer)
      this._resizeDebounceTimer = null
    }

    // Remove all event listeners
    this._unbindEvents()

    // Unblock events so nothing is stuck
    this.blockEvents = false

    // Clear state
    this.storedViews = []
    this.currentStage = null
    this.lateralHistory = []
    this.trace = []

    // Nullify references
    this._hooks = {}
    this.prefetcher = null
    this.transitionDriver = null
    // Keep this.canvas reference for the consumer to clean up DOM if needed,
    // but remove the attributes we added.
    if (this.canvas) {
      this.canvas.removeAttribute('tabindex')
      this.canvas.removeAttribute('role')
      this.canvas.removeAttribute('aria-roledescription')
      this.canvas.removeAttribute('aria-live')
    }

    this.isValid = false
  }

  // ─── Internal: zoom in ───────────────────────────────────────────

  /**
   * Shared zoom-in path for both trigger-based and programmatic navigation.
   *
   * The geometry computation section mutates DOM styles temporarily to read
   * bounding rects after transforms. This is wrapped in try/catch so that
   * if anything goes wrong (element removed mid-computation, unexpected NaN,
   * etc.), the DOM is restored to a safe state and the zoom is aborted
   * rather than leaving the UI frozen or in a broken transform state.
   *
   * @param {string} targetViewName - View to zoom to
   * @param {{ el?: HTMLElement, rect?: object, duration?: string, ease?: string, props?: object }} triggerOrDescriptor
   */
  async _doZoomIn (targetViewName, triggerOrDescriptor) {
    if (this._destroyed) return
    this.lateralHistory = []
    this._emit('beforeZoomIn', { viewName: targetViewName })
    this.tracing('zoomIn()')
    const canvas = this.canvas
    const el = triggerOrDescriptor.el
    const canvasRect = canvas.getBoundingClientRect()
    const offsetX = canvasRect.left
    const offsetY = canvasRect.top
    const prevSnapshot = this.storedViews.length > 0 ? this.storedViews[this.storedViews.length - 1] : null
    const preScale = prevSnapshot?.scale ?? 1
    this.tracing('getView()')

    const context = el
      ? { trigger: el, target: document.createElement('div'), context: this.componentContext, props: Object.assign({}, el.dataset) }
      : { target: document.createElement('div'), context: this.componentContext, props: triggerOrDescriptor.props ?? {} }

    const node = await this.prefetcher.get(targetViewName, context)
    if (this._destroyed) return // instance may have been destroyed during async fetch
    this.prefetcher.scanAndPrefetch(node, context)
    const currentView = await prepareAndInsertView(node, targetViewName, canvas, false, this.views, this.componentContext)

    if (!currentView) return
    this._emit('viewMounted', { viewName: targetViewName, node: currentView })

    if (el) el.classList.add('zoomed')

    const triggerRect = el
      ? (() => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()
      : triggerOrDescriptor.rect

    const duration = el ? (el.dataset.withDuration || this.duration) : (triggerOrDescriptor.duration ?? this.duration)
    const ease = el ? (el.dataset.withEase || this.ease) : (triggerOrDescriptor.ease ?? this.ease)

    const previousView = canvas.querySelector('.is-current-view')
    const lastView = canvas.querySelector('.is-previous-view')
    const removeView = canvas.querySelector('.is-last-view')
    hideViewContent(currentView)
    hideViewContent(previousView)
    hideViewContent(lastView)
    if (removeView) {
      hideViewContent(removeView)
      canvas.removeChild(removeView)
    }

    // ── Geometry computation ────────────────────────────────────────
    // This section temporarily mutates transforms on previousView (and lastView)
    // to read bounding rects after transform changes. If anything throws, we
    // restore the original transforms and abort gracefully.

    let transformCurrentView0, transformCurrentView1
    let transformPreviousView0, prevEnd
    let transformLastView0, transformLastView1
    let coverScale

    // Save original state for rollback
    const originalPreviousTransform = previousView.style.transform
    const originalPreviousOrigin = previousView.style.transformOrigin
    const originalLastTransform = lastView ? lastView.style.transform : null
    const originalLastOrigin = lastView ? lastView.style.transformOrigin : null

    try {
      const cc = currentView.getBoundingClientRect()
      const canvasOffset = { left: offsetX, top: offsetY }
      const canvasRectSize = { width: canvasRect.width, height: canvasRect.height }
      const currentViewRect = { width: cc.width, height: cc.height }

      const coverResult = computeCoverScale(
        triggerRect.width, triggerRect.height, cc.width, cc.height, this.cover
      )
      coverScale = coverResult.scale
      const coverScaleInv = coverResult.scaleInv
      transformCurrentView0 = computeCurrentViewStartTransform(
        triggerRect, canvasOffset, currentViewRect, coverScaleInv
      )
      currentView.style.transform = transformCurrentView0

      previousView.classList.replace('is-current-view', 'is-previous-view')
      const previousViewRectAsPrevious = previousView.getBoundingClientRect()
      transformPreviousView0 = previousView.style.transform
      previousView.style.transformOrigin = computePreviousViewOrigin(triggerRect, previousViewRectAsPrevious)

      prevEnd = computePreviousViewEndTransform(
        canvasRectSize, triggerRect, previousViewRectAsPrevious, coverScale
      )
      // ── Temporary DOM mutation: set previousView to end transform to read trigger's new position
      previousView.style.transform = prevEnd.transform

      const triggerRectAfterTransform = el ? el.getBoundingClientRect() : triggerRect
      transformCurrentView1 = computeCurrentViewEndTransform(
        triggerRectAfterTransform, canvasOffset, currentViewRect
      )

      if (lastView) {
        lastView.classList.replace('is-previous-view', 'is-last-view')
        transformLastView0 = lastView.style.transform
        const previousViewRectWhileAtEndTransform = previousView.getBoundingClientRect()
        // ── Temporary DOM mutation: set lastView intermediate
        lastView.style.transform = computeLastViewIntermediateTransform(
          prevEnd.x, prevEnd.y, canvasOffset, coverScale, preScale
        )
        const lastZoomedEl = lastView.querySelector('.zoomed')
        const lastViewZoomedElementRect = (lastZoomedEl && lastZoomedEl.getBoundingClientRect)
          ? lastZoomedEl.getBoundingClientRect()
          : lastView.getBoundingClientRect()
        // ── Restore: revert temporary mutations
        lastView.style.transform = transformLastView0
        previousView.style.transform = transformPreviousView0
        const previousViewRectAtBaseTransform = previousView.getBoundingClientRect()
        transformLastView1 = computeLastViewEndTransform({
          canvasRect: canvasRectSize,
          canvasOffset,
          triggerRect,
          previousViewRectAtBaseTransform,
          lastViewZoomedElementRect,
          previousViewRectWithPreviousAtEndTransform: previousViewRectWhileAtEndTransform,
          scale: coverScale,
          preScale
        })
      } else {
        // ── Restore: revert temporary mutation (no lastView branch)
        previousView.style.transform = transformPreviousView0
      }
    } catch (error) {
      // ── Rollback: restore all DOM mutations on error ──────────────
      this.notify(`zoomIn geometry computation failed: ${error.message}. Aborting zoom.`, 'error')
      if (this.debug) console.error('Zumly _doZoomIn error:', error) // eslint-disable-line no-console

      // Restore previousView
      previousView.style.transform = originalPreviousTransform
      previousView.style.transformOrigin = originalPreviousOrigin
      // Undo class swap if it happened
      if (previousView.classList.contains('is-previous-view')) {
        previousView.classList.replace('is-previous-view', 'is-current-view')
      }

      // Restore lastView
      if (lastView) {
        lastView.style.transform = originalLastTransform
        lastView.style.transformOrigin = originalLastOrigin
        if (lastView.classList.contains('is-last-view')) {
          lastView.classList.replace('is-last-view', 'is-previous-view')
        }
      }

      // Remove the currentView we just inserted (it was never shown)
      try { canvas.removeChild(currentView) } catch (e) { /* already removed */ }

      showViewContent(previousView)
      showViewContent(lastView)

      return // Abort the zoom
    }

    // ── Build snapshot and run transition ───────────────────────────

    const currentEntry = createViewEntry(
      currentView.dataset.viewName,
      { origin: currentView.style.transformOrigin, duration, ease, transform: transformCurrentView0 },
      { origin: currentView.style.transformOrigin, duration, ease, transform: transformCurrentView1 }
    )
    const previousEntry = createViewEntry(
      previousView.dataset.viewName,
      { origin: previousView.style.transformOrigin, duration, ease, transform: transformPreviousView0 },
      { origin: previousView.style.transformOrigin, duration, ease, transform: prevEnd.transform }
    )
    const lastEntry = lastView ? createViewEntry(
      lastView.dataset.viewName,
      { origin: lastView.style.transformOrigin, duration, ease, transform: transformLastView0 },
      { origin: lastView.style.transformOrigin, duration, ease, transform: transformLastView1 }
    ) : null
    const removedEntry = removeView ? createRemovedViewEntry(removeView) : null

    const snapShoot = createZoomSnapshot(
      this.storedViews.length,
      currentEntry,
      previousEntry,
      lastEntry,
      removedEntry
    )
    snapShoot.scale = coverScale
    this.storeViews(snapShoot)
    this.currentStage = this.storedViews[this.storedViews.length - 1]
    this.tracing('setCSSVariables()')
    this._setBlockEvents()
    const spec = {
      type: 'zoomIn',
      currentView,
      previousView,
      lastView,
      currentStage: this.currentStage,
      duration,
      ease
    }
    this.transitionDriver.runTransition(spec, () => {
      this.blockEvents = false
      this._onTransitionComplete()
      this._emit('afterZoomIn', { viewName: targetViewName, zoomLevel: this.zoomLevel() })
      this.tracing('ended')
    })
  }

  /**
   * Zoom in to the view indicated by the clicked element.
   * @param {HTMLElement} el - Element with .zoom-me and data-to="viewName"
   */
  async zoomIn (el) {
    if (this._destroyed) return
    if (!el?.dataset?.to) return
    await this._doZoomIn(el.dataset.to, { el })
  }

  // ─── Internal: lateral navigation ────────────────────────────────

  /**
   * Same-level navigation: replace current view with target at same depth.
   */
  async _doLateral (targetViewName, isBack = false, options = {}) {
    if (this._destroyed) return
    if (!this.isValid || !this.canvas) return
    if (!Object.prototype.hasOwnProperty.call(this.views, targetViewName)) {
      this.notify(`goTo("${targetViewName}", { mode: 'lateral' }): view not found in views. Available: ${Object.keys(this.views).join(', ')}`, 'warn')
      return
    }
    const outgoingView = this.canvas.querySelector('.is-current-view')
    if (!outgoingView) return
    const currentName = outgoingView.dataset?.viewName
    if (currentName === targetViewName) return
    this._emit('beforeLateral', { viewName: targetViewName, from: currentName, isBack })

    if (!isBack) {
      this.lateralHistory = this.lateralHistory || []
      const topSnapshot = this.storedViews[this.storedViews.length - 1]
      this.lateralHistory.push({ name: currentName, entry: topSnapshot.views[INDEX_CURRENT] })
    }

    this.tracing('lateral()')
    const duration = options.duration ?? this.duration
    const ease = options.ease ?? this.ease

    const backView = this.canvas.querySelector('.is-previous-view')
    const lastView = this.canvas.querySelector('.is-last-view')

    let slideDeltaX = 0
    let slideDeltaY = 0
    if (backView) {
      const fromTrigger = backView.querySelector(`.zoom-me[data-to="${currentName}"]`)
      const toTrigger = backView.querySelector(`.zoom-me[data-to="${targetViewName}"]`)
      if (fromTrigger && toTrigger) {
        const fr = fromTrigger.getBoundingClientRect()
        const tr = toTrigger.getBoundingClientRect()
        slideDeltaX = (fr.left + fr.width / 2) - (tr.left + tr.width / 2)
        slideDeltaY = (fr.top + fr.height / 2) - (tr.top + tr.height / 2)
      } else {
        const canvasRect = this.canvas.getBoundingClientRect()
        slideDeltaX = canvasRect.width * 0.15
      }
    }

    const context = { target: document.createElement('div'), context: this.componentContext, props: options.props ?? {} }
    const node = await this.prefetcher.get(targetViewName, context)
    if (this._destroyed) return
    this.prefetcher.scanAndPrefetch(node, context)
    const incomingView = await prepareAndInsertView(node, targetViewName, this.canvas, false, this.views, this.componentContext)
    if (!incomingView) return
    this._emit('viewMounted', { viewName: targetViewName, node: incomingView })

    hideViewContent(incomingView)
    hideViewContent(lastView)

    const outTransform = outgoingView.style.transform || ''
    const outOrigin = outgoingView.style.transformOrigin || '0 0'
    incomingView.style.transform = outTransform
    incomingView.style.transformOrigin = outOrigin

    const topSnapshot = this.storedViews[this.storedViews.length - 1]
    const newCurrentEntry = (isBack && options.savedEntry)
      ? { ...options.savedEntry, viewName: targetViewName }
      : createViewEntry(
          targetViewName,
          { origin: outOrigin, duration, ease, transform: outTransform },
          { origin: outOrigin, duration, ease, transform: outTransform }
        )
    topSnapshot.views[INDEX_CURRENT] = newCurrentEntry
    this.currentStage = topSnapshot

    const backViewState = backView ? {
      transformStart: backView.style.transform || '',
      transformEnd: this._computeLateralBackTransform(backView.style.transform || '', slideDeltaX, slideDeltaY)
    } : null
    const lastViewState = lastView && topSnapshot.views[INDEX_LAST] ? {
      transformStart: lastView.style.transform || '',
      transformEnd: this._computeLateralBackTransform(lastView.style.transform || '', slideDeltaX * 0.7, slideDeltaY * 0.7)
    } : null

    if (backViewState && topSnapshot.views[INDEX_PREVIOUS]) {
      topSnapshot.views[INDEX_PREVIOUS].forwardState = {
        ...topSnapshot.views[INDEX_PREVIOUS].forwardState,
        transform: backViewState.transformEnd
      }
    }
    if (lastViewState && topSnapshot.views[INDEX_LAST]) {
      topSnapshot.views[INDEX_LAST].forwardState = {
        ...topSnapshot.views[INDEX_LAST].forwardState,
        transform: lastViewState.transformEnd
      }
    }

    const incomingTransformEnd = outTransform
    const incomingTransformStart = this._computeLateralBackTransform(incomingTransformEnd, -slideDeltaX, -slideDeltaY)
    const outgoingTransformEnd = this._computeLateralBackTransform(outTransform, slideDeltaX, slideDeltaY)

    this._setBlockEvents()
    const spec = {
      type: 'lateral',
      currentView: incomingView,
      previousView: outgoingView,
      lastView: lastView || null,
      backView: backView || null,
      backViewState,
      lastViewState,
      incomingTransformStart,
      incomingTransformEnd,
      outgoingTransform: outTransform,
      outgoingTransformEnd,
      currentStage: this.currentStage,
      duration,
      ease,
      canvas: this.canvas,
      slideDeltaX,
      slideDeltaY
    }
    this.transitionDriver.runTransition(spec, () => {
      this.blockEvents = false
      this._onTransitionComplete()
      this._emit('afterLateral', { viewName: targetViewName, from: currentName, isBack })
      this.tracing('ended')
    })
  }

  /**
   * Add translate(dx, dy) to an existing transform string for lateral slide.
   */
  _computeLateralBackTransform (transform, dx, dy) {
    const m = transform.match(/translate\s*\(\s*([-\d.eE]+)px\s*,\s*([-\d.eE]+)px\s*\)/)
    if (m) {
      const tx = parseFloat(m[1]) + dx
      const ty = parseFloat(m[2]) + dy
      const rest = transform.replace(/translate\s*\([^)]+\)\s*/, '')
      return `translate(${tx}px, ${ty}px) ${rest}`.trim()
    }
    return `translate(${dx}px, ${dy}px) ${transform}`.trim()
  }

  // ─── Zoom out ────────────────────────────────────────────────────

  zoomOut () {
    if (this._destroyed) return
    this.lateralHistory = []
    this._emit('beforeZoomOut', { zoomLevel: this.zoomLevel() })
    this.tracing('zoomOut()')
    const canvas = this.canvas
    const currentView = canvas.querySelector('.is-current-view')
    const previousView = canvas.querySelector('.is-previous-view')
    if (!currentView || !previousView) {
      this.notify('zoomOut: current or previous view not found (animation may still be running)', 'warn')
      return
    }
    this._setBlockEvents()
    this.currentStage = this.storedViews[this.storedViews.length - 1]
    const lastView = canvas.querySelector('.is-last-view')
    this.tracing('setCSSVariables()')

    const zoomedEl = previousView.querySelector('.zoomed')
    if (zoomedEl) zoomedEl.classList.remove('zoomed')
    previousView.classList.replace('is-previous-view', 'is-current-view')

    if (lastView !== null) {
      lastView.classList.replace('is-last-view', 'is-previous-view')
      lastView.classList.remove('hide')
    }
    const detachedNode = getDetachedNode(this.currentStage)
    if (detachedNode) {
      canvas.prepend(detachedNode)
      const newlastView = canvas.querySelector('.z-view:first-child')
      if (newlastView) {
        showViewContent(newlastView)
        newlastView.classList.add('hide')
      }
    }

    const duration = this.currentStage.views[INDEX_CURRENT]?.forwardState?.duration ?? this.duration
    const ease = this.currentStage.views[INDEX_CURRENT]?.forwardState?.ease ?? this.ease
    const spec = {
      type: 'zoomOut',
      currentView,
      previousView,
      lastView,
      currentStage: this.currentStage,
      duration,
      ease,
      canvas
    }
    this.transitionDriver.runTransition(spec, () => {
      this.blockEvents = false
      this._onTransitionComplete()
      this._emit('afterZoomOut', { zoomLevel: this.zoomLevel() })
      this.tracing('ended')
    })
    this.storedViews.pop()
  }

  // ─── Event handling ──────────────────────────────────────────────

  onZoom (event) {
    if (this._destroyed) return
    if (this.storedViews.length > 1 && !this.blockEvents && !event.target.classList.contains('zoom-me') && event.target.closest('.is-current-view') === null && !this.touching) {
      this.tracing('onZoom()')
      event.stopPropagation()
      this.zoomOut()
    }
    if (!this.blockEvents && event.target.classList.contains('zoom-me') && !this.touching) {
      this.tracing('onZoom()')
      event.stopPropagation()
      this.zoomIn(event.target)
    }
  }

  onKeyUp (event) {
    if (this._destroyed) return
    this.tracing('onKeyUp()')
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.zoomOut()
      } else {
        this.notify(`is on level zero. Can't zoom out. Trigger: ${event.key}`, 'warn')
      }
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      this.notify(event.key + ' has no actions defined')
    }
  }

  onWheel (event) {
    if (this._destroyed) return
    if (!this.blockEvents) {
      this.tracing('onWheel()')
      if (event.deltaY > 0) {
        if (this.storedViews.length > 1 && !this.blockEvents) {
          this.zoomOut()
        }
      }
    }
  }

  onTouchStart (event) {
    if (this._destroyed) return
    this.tracing('onTouchStart()')
    this.touching = true
    this.touchstartX = event.changedTouches[0].screenX
    this.touchstartY = event.changedTouches[0].screenY
  }

  onTouchEnd (event) {
    if (this._destroyed) return
    if (!this.blockEvents) {
      this.tracing('onTouchEnd()')
      this.touchendX = event.changedTouches[0].screenX
      this.touchendY = event.changedTouches[0].screenY
      this.handleGesture(event)
    }
  }

  handleGesture (event) {
    event.stopPropagation()
    this.tracing('handleGesture()')
    const dx = this.touchendX - this.touchstartX
    const dy = this.touchendY - this.touchstartY
    const isTap = Math.abs(dx) < 10 && Math.abs(dy) < 10
    if (dx < -30) {
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.tracing('swipe left')
        this.zoomOut()
      } else {
        this.notify("is on level zero. Can't zoom out. Trigger: Swipe left", 'warn')
      }
    }
    if (isTap && !this.blockEvents && event.target.classList.contains('zoom-me') && this.touching) {
      this.touching = false
      this.tracing('tap')
      event.preventDefault()
      this.zoomIn(event.target)
    }
    if (isTap && this.storedViews.length > 1 && !this.blockEvents && !event.target.classList.contains('zoom-me') && event.target.closest('.is-current-view') === null && this.touching) {
      this.touching = false
      this.tracing('tap')
      this.zoomOut()
    }
  }
}
