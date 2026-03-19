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

/**
 * Zumly
 * Powers your apps with a zoomable user interface (ZUI) taste.
 * @class
 */


export class Zumly {
  /**
  * Creates a Zumly instance
  * @constructor
  * @params {Object} options
  * @example
  *  new Zumly({
  *  mount: '.mount',
  *  initialView: 'home',
  *  views: {
  *   home,
  *   contact,
  *   ...
  *  }
  *
  */
  constructor (options) {
    // Internal state:
    // Store snapshots of each zoom transition
    this.storedViews = []
    // Show current zoom level properties
    this.currentStage = null
    // Store the scale of previous zoom transition
    this.storedPreviousScale = [1]
    // Debugging?
    this.debug = false
    // Array of events useful for debugging
    this.trace = []
    // Deactive events during transtions
    this.blockEvents = false
    // Initial values for gesture events
    this.touchstartX = 0
    this.touchstartY = 0
    this.touchendX = 0
    this.touchendY = 0
    this.touching = false
    /** Lateral history: view names at current depth. back() pops before zoomOut. Cleared on depth change. */
    this.lateralHistory = []
    // Check if user options exist and are valid
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
    // Event bindings:
    this._onZoom = this.onZoom.bind(this)
    this._onTouchStart = this.onTouchStart.bind(this)
    this._onTouchEnd = this.onTouchEnd.bind(this)
    this._onKeyUp = this.onKeyUp.bind(this)
    this._onWeel = this.onWeel.bind(this)
    // View prefetcher (preload, hover, scan)
    this.prefetcher = new ViewPrefetcher(this.views)
    this.canvas.setAttribute('tabindex', 0)
    this.canvas.addEventListener('mouseup', this._onZoom, false)
    this.canvas.addEventListener('touchend', this._onZoom, false)
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: true })
    this.canvas.addEventListener('touchend', this._onTouchEnd, false)
    this.canvas.addEventListener('keyup', this._onKeyUp, false)
    this.canvas.addEventListener('wheel', this._onWeel, { passive: true })
    this._onPrefetchTrigger = (e) => {
      if (e.target.classList.contains('zoom-me') && e.target.dataset.to) {
        this.prefetcher.prefetch(e.target.dataset.to, { trigger: e.target, ...e.target.dataset })
      }
    }
    this.canvas.addEventListener('mouseover', this._onPrefetchTrigger, { passive: true })
    this.canvas.addEventListener('focusin', this._onPrefetchTrigger, { passive: true })
  }

  /**
   * Helpers
   */
  storeViews (data) {
    this.tracing('storedViews()')
    this.storedViews.push(data)
    if (this.debug) {
      console.debug('Zumly storedViews', data) // eslint-disable-line no-console
    }
  }

  setPreviousScale (scale) {
    this.tracing('setPreviousScale()')
    this.storedPreviousScale.push(scale)
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

  /**
   * Public methods
   */
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
   *   - mode 'depth': drill-down / zoom-in (default)
   *   - mode 'lateral': same-level swap, preserves zoom level
   */
  async goTo (viewName, options = {}) {
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
   * @param {{ duration?: string, ease?: string, props?: object }} [options] - Optional overrides
   */
  async zoomTo (viewName, options = {}) {
    if (!this.isValid || !this.canvas) {
      this.notify('zoomTo() cannot run: instance is invalid or canvas not found.', 'error')
      return
    }
    if (typeof viewName !== 'string' || !viewName) {
      this.notify('zoomTo() requires a non-empty view name.', 'warn')
      return
    }
    if (!Object.prototype.hasOwnProperty.call(this.views, viewName)) {
      this.notify(`zoomTo("${viewName}"): view not found in views.`, 'warn')
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
      this.prefetcher.scanAndPrefetch(currentView, null)
      this.storeViews({
        zoomLevel: this.storedViews.length,
        views: [{
          viewName: this.initialView,
          backwardState: {
            origin: '0 0',
            transform: ''
          }
        }]
      })
    this.currentStage = this.storedViews[this.storedViews.length - 1]
  }

  /**
   * Internal: shared zoom-in path for both trigger-based and programmatic navigation.
   * @param {string} targetViewName - View to zoom to
   * @param {{ el?: HTMLElement, rect?: {x,y,width,height}, duration?: string, ease?: string, props?: object }} triggerOrDescriptor
   *   - el: real DOM trigger (has dataset.to, getBoundingClientRect)
   *   - rect, duration, ease: used for programmatic (synthetic) navigation
   */
  async _doZoomIn (targetViewName, triggerOrDescriptor) {
    this.lateralHistory = []
    this.tracing('zoomIn()')
    const canvas = this.canvas
    const el = triggerOrDescriptor.el
    const canvasRect = canvas.getBoundingClientRect()
    const offsetX = canvasRect.left
    const offsetY = canvasRect.top
    const preScale = this.storedPreviousScale[this.storedPreviousScale.length - 1]
    this.tracing('getView()')

    const context = el
      ? { trigger: el, target: document.createElement('div'), context: this.componentContext, props: Object.assign({}, el.dataset) }
      : { target: document.createElement('div'), context: this.componentContext, props: triggerOrDescriptor.props ?? {} }

    const node = await this.prefetcher.get(targetViewName, context)
    this.prefetcher.scanAndPrefetch(node, context)
    const currentView = await prepareAndInsertView(node, targetViewName, canvas, false, this.views, this.componentContext)

    if (!currentView) return

    if (el) el.classList.add('zoomed')

    const triggerRect = el
      ? (() => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()
      : triggerOrDescriptor.rect

    const duration = el ? (el.dataset.withDuration || this.duration) : (triggerOrDescriptor.duration ?? this.duration)
    const ease = el ? (el.dataset.withEase || this.ease) : (triggerOrDescriptor.ease ?? this.ease)

    const previousView = canvas.querySelector('.is-current-view')
    const lastView = canvas.querySelector('.is-previous-view')
    const removeView = canvas.querySelector('.is-last-view')
    currentView.style.contentVisibility = 'hidden'
    previousView.style.contentVisibility = 'hidden'
    if (lastView) lastView.style.contentVisibility = 'hidden'
    if (removeView) {
      removeView.style.contentVisibility = 'hidden'
      canvas.removeChild(removeView)
    }

    const cc = currentView.getBoundingClientRect()
    const canvasOffset = { left: offsetX, top: offsetY }
    const canvasRectSize = { width: canvasRect.width, height: canvasRect.height }
    const currentViewRect = { width: cc.width, height: cc.height }

    const { scale: laScala, scaleInv: laScalaInv } = computeCoverScale(
      triggerRect.width, triggerRect.height, cc.width, cc.height, this.cover
    )
    this.setPreviousScale(laScala)

    const transformCurrentView0 = computeCurrentViewStartTransform(
      triggerRect, canvasOffset, currentViewRect, laScalaInv
    )
    currentView.style.transform = transformCurrentView0

    previousView.classList.replace('is-current-view', 'is-previous-view')
    const coordenadasPreviousView = previousView.getBoundingClientRect()
    const transformPreviousView0 = previousView.style.transform
    previousView.style.transformOrigin = computePreviousViewOrigin(triggerRect, coordenadasPreviousView)

    const prevEnd = computePreviousViewEndTransform(
      canvasRectSize, triggerRect, coordenadasPreviousView, laScala
    )
    previousView.style.transform = prevEnd.transform

    const triggerRectAfterTransform = el ? el.getBoundingClientRect() : triggerRect
    const transformCurrentView1 = computeCurrentViewEndTransform(
      triggerRectAfterTransform, canvasOffset, currentViewRect
    )

    let transformLastView0
    let transformLastView1
    if (lastView) {
      lastView.classList.replace('is-previous-view', 'is-last-view')
      transformLastView0 = lastView.style.transform
      const newcoordenadasPV = previousView.getBoundingClientRect()
      lastView.style.transform = computeLastViewIntermediateTransform(
        prevEnd.x, prevEnd.y, canvasOffset, laScala, preScale
      )
      const last = lastView.querySelector('.zoomed')
      const coorLast = (last && last.getBoundingClientRect) ? last.getBoundingClientRect() : lastView.getBoundingClientRect()
      lastView.style.transform = transformLastView0
      previousView.style.transform = transformPreviousView0
      const coorPrev = previousView.getBoundingClientRect()
      transformLastView1 = computeLastViewEndTransform(
        canvasRectSize, canvasOffset, triggerRect,
        coorPrev, coorLast, newcoordenadasPV, laScala, preScale
      )
    } else {
      previousView.style.transform = transformPreviousView0
    }

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
    this.storeViews(snapShoot)
    this.currentStage = this.storedViews[this.storedViews.length - 1]
    this.tracing('setCSSVariables()')
    this.blockEvents = true
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
      this.tracing('ended')
    })
  }

  /**
   * Zoom in to the view indicated by the clicked element.
   * @param {HTMLElement} el - Element with .zoom-me and data-to="viewName"
   */
  async zoomIn (el) {
    if (!el?.dataset?.to) return
    await this._doZoomIn(el.dataset.to, { el })
  }

  /**
   * Same-level navigation: replace current view with target at same depth.
   * Moves towards the target element: previous/last views slide so we "pan" to the new view.
   * Pushes current view to lateralHistory when isBack=false so back() can restore.
   * @param {string} targetViewName
   * @param {boolean} isBack - True when invoked from back(); do not push to lateralHistory
   * @param {{ duration?: string, ease?: string, savedEntry?: object }} [options]
   *   - savedEntry: when isBack, the restored view entry (preserves backwardState for zoomOut)
   */
  async _doLateral (targetViewName, isBack = false, options = {}) {
    if (!this.isValid || !this.canvas) return
    if (!Object.prototype.hasOwnProperty.call(this.views, targetViewName)) {
      this.notify(`goTo("${targetViewName}", { mode: 'lateral' }): view not found.`, 'warn')
      return
    }
    const outgoingView = this.canvas.querySelector('.is-current-view')
    if (!outgoingView) return
    const currentName = outgoingView.dataset?.viewName
    if (currentName === targetViewName) return

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
    this.prefetcher.scanAndPrefetch(node, context)
    const incomingView = await prepareAndInsertView(node, targetViewName, this.canvas, false, this.views, this.componentContext)
    if (!incomingView) return

    incomingView.style.contentVisibility = 'hidden'
    if (lastView) lastView.style.contentVisibility = 'hidden'

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

    this.blockEvents = true
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

  zoomOut () {
    this.lateralHistory = []
    this.tracing('zoomOut()')
    const canvas = this.canvas
    var currentView = canvas.querySelector('.is-current-view')
    var previousView = canvas.querySelector('.is-previous-view')
    if (!currentView || !previousView) {
      this.notify('zoomOut: current or previous view not found (animation may still be running)', 'warn')
      return
    }
    this.blockEvents = true
    this.storedPreviousScale.pop()
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
        newlastView.style.contentVisibility = 'auto'
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
      this.tracing('ended')
    })
    this.storedViews.pop()
  }

  /**
   * Event hangling
   */
  onZoom (event) {
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
    this.tracing('onKeyUp()')
    // Possible conflict with usar inputs
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
      this.notify(event.key + 'has not actions defined')
    }
  }

  onWeel (event) {
    // inertia need to be fixed
    if (!this.blockEvents) {
      this.tracing('onWeel()')
      if (event.deltaY < 0) {}
      if (event.deltaY > 0) {
        if (this.storedViews.length > 1 && !this.blockEvents) {
          this.zoomOut()
        } else {
          // this.notify("is on level zero. Can't zoom out. Trigger: wheel/scroll", 'warn')
        }
      }
    }
  }

  onTouchStart (event) {
    this.tracing('onTouchStart()')
    this.touching = true
    this.touchstartX = event.changedTouches[0].screenX
    this.touchstartY = event.changedTouches[0].screenY
  }

  onTouchEnd (event) {
    if (!this.blockEvents) {
      this.tracing('onTouchEnd()')
      this.touchendX = event.changedTouches[0].screenX
      this.touchendY = event.changedTouches[0].screenY
      this.handleGesture(event)
      // event.preventDefault()
    }
  }

  handleGesture (event) {
    event.stopPropagation()
    this.tracing('handleGesture()')
    if (this.touchendX < this.touchstartX - 30) {
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.tracing('swipe left')
        this.zoomOut()
      } else {
        this.notify("is on level zero. Can't zoom out. Trigger: Swipe left", 'warn')
      }
    }
    if (this.touchendY < this.touchstartY - 10) {
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.tracing('swipe up')
        // Disabled. In near future enable if Zumly is full screen
        // this.zoomOut()
      } else {
        this.notify("is on level zero. Can't zoom out. Trigger: Swipe up", 'warn')
      }
    }
    if (this.touchendY === this.touchstartY && !this.blockEvents && event.target.classList.contains('zoom-me') && this.touching) {
      this.touching = false
      this.tracing('tap')
      event.preventDefault()
      this.zoomIn(event.target)
    }
    if (this.touchendY === this.touchstartY && this.storedViews.length > 1 && !this.blockEvents && !event.target.classList.contains('zoom-me') && event.target.closest('.is-current-view') === null && this.touching) {
      this.touching = false
      this.tracing('tap')
      this.zoomOut()
    }
  }

}
