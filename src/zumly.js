import { prepareAndInsertView, definitionTitle, formatLabel, notification, checkParameters, normalizeDuration, normalizeEase } from './utils.js'
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
  splitTranslate,
  poseFromTransform,
  composePoses,
  invertPose,
  poseToTransform
} from './geometry.js'
import { createViewEntry, createRemovedViewEntry, createZoomSnapshot, getDetachedNode, INDEX_CURRENT, INDEX_PREVIOUS, INDEX_LAST } from './snapshots.js'
import { ViewPrefetcher } from './view-prefetcher.js'
import { getDriver, parseDurationMs } from './drivers/index.js'
import { removeViewFromCanvas } from './drivers/driver-helpers.js'
import { DepthNav } from './depth-nav.js'
import { applyResizeCorrection } from './resize-correction.js'
import { hideViewContent, showViewContent, restoreViewContent } from './view-visibility.js'
import { disposeView, activateView } from './view-lifecycle.js'
import { ViewAccessibility, isNativeControl, isEditable } from './view-accessibility.js'
import { unknownViewMessage } from './diagnostics.js'

/**
 * Maximum time (ms) that blockEvents can stay true before being force-reset.
 * Prevents permanent UI freeze if a driver never calls onComplete (bug, error, removed element).
 * @type {number}
 */
const BLOCK_EVENTS_SAFETY_MS = 8000

/** Wheel distance (px) that takes a followed zoom-out from 0 to 1. */
const WHEEL_FOLLOW_DISTANCE = 400
/** Wheel silence (ms) that counts as releasing a followed zoom-out. */
const WHEEL_RELEASE_MS = 140
/** Fraction of the canvas width a swipe travels for a full zoom-out. */
const SWIPE_FOLLOW_WIDTH = 0.6
/** Fraction of the starting finger distance a pinch closes for a full zoom-out. */
const PINCH_FOLLOW_CLOSE = 0.6

