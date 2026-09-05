import { prepareAndInsertView, notification, checkParameters } from './utils.js'
import {
  computeCoverScale,
  computeCurrentViewStartTransform,
  computeCurrentViewEndTransform,
  computePreviousViewOrigin,
  computePreviousViewEndTransform,
  computeLastViewEndTransform,
  computeLastViewIntermediateTransform,
  computeChildRectAfterParentTransformChange,
  parseOrigin,
  parseTranslateScale,
  splitTranslate
} from './geometry.js'
import { createViewEntry, createRemovedViewEntry, createZoomSnapshot, getDetachedNode, INDEX_CURRENT, INDEX_PREVIOUS, INDEX_LAST } from './snapshots.js'
import { ViewPrefetcher } from './view-prefetcher.js'
import { getDriver } from './drivers/index.js'
import { applyResizeCorrection } from './resize-correction.js'
import { hideViewContent, showViewContent } from './view-visibility.js'
import { disposeView } from './view-lifecycle.js'
import { ViewAccessibility, isNativeControl, isEditable } from './view-accessibility.js'

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
    /** Timers created via _setTrackedTimeout, cleared in destroy(). */
    this._trackedTimers = new Set()
    /** Completion callback of the in-flight transition (see _setBlockEvents). */
    this._pendingTransitionComplete = null
    this._navigationTask = null
    this._initPromise = null
    this._accessibility = new ViewAccessibility()
    /** Lifecycle hooks: { eventName: [fn, ...] } */
    this._hooks = {}
    /** Registered plugins */
    this._plugins = []

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
    this._onTouchCancel = () => { this.touching = false }
    this._onKeyUp = this.onKeyUp.bind(this)
    this._onKeyDown = this.onKeyDown.bind(this)
    this._onKeyboardClick = (event) => {
      // Pointer activation is handled on mouseup/touchend for compatibility.
      // Native keyboard and assistive-technology activation produces detail=0.
      if (!event.target.closest?.('.zoom-me[data-to]')) return
      if (event.detail === 0 ? !this.inputs.keyboard : !this.inputs.click) return
      event.preventDefault()
      if (event.detail === 0) this.onZoom(event)
    }
    this._onWheel = this.onWheel.bind(this)
    this._wheelCooldown = false
    this._onPrefetchTrigger = (e) => {
      const trigger = e.target.closest?.('.zoom-me[data-to]')
      if (!this._destroyed && trigger && this.canvas.contains(trigger)) {
        this.prefetcher.prefetch(trigger.dataset.to, { trigger, context: this.componentContext, props: { ...trigger.dataset } })
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

    this._canvasAttributes = new Map(['tabindex', 'role', 'aria-roledescription', 'aria-live'].map(name => [name, canvas.getAttribute(name)]))
    canvas.setAttribute('tabindex', '0')
    canvas.setAttribute('role', 'application')
    canvas.setAttribute('aria-roledescription', 'zoomable interface')
    canvas.setAttribute('aria-live', 'polite')
    canvas.addEventListener('mouseup', this._onZoom, false)
    canvas.addEventListener('touchend', this._onZoom, false)
    canvas.addEventListener('touchstart', this._onTouchStart, { passive: true })
    canvas.addEventListener('touchend', this._onTouchEnd, false)
    canvas.addEventListener('touchcancel', this._onTouchCancel, { passive: true })
    canvas.addEventListener('keyup', this._onKeyUp, false)
    canvas.addEventListener('keydown', this._onKeyDown, false)
    canvas.addEventListener('click', this._onKeyboardClick, false)
    canvas.addEventListener('wheel', this._onWheel, { passive: false })
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
      canvas.removeEventListener('touchcancel', this._onTouchCancel)
      canvas.removeEventListener('keyup', this._onKeyUp, false)
      canvas.removeEventListener('keydown', this._onKeyDown, false)
      canvas.removeEventListener('click', this._onKeyboardClick, false)
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

  /**
   * Defensive: if anything scrolled the canvas (overflow:hidden containers
   * scroll programmatically — scrollIntoView, focus(), test runners), every
   * geometry read afterwards is displaced by that offset, permanently.
   * The canvas is never meant to scroll: zero it before reading rects.
   * @param {HTMLElement} canvas
   * @private
   */
  _resetCanvasScroll (canvas) {
    if (!canvas) return
    if (canvas.scrollLeft !== 0 || canvas.scrollTop !== 0) {
      this.notify(`canvas had a residual scroll (${canvas.scrollLeft}, ${canvas.scrollTop}) — resetting. Something scrolled the canvas mid-transition.`, 'warn')
      canvas.scrollLeft = 0
      canvas.scrollTop = 0
    }
    // DX: a scrolled ANCESTOR displaces every geometry read the same way, and
    // it's app CSS, so we must not mutate it — but we can name the culprit.
    // overflow:hidden containers scroll programmatically (scrollIntoView,
    // focus(), test runners); the host fix is `overflow: clip`.
    if (!this._warnedScrolledAncestor) {
      for (let el = canvas.parentElement; el && el !== document.body; el = el.parentElement) {
        if (el.scrollLeft !== 0 || el.scrollTop !== 0) {
          const who = el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : el.tagName.toLowerCase()
          this.notify(`an ancestor of the canvas (${who}) is scrolled (${el.scrollLeft}, ${el.scrollTop}): all zooms will land displaced. Use 'overflow: clip' (not 'hidden') on containers around the canvas.`, 'warn')
          this._warnedScrolledAncestor = true
          break
        }
      }
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
        // Run the full pending completion (nav update, hooks, storedViews pop on
        // zoom-out) so internal state stays in sync with the already-mutated DOM.
        const pending = this._pendingTransitionComplete
        if (pending) pending()
        else this._onTransitionComplete()
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

  /**
   * setTimeout wrapper whose id is tracked so destroy() can clear it.
   * The callback is skipped if the instance was destroyed meanwhile.
   * @private
   */
  _setTrackedTimeout (fn, ms) {
    const id = setTimeout(() => {
      this._trackedTimers.delete(id)
      if (this._destroyed) return
      fn()
    }, ms)
    this._trackedTimers.add(id)
    return id
  }

  /** @private */
  _clearTrackedTimeouts () {
    for (const id of this._trackedTimers) clearTimeout(id)
    this._trackedTimers.clear()
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
        const parse = this.trace.map((task, index) => `${index === 0 ? `Instance ${this.mount}: ${task}` : `${task}`}`).join(' > ')
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
    // Restore the incoming view before focusing it (it may have been inert).
    const current = this.canvas?.querySelector('.is-current-view')
    if (current) this._accessibility.restore(current)
    this._manageFocus()
    if (this.canvas) this._accessibility.sync(this.canvas)
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
    const focusable = currentView.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    for (const element of focusable) {
      if (element.closest('[inert]')) continue
      element.focus({ preventScroll: true })
      if (document.activeElement === element || element.contains(document.activeElement)) return
    }
    currentView.setAttribute('tabindex', '-1')
    currentView.focus({ preventScroll: true })
  }

  _prefersReducedMotion () {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  // ─── Background view effects ─────────────────────────────────────

  /**
   * Parse per-trigger effects override or fall back to instance config.
   * Format: "blur(3px) | blur(8px) saturate(0)" (pipe separator for previous|last).
   * @param {HTMLElement|null} triggerEl
   * @returns {[string, string]} [previousEffect, lastEffect]
   * @private
   */
  _resolveEffects (triggerEl) {
    if (this._prefersReducedMotion()) return ['none', 'none']
    const perTrigger = triggerEl?.dataset?.withEffects
    if (perTrigger && typeof perTrigger === 'string') {
      const parts = perTrigger.split('|').map(s => s.trim())
      return [parts[0] || 'none', parts[1] || parts[0] || 'none']
    }
    return this.effects
  }

  /**
   * Apply background effects to previous/last views during zoom-in.
   * Sets CSS custom properties and adds .has-effect class for CSS transition.
   * @param {HTMLElement} previousView
   * @param {HTMLElement|null} lastView
   * @param {[string, string]} effects - [previousEffect, lastEffect]
   * @param {string} duration - CSS duration for transition timing
   * @param {string} ease - CSS easing for transition timing
   * @private
   */
  _applyEffects (previousView, lastView, effects, duration, ease) {
    if (!effects || (effects[0] === 'none' && effects[1] === 'none')) return
    if (previousView && effects[0] !== 'none') {
      previousView.style.setProperty('--z-effect-filter', effects[0])
      previousView.style.setProperty('--zoom-duration', duration)
      previousView.style.setProperty('--zoom-ease', ease)
      previousView.classList.add('has-effect')
    }
    if (lastView && effects[1] !== 'none') {
      lastView.style.setProperty('--z-effect-filter', effects[1])
      lastView.style.setProperty('--zoom-duration', duration)
      lastView.style.setProperty('--zoom-ease', ease)
      lastView.classList.add('has-effect')
    }
  }

  /**
   * Remove background effect from a view (used when it becomes current on zoom-out).
   * Adds .has-effect-reverse temporarily to animate the filter back to none.
   * @param {HTMLElement} element
   * @private
   */
  _removeEffect (element) {
    if (!element || !element.classList.contains('has-effect')) return
    element.classList.remove('has-effect')
    element.classList.add('has-effect-reverse')
    const onEnd = () => {
      element.classList.remove('has-effect-reverse')
      element.style.removeProperty('--z-effect-filter')
      element.removeEventListener('transitionend', onEnd)
    }
    element.addEventListener('transitionend', onEnd, { once: true })
    // Safety: remove after duration in case transitionend doesn't fire
    const dur = element.style.getPropertyValue('--zoom-duration')
    this._setTrackedTimeout(onEnd, dur ? parseFloat(dur) * (dur.includes('ms') ? 1 : 1000) + 100 : 1100)
  }

  // ─── Trigger hide/crossfade ───────────────────────────────────────

  /**
   * Resolve hideTrigger mode: per-trigger data attribute or global config.
   * @param {HTMLElement|null} triggerEl
   * @returns {string|boolean} 'fade', true, or false
   * @private
   */
  _resolveHideTrigger (triggerEl) {
    if (triggerEl?.dataset?.hideTrigger !== undefined) {
      const val = triggerEl.dataset.hideTrigger
      if (val === 'fade') return 'fade'
      return true // data-hide-trigger (no value or any value) → hide
    }
    return this.hideTrigger
  }

  /**
   * Apply trigger hide/crossfade on zoom-in.
   * @param {HTMLElement|null} triggerEl
   * @param {HTMLElement} currentView - The incoming view
   * @param {string|boolean} mode - 'fade', true, or false
   * @param {string} duration - CSS duration
   * @param {string} ease - CSS easing
   * @private
   */
  _applyHideTrigger (triggerEl, currentView, mode, duration, ease) {
    if (!mode || !triggerEl) return
    if (mode === 'fade') {
      triggerEl.style.setProperty('--zoom-duration', duration)
      triggerEl.style.setProperty('--zoom-ease', ease)
      triggerEl.classList.add('z-trigger-fade')
      // New view fades in from opacity 0 → 1 via CSS transition.
      // The view already has .hide (opacity:0) from prepareAndInsertView.
      // We set up the transition, then swap .hide for .z-view-fade-in after reflow.
      currentView.style.setProperty('--zoom-duration', duration)
      currentView.style.setProperty('--zoom-ease', ease)
      currentView.classList.add('z-view-fade-in')
      // Force reflow so browser registers opacity:0 from .hide before transition starts
      currentView.offsetHeight // eslint-disable-line no-unused-expressions
      currentView.classList.remove('hide')
    } else {
      triggerEl.classList.add('z-trigger-hidden')
    }
  }

  /**
   * Restore trigger visibility on zoom-out.
   * @param {HTMLElement|null} triggerEl - The .zoomed element in previousView
   * @param {string|boolean} mode - from snapshot.hideTriggerMode
   * @param {string} duration - CSS duration
   * @param {string} ease - CSS easing
   * @private
   */
  _restoreHideTrigger (triggerEl, mode, duration, ease) {
    if (!mode || !triggerEl) return
    if (mode === 'fade') {
      triggerEl.classList.remove('z-trigger-fade')
      triggerEl.style.setProperty('--zoom-duration', duration)
      triggerEl.style.setProperty('--zoom-ease', ease)
      triggerEl.classList.add('z-trigger-fade-reverse')
      const onEnd = () => {
        triggerEl.classList.remove('z-trigger-fade-reverse')
        triggerEl.style.removeProperty('--zoom-duration')
        triggerEl.style.removeProperty('--zoom-ease')
        triggerEl.removeEventListener('transitionend', onEnd)
      }
      triggerEl.addEventListener('transitionend', onEnd, { once: true })
      this._setTrackedTimeout(onEnd, parseFloat(duration) * (duration.includes('ms') ? 1 : 1000) + 100)
    } else {
      triggerEl.classList.remove('z-trigger-hidden')
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
   * Register a plugin. The plugin's install() method is called during init().
   * If the instance is already initialized, install() runs immediately.
   * @param {object|function} plugin - Object with install(instance, options) or a function
   * @param {object} [options] - Options passed to plugin.install()
   * @returns {this}
   */
  use (plugin, options) {
    if (!plugin) return this
    const entry = { plugin, options }
    this._plugins.push(entry)
    if (this._initialized) this._installPlugin(entry)
    return this
  }

  /** @private */
  _installPlugin (entry) {
    const { plugin, options } = entry
    try {
      if (typeof plugin === 'function') {
        plugin(this, options)
      } else if (typeof plugin.install === 'function') {
        plugin.install(this, options)
      }
    } catch (e) {
      this.notify(`plugin install error: ${e.message}`, 'error')
    }
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

  /**
   * Own the complete navigation, including asynchronous view preparation.
   * Calls made while busy are resolved no-ops; callers can await a navigation
   * before starting the next one. destroy() releases the public promise even
   * when a view source or custom driver never settles.
   * @private
   */
  _runNavigation (operation) {
    if (this._destroyed || this.blockEvents) return Promise.resolve()
    const task = { pendingViews: new Set() }
    task.promise = new Promise(resolve => { task.resolve = resolve })
    this._navigationTask = task
    this.blockEvents = true
    const finish = () => {
      if (this._navigationTask === task) {
        this._navigationTask = null
        this.blockEvents = false
        this._clearBlockEventsSafety()
      }
      task.resolve()
    }
    try {
      Promise.resolve(operation()).then(finish, error => {
        this.notify(`navigation aborted: ${error.message}`, 'error')
        finish()
      })
    } catch (error) {
      this.notify(`navigation aborted: ${error.message}`, 'error')
      finish()
    }
    return task.promise
  }

  /** @private */
  _cancelNavigation () {
    const task = this._navigationTask
    this._navigationTask = null
    this._pendingTransitionComplete = null
    this._clearBlockEventsSafety()
    this.blockEvents = false
    if (task) {
      for (const target of task.pendingViews) disposeView(target)
      task.pendingViews.clear()
      task.releaseTransition?.()
      task.resolve()
    }
  }

  /** Own preparation containers so destroy can clean up unfinished renderers. */
  _createViewContext (props = {}, trigger) {
    const context = { target: document.createElement('div'), context: this.componentContext, props }
    if (trigger) context.trigger = trigger
    this._navigationTask?.pendingViews.add(context.target)
    return context
  }

  /** @private */
  _runNavigationTransition (spec, onComplete) {
    if (this._destroyed) return Promise.resolve()
    const task = this._navigationTask
    return new Promise(resolve => {
      if (task) task.releaseTransition = resolve
      const complete = () => {
        if (this._pendingTransitionComplete !== complete) return
        this._pendingTransitionComplete = null
        if (this._destroyed) { resolve(); return }
        // Run synchronous drivers' completion synchronously as well; callers
        // using the none driver can still inspect its completed DOM immediately.
        try {
          Promise.resolve(onComplete()).then(resolve, error => {
            this.notify(`transition completion failed: ${error.message}`, 'error')
            resolve()
          })
        } catch (error) {
          this.notify(`transition completion failed: ${error.message}`, 'error')
          resolve()
        }
      }
      this._setBlockEvents()
      this._pendingTransitionComplete = complete
      const reducedMotion = this._prefersReducedMotion?.()
      const driver = reducedMotion ? getDriver('none') : this.transitionDriver
      const transitionSpec = reducedMotion
        ? { ...spec, duration: '0s', currentStage: { ...spec.currentStage, stagger: 0 } }
        : spec
      try {
        driver.runTransition(transitionSpec, complete)
      } catch (error) {
        this.notify(`transition driver failed: ${error.message}. Finishing without animation.`, 'error')
        try { getDriver('none').runTransition(transitionSpec, complete) } catch (fallbackError) { complete() }
      }
    })
  }

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
   * Returns a Promise that settles after the selected navigation completes.
   */
  async back () {
    if (this._destroyed) return
    // Guard here too: popping lateralHistory and then having _doLateral
    // ignore the call would lose the history entry.
    if (this.blockEvents) {
      this.notify('back ignored: a transition is already running.', 'warn')
      return
    }
    if (this.lateralHistory && this.lateralHistory.length > 0) {
      const popped = this.lateralHistory.pop()
      const targetViewName = popped && typeof popped === 'object' ? popped.name : popped
      const savedEntry = popped && typeof popped === 'object' ? popped.entry : undefined
      const keepAliveNode = popped && typeof popped === 'object' ? popped.node : undefined
      return this._doLateral(targetViewName, true, { savedEntry, keepAliveNode, savedStage: popped?.stage })
    }
    return this.zoomOut()
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

  init () {
    if (this._destroyed || this._initialized) return Promise.resolve()
    if (this._initPromise) return this._initPromise
    if (!this.isValid || !this.canvas) {
      this.notify('init() cannot run: instance is invalid or canvas element was not found.', 'error')
      return Promise.resolve()
    }
    this._initPromise = this._runNavigation(() => this._initialize()).finally(() => {
      this._initPromise = null
    })
    return this._initPromise
  }

  async _initialize () {
    this.tracing('init()')
    const prefetcher = this.prefetcher
    const context = this._createViewContext()
    if (this.preload && this.preload.length) {
      // Preload is an optimization: a failed prefetch must not abort init.
      await prefetcher.preloadEager(this.preload, null).catch(error => {
        this.notify(`preload failed: ${error.message}`, 'warn')
      })
      if (this._destroyed) return
    }
    let currentView
    try {
      const node = await prefetcher.get(this.initialView, context)
      if (this._destroyed) {
        disposeView(node)
        return
      }
      currentView = await prepareAndInsertView(node, this.initialView, this.canvas, true, this.views, this.componentContext)
      if (this._destroyed) {
        disposeView(currentView)
        currentView.remove()
        return
      }
    } catch (error) {
      this.notify(`init() failed to resolve initial view "${this.initialView}": ${error.message}`, 'error')
      return
    }
    this._emit('viewMounted', { viewName: this.initialView, node: currentView })
    if (this._destroyed) return
    prefetcher.scanAndPrefetch(currentView, context)
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
    this._accessibility.sync(this.canvas)

    // Install plugins
    this._initialized = true
    for (const entry of this._plugins) this._installPlugin(entry)
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
    this._destroyed = true
    this._emit('destroy')
    this._cancelNavigation()


    // Clear blockEvents safety timer
    this._clearBlockEventsSafety()

    // Clear tracked safety/cooldown timers
    this._clearTrackedTimeouts()
    this._pendingTransitionComplete = null

    // Clear resize debounce timer
    if (this._resizeDebounceTimer) {
      clearTimeout(this._resizeDebounceTimer)
      this._resizeDebounceTimer = null
    }

    // Remove all event listeners
    this._unbindEvents()

    // Remove navigation UI and kept-alive lateral views
    this._removeNav()
    this._cleanupLateralKeepAlive()
    this._accessibility.destroy()
    if (this.canvas) disposeView(this.canvas)
    for (const snapshot of this.storedViews) {
      const detached = getDetachedNode(snapshot)
      if (detached) disposeView(detached)
    }

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
      for (const [name, value] of this._canvasAttributes || []) {
        if (value === null) this.canvas.removeAttribute(name)
        else this.canvas.setAttribute(name, value)
      }
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
    return this._runNavigation(() => this._performZoomIn(targetViewName, triggerOrDescriptor))
  }

  /** @private */
  async _performZoomIn (targetViewName, triggerOrDescriptor) {
    this._emit('beforeZoomIn', { viewName: targetViewName })
    if (this._destroyed) return
    this.tracing('zoomIn()')
    const canvas = this.canvas
    const el = triggerOrDescriptor.el
    this._resetCanvasScroll(canvas)
    const canvasRect = canvas.getBoundingClientRect()
    const offsetX = canvasRect.left
    const offsetY = canvasRect.top
    const prevSnapshot = this.storedViews.length > 0 ? this.storedViews[this.storedViews.length - 1] : null
    const preScale = prevSnapshot?.scale ?? 1
    this.tracing('getView()')

    const context = this._createViewContext(el ? { ...el.dataset } : triggerOrDescriptor.props ?? {}, el)

    // Check if this view should use deferred rendering
    const isDeferred = el?.dataset?.deferred !== undefined ? true : this.deferred

    let currentView
    let deferredContent = null
    const discardPreparedView = () => {
      // Deferred children are outside the shell until completion, so disposing
      // just the shell would miss their registered cleanup scopes.
      disposeView(deferredContent)
      disposeView(currentView)
      currentView?.remove()
    }
    try {
      if (isDeferred) {
        // Deferred: resolve the view to get correct dimensions/classes for geometry,
        // but detach its children so the browser only paints an empty shell during animation.
        const node = await this.prefetcher.get(targetViewName, context)
        if (this._destroyed) { disposeView(node); return }
        deferredContent = document.createDocumentFragment()
        while (node.firstChild) deferredContent.appendChild(node.firstChild)
        currentView = await prepareAndInsertView(node, targetViewName, canvas, false, {}, this.componentContext)
      } else {
        const node = await this.prefetcher.get(targetViewName, context)
        if (this._destroyed) { disposeView(node); return }
        this.prefetcher.scanAndPrefetch(node, context)
        currentView = await prepareAndInsertView(node, targetViewName, canvas, false, this.views, this.componentContext)
      }
    } catch (error) {
      discardPreparedView()
      this.notify(`zoomIn aborted: failed to resolve view "${targetViewName}": ${error.message}`, 'error')
      return
    }

    if (!currentView) { discardPreparedView(); return }
    if (this._destroyed) {
      discardPreparedView()
      return
    }
    if (!isDeferred) this._emit('viewMounted', { viewName: targetViewName, node: currentView })
    if (this._destroyed) return

    if (el) el.classList.add('zoomed')

    const triggerRect = el
      ? (() => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()
      : triggerOrDescriptor.rect

    const duration = el ? (el.dataset.withDuration || this.duration) : (triggerOrDescriptor.duration ?? this.duration)
    const ease = el ? (el.dataset.withEase || this.ease) : (triggerOrDescriptor.ease ?? this.ease)
    const cover = el ? (el.dataset.withCover || this.cover) : (triggerOrDescriptor.cover ?? this.cover)
    const stagger = el ? (parseInt(el.dataset.withStagger, 10) || this.stagger) : (triggerOrDescriptor.stagger ?? this.stagger)

    const previousView = canvas.querySelector('.is-current-view')
    const lastView = canvas.querySelector('.is-previous-view')
    const removeView = canvas.querySelector('.is-last-view')
    if (!previousView) {
      // No current view: init() was never run, or host code stripped the view
      // class markers. Zooming would dereference null — abort and undo the insert.
      this.notify('zoomIn aborted: no current view found in canvas. Call init() before navigating and keep Zumly view classes intact.', 'error')
      if (el) el.classList.remove('zoomed')
      discardPreparedView()
      return
    }
    this._cleanupLateralKeepAlive()
    this.lateralHistory = []
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
      // ── Single read phase: all getBoundingClientRect() calls batched ──
      previousView.classList.replace('is-current-view', 'is-previous-view')
      if (lastView) lastView.classList.replace('is-previous-view', 'is-last-view')

      const cc = currentView.getBoundingClientRect()
      const previousViewRectAsPrevious = previousView.getBoundingClientRect()
      let lastViewRect = null
      let lastViewZoomedElementRect = null
      let lastZoomedEl = null
      if (lastView) {
        lastViewRect = lastView.getBoundingClientRect()
        lastZoomedEl = lastView.querySelector('.zoomed')
        lastViewZoomedElementRect = (lastZoomedEl && lastZoomedEl.getBoundingClientRect)
          ? lastZoomedEl.getBoundingClientRect()
          : lastViewRect
      }

      // ── Pure compute phase: no DOM reads or writes ──
      const canvasOffset = { left: offsetX, top: offsetY }
      const canvasRectSize = { width: canvasRect.width, height: canvasRect.height }
      const currentViewRect = { width: cc.width, height: cc.height }

      const coverResult = computeCoverScale(
        triggerRect.width, triggerRect.height, cc.width, cc.height, cover
      )
      coverScale = coverResult.scale
      const coverScaleInv = coverResult.scaleInv
      transformCurrentView0 = computeCurrentViewStartTransform(
        triggerRect, canvasOffset, currentViewRect, coverScaleInv
      )

      transformPreviousView0 = previousView.style.transform
      const prevOriginStr = computePreviousViewOrigin(triggerRect, previousViewRectAsPrevious)

      prevEnd = computePreviousViewEndTransform(
        canvasRectSize, triggerRect, previousViewRectAsPrevious, coverScale, this.parallax
      )

      // Parse old and new transforms for previousView to compute child positions mathematically
      const prevOldOrigin = parseOrigin(originalPreviousOrigin || '0 0')
      const prevOldT = parseTranslateScale(transformPreviousView0 || '')
      const prevNewOrigin = parseOrigin(prevOriginStr)
      const prevNewT = parseTranslateScale(prevEnd.transform)

      // Compute trigger rect after previousView transform change — no reflow needed
      let triggerRectAfterTransform = triggerRect
      if (el) {
        triggerRectAfterTransform = computeChildRectAfterParentTransformChange(
          triggerRect, previousViewRectAsPrevious,
          prevOldOrigin, prevOldT.tx, prevOldT.ty, prevOldT.scale,
          prevNewOrigin, prevNewT.tx, prevNewT.ty, prevNewT.scale
        )
      }
      transformCurrentView1 = computeCurrentViewEndTransform(
        triggerRectAfterTransform, canvasOffset, currentViewRect
      )

      if (lastView) {
        transformLastView0 = lastView.style.transform

        // Compute previousView rect at end transform — self-rect after transform change
        const previousViewRectWhileAtEndTransform = computeChildRectAfterParentTransformChange(
          previousViewRectAsPrevious, previousViewRectAsPrevious,
          prevOldOrigin, prevOldT.tx, prevOldT.ty, prevOldT.scale,
          prevNewOrigin, prevNewT.tx, prevNewT.ty, prevNewT.scale
        )

        // Compute lastViewZoomedElementRect after lastView gets intermediate transform
        const intermediateTransformStr = computeLastViewIntermediateTransform(
          prevEnd.x, prevEnd.y, canvasOffset, coverScale, preScale
        )
        const lastOldOrigin = parseOrigin(originalLastOrigin || '0 0')
        const lastOldT = parseTranslateScale(transformLastView0 || '')
        const lastNewT = parseTranslateScale(intermediateTransformStr)
        // lastView origin doesn't change (stays at originalLastOrigin)
        const lastViewZoomedElementRectAfterIntermediate = computeChildRectAfterParentTransformChange(
          lastViewZoomedElementRect, lastViewRect,
          lastOldOrigin, lastOldT.tx, lastOldT.ty, lastOldT.scale,
          lastOldOrigin, lastNewT.tx, lastNewT.ty, lastNewT.scale
        )

        transformLastView1 = computeLastViewEndTransform({
          canvasRect: canvasRectSize,
          canvasOffset,
          triggerRect,
          previousViewRectAtBaseTransform: previousViewRectAsPrevious,
          lastViewZoomedElementRect: lastViewZoomedElementRectAfterIntermediate,
          previousViewRectWithPreviousAtEndTransform: previousViewRectWhileAtEndTransform,
          scale: coverScale,
          preScale,
          parallax: this.parallax
        })
      }

      // ── Write phase: apply all transforms at once ──
      currentView.style.transform = transformCurrentView0
      previousView.style.transformOrigin = prevOriginStr
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
      discardPreparedView()

      // This ancestor was detached before geometry ran; an aborted navigation
      // must put it back because no new snapshot owns it yet.
      if (removeView) canvas.prepend(removeView)

      // Undo the trigger marker; a stale .zoomed would mislead the next zoomOut
      if (el) el.classList.remove('zoomed')

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
    snapShoot.stagger = stagger || 0
    this.storeViews(snapShoot)
    this.currentStage = this.storedViews[this.storedViews.length - 1]
    this.tracing('setCSSVariables()')
    // Apply background view effects (blur, saturate, etc.)
    const effects = this._resolveEffects(el)
    this._applyEffects(previousView, lastView, effects, duration, ease)
    // Hide/crossfade trigger element during zoom
    const htMode = this._resolveHideTrigger(el)
    this._applyHideTrigger(el, currentView, htMode, duration, ease)
    if (htMode) snapShoot.hideTriggerMode = htMode
    const spec = {
      type: 'zoomIn',
      currentView,
      previousView,
      lastView,
      currentStage: this.currentStage,
      duration,
      ease
    }
    const complete = async () => {
      // Deferred rendering: re-attach content that was detached before animation
      if (isDeferred && deferredContent && currentView) {
        currentView.appendChild(deferredContent)
        this.prefetcher.scanAndPrefetch(currentView, context)
        if (typeof this.views[targetViewName] === 'object' && typeof this.views[targetViewName].mounted === 'function') {
          try { await this.views[targetViewName].mounted() } catch (error) {
            this.notify(`deferred view mounted() failed: ${error.message}`, 'error')
          }
        }
        if (this._destroyed) return
        this._emit('viewMounted', { viewName: targetViewName, node: currentView })
      }
      if (this._destroyed) return
      this.blockEvents = false
      this._onTransitionComplete()
      this._updateNav()
      this._emit('afterZoomIn', { viewName: targetViewName, zoomLevel: this.zoomLevel() })
      this.tracing('ended')
    }
    await this._runNavigationTransition(spec, complete)
    if (this._destroyed && deferredContent) disposeView(deferredContent)
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
    return this._runNavigation(() => this._performLateral(targetViewName, isBack, options))
  }

  /** @private */
  async _performLateral (targetViewName, isBack = false, options = {}) {
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
    if (this._destroyed) return

    const keepAlive = this.lateralNav && this.lateralNav.keepAlive

    // Prepared here, pushed only after the incoming view resolves successfully —
    // a failed fetch must not leave a corrupt entry in lateral history.
    let pendingHistoryEntry = null
    if (!isBack) {
      this.lateralHistory = this.lateralHistory || []
      const topSnapshot = this.storedViews[this.storedViews.length - 1]
      pendingHistoryEntry = {
        name: currentName,
        stage: this._copyLateralStage(topSnapshot),
        node: keepAlive ? outgoingView : null
      }
      pendingHistoryEntry.entry = pendingHistoryEntry.stage.views[INDEX_CURRENT]
    }

    this.tracing('lateral()')
    const duration = options.duration ?? this.duration
    const ease = options.ease ?? this.ease

    const backView = this.canvas.querySelector('.is-previous-view')
    const lastView = this.canvas.querySelector('.is-last-view')

    let slideDeltaX = 0
    let slideDeltaY = 0
    const declared = this._declaredSiblings()
    const declFrom = declared ? declared.indexOf(currentName) : -1
    const declTo = declared ? declared.indexOf(targetViewName) : -1
    if (declFrom !== -1 && declTo !== -1) {
      // Declared order wins: direction and distance from the indices
      // (non-adjacent jumps slide proportionally further).
      const canvasRect = this.canvas.getBoundingClientRect()
      slideDeltaX = (declFrom - declTo) * canvasRect.width * 0.15
    } else if (backView) {
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

    // keepAlive: try to find an existing hidden DOM node for the target view
    let incomingView = null
    let keepAliveNode = null
    if (keepAlive) {
      // Check if back() passed a specific node
      if (isBack && options.keepAliveNode) {
        keepAliveNode = options.keepAliveNode
      } else {
        // Look for a kept-alive node in the canvas by view name
        keepAliveNode = this.canvas.querySelector(`.is-lateral-hidden[data-view-name="${targetViewName}"]`)
      }
    }
    if (keepAliveNode) {
      // Restore the kept-alive node: unhide and make it the incoming view
      keepAliveNode.style.display = ''
      keepAliveNode.style.opacity = ''
      keepAliveNode.classList.remove('is-lateral-hidden', 'zoom-lateral-out')
      keepAliveNode.classList.add('is-new-current-view', 'has-no-events')
      incomingView = keepAliveNode
      // Remove from lateralHistory if navigating forward to a kept-alive view
      if (!isBack && this.lateralHistory) {
        const idx = this.lateralHistory.findIndex(h => h.node === keepAliveNode)
        if (idx !== -1) this.lateralHistory.splice(idx, 1)
      }
    } else {
      // back() already popped its history entry; if resolution fails, restore it
      // so the entry isn't silently lost.
      const restoreBackEntry = () => {
        if (isBack) {
          this.lateralHistory.push({ name: targetViewName, entry: options.savedEntry, stage: options.savedStage, node: options.keepAliveNode ?? null })
        }
      }
      const context = this._createViewContext(options.props ?? {})
      try {
        const node = await this.prefetcher.get(targetViewName, context)
        if (this._destroyed) { disposeView(node); return }
        this.prefetcher.scanAndPrefetch(node, context)
        incomingView = await prepareAndInsertView(node, targetViewName, this.canvas, false, this.views, this.componentContext)
      } catch (error) {
        this.notify(`lateral navigation aborted: failed to resolve view "${targetViewName}": ${error.message}`, 'error')
        restoreBackEntry()
        return
      }
      if (!incomingView) {
        restoreBackEntry()
        return
      }
      if (this._destroyed) {
        disposeView(incomingView)
        incomingView.remove()
        return
      }
      this._emit('viewMounted', { viewName: targetViewName, node: incomingView })
      if (this._destroyed) return
    }

    const outTransform = outgoingView.style.transform || ''
    const topSnapshot = this.storedViews[this.storedViews.length - 1]
    const backViewState = backView ? {
      transformStart: backView.style.transform || '',
      transformEnd: this._computeLateralBackTransform(backView.style.transform || '', slideDeltaX, slideDeltaY)
    } : null
    const lastViewState = lastView && topSnapshot.views[INDEX_LAST] ? {
      transformStart: lastView.style.transform || '',
      transformEnd: this._computeLateralBackTransform(lastView.style.transform || '', slideDeltaX * 0.7, slideDeltaY * 0.7)
    } : null

    // Measure each incoming view in its own layout box. Reusing the outgoing
    // translation preserves its corner, not its center, when sizes differ.
    incomingView.style.transform = ''
    incomingView.style.transformOrigin = '0 0'
    const incomingRect = incomingView.getBoundingClientRect()
    const outgoingRect = outgoingView.getBoundingClientRect()
    const canvasRect = this.canvas.getBoundingClientRect()
    const canvasScaleX = canvasRect.width / this.canvas.offsetWidth || 1
    const canvasScaleY = canvasRect.height / this.canvas.offsetHeight || 1
    const outgoingEntry = topSnapshot.views[INDEX_CURRENT]
    let incomingTransformEnd = this._computeLateralBackTransform('',
      (outgoingRect.x - incomingRect.x + (outgoingRect.width - incomingRect.width) / 2) / canvasScaleX,
      (outgoingRect.y - incomingRect.y + (outgoingRect.height - incomingRect.height) / 2) / canvasScaleY)
    const backwardScale = parseTranslateScale(outgoingEntry.backwardState.transform || '').scale
    let incomingTransformBack = this._computeLateralBackTransform(outgoingEntry.backwardState.transform || '',
      (outgoingRect.width - incomingRect.width) * backwardScale / (2 * canvasScaleX),
      (outgoingRect.height - incomingRect.height) * backwardScale / (2 * canvasScaleY))
    const oldTrigger = backView?.querySelector('.zoomed')
    const targetTrigger = backView && Array.from(backView.querySelectorAll('.zoom-me[data-to]'))
      .find(trigger => trigger.dataset.to === targetViewName)

    // Rebuild the target's zoom poses from the unchanged parent base state.
    // This also updates cover scale and the reverse path to the correct trigger.
    if (targetTrigger && backViewState) {
      const geometry = this._lateralTargetGeometry(incomingView, targetTrigger, backView, lastView, topSnapshot)
      if (geometry) {
        incomingTransformEnd = geometry.currentEnd
        incomingTransformBack = geometry.currentBack
        backViewState.transformEnd = geometry.previousEnd
        if (lastViewState && geometry.lastEnd) lastViewState.transformEnd = geometry.lastEnd
        topSnapshot.scale = geometry.scale
      }
    }

    if (isBack && options.savedStage) {
      // Restore all layers, not just the current view. In particular, the
      // programmatic fallback has no trigger positions from which to undo a pan.
      Object.assign(topSnapshot, this._copyLateralStage(options.savedStage))
      incomingTransformEnd = topSnapshot.views[INDEX_CURRENT].forwardState?.transform || ''
      incomingTransformBack = topSnapshot.views[INDEX_CURRENT].backwardState.transform
      if (backViewState) backViewState.transformEnd = topSnapshot.views[INDEX_PREVIOUS].forwardState.transform
      if (lastViewState) lastViewState.transformEnd = topSnapshot.views[INDEX_LAST].forwardState.transform
      const from = splitTranslate(backViewState?.transformStart || outTransform)
      const to = splitTranslate(backViewState?.transformEnd || incomingTransformEnd)
      slideDeltaX = to.tx - from.tx
      slideDeltaY = to.ty - from.ty
    } else {
      topSnapshot.views[INDEX_CURRENT] = createViewEntry(targetViewName,
        { origin: '0 0', duration, ease, transform: incomingTransformBack },
        { origin: '0 0', duration, ease, transform: incomingTransformEnd })
    }
    this.currentStage = topSnapshot
    if (pendingHistoryEntry) this.lateralHistory.push(pendingHistoryEntry)

    // Keep both participating triggers hidden during the crossfade. Revealing
    // the outgoing one early paints its enlarged label through the fading view.
    oldTrigger?.classList.remove('zoomed')
    const hideTriggerMode = targetTrigger ? this._resolveHideTrigger(targetTrigger) : false
    topSnapshot.hideTriggerMode = hideTriggerMode
    if (targetTrigger) {
      targetTrigger.classList.add('zoomed')
      this._applyHideTrigger(targetTrigger, incomingView, hideTriggerMode, duration, ease)
      if (hideTriggerMode) targetTrigger.classList.add('z-trigger-hidden')
    }
    hideViewContent(incomingView)

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

    const incomingTransformStart = this._computeLateralBackTransform(incomingTransformEnd, -slideDeltaX, -slideDeltaY)
    const outgoingTransformEnd = this._computeLateralBackTransform(outTransform, slideDeltaX, slideDeltaY)

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
      slideDeltaY,
      keepAlive: keepAlive && !isBack ? keepAlive : false
    }
    const complete = () => {
      if (oldTrigger && oldTrigger !== targetTrigger) {
        oldTrigger.classList.remove('z-trigger-hidden', 'z-trigger-fade', 'z-trigger-fade-reverse')
        oldTrigger.style.removeProperty('--zoom-duration')
        oldTrigger.style.removeProperty('--zoom-ease')
      }
      if (hideTriggerMode === 'fade') targetTrigger.classList.remove('z-trigger-hidden')
      // keepAlive forward: keep outgoing view in DOM instead of removing (driver skips removeViewFromCanvas)
      if (keepAlive && !isBack) {
        outgoingView.classList.remove('is-current-view', 'is-new-current-view', 'has-no-events')
        outgoingView.classList.add('is-lateral-hidden')
        if (keepAlive !== 'visible') {
          outgoingView.style.display = 'none'
        } else {
          // visible mode: restore original transform (driver didn't animate outgoing)
          outgoingView.style.transform = outTransform
          outgoingView.style.opacity = ''
        }
      }
      this.blockEvents = false
      this._onTransitionComplete()
      this._updateNav()
      this._emit('afterLateral', { viewName: targetViewName, from: currentName, isBack })
      this.tracing('ended')
    }
    return this._runNavigationTransition(spec, complete)
  }

  /**
   * Copy poses for lateral back without sharing mutable resize/forward states.
   */
  _copyLateralStage (stage) {
    return {
      ...stage,
      views: stage.views.map(entry => ({
        ...entry,
        ...(entry.backwardState && { backwardState: { ...entry.backwardState } }),
        ...((entry.forwardState || entry.backwardState) && {
          forwardState: { ...(entry.forwardState || entry.backwardState) }
        })
      }))
    }
  }

  /**
   * Align a lateral target with the current focus while preserving layer origins.
   * All reads are converted to canvas coordinates, including nested scaled canvases.
   */
  _lateralTargetGeometry (incomingView, trigger, previousView, lastView, stage) {
    const canvasRect = this.canvas.getBoundingClientRect()
    const sx = canvasRect.width / this.canvas.offsetWidth || 1
    const sy = canvasRect.height / this.canvas.offsetHeight || 1
    const rect = element => {
      const r = element.getBoundingClientRect()
      return { x: (r.x - canvasRect.x) / sx, y: (r.y - canvasRect.y) / sy, width: r.width / sx, height: r.height / sy }
    }
    const incoming = rect(incomingView)
    const current = rect(this.canvas.querySelector(':scope > .is-current-view'))
    const previous = rect(previousView)
    const target = rect(trigger)
    if (!incoming.width || !incoming.height || !target.width || !target.height) return null

    const old = parseTranslateScale(previousView.style.transform || '')
    const origin = parseOrigin(previousView.style.transformOrigin || '0 0')
    const cover = trigger.dataset.withCover || this.cover
    const ratio = computeCoverScale(target.width, target.height, incoming.width, incoming.height, cover).scale
    const scale = old.scale * ratio
    const project = (child, parent, fromOrigin, from, toOrigin, to) =>
      computeChildRectAfterParentTransformChange(child, parent,
        fromOrigin, from.tx, from.ty, from.scale, toOrigin, to.tx, to.ty, to.scale)
    const predictedTarget = project(target, previous, origin, old, origin, { ...old, scale })
    const next = {
      tx: old.tx + current.x + current.width / 2 - predictedTarget.x - predictedTarget.width / 2,
      ty: old.ty + current.y + current.height / 2 - predictedTarget.y - predictedTarget.height / 2,
      scale
    }
    const serialize = pose => `translate(${pose.tx}px, ${pose.ty}px) scale(${pose.scale})`
    const restoredTarget = project(target, previous, origin, old, { x: 0, y: 0 },
      parseTranslateScale(stage.views[INDEX_PREVIOUS].backwardState.transform || ''))
    const inverse = computeCoverScale(restoredTarget.width, restoredTarget.height, incoming.width, incoming.height, cover).scaleInv
    const result = {
      currentEnd: `translate(${current.x - incoming.x + (current.width - incoming.width) / 2}px, ${current.y - incoming.y + (current.height - incoming.height) / 2}px)`,
      currentBack: computeCurrentViewStartTransform(restoredTarget, { left: incoming.x, top: incoming.y }, incoming, inverse),
      previousEnd: serialize(next),
      scale
    }

    if (lastView && stage.views[INDEX_LAST]) {
      // Apply the same scene movement to the ancestor. Arbitrary per-step pans
      // accumulate an error between this layer and its child after lateral loops.
      const last = rect(lastView)
      const lastOrigin = parseOrigin(lastView.style.transformOrigin || '0 0')
      const lastOld = parseTranslateScale(lastView.style.transform || '')
      const previousEnd = project(previous, previous, origin, old, origin, next)
      const lastNext = { ...lastOld, scale: lastOld.scale * ratio }
      const predictedLast = project(last, last, lastOrigin, lastOld, lastOrigin, lastNext)
      lastNext.tx += previousEnd.x + ratio * (last.x - previous.x) - predictedLast.x
      lastNext.ty += previousEnd.y + ratio * (last.y - previous.y) - predictedLast.y
      result.lastEnd = serialize(lastNext)
    }
    return result
  }

  /**
   * Add translate(dx, dy) to an existing transform string for lateral slide.
   */
  _computeLateralBackTransform (transform, dx, dy) {
    const t = splitTranslate(transform)
    if (t.matched) {
      return `translate(${t.tx + dx}px, ${t.ty + dy}px) ${t.rest}`.trim()
    }
    return `translate(${dx}px, ${dy}px) ${transform}`.trim()
  }

  // ─── Zoom out ────────────────────────────────────────────────────

  zoomOut () {
    return this._runNavigation(() => this._performZoomOut())
  }

  /** @private */
  _performZoomOut () {
    this._emit('beforeZoomOut', { zoomLevel: this.zoomLevel() })
    if (this._destroyed) return
    this.tracing('zoomOut()')
    const canvas = this.canvas
    this._resetCanvasScroll(canvas)
    const currentView = canvas.querySelector('.is-current-view')
    const previousView = canvas.querySelector('.is-previous-view')
    if (!currentView || !previousView) {
      this.notify('zoomOut: current or previous view not found (animation may still be running)', 'warn')
      return
    }
    this._cleanupLateralKeepAlive()
    this.lateralHistory = []
    this.currentStage = this.storedViews[this.storedViews.length - 1]
    const lastView = canvas.querySelector('.is-last-view')
    this.tracing('setCSSVariables()')

    const duration = this.currentStage.views[INDEX_CURRENT]?.forwardState?.duration ?? this.duration
    const ease = this.currentStage.views[INDEX_CURRENT]?.forwardState?.ease ?? this.ease

    const zoomedEl = previousView.querySelector('.zoomed')
    if (zoomedEl) zoomedEl.classList.remove('zoomed')
    // Restore trigger visibility if it was hidden/faded during zoom-in
    const htMode = this.currentStage.hideTriggerMode
    if (htMode && zoomedEl) {
      this._restoreHideTrigger(zoomedEl, htMode, duration, ease)
    }
    // Crossfade: outgoing view fades out (opacity 1 → 0) during zoom-out
    if (htMode === 'fade') {
      currentView.classList.remove('z-view-fade-in')
      currentView.style.setProperty('--zoom-duration', duration)
      currentView.style.setProperty('--zoom-ease', ease)
      currentView.classList.add('z-view-fade-out')
    } else {
      currentView.classList.remove('z-view-fade-in')
      currentView.style.removeProperty('opacity')
    }
    // Remove effect from previousView (it becomes current again)
    this._removeEffect(previousView)
    previousView.classList.replace('is-previous-view', 'is-current-view')

    if (lastView !== null) {
      // lastView becomes previous: update its effect to the previous-view level
      if (lastView.classList.contains('has-effect') && this.effects[0] !== 'none') {
        lastView.style.setProperty('--z-effect-filter', this.effects[0])
      }
      lastView.classList.replace('is-last-view', 'is-previous-view')
      lastView.classList.remove('hide')
      showViewContent(lastView)
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
    const complete = () => {
      this.blockEvents = false
      this._onTransitionComplete()
      // Pop storedViews inside callback so nav update sees correct depth
      // (with sync drivers like 'none', the callback runs before code after runTransition)
      this.storedViews.pop()
      this._updateNav()
      this._emit('afterZoomOut', { zoomLevel: this.zoomLevel() })
      this.tracing('ended')
    }
    return this._runNavigationTransition(spec, complete)
  }

  // ─── Event handling ──────────────────────────────────────────────

  onZoom (event) {
    if (this._destroyed) return
    if (event.type === 'mouseup' && event.button !== 0) return
    if (event.type === 'click' && !this.inputs.keyboard) return
    // Check if this input type is enabled
    if (event.type === 'mouseup' && !this.inputs.click) return
    if (event.type === 'touchend' && !this.inputs.touch) return
    const target = event.target
    if (target.closest?.('[inert]')) return
    // Ignore events from navigation UI
    if (target.closest('.z-depth-nav') || target.closest('.z-lateral-nav')) return
    const isZoomMe = target.classList.contains('zoom-me') || target.closest('.zoom-me')
    if (!this.blockEvents && isZoomMe && !this.touching) {
      this.tracing('onZoom() → zoomIn')
      event.preventDefault()
      event.stopPropagation()
      const trigger = target.classList.contains('zoom-me') ? target : target.closest('.zoom-me')
      this.zoomIn(trigger)
      return
    }
    if (this.storedViews.length > 1 && !this.blockEvents && !isZoomMe && !this.touching) {
      // If the click landed inside the current view, let interactive elements work
      const currentView = this.canvas.querySelector('.is-current-view')
      if (currentView && currentView.contains(target)) return

      // Check if click lands on a sibling .zoom-me in the previous view
      const siblingTrigger = this._findSiblingTriggerAtPoint(event.clientX, event.clientY)
      if (siblingTrigger) {
        this.tracing('onZoom() → lateral')
        event.stopPropagation()
        this._doLateral(siblingTrigger.dataset.to)
        return
      }
      this.tracing('onZoom() → zoomOut')
      event.stopPropagation()
      this.zoomOut()
    }
  }

  /**
   * Hit-test sibling .zoom-me elements in the previous view at given coordinates.
   * Uses getBoundingClientRect since previous-view has pointer-events: none.
   * @param {number} x - clientX
   * @param {number} y - clientY
   * @returns {HTMLElement|null} The sibling trigger element, or null
   * @private
   */
  _findSiblingTriggerAtPoint (x, y) {
    const previousView = this.canvas.querySelector('.is-previous-view')
    if (!previousView) return null
    const currentView = this.canvas.querySelector('.is-current-view')
    const currentName = currentView?.dataset?.viewName
    if (!currentName) return null
    const triggers = previousView.querySelectorAll('.zoom-me[data-to]')
    for (const trigger of triggers) {
      if (trigger.dataset.to === currentName) continue
      const rect = trigger.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return trigger
      }
    }
    return null
  }

  // ─── Lateral navigation UI ────────────────────────────────────────

  /**
   * Get the list of sibling view names at the current depth.
   * @returns {{ siblings: string[], currentIndex: number }}
   * @private
   */
  _getSiblings () {
    const currentView = this.canvas.querySelector('.is-current-view')
    const currentName = currentView?.dataset?.viewName
    // Declared siblings (lateralNav.siblings) take precedence over inferring
    // the order from trigger positions in the parent view.
    const declared = this._declaredSiblings()
    if (declared && declared.indexOf(currentName) !== -1) {
      return { siblings: declared, currentIndex: declared.indexOf(currentName) }
    }
    const previousView = this.canvas.querySelector('.is-previous-view')
    if (!previousView) return { siblings: [], currentIndex: -1 }
    const triggers = previousView.querySelectorAll('.zoom-me[data-to]')
    const siblings = []
    for (const t of triggers) {
      if (t.dataset.to) siblings.push(t.dataset.to)
    }
    const currentIndex = siblings.indexOf(currentName)
    return { siblings, currentIndex }
  }

  /**
   * Resolve the declared sibling order for the current depth, if configured.
   * `lateralNav.siblings` can be an array (one lateral group) or a map keyed
   * by parent view name: { home: ['a','b','c'] }.
   * @returns {string[]|null}
   * @private
   */
  _declaredSiblings () {
    const conf = this.lateralNav && typeof this.lateralNav === 'object' ? this.lateralNav.siblings : null
    if (!conf) return null
    if (Array.isArray(conf)) return conf
    const parentName = this.canvas.querySelector('.is-previous-view')?.dataset?.viewName
    if (parentName && Array.isArray(conf[parentName])) return conf[parentName]
    return null
  }

  // ─── Navigation UI (separate depth + lateral components) ─────────

  /**
   * Create or update both navigation components.
   * Called after zoom-in, zoom-out, and lateral navigation.
   * @private
   */
  _updateNav () {
    if (this._destroyed) return
    this._removeNav()
    this._updateDepthNav()
    this._updateLateralNav()
  }

  /**
   * Create the depth navigation button (back arrow in a circle).
   * Position: bottom-left (default) or top-left.
   * @private
   */
  _updateDepthNav () {
    if (!this.depthNav) return
    const depth = this.storedViews.length - 1
    if (depth < 1) return

    // Check if a child Zumly instance inside the current view has its own depth nav.
    // If so, hide ours to avoid duplicate back buttons.
    const cv = this.canvas.querySelector('.z-view.is-current-view')
    if (cv && cv.querySelector('.z-depth-nav')) return

    const pos = this.depthNav.position || 'bottom-left'
    const nav = document.createElement('div')
    nav.className = 'z-depth-nav z-depth-nav--' + pos

    const backBtn = document.createElement('button')
    backBtn.className = 'z-nav-back'
    backBtn.setAttribute('aria-label', 'Zoom out (go back)')
    backBtn.innerHTML = '&#8249;'
    backBtn.type = 'button'
    backBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!this.blockEvents && this.storedViews.length > 1) {
        this.zoomOut()
      }
    })
    nav.appendChild(backBtn)

    this.canvas.appendChild(nav)
  }

  /**
   * Create the lateral navigation bar (arrows + dots).
   * Position: bottom-center (default) or top-center.
   * @private
   */
  _updateLateralNav () {
    if (!this.lateralNav) return
    const depth = this.storedViews.length - 1

    let lateralData = this._getSiblings()
    if (lateralData.siblings.length < 2) return
    // Auto mode: suppress lateral nav when the current view covers the full canvas
    if (this.lateralNav.mode === 'auto' && depth >= 1) {
      const cv = this.canvas.querySelector('.z-view.is-current-view')
      if (cv && cv.offsetWidth >= this.canvas.offsetWidth && cv.offsetHeight >= this.canvas.offsetHeight) {
        return
      }
    }

    const { siblings, currentIndex } = lateralData
    const pos = this.lateralNav.position || 'bottom-center'
    const nav = document.createElement('div')
    nav.className = 'z-lateral-nav z-lateral-nav--' + pos

    if (this.lateralNav.arrows) {
      const prevBtn = document.createElement('button')
      prevBtn.className = 'z-nav-arrow z-nav-prev'
      prevBtn.setAttribute('aria-label', 'Previous sibling view')
      prevBtn.innerHTML = '&#8249;'
      prevBtn.disabled = currentIndex <= 0
      prevBtn.type = 'button'
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (currentIndex > 0) this._doLateral(siblings[currentIndex - 1])
      })
      nav.appendChild(prevBtn)
    }

    if (this.lateralNav.dots) {
      const dotsContainer = document.createElement('div')
      dotsContainer.className = 'z-nav-lateral-dots'
      for (let i = 0; i < siblings.length; i++) {
        const dot = document.createElement('button')
        dot.className = 'z-nav-dot z-nav-lat-dot' + (i === currentIndex ? ' is-active' : '')
        dot.setAttribute('aria-label', `Go to ${siblings[i]}`)
        dot.dataset.to = siblings[i]
        dot.type = 'button'
        if (i === currentIndex) dot.setAttribute('aria-current', 'true')
        dot.addEventListener('click', ((idx) => (e) => {
          e.stopPropagation()
          if (idx !== currentIndex) this._doLateral(siblings[idx])
        })(i))
        dotsContainer.appendChild(dot)
      }
      nav.appendChild(dotsContainer)
    }

    if (this.lateralNav.arrows) {
      const nextBtn = document.createElement('button')
      nextBtn.className = 'z-nav-arrow z-nav-next'
      nextBtn.setAttribute('aria-label', 'Next sibling view')
      nextBtn.innerHTML = '&#8250;'
      nextBtn.disabled = currentIndex >= siblings.length - 1
      nextBtn.type = 'button'
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (currentIndex < siblings.length - 1) this._doLateral(siblings[currentIndex + 1])
      })
      nav.appendChild(nextBtn)
    }

    this.canvas.appendChild(nav)
  }

  /**
   * Remove all navigation UI from the canvas.
   * @private
   */
  _removeNav () {
    if (!this.canvas) return
    this.canvas.querySelectorAll('.z-depth-nav, .z-lateral-nav').forEach(el => el.remove())
  }

  /**
   * Remove all kept-alive lateral views from the DOM.
   * Called when leaving the current depth level (zoomIn, zoomOut, destroy).
   * @private
   */
  _cleanupLateralKeepAlive () {
    if (!this.canvas) return
    const hidden = this.canvas.querySelectorAll('.is-lateral-hidden')
    for (const el of hidden) {
      this._accessibility.restore(el)
      disposeView(el)
      el.remove()
    }
  }

  onKeyDown (event) {
    if (this._destroyed || !this.inputs.keyboard || event.defaultPrevented || isEditable(event.target)) return
    const trigger = event.target.closest?.('.zoom-me[data-to]')
    if (!trigger || isNativeControl(trigger) || trigger.closest('[inert]')) return
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (event.key === 'Enter' && !event.repeat && !this.blockEvents) this.zoomIn(trigger)
    }
  }

  onKeyUp (event) {
    if (this._destroyed) return
    if (!this.inputs.keyboard || event.defaultPrevented || isEditable(event.target) || event.target.closest?.('[inert]')) return
    const trigger = event.target.closest?.('.zoom-me[data-to]')
    if (event.key === ' ' && trigger && !isNativeControl(trigger)) {
      event.preventDefault()
      if (!this.blockEvents) this.zoomIn(trigger)
      return
    }
    this.tracing('onKeyUp()')
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.zoomOut()
      } else {
        this.notify(`is on level zero. Can't zoom out. Trigger: ${event.key}`, 'warn')
      }
    }
  }

  onWheel (event) {
    if (this._destroyed) return
    if (!this.inputs.wheel) return
    // Don't intercept wheel if target is inside a scrollable element
    if (this._isInsideScrollable(event.target, event.deltaY)) return
    // Prevent browser scroll on the canvas — it causes jank during zoom transitions
    event.preventDefault()
    if (this.blockEvents || this._wheelCooldown) return
    if (event.deltaY > 0 && this.storedViews.length > 1) {
      // Leading-edge: fire immediately on first wheel event, then ignore the rest
      this.tracing('onWheel() → zoomOut')
      this._wheelCooldown = true
      this._setTrackedTimeout(() => { this._wheelCooldown = false }, 500)
      this.zoomOut()
    }
  }

  /**
   * Check if an element sits inside a scrollable container (within the current view)
   * that still has scroll room in the wheel direction.
   * @param {HTMLElement} target - The event target
   * @param {number} deltaY - Wheel deltaY (positive = scroll down)
   * @returns {boolean}
   * @private
   */
  _isInsideScrollable (target, deltaY) {
    let el = target
    const currentView = this.canvas.querySelector('.is-current-view')
    while (el && el !== this.canvas) {
      // Only check elements inside the current view
      if (el === currentView || (currentView && currentView.contains(el))) {
        const { overflowY } = window.getComputedStyle(el)
        if (overflowY === 'auto' || overflowY === 'scroll') {
          const canScroll = deltaY > 0
            ? el.scrollTop + el.clientHeight < el.scrollHeight - 1
            : el.scrollTop > 0
          if (canScroll) return true
        }
      }
      el = el.parentElement
    }
    return false
  }

  onTouchStart (event) {
    if (this._destroyed) return
    if (!this.inputs.touch) return
    this.tracing('onTouchStart()')
    this.touching = true
    this.touchstartX = event.changedTouches[0].screenX
    this.touchstartY = event.changedTouches[0].screenY
  }

  onTouchEnd (event) {
    if (this._destroyed) return
    if (!this.inputs.touch) return
    if (!this.blockEvents) {
      this.tracing('onTouchEnd()')
      this.touchendX = event.changedTouches[0].screenX
      this.touchendY = event.changedTouches[0].screenY
      this.handleGesture(event)
    }
    // Always release the flag: after a swipe (or a blocked gesture) no tap branch
    // runs, and a stuck `touching` would block every subsequent mouseup.
    this.touching = false
  }

  handleGesture (event) {
    // Navigation controls handle their own click, including synthesized touch clicks.
    if (event.target.closest?.('.z-depth-nav, .z-lateral-nav')) return
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
    const trigger = event.target.classList.contains('zoom-me') ? event.target : event.target.closest('.zoom-me')
    if (isTap && !this.blockEvents && trigger && this.touching) {
      this.touching = false
      this.tracing('tap')
      event.preventDefault()
      this.zoomIn(trigger)
    }
    if (isTap && this.storedViews.length > 1 && !this.blockEvents && !trigger && event.target.closest('.is-current-view') === null && this.touching) {
      this.touching = false
      this.tracing('tap')
      this.zoomOut()
    }
  }

}
