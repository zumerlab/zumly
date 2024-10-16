import {renderView, notification, checkParameters } from './utils.js'

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
      // Event bindings:
      this._onZoom = this.onZoom.bind(this)
      this._onZoomInHandlerStart = this.onZoomInHandlerStart.bind(this)
      this._onZoomInHandlerEnd = this.onZoomInHandlerEnd.bind(this)
      this._onZoomOutHandlerStart = this.onZoomOutHandlerStart.bind(this)
      this._onZoomOutHandlerEnd = this.onZoomOutHandlerEnd.bind(this)
      this._onTouchStart = this.onTouchStart.bind(this)
      this._onTouchEnd = this.onTouchEnd.bind(this)
      this._onKeyUp = this.onKeyUp.bind(this)
      this._onWeel = this.onWeel.bind(this)
      // Prepare the instance:
      this.canvas = document.querySelector(this.mount)
      this.canvas.setAttribute('tabindex', 0)
      this.canvas.addEventListener('mouseup', this._onZoom, false)
      this.canvas.addEventListener('touchend', this._onZoom, false)
      this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: true })
      this.canvas.addEventListener('touchend', this._onTouchEnd, false)
      this.canvas.addEventListener('keyup', this._onKeyUp, false)
      this.canvas.addEventListener('wheel', this._onWeel, { passive: true })
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
    console.log(data)
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
      // add instance style
      this.tracing('init()')
      //prepareCSS(this.instance)
      await renderView(this.initialView, this.canvas, this.views, 'init', this.componentContext)
      // add to storage. OPTIMIZAR
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
  async zoomIn (triggeredElement) {
    this.tracing('zoomIn()')
    const canvas = this.canvas
    const canvasBounds = canvas.getBoundingClientRect()
    var canvasOffsetX = canvasBounds.left
    var canvasOffsetY = canvasBounds.top
    const previousStoredScale = this.storedPreviousScale[this.storedPreviousScale.length - 1]
    // generated new view from activated .zoom-me element
    // generateNewView(triggeredElement)
    this.tracing('renderView()')
    
    var newCurrentView = await renderView(triggeredElement, canvas, this.views, false, this.componentContext)

    if (newCurrentView) {
      triggeredElement.classList.add('zoomed')
      const triggeredElementBounds = triggeredElement.getBoundingClientRect()
      // create new view in a template tag
      // select VIEWS from DOM
      //var newCurrentView = canvas.querySelector('.is-new-current-view')
      var currentToPreviousView = canvas.querySelector('.is-current-view')
      var previousToLastView = canvas.querySelector('.is-previous-view')
      var lastToDetachedView = canvas.querySelector('.is-last-view')
      newCurrentView.style.contentVisibility = 'hidden';
      currentToPreviousView.style.contentVisibility = 'hidden';
      if (previousToLastView !== null) previousToLastView.style.contentVisibility = 'hidden';
      if (lastToDetachedView !== null) lastToDetachedView.style.contentVisibility = 'hidden';
      if (lastToDetachedView !== null) canvas.removeChild(lastToDetachedView)
      // do changes
      const newCurrentViewBounds = newCurrentView.getBoundingClientRect()
      const horizontalScale = newCurrentViewBounds.width / triggeredElementBounds.width
      const invertedHorizontalScale = 1 / horizontalScale
      const verticalScale = newCurrentViewBounds.height / triggeredElementBounds.height
      const invertedVerticalScale = 1 / verticalScale
      // muy interesante featura... usar triggeredElement zoom de acuardo a la h o w mayor y agra
      var duration = triggeredElement.dataset.withDuration || this.duration
      var ease = triggeredElement.dataset.withEease || this.ease
      var filterIn = this.effects[0]
      var filterOut = this.effects[1]
      var cover = this.cover
  
      if (cover === 'width') {
        var computedScale = horizontalScale
        var computedInvertedScale = invertedHorizontalScale
      } else if (cover === 'height') {
        computedScale = verticalScale
        computedInvertedScale = invertedVerticalScale
      }
  
      this.setPreviousScale(computedScale)
      // Calculates and applies initial transform coordinates of newCurrentView
      let x = triggeredElementBounds.x - canvasOffsetX + (triggeredElementBounds.width - newCurrentViewBounds.width * computedInvertedScale) / 2
      let y = triggeredElementBounds.y - canvasOffsetY + (triggeredElementBounds.height - newCurrentViewBounds.height * computedInvertedScale) / 2
      var newCurrentViewTransformStart = `translate(${x}px, ${y}px) scale(${computedInvertedScale})`
      newCurrentView.style.transform = newCurrentViewTransformStart
      //
      currentToPreviousView.classList.replace('is-current-view', 'is-previous-view')

      const currentToPreviousViewBounds = currentToPreviousView.getBoundingClientRect()
      // PREVIOUS VIEW EXACTAMENTE ONDE ESTANA ANTES COMO CURRENT
      // usar . style. setProperty('--demo-color-change', '#f44336')//
      var currentToPreviousViewTransformStart = currentToPreviousView.style.transform
      ///
      currentToPreviousView.style.transformOrigin = `${triggeredElementBounds.x + triggeredElementBounds.width / 2 - currentToPreviousViewBounds.x}px ${triggeredElementBounds.y + triggeredElementBounds.height / 2 - currentToPreviousViewBounds.y}px`
      
      // Calculates and applies final transform coordinates of currentToPreviousView
      const x1 = canvasBounds.width / 2 - triggeredElementBounds.width / 2 - triggeredElementBounds.x + currentToPreviousViewBounds.x
      const y1 = canvasBounds.height / 2 - triggeredElementBounds.height / 2 - triggeredElementBounds.y + currentToPreviousViewBounds.y
      const currentToPreviousViewTransformEnd = `translate(${x1}px, ${y1}px) scale(${computedScale})`
      currentToPreviousView.style.transform = currentToPreviousViewTransformEnd

      // ACA CAMBIA LA COSA, LEVANTO LAS COORDENADAS DEL ELEMENTO CLICLEADO QUE ESTBA DNRO DE PREVIOUS VIEW
      var reDoTriggeredElementBounds = triggeredElement.getBoundingClientRect() // ver esto... por ahi no es nesario?
      // LO QUE DETERMINA LA POSICINES FONAL DEL CURRENT VIEW
      // Calculates final transform coordinates of newCurrentView
      var x2 = reDoTriggeredElementBounds.x - canvasOffsetX + (reDoTriggeredElementBounds.width - newCurrentViewBounds.width) / 2
      var y2 = reDoTriggeredElementBounds.y - canvasOffsetY + (reDoTriggeredElementBounds.height - newCurrentViewBounds.height) / 2
      var newCurrentViewTransformEnd = `translate(${x2}px, ${y2}px)`
  
      if (previousToLastView !== null) {
        previousToLastView.classList.replace('is-previous-view', 'is-last-view')
        var previousToLastViewTransformStart = previousToLastView.style.transform
        var reDoCurrentToPreviousViewBounds = currentToPreviousView.getBoundingClientRect()
        let x3 = x1 - canvasOffsetX
        let y3 = y1 - canvasOffsetY
        previousToLastView.style.transform = `translate(${x3}px, ${y3}px) scale(${computedScale * previousStoredScale})`
        const zoomedElement = previousToLastView.querySelector('.zoomed')
        var zoomedElementBounds = zoomedElement.getBoundingClientRect()
        previousToLastView.style.transform = previousToLastViewTransformStart
        currentToPreviousView.style.transform = currentToPreviousViewTransformStart
        var reReDoCurrentToPreviousViewBounds = currentToPreviousView.getBoundingClientRect()
       
        let x4 = 
        canvasBounds.width / 2 
        - 
        triggeredElementBounds.width / 2 
        - 
        triggeredElementBounds.x 
        + 
        (reReDoCurrentToPreviousViewBounds.x - zoomedElementBounds.x) 
        +
         reDoCurrentToPreviousViewBounds.x
          - 
          canvasOffsetX 
          + 
          (reDoCurrentToPreviousViewBounds.width 
            - 
            zoomedElementBounds.width) / 2
        
        let y4 = canvasBounds.height / 2 - triggeredElementBounds.height / 2 - triggeredElementBounds.y + (reReDoCurrentToPreviousViewBounds.y - zoomedElementBounds.y) + reDoCurrentToPreviousViewBounds.y - canvasOffsetY +
        (reDoCurrentToPreviousViewBounds.height - zoomedElementBounds.height) / 2
        var previousToLastViewTransformEnd = `translate(${x4}px, ${y4}px) scale(${computedScale * previousStoredScale})`
      } else {
        currentToPreviousView.style.transform = currentToPreviousViewTransformStart
      }
      // arrays
      var snapShoot = {
        zoomLevel: this.storedViews.length,
        views: []
      }
      const newCurrentViewSnapShoot = newCurrentView ? {
        viewName: newCurrentView.dataset.viewName,
        backwardState: {
          origin: newCurrentView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: newCurrentViewTransformStart
        },
        forwardState: {
          origin: newCurrentView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: newCurrentViewTransformEnd
        }
      } : null
      const currentToPreviousViewSnapShoot = currentToPreviousView ? {
        viewName: currentToPreviousView.dataset.viewName,
        backwardState: {
          origin: currentToPreviousView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: currentToPreviousViewTransformStart
        },
        forwardState: {
          origin: currentToPreviousView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: currentToPreviousViewTransformEnd
        }
      } : null
      const previousToLastViewSnapShoot = previousToLastView ? {
        viewName: previousToLastView.dataset.viewName,
        backwardState: {
          origin: previousToLastView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: previousToLastViewTransformStart
        },
        forwardState: {
          origin: previousToLastView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: previousToLastViewTransformEnd
        }
      } : null
      const lastToDetachedViewSnapShoot = lastToDetachedView ? { // ACA VA LA VISTA ENTERA FALTA REALIZAR UN ZOOM IGUAL ANTES DE SACARLA DE JUEGO
        viewName: lastToDetachedView
      } : null
      if (newCurrentViewSnapShoot !== null) snapShoot.views.push(newCurrentViewSnapShoot)
      if (currentToPreviousViewSnapShoot !== null) snapShoot.views.push(currentToPreviousViewSnapShoot)
      if (previousToLastViewSnapShoot !== null) snapShoot.views.push(previousToLastViewSnapShoot)
      if (lastToDetachedViewSnapShoot !== null) snapShoot.views.push(lastToDetachedViewSnapShoot)
      this.storeViews(snapShoot)
      this.currentStage = this.storedViews[this.storedViews.length - 1]
      // animation
      this.tracing('setCSSVariables()')
      //
      newCurrentView.classList.remove('hide')
      newCurrentView.addEventListener('animationstart', this._onZoomInHandlerStart)
      newCurrentView.addEventListener('animationend', this._onZoomInHandlerEnd)
      currentToPreviousView.addEventListener('animationend', this._onZoomInHandlerEnd)
      if (previousToLastView !== null) previousToLastView.addEventListener('animationend', this._onZoomInHandlerEnd)
      //
      newCurrentView.style.setProperty('--zoom-duration', duration)
      newCurrentView.style.setProperty('--zoom-ease', ease)
      newCurrentView.style.setProperty('--current-view-transform-start', newCurrentViewTransformStart)
      newCurrentView.style.setProperty('--current-view-transform-end', newCurrentViewTransformEnd)

      currentToPreviousView.style.setProperty('--zoom-duration', duration)
      currentToPreviousView.style.setProperty('--zoom-ease', ease)
      currentToPreviousView.style.setProperty('--previous-view-transform-start', currentToPreviousViewTransformStart)
      currentToPreviousView.style.setProperty('--previous-view-transform-end', currentToPreviousViewTransformEnd)
      if (previousToLastView !== null)  {
        previousToLastView.style.setProperty('--zoom-duration', duration)
        previousToLastView.style.setProperty('--zoom-ease', ease)
        previousToLastView.style.setProperty('--last-view-transform-start', previousToLastViewTransformStart)
        previousToLastView.style.setProperty('--last-view-transform-end', previousToLastViewTransformEnd)
      }
      
      newCurrentView.style.contentVisibility = 'auto';
      currentToPreviousView.style.contentVisibility = 'auto';
      if (previousToLastView !== null) previousToLastView.style.contentVisibility = 'auto';
      newCurrentView.classList.add(`zoom-current-view`)
      currentToPreviousView.classList.add(`zoom-previous-view`)
      if (previousToLastView !== null) previousToLastView.classList.add(`zoom-last-view`)
      
    }

  }

  zoomOut () {
    this.tracing('zoomOut()')
    this.blockEvents = true
    this.storedPreviousScale.pop()
    //var instance = this.instance
    const canvas = this.canvas
    this.currentStage = this.storedViews[this.storedViews.length - 1]
    const reAttachView = this.currentStage.views[3]
    var currentView = canvas.querySelector('.is-current-view')
    var previousView = canvas.querySelector('.is-previous-view')
    var lastView = canvas.querySelector('.is-last-view')
    //
    this.tracing('setCSSVariables()')
   
    previousView.querySelector('.zoomed').classList.remove('zoomed')
    previousView.classList.replace('is-previous-view','is-current-view')
    
    
    if (lastView !== null) {
      lastView.classList.replace('is-last-view','is-previous-view')
      lastView.classList.remove('hide')
    }
    //
    if (reAttachView !== undefined) {
      // aca hay que 
      canvas.prepend(reAttachView.viewName)
      var newlastView = canvas.querySelector('.z-view:first-child')
      newlastView.style.contentVisibility = 'auto'
      newlastView.classList.add('hide')
    }
    //
    currentView.addEventListener('animationstart', this._onZoomOutHandlerStart)
    currentView.addEventListener('animationend', this._onZoomOutHandlerEnd)
    previousView.addEventListener('animationend', this._onZoomOutHandlerEnd)
    if (lastView !== null) lastView.addEventListener('animationend', this._onZoomOutHandlerEnd)
    //

    currentView.classList.add(`zoom-current-view-reverse`)
    previousView.classList.add(`zoom-previous-view-reverse`)
    if (lastView !== null) lastView.classList.add(`zoom-last-view-reverse`)

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

  onZoomOutHandlerStart (event) {
    this.tracing('onZoomOutHandlerStart()')
    this.blockEvents = true
    event.target.removeEventListener('animationstart', this._onZoomOutHandlerStart)
  }

  onZoomOutHandlerEnd (event) {
    this.tracing('onZoomOutHandlerEnd()')
    const element = event.target
    var currentZoomLevel = this.currentStage
    element.removeEventListener('animationend', this._onZoomOutHandlerEnd)
    // current
    if (element.classList.contains(`zoom-current-view-reverse`)) {
      try {
        this.canvas.removeChild(element)  
      } catch(e) {
        console.debug("Error when trying to remove element after zoom out. Trying to remove its parent instead...")
        try {
          this.canvas.removeChild(element.parentElement)  
        } catch(e) {
          console.debug("Error when trying to remove elemont after zoom out:", e)
          console.debug("Element to remove was:", element)
        }
        
      }
      
      this.blockEvents = false
    }
    if (element.classList.contains(`zoom-previous-view-reverse`)) {
      var origin = currentZoomLevel.views[1].backwardState.origin
      var transform = currentZoomLevel.views[1].backwardState.transform
      element.classList.remove(`zoom-previous-view-reverse`)
      element.style.transformOrigin = `0 0`
      element.style.transform = transform
      //element.style.filter = 'none'
      if (currentZoomLevel.views.length === 2) this.tracing('ended')
    }
    if (element.classList.contains(`zoom-last-view-reverse`)) {
      origin = currentZoomLevel.views[2].backwardState.origin
      transform = currentZoomLevel.views[2].backwardState.transform
      element.classList.remove(`zoom-last-view-reverse`)
      element.style.transformOrigin = origin
      element.style.transform = transform
      if (currentZoomLevel.views.length > 2) this.tracing('ended')
    }
  }

  onZoomInHandlerStart (event) {
    this.tracing('onZoomInHandlerStart()')
    this.blockEvents = true
    event.target.removeEventListener('animationstart', this._onZoomInHandlerStart)
  }

  onZoomInHandlerEnd (event) {
    this.tracing('onZoomInHandlerEnd()')
    const element = event.target
    var currentZoomLevel = this.currentStage
    if (event.target.classList.contains('is-new-current-view')) {
      this.blockEvents = false
      var viewName = 'current-view'
      var transform = currentZoomLevel.views[0].forwardState.transform
      var origin = currentZoomLevel.views[0].forwardState.origin
      element.classList.replace('is-new-current-view', 'is-current-view')

    } else if (event.target.classList.contains('is-previous-view')) {
      viewName = 'previous-view'
      transform = currentZoomLevel.views[1].forwardState.transform
      origin = currentZoomLevel.views[1].forwardState.origin
      if (currentZoomLevel.views.length === 2) this.tracing('ended')
    } else {
      viewName = 'last-view'
      transform = currentZoomLevel.views[2].forwardState.transform
      origin = currentZoomLevel.views[2].forwardState.origin
      if (currentZoomLevel.views.length > 2) this.tracing('ended')
    }
    element.classList.remove(`zoom-${viewName}`, 'has-no-events')
    element.style.transformOrigin = origin
    element.style.transform = transform
    // element.style.filter = window.getComputedStyle(document.documentElement).getPropertyValue(`--${viewName}-filter-end-${this.instance}`)
    element.removeEventListener('animationend', this._onZoomInHandlerEnd)
  }
}