function touchDistance (touches) {
  return Math.hypot(touches[0].screenX - touches[1].screenX, touches[0].screenY - touches[1].screenY) || 1
}

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
    this.canvas = typeof this.mount === 'string' ? document.querySelector(this.mount) : this.mount
    if (!this.canvas) {
      this.notify(`mount selector "${this.mount}" did not match any element. Create the canvas element before new Zumly(), or pass the element itself.`, 'error')
      this.isValid = false
      return
    }
    if (!this.canvas.classList.contains('zumly-canvas')) {
      this.notify('the mount element needs the class "zumly-canvas" (and zumly.css loaded). Adding the class.', 'warn')
      this.canvas.classList.add('zumly-canvas')
    }
    /** Built-in driver name, or 'custom' for a driver function. */
    this.transitionDriverName = typeof this.transitionDriver === 'string' ? this.transitionDriver : 'custom'
    this.transitionDriver = getDriver(this.transitionDriver)

    // Event bindings (stored for cleanup in destroy())
    this._onZoom = this.onZoom.bind(this)
    this._onTouchStart = this.onTouchStart.bind(this)
    this._onTouchEnd = this.onTouchEnd.bind(this)
    this._onTouchMove = this.onTouchMove.bind(this)
    this._onTouchCancel = () => {
      this.touching = false
      this._swipe = null
      this._pinch = null
      this._pinchTail = false
      if (this._scrub && this._scrub.source !== 'wheel') this._endZoomOutScrub(false)
    }
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
    canvas.addEventListener('touchmove', this._onTouchMove, { passive: false })
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
      canvas.removeEventListener('touchmove', this._onTouchMove)
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
  _setBlockEvents (expectedMs = 0) {
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
    }, Math.max(BLOCK_EVENTS_SAFETY_MS, expectedMs + BLOCK_EVENTS_SAFETY_MS / 4))
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
        const parse = this.trace.map((task, index) => `${index === 0 ? `Instance ${typeof this.mount === 'string' ? this.mount : 'element'}: ${task}` : `${task}`}`).join(' > ')
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
    // Layout dimensions exclude a surrounding Zumly instance's animated scale.
    this._lastCanvasWidth = this.canvas.offsetWidth
    this._lastCanvasHeight = this.canvas.offsetHeight
  }

  _handleResize () {
    if (this._destroyed) return
    if (this._resizeDebounceTimer) clearTimeout(this._resizeDebounceTimer)
    this._resizeDebounceTimer = setTimeout(() => {
      this._resizeDebounceTimer = null
      this._layoutNav()
      if (!this.isValid || !this.canvas || this._lastCanvasWidth === 0) return
      const newW = this.canvas.offsetWidth
      const newH = this.canvas.offsetHeight
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
      if (this.canvas && this._lastCanvasWidth > 0) {
        const newW = this.canvas.offsetWidth
        const newH = this.canvas.offsetHeight
        if (newW !== this._lastCanvasWidth || newH !== this._lastCanvasHeight) {
          applyResizeCorrection(this, this._lastCanvasWidth, this._lastCanvasHeight, newW, newH)
        }
        this._lastCanvasWidth = newW
        this._lastCanvasHeight = newH
      }
    } else {
      this._recordCanvasSize()
    }
    // Drivers need visible contents while moving; afterwards let CSS skip work
    // for offscreen views again instead of permanently overriding `auto`.
    for (const view of this.canvas?.children || []) {
      if (view.classList.contains('z-view')) restoreViewContent(view)
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
    const selector = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focus = element => {
      if (!element || element.closest('[inert], [hidden]')) return false
      element.focus({ preventScroll: true })
      return document.activeElement === element || element.contains(document.activeElement)
    }
    // Most views accept the first candidate. Avoid collecting a whole large
    // form unless hidden/inert controls require the fallback search.
    const first = currentView.querySelector(selector)
    if (focus(first)) return
    for (const element of currentView.querySelectorAll(selector)) {
      if (element !== first && focus(element)) return
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
      this._setEffectDuration(previousView)
      previousView.style.setProperty('--z-effect-filter', effects[0])
      previousView.style.setProperty('--zoom-duration', duration)
      previousView.style.setProperty('--zoom-ease', ease)
      previousView.classList.add('has-effect')
    }
    if (lastView && effects[1] !== 'none') {
      this._setEffectDuration(lastView)
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
  /**
   * Pin the filter transition to 0s when effects must not animate (transitions.animateEffects).
   * @param {HTMLElement} element
   * @private
   */
  _setEffectDuration (element) {
    if (this.animateEffects === false) element.style.setProperty('--z-effect-duration', '0s')
    else element.style.removeProperty('--z-effect-duration')
  }

  _removeEffect (element) {
    if (!element || !element.classList.contains('has-effect')) return
    if (this.animateEffects === false) {
      element.classList.remove('has-effect', 'has-effect-reverse')
      element.style.removeProperty('--z-effect-filter')
      return
    }
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
  _applyHideTrigger (triggerEl, currentView, mode, duration, ease, fadeView = true) {
    if (!mode || !triggerEl) return
    if (mode === 'fade') {
      triggerEl.style.setProperty('--zoom-duration', duration)
      triggerEl.style.setProperty('--zoom-ease', ease)
      triggerEl.classList.add('z-trigger-fade')
      // Lateral drivers already animate opacity; a second fade only forces an
      // extra layout flush and competes with their keyframes.
      if (!fadeView) return
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
    this.prefetcher?.pause()
    const finish = () => {
      if (this._navigationTask === task) {
        this._navigationTask = null
        this.blockEvents = false
        this._clearBlockEventsSafety()
        this.prefetcher?.resume()
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

  /**
   * Prefetch a newly active view's targets and report triggers that point
   * nowhere (once per target), before the user clicks them.
   * @private
   */
  _scanView (node, context) {
    this.prefetcher?.scanAndPrefetch(node, context)
    if (!node?.querySelectorAll) return
    this._reportedTargets ||= new Set()
    for (const trigger of node.querySelectorAll('.zoom-me')) {
      const to = trigger.dataset.to
      const key = to ?? ''
      if (this._reportedTargets.has(key)) continue
      if (!to) {
        this._reportedTargets.add(key)
        this.notify('a .zoom-me element has no data-to attribute, so it does nothing. Add data-to="viewName".', 'warn')
      } else if (!Object.prototype.hasOwnProperty.call(this.views, to)) {
        if (to.includes('-') && typeof customElements !== 'undefined' && customElements.get(to)) continue
        if (/^https?:\/\/|^\/|\.(?:html|php)(?:[?#].*)?$/i.test(to)) continue
        this._reportedTargets.add(key)
        this.notify(to.includes('-')
          ? `data-to="${to}": ${unknownViewMessage(to, this.views)} It will be treated as a custom element tag once <${to}> is defined.`
          : `data-to="${to}": ${unknownViewMessage(to, this.views)}`, 'warn')
      }
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
      const reducedMotion = this._prefersReducedMotion?.() || spec.instant
      const driver = reducedMotion ? getDriver('none') : this.transitionDriver
      const transitionSpec = reducedMotion
        ? { ...spec, duration: '0s', currentStage: { ...spec.currentStage, stagger: 0 } }
        : spec
      // Long or staggered transitions must not trip the safety reset mid-animation.
      const stagger = transitionSpec.currentStage?.stagger || 0
      this._setBlockEvents(parseDurationMs(transitionSpec.duration) + stagger * 2)
      this._pendingTransitionComplete = complete
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
   * Whether back() would navigate: there is lateral history at this depth
   * or a level to zoom out to.
   * @returns {boolean}
   */
  canGoBack () {
    return !this._destroyed && (this.lateralHistory.length > 0 || this.storedViews.length > 1)
  }

  /** @private */
  _emitViewChanged (type, from) {
    this._emit('viewChanged', {
      type,
      viewName: this.getCurrentViewName(),
      from,
      zoomLevel: this.zoomLevel(),
      node: this.canvas?.querySelector('.is-current-view') ?? null
    })
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
   * The view node at a stack depth (0 = root): one of the three views in the
   * canvas, or an ancestor detached into the snapshot that hid it.
   * @private
   * @param {number} depth
   * @returns {HTMLElement|null}
   */
  _viewNodeAt (depth) {
    const top = this.storedViews.length - 1
    const role = ['is-current-view', 'is-previous-view', 'is-last-view'][top - depth]
    if (role) return this.canvas?.querySelector(`:scope > .z-view.${role}`) ?? null
    return getDetachedNode(this.storedViews[depth + 3] ?? {}) ?? null
  }

  /**
   * Human-readable name of a view: its data-title, else the `title` of its
   * definition, else the view name itself.
   * @param {string} viewName
   * @returns {string}
   */
  getViewTitle (viewName) {
    for (let depth = this.storedViews.length - 1; depth >= 0; depth--) {
      if (this.storedViews[depth].views[INDEX_CURRENT]?.viewName !== viewName) continue
      const title = this._viewNodeAt(depth)?.dataset?.title
      if (title) return title
    }
    return definitionTitle(this.views?.[viewName]) ?? viewName
  }

  /**
   * The views from the root to the current one, with their titles.
   * @returns {Array<{ name: string, title: string, depth: number }>}
   */
  getViewStack () {
    return this.storedViews.map((stage, depth) => {
      const name = stage.views[INDEX_CURRENT]?.viewName ?? null
      const title = this._viewNodeAt(depth)?.dataset?.title || definitionTitle(this.views?.[name]) || name
      return { name, title, depth }
    })
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
      this.notify('back ignored: a transition is already running.')
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
      duration: normalizeDuration(options.duration, 'zoomTo() duration', this.duration),
      ease: normalizeEase(options.ease, this.transitionDriverName, 'zoomTo() ease', this.ease),
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
    // A canvas can be sized a moment later (hidden tab, panel opening), so
    // only a canvas that stays empty is reported.
    const hasNoSize = () => this.canvas && (this.canvas.clientWidth === 0 || this.canvas.clientHeight === 0)
    if (hasNoSize()) {
      this._setTrackedTimeout(() => {
        if (!this._destroyed && hasNoSize() && document.visibilityState !== 'hidden') {
          this.notify(`the canvas is ${this.canvas.clientWidth}×${this.canvas.clientHeight}px, so views will not be visible. .zumly-canvas is position: absolute and fills its nearest positioned ancestor: give that container position: relative and a height.`, 'warn')
        }
      }, 1000)
    }
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
    this._scanView(currentView, context)
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
    this._emitViewChanged('init', null)
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
    this._stopScrubAnimations()


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
    this.prefetcher?.destroy()
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
    const fromName = this.getCurrentViewName()
    this._emit('beforeZoomIn', { viewName: targetViewName })
    if (this._destroyed) return
    this.tracing('zoomIn()')
    const canvas = this.canvas
    const el = triggerOrDescriptor.el
    this._resetCanvasScroll(canvas)
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
        // mounted() runs after the animation, so prepareAndInsertView gets no
        // views map here: carry the definition's title over explicitly.
        const title = !node.dataset?.title && definitionTitle(this.views[targetViewName])
        if (title) node.dataset.title = title
        deferredContent = document.createDocumentFragment()
        while (node.firstChild) deferredContent.appendChild(node.firstChild)
        currentView = await prepareAndInsertView(node, targetViewName, canvas, false, {}, this.componentContext)
      } else {
        const node = await this.prefetcher.get(targetViewName, context)
        if (this._destroyed) { disposeView(node); return }
        this._scanView(node, context)
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

    // Resolve/mount can yield or change layout. Measure the canvas together
    // with the trigger instead of retaining coordinates from before the await.
    const canvasRect = canvas.getBoundingClientRect()
    const offsetX = canvasRect.left
    const offsetY = canvasRect.top
    const triggerRect = el
      ? (() => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()
      : triggerOrDescriptor.rect

    const duration = el ? normalizeDuration(el.dataset.withDuration, 'data-with-duration', this.duration) : (triggerOrDescriptor.duration ?? this.duration)
    const ease = el ? normalizeEase(el.dataset.withEase, this.transitionDriverName, 'data-with-ease', this.ease) : (triggerOrDescriptor.ease ?? this.ease)
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
    // Each depth keeps its own lateral history: park it on the parent's
    // snapshot so back() after zooming out again returns laterally, as the
    // router's browser back does. Kept-alive nodes are discarded below, so
    // parked entries render their view again.
    if (prevSnapshot && this.lateralHistory.length) {
      prevSnapshot.lateralHistory = this.lateralHistory.map(entry => ({ ...entry, node: null }))
    }
    this._cleanupLateralKeepAlive()
    this.lateralHistory = []
    hideViewContent(currentView)
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
      if (prevSnapshot?.lateralHistory) {
        this.lateralHistory = prevSnapshot.lateralHistory
        delete prevSnapshot.lateralHistory
      }
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

      restoreViewContent(previousView)
      restoreViewContent(lastView)
      restoreViewContent(removeView)

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
    // Zoom-out back to this level restores the same background effects.
    snapShoot.effects = effects
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
        this._scanView(currentView, context)
        if (typeof this.views[targetViewName] === 'object' && typeof this.views[targetViewName].mounted === 'function') {
          try { await this.views[targetViewName].mounted(currentView) } catch (error) {
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
      this._emitViewChanged('zoomIn', fromName)
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
    const duration = normalizeDuration(options.duration, 'goTo() duration', this.duration)
    const ease = normalizeEase(options.ease, this.transitionDriverName, 'goTo() ease', this.ease)

    const backView = this.canvas.querySelector('.is-previous-view')
    const lastView = this.canvas.querySelector('.is-last-view')

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
        this._scanView(node, context)
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
    // Measure each incoming view in its own layout box. Reusing the outgoing
    // translation preserves its corner, not its center, when sizes differ.
    incomingView.style.transform = ''
    incomingView.style.transformOrigin = '0 0'
    // Cache only within this read phase; no stale geometry survives navigation.
    const rectangles = new Map()
    const measure = element => {
      if (!rectangles.has(element)) rectangles.set(element, element.getBoundingClientRect())
      return rectangles.get(element)
    }
    const incomingRect = measure(incomingView)
    const outgoingRect = measure(outgoingView)
    const canvasRect = measure(this.canvas)
    const canvasScaleX = canvasRect.width / this.canvas.offsetWidth || 1
    const canvasScaleY = canvasRect.height / this.canvas.offsetHeight || 1
    const triggers = backView ? backView.querySelectorAll('.zoom-me[data-to]') : []
    let fromTrigger, targetTrigger
    for (const trigger of triggers) {
      if (!fromTrigger && trigger.dataset.to === currentName) fromTrigger = trigger
      if (!targetTrigger && trigger.dataset.to === targetViewName) targetTrigger = trigger
      if (fromTrigger && targetTrigger) break
    }
    let slideDeltaX = 0
    let slideDeltaY = 0
    const declared = this._declaredSiblings()
    const declFrom = declared ? declared.indexOf(currentName) : -1
    const declTo = declared ? declared.indexOf(targetViewName) : -1
    if (declFrom !== -1 && declTo !== -1) {
      // Declared order wins, including proportional non-adjacent jumps.
      slideDeltaX = (declFrom - declTo) * canvasRect.width * 0.15
    } else if (backView) {
      if (fromTrigger && targetTrigger) {
        const fr = measure(fromTrigger)
        const tr = measure(targetTrigger)
        slideDeltaX = (fr.left + fr.width / 2) - (tr.left + tr.width / 2)
        slideDeltaY = (fr.top + fr.height / 2) - (tr.top + tr.height / 2)
      } else {
        slideDeltaX = canvasRect.width * 0.15
      }
    }
    const backViewState = backView ? {
      transformStart: backView.style.transform || '',
      transformEnd: this._computeLateralBackTransform(backView.style.transform || '', slideDeltaX, slideDeltaY)
    } : null
    const lastViewState = lastView && topSnapshot.views[INDEX_LAST] ? {
      transformStart: lastView.style.transform || '',
      transformEnd: this._computeLateralBackTransform(lastView.style.transform || '', slideDeltaX * 0.7, slideDeltaY * 0.7)
    } : null
    const outgoingEntry = topSnapshot.views[INDEX_CURRENT]
    let incomingTransformEnd = this._computeLateralBackTransform('',
      (outgoingRect.x - incomingRect.x + (outgoingRect.width - incomingRect.width) / 2) / canvasScaleX,
      (outgoingRect.y - incomingRect.y + (outgoingRect.height - incomingRect.height) / 2) / canvasScaleY)
    const backwardScale = parseTranslateScale(outgoingEntry.backwardState.transform || '').scale
    let incomingTransformBack = this._computeLateralBackTransform(outgoingEntry.backwardState.transform || '',
      (outgoingRect.width - incomingRect.width) * backwardScale / (2 * canvasScaleX),
      (outgoingRect.height - incomingRect.height) * backwardScale / (2 * canvasScaleY))
    const oldTrigger = backView?.querySelector('.zoomed')

    // Rebuild the target's zoom poses from the unchanged parent base state.
    // This also updates cover scale and the reverse path to the correct trigger.
    if (targetTrigger && backViewState && !(isBack && options.savedStage)) {
      const geometry = this._lateralTargetGeometry(incomingView, targetTrigger, backView, lastView, topSnapshot,
        { measure, outgoingView, canvasRect, sx: canvasScaleX, sy: canvasScaleY })
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
      this._applyHideTrigger(targetTrigger, incomingView, hideTriggerMode, duration, ease, false)
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
      if (keepAliveNode) activateView(keepAliveNode)
      this._emit('afterLateral', { viewName: targetViewName, from: currentName, isBack })
      this._emitViewChanged('lateral', currentName)
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
  _lateralTargetGeometry (incomingView, trigger, previousView, lastView, stage, measurements) {
    const { measure, outgoingView, canvasRect, sx, sy } = measurements
    const rect = element => {
      const r = measure(element)
      return { x: (r.x - canvasRect.x) / sx, y: (r.y - canvasRect.y) / sy, width: r.width / sx, height: r.height / sy }
    }
    const incoming = rect(incomingView)
    const current = rect(outgoingView)
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

  /**
   * Zoom out one level, several levels (`zoomOut(2)`), or up to an ancestor
   * view (`zoomOut({ to: 'home' })`). Several levels run as one transition.
   * @param {number|{ to?: string, levels?: number, duration?: string, ease?: string }} [target]
   */
  zoomOut (target) {
    const options = target && typeof target === 'object' && !(target instanceof Event) ? target : {}
    const levels = this._zoomOutLevels(typeof target === 'number' ? target : options)
    if (levels === 0) return Promise.resolve()
    return this._runNavigation(() => levels > 1
      ? this._performZoomOutLevels(levels, options)
      : this._performZoomOut(options))
  }

  /**
   * Levels a zoomOut() argument climbs, clamped to the root. 0 means no-op.
   * @private
   */
  _zoomOutLevels (target) {
    const depth = this.storedViews.length - 1
    if (typeof target === 'number') {
      if (!Number.isInteger(target) || target < 1) {
        this.notify(`zoomOut(${target}): levels must be a positive integer.`, 'warn')
        return 0
      }
      return Math.max(1, Math.min(target, depth))
    }
    if (typeof target.to === 'string') {
      for (let level = depth - 1; level >= 0; level--) {
        if (this.storedViews[level].views[INDEX_CURRENT]?.viewName === target.to) return depth - level
      }
      this.notify(`zoomOut({ to: "${target.to}" }): no such view above the current one. Stack: ${this.getViewStack().map(v => v.name).join(' > ')}`, 'warn')
      return 0
    }
    if (target.levels !== undefined) return this._zoomOutLevels(target.levels)
    return 1
  }

  /**
   * Zoom out several levels in one transition. The child of the target view
   * (c1) shrinks back into its trigger as in a one-level zoomOut; the deeper
   * views still in the canvas ride along with it as passengers.
   * @private
   */
  _performZoomOutLevels (levels, options = {}) {
    const top = this.storedViews.length - 1
    const t = top - levels
    const c1Depth = t + 1
    const from = this.getCurrentViewName()
    const to = this.storedViews[t].views[INDEX_CURRENT].viewName
    this._emit('beforeZoomOut', { zoomLevel: this.zoomLevel(), viewName: to, from, levels })
    if (this._destroyed) return
    this.tracing(`zoomOut(${levels})`)
    const canvas = this.canvas
    this._resetCanvasScroll(canvas)
    this._cleanupLateralKeepAlive()
    this.lateralHistory = []

    const stage = this.storedViews[c1Depth]
    const c1 = this._viewNodeAt(c1Depth)
    const target = this._viewNodeAt(t)
    const targetParent = t >= 1 ? this._viewNodeAt(t - 1) : null
    const targetGrand = t >= 2 ? getDetachedNode(stage) ?? null : null
    if (!c1 || !target || (t >= 1 && !targetParent)) {
      this.notify('zoomOut: a view of the stack was not found (animation may still be running)', 'warn')
      return
    }
    const passengers = []
    for (let depth = c1Depth + 1; depth <= top; depth++) {
      if (top - depth <= 2) passengers.push(this._viewNodeAt(depth))
    }
    const dropped = []
    for (let depth = c1Depth + 1; depth <= top - 3; depth++) dropped.push(this._viewNodeAt(depth))

    // Where each view sits now, as poses in canvas space (see geometry.js).
    const stylePose = el => poseFromTransform(el.style.transformOrigin, el.style.transform)
    const statePose = state => poseFromTransform(state.origin, state.transform)
    const step = k => composePoses(
      statePose(this.storedViews[k].views[INDEX_PREVIOUS].forwardState),
      invertPose(statePose(this.storedViews[k].views[INDEX_PREVIOUS].backwardState)))
    let c1Pose
    if (c1.isConnected) {
      c1Pose = stylePose(c1)
    } else {
      // Detached when it was the last view at depth c1 + 2; follow each
      // zoom-in since then, which moves the whole scene by its previous view.
      c1Pose = statePose(this.storedViews[c1Depth + 2].views[INDEX_LAST].forwardState)
      for (let k = c1Depth + 3; k <= top; k++) c1Pose = composePoses(step(k), c1Pose)
    }
    // The scene at depth c1, as seen now.
    const scene = composePoses(c1Pose, invertPose(statePose(stage.views[INDEX_CURRENT].forwardState)))
    const startState = (el, entry) => {
      const pose = el.isConnected ? stylePose(el) : composePoses(scene, statePose(entry.forwardState))
      const origin = entry.forwardState.origin
      el.style.transformOrigin = origin
      el.style.transform = poseToTransform(pose, origin)
      return { ...entry, forwardState: { ...entry.forwardState, origin, transform: el.style.transform } }
    }
    const passengerStart = passengers.map(el => ({ el, pose: stylePose(el) }))

    const duration = options.duration !== undefined
      ? normalizeDuration(options.duration, 'zoomOut() duration', this.duration)
      : stage.views[INDEX_CURRENT]?.forwardState?.duration ?? this.duration
    const ease = options.ease !== undefined
      ? normalizeEase(options.ease, this.transitionDriverName, 'zoomOut() ease', this.ease)
      : stage.views[INDEX_CURRENT]?.forwardState?.ease ?? this.ease

    const views = [startState(c1, stage.views[INDEX_CURRENT]), startState(target, stage.views[INDEX_PREVIOUS])]
    if (targetParent) views.push(startState(targetParent, stage.views[INDEX_LAST]))
    // Put the target and its ancestors back, oldest first, before the views in the canvas.
    const first = canvas.querySelector(':scope > .z-view')
    for (const node of [targetGrand, targetParent, target, c1]) {
      if (node && !node.isConnected) canvas.insertBefore(node, first)
    }
    const synthetic = { ...stage, views }
    this.currentStage = synthetic

    for (const el of passengers) {
      this._removeEffect(el)
      el.classList.remove('is-current-view', 'is-previous-view', 'is-last-view')
      el.classList.add('has-no-events')
    }
    const zoomedEl = target.querySelector('.zoomed')
    if (zoomedEl) zoomedEl.classList.remove('zoomed')
    if (stage.hideTriggerMode && zoomedEl) this._restoreHideTrigger(zoomedEl, stage.hideTriggerMode, duration, ease)
    this._removeEffect(c1)
    c1.classList.remove('is-previous-view', 'is-last-view', 'hide')
    c1.classList.add('is-current-view')
    showViewContent(c1)
    this._removeEffect(target)
    target.classList.remove('is-previous-view', 'is-last-view', 'hide')
    target.classList.add('is-current-view')
    showViewContent(target)
    if (targetParent) {
      const effect = (this.storedViews[t]?.effects ?? this._resolveEffects(null))[0]
      targetParent.classList.remove('is-current-view', 'is-last-view', 'hide', 'has-effect-reverse')
      targetParent.classList.add('is-previous-view')
      if (effect !== 'none' && !this._prefersReducedMotion()) this._applyEffects(targetParent, null, [effect, 'none'], duration, ease)
      else this._removeEffect(targetParent)
      showViewContent(targetParent)
    }
    if (targetGrand) {
      targetGrand.classList.remove('is-current-view', 'is-previous-view')
      targetGrand.classList.add('is-last-view', 'hide')
      showViewContent(targetGrand)
    }

    // Passengers follow c1 whatever the driver: read its pose every frame.
    let frame = null
    const c1Start = invertPose(stylePose(c1))
    const follow = () => {
      const cs = getComputedStyle(c1)
      const delta = composePoses(poseFromTransform(cs.transformOrigin, cs.transform), c1Start)
      for (const { el, pose } of passengerStart) {
        el.style.transformOrigin = '0 0'
        el.style.transform = poseToTransform(composePoses(delta, pose), '0 0')
      }
      frame = requestAnimationFrame(follow)
    }
    if (passengers.length) frame = requestAnimationFrame(follow)

    const spec = {
      type: 'zoomOut',
      currentView: c1,
      previousView: target,
      lastView: targetParent,
      currentStage: synthetic,
      duration,
      ease,
      canvas
    }
    const complete = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      for (const el of passengers) removeViewFromCanvas(el, canvas)
      for (const node of dropped) disposeView(node)
      this.blockEvents = false
      this.storedViews.length = t + 1
      const parent = this.storedViews[t]
      this.lateralHistory = parent?.lateralHistory ?? []
      if (parent) delete parent.lateralHistory
      this._onTransitionComplete()
      this._updateNav()
      activateView(target)
      this._emit('afterZoomOut', { zoomLevel: this.zoomLevel(), viewName: to, from, levels })
      this._emitViewChanged('zoomOut', from)
      this.tracing('ended')
    }
    return this._runNavigationTransition(spec, complete)
  }

  /** @private */
  _performZoomOut (options = {}) {
    // A followed gesture already animated the views: settle at the end state.
    if (options.instant) {
      const animateEffects = this.animateEffects
      this.animateEffects = false
      try { return this._performZoomOut({ ...options, instant: false, duration: '0s', _instantSpec: true }) } finally { this.animateEffects = animateEffects }
    }
    const from = this.getCurrentViewName()
    const to = this.canvas.querySelector('.is-previous-view')?.dataset.viewName ?? null
    this._emit('beforeZoomOut', { zoomLevel: this.zoomLevel(), viewName: to, from })
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

    const duration = options.duration !== undefined
      ? normalizeDuration(options.duration, 'zoomOut() duration', this.duration)
      : this.currentStage.views[INDEX_CURRENT]?.forwardState?.duration ?? this.duration
    const ease = options.ease !== undefined
      ? normalizeEase(options.ease, this.transitionDriverName, 'zoomOut() ease', this.ease)
      : this.currentStage.views[INDEX_CURRENT]?.forwardState?.ease ?? this.ease

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
      // lastView becomes previous: give it the previous-view effect of the level we return
      // to, as resolved when that level was zoomed into (per-trigger overrides included).
      const returning = this.storedViews[this.storedViews.length - 2]
      const effect = (returning?.effects ?? this._resolveEffects(null))[0]
      if (effect !== 'none' && !this._prefersReducedMotion()) {
        lastView.classList.remove('has-effect-reverse')
        this._applyEffects(lastView, null, [effect, 'none'], duration, ease)
      } else {
        this._removeEffect(lastView)
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
      canvas,
      instant: !!options._instantSpec
    }
    const complete = () => {
      this.blockEvents = false
      this._onTransitionComplete()
      // Pop storedViews inside callback so nav update sees correct depth
      // (with sync drivers like 'none', the callback runs before code after runTransition)
      this.storedViews.pop()
      const parent = this.storedViews[this.storedViews.length - 1]
      this.lateralHistory = parent?.lateralHistory ?? []
      if (parent) delete parent.lateralHistory
      this._updateNav()
      activateView(previousView)
      this._emit('afterZoomOut', { zoomLevel: this.zoomLevel(), viewName: to, from })
      this._emitViewChanged('zoomOut', from)
      this.tracing('ended')
    }
    return this._runNavigationTransition(spec, complete)
  }

  // ─── Zoom out that follows a gesture ─────────────────────────────
  // With gestures.follow, wheel, swipe and pinch drive the zoom-out with a
  // 0 → 1 progress instead of firing it whole. The engine scrubs the three
  // views with paused Web Animations, so this works with every driver; on
  // release it animates to the end (then settles the state at once) or back.

  /** @private */
  _beginZoomOutScrub (source) {
    if (!this.gestures.follow || this._destroyed || this.blockEvents || this._scrub) return false
    if (this.storedViews.length < 2 || this._prefersReducedMotion() || typeof Element.prototype.animate !== 'function') return false
    const canvas = this.canvas
    const current = canvas.querySelector(':scope > .z-view.is-current-view')
    const previous = canvas.querySelector(':scope > .z-view.is-previous-view')
    const last = canvas.querySelector(':scope > .z-view.is-last-view')
    const stage = this.storedViews[this.storedViews.length - 1]
    if (!current || !previous || !stage.views[INDEX_PREVIOUS]) return false
    const returning = this.storedViews[this.storedViews.length - 2]
    const lastEffect = (returning?.effects ?? this._resolveEffects(null))[0]

    const layers = []
    const layer = (el, entry, to) => {
      if (!el || !entry) return
      const cs = getComputedStyle(el)
      el.style.transformOrigin = entry.forwardState.origin
      const from = { transform: el.style.transform || 'none', filter: cs.filter }
      layers.push({ el, from, to: { transform: entry.backwardState.transform || 'none', ...to } })
    }
    // The current view shrinks into its trigger, taking the trigger's rounding.
    const trigger = previous.querySelector('.zoomed')
    const radius = trigger ? getComputedStyle(trigger).borderTopLeftRadius : ''
    const round = {}
    if (radius && parseFloat(radius) > 0) {
      round.borderRadius = radius.endsWith('%')
        ? radius
        : `${parseFloat(radius) / trigger.offsetWidth * 100}% / ${parseFloat(radius) / trigger.offsetHeight * 100}%`
    }
    layer(current, stage.views[INDEX_CURRENT], { filter: 'none', ...round })
    if (round.borderRadius) layers[0].from.borderRadius = getComputedStyle(current).borderRadius
    layer(previous, stage.views[INDEX_PREVIOUS], { filter: 'none' })
    if (last && !last.classList.contains('hide')) {
      layer(last, stage.views[INDEX_LAST], { filter: lastEffect !== 'none' ? lastEffect : 'none' })
    }
    for (const entry of layers) {
      entry.animation = entry.el.animate([entry.from, entry.to], { duration: 1000, fill: 'both', easing: 'linear' })
      entry.animation.pause()
      entry.animation.currentTime = 0
    }

    this.blockEvents = true
    this.prefetcher?.pause()
    const from = this.getCurrentViewName()
    const to = returning?.views[INDEX_CURRENT]?.viewName ?? null
    this._scrub = { source, layers, progress: 0, from, to, delta: 0 }
    this._emit('zoomOutProgress', { phase: 'start', progress: 0, viewName: to, from, source })
    return true
  }

  /** @private */
  _scrubZoomOut (progress) {
    const scrub = this._scrub
    if (!scrub) return
    const p = Math.min(1, Math.max(0, progress))
    if (p === scrub.progress) return
    scrub.progress = p
    for (const { animation } of scrub.layers) animation.currentTime = p * 1000
    this._depthNav?.setProgress(p, this.gestures.threshold)
    this._emit('zoomOutProgress', { phase: 'move', progress: p, viewName: scrub.to, from: scrub.from, source: scrub.source })
  }

  /**
   * Release the gesture: finish the zoom-out, or put every view back.
   * @private
   * @param {boolean} commit
   */
  _endZoomOutScrub (commit) {
    const scrub = this._scrub
    if (!scrub) return Promise.resolve()
    this._scrub = null
    clearTimeout(scrub.idleTimer)
    const stage = this.storedViews[this.storedViews.length - 1]
    const full = parseDurationMs(stage.views[INDEX_CURRENT]?.forwardState?.duration ?? this.duration) || 600
    const p = scrub.progress
    const duration = Math.max(120, full * (commit ? 1 - p : p))
    const phase = commit ? 'commit' : 'cancel'
    this._emit('zoomOutProgress', { phase, progress: p, duration, viewName: scrub.to, from: scrub.from, source: scrub.source })
    this._depthNav?.setProgress(commit ? 1 : null, this.gestures.threshold)

    // Continue from where each view is now, decelerating like a released drag.
    const settle = scrub.layers.map(entry => {
      const cs = getComputedStyle(entry.el)
      const now = { transform: cs.transform, filter: cs.filter }
      if (entry.to.borderRadius) now.borderRadius = cs.borderRadius
      const target = commit ? entry.to : entry.from
      const animation = entry.el.animate([now, target], { duration, fill: 'both', easing: 'cubic-bezier(.2,.8,.2,1)' })
      entry.animation.cancel()
      entry.animation = animation
      return animation.finished.catch(() => {})
    })
    this._scrubLayers = scrub.layers
    return Promise.all(settle).then(async () => {
      if (this._destroyed || this._scrubLayers !== scrub.layers) return
      this.blockEvents = false
      this.prefetcher?.resume()
      if (commit) {
        const navigation = this.zoomOut({ instant: true })
        this._stopScrubAnimations()
        await navigation
      } else {
        this._stopScrubAnimations()
      }
      this._depthNav?.setProgress(null)
      this._emit('zoomOutProgress', { phase: 'end', progress: commit ? 1 : 0, viewName: scrub.to, from: scrub.from, source: scrub.source })
    })
  }

  /** @private */
  _stopScrubAnimations () {
    const layers = this._scrub?.layers ?? this._scrubLayers
    if (this._scrub) clearTimeout(this._scrub.idleTimer)
    this._scrub = null
    this._scrubLayers = null
    for (const { animation } of layers ?? []) animation?.cancel()
  }

  /**
   * Wheel and trackpad: small continuous deltas drive the zoom-out; a mouse
   * wheel notch (large or line-based delta) still zooms out at once.
   * @private
   * @returns {boolean} whether the event belongs to a followed gesture
   */
  _onWheelFollow (event) {
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY
    const scrub = this._scrub
    if (scrub) {
      if (scrub.source !== 'wheel') return true
      scrub.delta += delta
      this._scrubZoomOut(scrub.delta / WHEEL_FOLLOW_DISTANCE)
      clearTimeout(scrub.idleTimer)
      if (scrub.progress >= 1) this._releaseWheel(true)
      else scrub.idleTimer = setTimeout(() => this._releaseWheel(scrub.progress >= this.gestures.threshold), WHEEL_RELEASE_MS)
      return true
    }
    if (this._wheelSettling) {
      // Momentum after a released gesture must not start another one.
      clearTimeout(this._wheelSettling)
      this._wheelSettling = setTimeout(() => { this._wheelSettling = null }, WHEEL_RELEASE_MS * 2)
      return true
    }
    if (!this.gestures.follow || delta <= 0 || event.deltaMode !== 0 || Math.abs(delta) >= 50) return false
    if (!this._beginZoomOutScrub('wheel')) return false
    return this._onWheelFollow(event)
  }

  /** @private */
  _releaseWheel (commit) {
    clearTimeout(this._wheelSettling)
    this._wheelSettling = setTimeout(() => { this._wheelSettling = null }, WHEEL_RELEASE_MS * 2)
    this._endZoomOutScrub(commit)
  }

  // ─── Event handling ──────────────────────────────────────────────

  onZoom (event) {
    if (this._destroyed) return
    if (event.type === 'mouseup' && event.button !== 0) return
    if (event.type === 'click' && !this.inputs.keyboard) return
    // Check if this input type is enabled
    if (event.type === 'mouseup' && !this.inputs.click) return
    if (event.type === 'touchend' && (!this.inputs.touch || this._pinch || this._pinchTail || this._scrub)) return
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
  /**
   * Siblings a horizontal swipe can reach, when lateralNav.swipe is on and
   * the current view has any.
   * @returns {{ prev: string|null, next: string|null }|null}
   * @private
   */
  _lateralSwipe () {
    if (!this.lateralNav?.swipe || this.storedViews.length < 2) return null
    const { siblings, currentIndex } = this._getSiblings()
    if (siblings.length < 2 || currentIndex === -1) return null
    return { prev: siblings[currentIndex - 1] ?? null, next: siblings[currentIndex + 1] ?? null }
  }

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
    const depth = this.storedViews.length - 1
    const currentView = this.canvas.querySelector(':scope > .z-view.is-current-view')
    const showDepth = !!this.depthNav && depth >= 1 && !currentView?.querySelector('.z-depth-nav')
    let lateralData = this.lateralNav ? this._getSiblings() : null
    if (lateralData?.siblings.length < 2) lateralData = null
    // Complete geometry reads before either component mutates the canvas.
    if (lateralData && this.lateralNav.mode === 'auto' && depth >= 1 && currentView &&
      currentView.offsetWidth >= this.canvas.offsetWidth && currentView.offsetHeight >= this.canvas.offsetHeight) {
      lateralData = null
    }
    this._updateDepthNav(showDepth)
    this._updateLateralNav(lateralData)
    this._layoutNav()
  }

  /**
   * Show or hide the depth navigation (see depth-nav.js for its styles).
   * Position: bottom-left (default) or top-left.
   * @private
   */
  _updateDepthNav (visible) {
    if (visible === undefined) {
      const cv = this.canvas.querySelector(':scope > .z-view.is-current-view')
      visible = !!this.depthNav && this.storedViews.length > 1 && !cv?.querySelector('.z-depth-nav')
    }
    if (!visible) {
      this._depthNav?.close()
      this._depthNavElement?.remove()
      return
    }
    if (!this._depthNav) {
      const ready = () => !this._destroyed && this.canvas.contains(this._depthNav.element) && !this.blockEvents && this.storedViews.length > 1
      this._depthNav = new DepthNav({
        onBack: () => { if (ready()) this.zoomOut() },
        onJump: levels => { if (ready()) this.zoomOut(levels) }
      })
      this._depthNavElement = this._depthNav.element
    }
    const levels = this.getViewStack().slice(0, -1).reverse().map((view, i) => ({ ...view, up: i + 1 }))
    this._depthNav.update({
      position: this.depthNav.position || 'bottom-left',
      style: this.depthNav.style || 'button',
      label: formatLabel(this.labels.back, levels[0] ?? {}),
      levels
    })
    if (this._depthNavElement.parentNode !== this.canvas) this.canvas.appendChild(this._depthNavElement)
  }

  /**
   * Keep the depth button and the sibling bar apart when they share an edge:
   * shift the bar sideways, or stack it over the button when there is no room.
   * Sets --z-nav-shift-x / --z-nav-shift-y on the bar.
   * @private
   */
  _layoutNav () {
    const lateral = this._lateralNavState?.element
    if (!lateral || lateral.parentNode !== this.canvas) return
    lateral.style.removeProperty('--z-nav-shift-x')
    lateral.style.removeProperty('--z-nav-shift-y')
    const depth = this._depthNavElement
    if (!depth || depth.parentNode !== this.canvas) return
    const edge = position => position.split('-')[0]
    if (edge(this.depthNav.position || 'bottom-left') !== edge(this.lateralNav.position || 'bottom-center')) return
    const gap = 8
    const width = this.canvas.clientWidth
    const depthRight = depth.offsetLeft + depth.offsetWidth + gap
    const lateralLeft = (width - lateral.offsetWidth) / 2
    if (lateralLeft >= depthRight) return
    if (depthRight + lateral.offsetWidth <= width - depth.offsetLeft) {
      lateral.style.setProperty('--z-nav-shift-x', `${depthRight - lateralLeft}px`)
    } else {
      lateral.style.setProperty('--z-nav-shift-y', `${depth.offsetHeight + gap}px`)
    }
  }

  /**
   * Apply a navigation label (see the `labels` option) as the control's
   * aria-label, or remove it when that label is turned off.
   * @private
   */
  _setLabel (element, label, viewName) {
    if (!element) return
    const view = viewName ? { name: viewName, title: this.getViewTitle(viewName) } : {}
    const text = formatLabel(label, view)
    if (text === null) element.removeAttribute('aria-label')
    else if (element.getAttribute('aria-label') !== text) element.setAttribute('aria-label', text)
  }

  /**
   * Create the lateral navigation bar (arrows + dots).
   * Position: bottom-center (default) or top-center.
   * @private
   */
  _updateLateralNav (lateralData) {
    if (lateralData === undefined) {
      lateralData = this.lateralNav ? this._getSiblings() : null
      if (lateralData?.siblings.length < 2) lateralData = null
      if (lateralData && this.lateralNav.mode === 'auto' && this.storedViews.length > 1) {
        const cv = this.canvas.querySelector(':scope > .z-view.is-current-view')
        if (cv && cv.offsetWidth >= this.canvas.offsetWidth && cv.offsetHeight >= this.canvas.offsetHeight) lateralData = null
      }
    }
    if (!lateralData) {
      this._lateralNavState?.element.remove()
      return
    }
    const { siblings, currentIndex } = lateralData
    const pos = this.lateralNav.position || 'bottom-center'
    const arrows = !!this.lateralNav.arrows
    const dots = !!this.lateralNav.dots
    let state = this._lateralNavState
    if (!state || state.arrows !== arrows || state.dots !== dots ||
      state.siblings.length !== siblings.length || state.siblings.some((name, index) => name !== siblings[index])) {
      state?.element.remove()
      const nav = document.createElement('div')
      state = { element: nav, siblings: [...siblings], currentIndex: -1, arrows, dots, dotButtons: [] }
      const arrow = (direction, label, glyph) => {
        const button = document.createElement('button')
        button.className = 'z-nav-arrow z-nav-' + direction
        this._setLabel(button, label)
        button.innerHTML = glyph
        button.type = 'button'
        return button
      }
      if (arrows) {
        state.prevButton = arrow('prev', this.labels.prev, '&#8249;')
        nav.appendChild(state.prevButton)
      }
      if (dots) {
        const dotsContainer = document.createElement('div')
        dotsContainer.className = 'z-nav-lateral-dots'
        for (const name of siblings) {
          const dot = document.createElement('button')
          dot.className = 'z-nav-dot z-nav-lat-dot'
          this._setLabel(dot, this.labels.goTo, name)
          dot.dataset.to = name
          dot.type = 'button'
          state.dotButtons.push(dot)
          dotsContainer.appendChild(dot)
        }
        nav.appendChild(dotsContainer)
      }
      if (arrows) {
        state.nextButton = arrow('next', this.labels.next, '&#8250;')
        nav.appendChild(state.nextButton)
      }
      // Resolve targets from the current state, not the index at creation time.
      nav.addEventListener('click', (e) => {
        const button = e.target.closest?.('button')
        if (!button || !nav.contains(button)) return
        e.stopPropagation()
        const active = this._lateralNavState
        if (this._destroyed || this.blockEvents || active?.element !== nav || nav.parentNode !== this.canvas) return
        const index = button === active.prevButton ? active.currentIndex - 1
          : button === active.nextButton ? active.currentIndex + 1 : active.dotButtons.indexOf(button)
        if (index >= 0 && index < active.siblings.length && index !== active.currentIndex) this._doLateral(active.siblings[index])
      })
      this._lateralNavState = state
    }
    if (state.currentIndex !== currentIndex) {
      const previous = state.dotButtons[state.currentIndex]
      previous?.classList.remove('is-active')
      previous?.removeAttribute('aria-current')
      const current = state.dotButtons[currentIndex]
      current?.classList.add('is-active')
      current?.setAttribute('aria-current', 'true')
      state.currentIndex = currentIndex
    }
    if (state.prevButton && state.prevButton.disabled !== (currentIndex <= 0)) state.prevButton.disabled = currentIndex <= 0
    if (state.nextButton && state.nextButton.disabled !== (currentIndex >= siblings.length - 1)) state.nextButton.disabled = currentIndex >= siblings.length - 1
    const className = 'z-lateral-nav z-lateral-nav--' + pos
    if (state.element.className !== className) state.element.className = className
    if (state.element.parentNode !== this.canvas) this.canvas.appendChild(state.element)
  }

  /**
   * Remove all navigation UI from the canvas.
   * @private
   */
  _removeNav () {
    this._depthNav?.destroy()
    this._depthNav = null
    this._depthNavElement?.remove()
    this._lateralNavState?.element.remove()
    this._depthNavElement = null
    this._lateralNavState = null
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
        this.notify(`is on level zero. Can't zoom out. Trigger: ${event.key}`)
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
    if (this._onWheelFollow(event)) return
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
    if (this.inputs.pinch && event.touches?.length === 2) {
      // A second finger turns the touch into a pinch: no tap, no swipe.
      this._pinch = { distance: touchDistance(event.touches), ratio: 1 }
      this._swipe = null
      this.touching = false
      return
    }
    if (!this.inputs.touch) return
    this.tracing('onTouchStart()')
    this.touching = true
    this.touchstartX = event.changedTouches[0].screenX
    this.touchstartY = event.changedTouches[0].screenY
    this._swipeBlocked = this._ownsHorizontalDrag(event.target)
    const now = performance.now()
    this._swipe = { x: this.touchstartX, time: now, velocity: 0, lateral: !!this._lateralSwipe() }
  }

  /**
   * Followed swipe and pinch: move the zoom-out with the fingers.
   * @private
   */
  onTouchMove (event) {
    if (this._destroyed) return
    const pinch = this._pinch
    if (pinch && event.touches.length >= 2) {
      event.preventDefault()
      pinch.ratio = touchDistance(event.touches) / pinch.distance
      const progress = (1 - pinch.ratio) / PINCH_FOLLOW_CLOSE
      if (!this._scrub && progress > 0.02) this._beginZoomOutScrub('pinch')
      if (this._scrub?.source === 'pinch') this._scrubZoomOut(progress)
      return
    }
    const swipe = this._swipe
    // A swipe that moves between siblings does not drive the zoom-out.
    if (!swipe || swipe.lateral || !this.inputs.touch || this._swipeBlocked || event.touches.length !== 1) return
    const touch = event.touches[0]
    const now = performance.now()
    if (now > swipe.time) swipe.velocity = (touch.screenX - swipe.x) / (now - swipe.time)
    swipe.x = touch.screenX
    swipe.time = now
    const dx = touch.screenX - this.touchstartX
    const dy = touch.screenY - this.touchstartY
    if (!this._scrub && dx < -10 && Math.abs(dx) > Math.abs(dy) * 1.2) this._beginZoomOutScrub('swipe')
    if (this._scrub?.source !== 'swipe') return
    event.preventDefault()
    this._scrubZoomOut(-dx / (this.canvas.clientWidth * SWIPE_FOLLOW_WIDTH))
  }

  /**
   * Finish a pinch or a followed swipe. Returns true when the touch was one.
   * @private
   */
  _endTouchGesture (event) {
    const scrub = this._scrub
    const remaining = event.touches?.length ?? 0
    if (this._pinchTail) {
      // The other finger of a finished pinch lifting.
      if (remaining === 0) this._pinchTail = false
      return true
    }
    if (this._pinch && remaining < 2) {
      const { ratio } = this._pinch
      this._pinch = null
      this._pinchTail = remaining > 0
      this._swipe = null
      this.touching = false
      if (scrub?.source === 'pinch') this._endZoomOutScrub(scrub.progress >= this.gestures.threshold)
      else if (!scrub && ratio < 0.8 && this.storedViews.length > 1) this.zoomOut()
      return true
    }
    if (scrub?.source === 'swipe' && (event.touches?.length ?? 0) === 0) {
      // A fast release flicks the zoom-out through; a finger held still does not.
      const swipe = this._swipe
      const flick = swipe && performance.now() - swipe.time < 80 && swipe.velocity < -0.5 && scrub.progress > 0.1
      this._swipe = null
      this.touching = false
      this._endZoomOutScrub(flick || scrub.progress >= this.gestures.threshold)
      return true
    }
    return false
  }

  /**
   * A horizontal drag that belongs to the content (slider, text field,
   * horizontal scroller, or an element marked data-no-swipe) must not zoom out.
   * @private
   */
  _ownsHorizontalDrag (target) {
    if (!target?.closest) return false
    if (isEditable(target) || target.closest('[data-no-swipe]')) return true
    for (let el = target; el && el !== this.canvas; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth + 1) {
        const { overflowX } = window.getComputedStyle(el)
        if (overflowX === 'auto' || overflowX === 'scroll') return true
      }
    }
    return false
  }

  onTouchEnd (event) {
    if (this._destroyed) return
    if (this._endTouchGesture(event)) return
    this._swipe = null
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
    // With lateralNav.swipe, a horizontal swipe moves between siblings
    // (left: next, right: previous) and no longer zooms out.
    const lateral = Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) && !this._swipeBlocked ? this._lateralSwipe() : null
    if (lateral) {
      const to = dx < 0 ? lateral.next : lateral.prev
      if (to && !this.blockEvents) {
        this.tracing(dx < 0 ? 'swipe left → next sibling' : 'swipe right → previous sibling')
        this._doLateral(to)
      }
    } else if (dx < -30 && !this._swipeBlocked) {
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.tracing('swipe left')
        this.zoomOut()
      } else {
        this.notify("is on level zero. Can't zoom out. Trigger: Swipe left")
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
