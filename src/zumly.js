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

  getPreviousScale () {
    this.tracing('getPreviousScale()')
    return this.storedPreviousScale[this.storedPreviousScale.length - 1]
  }

  getNewScale (bounds) {
    let newScale
    if (this.cover === 'width') {
      newScale = bounds.newCurrentView.width / bounds.triggeredElement.width
    } else if (this.cover === 'height') {
      newScale = bounds.newCurrentView.height / bounds.triggeredElement.height
    }
    return {
      normal: newScale,
      inverted: 1 / newScale
    }
  }

  calculateCoords (step, data) {
    let x
    let y
   
    if (step === 'newCurrentView') {
      x = data.bounds.triggeredElement.x - data.bounds.canvas.left + (data.bounds.triggeredElement.width - data.bounds.newCurrentView.width * data.scale.newInverted) / 2
      y = data.bounds.triggeredElement.y - data.bounds.canvas.top + (data.bounds.triggeredElement.height - data.bounds.newCurrentView.height * data.scale.newInverted) / 2
    }
    if (step === 'currentToPreviousView') {
      x = data.bounds.canvas.width / 2 - data.bounds.triggeredElement.width / 2 - data.bounds.triggeredElement.x + data.bounds.currentToPreviousView.x
      y = data.bounds.canvas.height / 2 - data.bounds.triggeredElement.height / 2 - data.bounds.triggeredElement.y + data.bounds.currentToPreviousView.y
    }
    if (step === 'newCurrentViewEnd') {
     x = data.reDoTriggeredElementBounds.x - data.bounds.canvas.left + (data.reDoTriggeredElementBounds.width - data.bounds.newCurrentView.width) / 2
     y = data.reDoTriggeredElementBounds.y - data.bounds.canvas.top + (data.reDoTriggeredElementBounds.height - data.bounds.newCurrentView.height) / 2
    }
    if (step === 'previousToLastViewEnd') {
      x = data.bounds.canvas.width / 2 - data.bounds.triggeredElement.width / 2 - data.bounds.triggeredElement.x + (data.reReDoCurrentToPreviousViewBounds.x - data.zoomedElementBounds.x) + data.reDoCurrentToPreviousViewBounds.x - data.bounds.canvas.left + (data.reDoCurrentToPreviousViewBounds.width - data.zoomedElementBounds.width) / 2
      y = data.bounds.canvas.height / 2 - data.bounds.triggeredElement.height / 2 - data.bounds.triggeredElement.y + (data.reReDoCurrentToPreviousViewBounds.y - data.zoomedElementBounds.y) + data.reDoCurrentToPreviousViewBounds.y - data.bounds.canvas.top + (data.reDoCurrentToPreviousViewBounds.height - data.zoomedElementBounds.height) / 2
    }
    if (step === 'previousToLastViewSimulated') {
      x = data.currentToPreviousViewEndCoords.x - data.bounds.canvas.left
      y = data.currentToPreviousViewEndCoords.y - data.bounds.canvas.top
    }
   
    return {
      x,
      y
    }
  }
  
  calculateTransformOriginCoords (step,bounds) {
    let x
    let y
    if (step === 'currentToPreviusView') {
      x = bounds.triggeredElement.x + bounds.triggeredElement.width / 2 - bounds.currentToPreviousView.x
      y = bounds.triggeredElement.y + bounds.triggeredElement.height / 2 - bounds.currentToPreviousView.y
    }
    return {
      x,
      y
    }
  }

  async  getDOMRect (element) {
    return new Promise((resolve) => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.boundingClientRect) {
                    const { x, y, width, height, top, left } = entry.boundingClientRect;
                    resolve({ x, y, width, height,top,left }); // Return only essential properties
                    observer.disconnect(); // Stop observing after getting the data
                }
            });
        }, { threshold: 1 });

        observer.observe(element);
    });
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

  
  async calculateStackedViews (triggeredElement) {
    // Obtener las vistas del DOM
    const { canvas, views } = this.getViewsFromDOM();

    // Renderizar la nueva vista
    const newCurrentView = await this.renderNewView(triggeredElement, canvas);

    // Obtener dimensiones
    const { bounds } = await this.getBounds(canvas, newCurrentView, views, triggeredElement);

    // Modificar los estilos
    this.modifyStyles(triggeredElement, newCurrentView, views, canvas);
  
    // Obtener y modificar escala AGRUPAR ESCALAS
    const { scale } = this.getAndModifyScale(bounds);

    // Calcular y aplicar transformaciones
    const { transforms } = this.calculateAndApplyTransforms(triggeredElement, bounds, scale, views, newCurrentView);
    
      // Guardar el estado de las vistas
    this.storeViewsState(views, newCurrentView, transforms);
 
    return {
      views: {
        newCurrent: newCurrentView,
        currentToPrevious: views.currentToPrevious,
        previousToLast: views.previousToLast
      }
    }

  }

  // Función para obtener las vistas del DOM
