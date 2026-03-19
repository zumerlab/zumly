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
import { createViewEntry, createRemovedViewEntry, createZoomSnapshot, getDetachedNode, INDEX_CURRENT } from './snapshots.js'
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
    this.canvas.addEventListener('mouseover', this._onPrefetchHover = (e) => {
      if (e.target.classList.contains('zoom-me') && e.target.dataset.to) {
        this.prefetcher.prefetchOnHover(e.target.dataset.to, { trigger: e.target, ...e.target.dataset })
      }
    }, { passive: true })
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
  }

  /**
   * Main methods
   */
  async zoomIn (el) {
    this.tracing('zoomIn()')
    const canvas = this.canvas
    const coordenadasCanvas = canvas.getBoundingClientRect()
    var offsetX = coordenadasCanvas.left
    var offsetY = coordenadasCanvas.top
    const preScale = this.storedPreviousScale[this.storedPreviousScale.length - 1]
    this.tracing('getView()')
    const context = { trigger: el, target: document.createElement('div'), context: this.componentContext, props: Object.assign({}, el.dataset) }
    const node = await this.prefetcher.get(el.dataset.to, context)
    this.prefetcher.scanAndPrefetch(node, context)
    var currentView = await prepareAndInsertView(node, el.dataset.to, canvas, false, this.views, this.componentContext)

    if (currentView) {
      el.classList.add('zoomed')
      const coordenadasEl = el.getBoundingClientRect()
      const previousView = canvas.querySelector('.is-current-view')
      const lastView = canvas.querySelector('.is-previous-view')
      const removeView = canvas.querySelector('.is-last-view')
      currentView.style.contentVisibility = 'hidden'
      previousView.style.contentVisibility = 'hidden'
      if (lastView !== null) lastView.style.contentVisibility = 'hidden'
      if (removeView !== null) removeView.style.contentVisibility = 'hidden'
      if (removeView !== null) canvas.removeChild(removeView)

      const cc = currentView.getBoundingClientRect()
      const canvasOffset = { left: offsetX, top: offsetY }
      const canvasRect = { width: coordenadasCanvas.width, height: coordenadasCanvas.height }
      const triggerRect = { x: coordenadasEl.x, y: coordenadasEl.y, width: coordenadasEl.width, height: coordenadasEl.height }
      const currentViewRect = { width: cc.width, height: cc.height }

      const { scale: laScala, scaleInv: laScalaInv } = computeCoverScale(
        coordenadasEl.width, coordenadasEl.height, cc.width, cc.height, this.cover
      )
      this.setPreviousScale(laScala)

      const duration = el.dataset.withDuration || this.duration
      const ease = el.dataset.withEase || this.ease

      const transformCurrentView0 = computeCurrentViewStartTransform(
        triggerRect, canvasOffset, currentViewRect, laScalaInv
      )
      currentView.style.transform = transformCurrentView0

      previousView.classList.replace('is-current-view', 'is-previous-view')
      const coordenadasPreviousView = previousView.getBoundingClientRect()
      const transformPreviousView0 = previousView.style.transform
      previousView.style.transformOrigin = computePreviousViewOrigin(triggerRect, coordenadasPreviousView)

      const prevEnd = computePreviousViewEndTransform(
        canvasRect, triggerRect, coordenadasPreviousView, laScala
      )
      previousView.style.transform = prevEnd.transform

      const newcoordenadasEl = el.getBoundingClientRect()
      const transformCurrentView1 = computeCurrentViewEndTransform(
        newcoordenadasEl, canvasOffset, currentViewRect
      )

      let transformLastView0
      let transformLastView1
      if (lastView !== null) {
        lastView.classList.replace('is-previous-view', 'is-last-view')
        transformLastView0 = lastView.style.transform
        const newcoordenadasPV = previousView.getBoundingClientRect()
        lastView.style.transform = computeLastViewIntermediateTransform(
          prevEnd.x, prevEnd.y, canvasOffset, laScala, preScale
        )
        const last = lastView.querySelector('.zoomed')
        const coorLast = last.getBoundingClientRect()
        lastView.style.transform = transformLastView0
        previousView.style.transform = transformPreviousView0
        const coorPrev = previousView.getBoundingClientRect()
        transformLastView1 = computeLastViewEndTransform(
          canvasRect, canvasOffset, triggerRect,
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

  }

  zoomOut () {
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
