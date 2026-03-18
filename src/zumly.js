import { renderView, prepareAndInsertView, notification, checkParameters } from './utils.js'
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
    // Check if user options exist
    checkParameters(options, this)
    if (this.options) {
      this.transitionDriver = getDriver(this.transitionDriver)
      // Event bindings:
      this._onZoom = this.onZoom.bind(this)
      this._onTouchStart = this.onTouchStart.bind(this)
      this._onTouchEnd = this.onTouchEnd.bind(this)
      this._onKeyUp = this.onKeyUp.bind(this)
      this._onWeel = this.onWeel.bind(this)
      // View prefetcher (preload, hover, scan)
      this.prefetcher = new ViewPrefetcher(this.views)
      // Prepare the instance:
      this.canvas = document.querySelector(this.mount)
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
    } else {
      this.notify('is unable to start: no {options} have been passed to the Zumly\'s instance.', 'error')
    }
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
    if (this.options) {
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
      // create new view in a template tag
      // select VIEWS from DOM
      //var currentView = canvas.querySelector('.is-new-current-view')
      var previousView = canvas.querySelector('.is-current-view')
      var lastView = canvas.querySelector('.is-previous-view')
      var removeView = canvas.querySelector('.is-last-view')
      currentView.style.contentVisibility = 'hidden';
      previousView.style.contentVisibility = 'hidden';
      if (lastView !== null) lastView.style.contentVisibility = 'hidden';
      if (removeView !== null) removeView.style.contentVisibility = 'hidden';
      if (removeView !== null) canvas.removeChild(removeView)
      // do changes
      const cc = currentView.getBoundingClientRect()
      const scale = cc.width / coordenadasEl.width
      const scaleInv = 1 / scale
      const scaleh = cc.height / coordenadasEl.height
      const scaleInvh = 1 / scaleh
      // muy interesante featura... usar el zoom de acuardo a la h o w mayor y agra
      var duration = el.dataset.withDuration || this.duration
      var ease = el.dataset.withEase || this.ease
      var filterIn = this.effects[0]
      var filterOut = this.effects[1]
      var cover = this.cover
  
      // Ensure both branches initialize the same variables.
      // Without this, `cover: 'height'` can end up writing to undeclared globals.
      var laScala
      var laScalaInv

      if (cover === 'width') {
        laScala = scale
        laScalaInv = scaleInv
      } else if (cover === 'height') {
        laScala = scaleh
        laScalaInv = scaleInvh
      }
  
      this.setPreviousScale(laScala)
      var transformCurrentView0 = `translate(${coordenadasEl.x - offsetX + (coordenadasEl.width - cc.width * laScalaInv) / 2}px, ${coordenadasEl.y - offsetY + (coordenadasEl.height - cc.height * laScalaInv) / 2}px) scale(${laScalaInv})`
      currentView.style.transform = transformCurrentView0
      //
      previousView.classList.replace('is-current-view', 'is-previous-view')
      const coordenadasPreviousView = previousView.getBoundingClientRect()
      // PREVIOUS VIEW EXACTAMENTE ONDE ESTANA ANTES COMO CURRENT
      // usar . style. setProperty('--demo-color-change', '#f44336')//
      var transformPreviousView0 = previousView.style.transform
      previousView.style.transformOrigin = `${coordenadasEl.x + coordenadasEl.width / 2 - coordenadasPreviousView.x}px ${coordenadasEl.y + coordenadasEl.height / 2 - coordenadasPreviousView.y}px`
  
      const x = coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + coordenadasPreviousView.x
      const y = coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + coordenadasPreviousView.y
  
      const transformPreviousView1 = `translate(${x}px, ${y}px) scale(${laScala})`
      // PREVIOUS VIEW FINAL STAGE
      previousView.style.transform = transformPreviousView1
      // ACA CAMBIA LA COSA, LEVANTO LAS COORDENADAS DEL ELEMENTO CLICLEADO QUE ESTBA DNRO DE PREVIOUS VIEW
      var newcoordenadasEl = el.getBoundingClientRect()
      // LO QUE DETERMINA LA POSICINES FONAL DEL CURRENT VIEW
      var transformCurrentView1 = `translate(${newcoordenadasEl.x - offsetX + (newcoordenadasEl.width - cc.width) / 2}px, ${newcoordenadasEl.y - offsetY + (newcoordenadasEl.height - cc.height) / 2}px)`
  
      if (lastView !== null) {
        lastView.classList.replace('is-previous-view', 'is-last-view')
        var transformLastView0 = lastView.style.transform
        var newcoordenadasPV = previousView.getBoundingClientRect()
        lastView.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px) scale(${laScala * preScale})`
        const last = lastView.querySelector('.zoomed')
        var coorLast = last.getBoundingClientRect()
        lastView.style.transform = transformLastView0
        previousView.style.transform = transformPreviousView0
        var coorPrev = previousView.getBoundingClientRect()
        var transformLastView1 = `translate(${coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + (coorPrev.x - coorLast.x) + newcoordenadasPV.x - offsetX + (newcoordenadasPV.width - coorLast.width) / 2}px, ${coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + (coorPrev.y - coorLast.y) + newcoordenadasPV.y - offsetY +
          (newcoordenadasPV.height - coorLast.height) / 2}px) scale(${laScala * preScale})`
      } else {
        previousView.style.transform = transformPreviousView0
      }
      // arrays
      var snapShoot = {
        zoomLevel: this.storedViews.length,
        views: []
      }
      const currentv = currentView ? {
        viewName: currentView.dataset.viewName,
        backwardState: {
          origin: currentView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: transformCurrentView0
        },
        forwardState: {
          origin: currentView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: transformCurrentView1
        }
      } : null
      const previousv = previousView ? {
        viewName: previousView.dataset.viewName,
        backwardState: {
          origin: previousView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: transformPreviousView0
        },
        forwardState: {
          origin: previousView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: transformPreviousView1
        }
      } : null
      const lastv = lastView ? {
        viewName: lastView.dataset.viewName,
        backwardState: {
          origin: lastView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: transformLastView0
        },
        forwardState: {
          origin: lastView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: transformLastView1
        }
      } : null
      const gonev = removeView ? { // ACA VA LA VISTA ENTERA FALTA REALIZAR UN ZOOM IGUAL ANTES DE SACARLA DE JUEGO
        viewName: removeView
      } : null
      if (currentv !== null) snapShoot.views.push(currentv)
      if (previousv !== null) snapShoot.views.push(previousv)
      if (lastv !== null) snapShoot.views.push(lastv)
      if (gonev !== null) snapShoot.views.push(gonev)
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
    const reAttachView = this.currentStage.views[3]
    var lastView = canvas.querySelector('.is-last-view')
    //
    this.tracing('setCSSVariables()')

    const zoomedEl = previousView.querySelector('.zoomed')
    if (zoomedEl) zoomedEl.classList.remove('zoomed')
    previousView.classList.replace('is-previous-view', 'is-current-view')
    
    
    if (lastView !== null) {
      lastView.classList.replace('is-last-view','is-previous-view')
      lastView.classList.remove('hide')
    }
    // Reattach the view that was removed at 4+ levels (stored as node in snapshot)
    if (reAttachView !== undefined && reAttachView.viewName instanceof Node) {
      canvas.prepend(reAttachView.viewName)
      var newlastView = canvas.querySelector('.z-view:first-child')
      if (newlastView) {
        newlastView.style.contentVisibility = 'auto'
        newlastView.classList.add('hide')
      }
    }

    const duration = this.currentStage.views[0]?.forwardState?.duration ?? this.duration
    const ease = this.currentStage.views[0]?.forwardState?.ease ?? this.ease
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