getViewsFromDOM() {
  const canvas = this.canvas;
  return {
      canvas,
      views: {
        currentToPrevious: canvas.querySelector('.is-current-view'),
        previousToLast: canvas.querySelector('.is-previous-view'),
        lastToDetached: canvas.querySelector('.is-last-view')
      }
  };
}

// Función para renderizar la nueva vista
async renderNewView(triggeredElement, canvas) {
  this.tracing('renderView()');
  return await renderView(triggeredElement, canvas, this.views, false, this.componentContext);
}

// Función para obtener dimensiones
async getBounds(canvas, newCurrentView, views, triggeredElement) {
  return {
    bounds: {
      canvas: await this.getDOMRect(canvas),
      newCurrentView: await this.getDOMRect(newCurrentView),
      currentToPreviousView: await this.getDOMRect(views.currentToPrevious),
      triggeredElement: await this.getDOMRect(triggeredElement)
    }
      
  };
}

// Función para modificar los estilos
modifyStyles(triggeredElement, newCurrentView, views, canvas) {
  triggeredElement.classList.add('zoomed');
  newCurrentView.style.contentVisibility = 'hidden';
  views.currentToPrevious.style.contentVisibility = 'hidden';
  views.currentToPrevious.classList.replace('is-current-view', 'is-previous-view');
  if (views.previousToLast !== null) {
      views.previousToLast.style.contentVisibility = 'hidden';
      views.previousToLast.classList.replace('is-previous-view', 'is-last-view');
  }
  if (views.lastToDetached !== null) {
      canvas.removeChild(views.lastToDetached);
  }
}

// Función para obtener y modificar escala 
getAndModifyScale(bounds) {
  const previous = this.getPreviousScale();
  const { normal: newScale, inverted: newInverted } = this.getNewScale(bounds);
  this.setPreviousScale(newScale);
  return { 
    scale: {
      new: newScale,
      newInverted,
      previous
    }
  };
}

// Función para calcular y aplicar las transformaciones
calculateAndApplyTransforms(triggeredElement,bounds, scale, views, newCurrentView) {
  // Lógica de transformaciones y coordenadas
  var newCurrentViewStartCoords = this.calculateCoords('newCurrentView', {bounds, scale})
    // save state
    var newCurrentViewTransformStart = `translate(${newCurrentViewStartCoords.x}px, ${newCurrentViewStartCoords.y}px) scale(${scale.newInverted})`
    // apply sate
    newCurrentView.style.transform = newCurrentViewTransformStart
    // save state
    var currentToPreviousViewTransformStart = views.currentToPrevious.style.transform
    // calculate transform origin
    var currentToPreviousViewTransformOriginCoords = this.calculateTransformOriginCoords('currentToPreviusView', bounds)
    // apply
    views.currentToPrevious.style.transformOrigin = `${currentToPreviousViewTransformOriginCoords.x}px ${currentToPreviousViewTransformOriginCoords.y}px`
    // Calculates and applies final transform coordinates of views.currentToPrevious.    
    const currentToPreviousViewEndCoords = this.calculateCoords('currentToPreviousView', {bounds})
    // save state
    const currentToPreviousViewTransformEnd = `translate(${currentToPreviousViewEndCoords.x}px, ${currentToPreviousViewEndCoords.y}px) scale(${scale.new})`
    // apply
    views.currentToPrevious.style.transform = currentToPreviousViewTransformEnd
    // recalcular dimensiones del elemento clickeado
    var reDoTriggeredElementBounds = triggeredElement.getBoundingClientRect()
    // calculated
    var newCurrentViewEndCoords = this.calculateCoords('newCurrentViewEnd', {reDoTriggeredElementBounds,bounds})
    // save state
    var newCurrentViewTransformEnd = `translate(${newCurrentViewEndCoords.x}px, ${newCurrentViewEndCoords.y}px)`
  
    if (views.previousToLast !== null) {
      // save sate
      var previousToLastViewTransformStart = views.previousToLast.style.transform
      // get dimensions
      var reDoCurrentToPreviousViewBounds = views.currentToPrevious.getBoundingClientRect()
      var previousToLastViewSimulatedCoors = this.calculateCoords('previousToLastViewSimulated', {currentToPreviousViewEndCoords, bounds})
      // apply
      views.previousToLast.style.transform = `translate(${previousToLastViewSimulatedCoors.x}px, ${previousToLastViewSimulatedCoors.y}px) scale(${scale.new * scale.previous})`
      // get dimensions
      var zoomedElement = views.previousToLast.querySelector('.zoomed')
      var zoomedElementBounds = zoomedElement.getBoundingClientRect()
      // apply
      views.previousToLast.style.transform = previousToLastViewTransformStart
      views.currentToPrevious.style.transform = currentToPreviousViewTransformStart
      // get dimensions
      var reReDoCurrentToPreviousViewBounds = views.currentToPrevious.getBoundingClientRect()
      // calculate
      var previousToLastViewEndCoords = this.calculateCoords('previousToLastViewEnd', {zoomedElementBounds,reDoCurrentToPreviousViewBounds,reReDoCurrentToPreviousViewBounds,bounds})
      // save sate
      var previousToLastViewTransformEnd = `translate(${previousToLastViewEndCoords.x}px, ${previousToLastViewEndCoords.y}px) scale(${scale.new * scale.previous})`
    } else {
      // apply
      views.currentToPrevious.style.transform = currentToPreviousViewTransformStart
    }

    return {
      transforms: {
        newCurrentViewTransformStart,
        newCurrentViewTransformEnd,
        currentToPreviousViewTransformStart,
        currentToPreviousViewTransformEnd,
        previousToLastViewTransformStart,
        previousToLastViewTransformEnd
      }
      
    }
}

// Función para guardar el estado de las vistas
storeViewsState(views, newCurrentView, transforms) {
  const snapShoot = this.createSnapshot(newCurrentView, views, transforms);
  this.storeViews(snapShoot);
  this.currentStage = this.storedViews[this.storedViews.length - 1];
}

// Crear snapshot de las vistas
createSnapshot(newCurrentView, views, transforms) {
  let snapShoot = {
      zoomLevel: this.storedViews.length,
      views: []
  };

  if (newCurrentView) snapShoot.views.push(this.createViewSnapShoot(newCurrentView, transforms.newCurrentViewTransformStart, transforms.newCurrentViewTransformEnd));
  if (views.currentToPrevious) snapShoot.views.push(this.createViewSnapShoot(views.currentToPrevious, transforms.currentToPreviousViewTransformStart, transforms.currentToPreviousViewTransformEnd));
  if (views.previousToLast) snapShoot.views.push(this.createViewSnapShoot(views.previousToLast, transforms.previousToLastViewTransformStart, transforms.previousToLastViewTransformEnd));
  if (views.lastToDetached) snapShoot.views.push({ viewName: views.lastToDetached });

  return snapShoot;
}

// Crear un snapshot de una vista específica
createViewSnapShoot(view, transformStart, transformEnd) {
  return {
      viewName: view.dataset.viewName,
      backwardState: {
          origin: view.style.transformOrigin,
          duration: this.duration,
          ease: this.ease,
          transform: transformStart
      },
      forwardState: {
          origin: view.style.transformOrigin,
          duration: this.duration,
          ease: this.ease,
          transform: transformEnd
      }
  };
}
prepareAnimation(views) {
    let currentStage = this.currentStage
    views.newCurrent.classList.remove('hide')
    views.newCurrent.addEventListener('animationstart', this._onZoomInHandlerStart)
    views.newCurrent.addEventListener('animationend', this._onZoomInHandlerEnd)
    views.currentToPrevious.addEventListener('animationend', this._onZoomInHandlerEnd)
    if (views.previousToLast !== null) views.previousToLast.addEventListener('animationend', this._onZoomInHandlerEnd)
    //
    views.newCurrent.style.setProperty('--zoom-duration', this.duration)
    views.newCurrent.style.setProperty('--zoom-ease', this.ease)
    views.newCurrent.style.setProperty('--current-view-transform-start', currentStage.views[0].backwardState.transform)
    views.newCurrent.style.setProperty('--current-view-transform-end', currentStage.views[0].forwardState.transform)

    views.currentToPrevious.style.setProperty('--zoom-duration', this.duration)
    views.currentToPrevious.style.setProperty('--zoom-ease', this.ease)
    views.currentToPrevious.style.setProperty('--previous-view-transform-start', currentStage.views[1].backwardState.transform)
    views.currentToPrevious.style.setProperty('--previous-view-transform-end', currentStage.views[1].forwardState.transform)
    if (views.previousToLast !== null)  {
      views.previousToLast.style.setProperty('--zoom-duration', this.duration)
      views.previousToLast.style.setProperty('--zoom-ease', this.ease)
      views.previousToLast.style.setProperty('--last-view-transform-start', currentStage.views[2].backwardState.transform)
      views.previousToLast.style.setProperty('--last-view-transform-end', currentStage.views[2].forwardState.transform)
    }
    
    views.newCurrent.style.contentVisibility = 'auto';
    views.currentToPrevious.style.contentVisibility = 'auto';
    if (views.previousToLast !== null) views.previousToLast.style.contentVisibility = 'auto';
}

// Función para ejecutar la animación
performAnimation(views) {
  views.newCurrent.classList.add('zoom-current-view');
  views.currentToPrevious.classList.add('zoom-previous-view');
    if (views.previousToLast !== null) views.previousToLast.classList.add('zoom-last-view');
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
   * Main methods
   */
  async zoomIn (triggeredElement) {
    const {views} = await this.calculateStackedViews(triggeredElement)
    // Preparar la animación
    this.prepareAnimation(views);

    // Ejecutar la animación
    this.performAnimation(views);
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
