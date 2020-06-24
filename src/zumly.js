import {shimIdleCallBack, prepareCSS, setCSSVariables} from './utils.js'

window.requestIdleCallback = window.requestIdleCallback || shimIdleCallBack

class Zumly {
  constructor(options) {
    this.app = options
    this.instance = Zumly.counter
    if (options.transitions) {
      this.duration = options.transitions.duration || '1s'
      this.ease = options.transitions.ease || 'ease-in-out'
    } else {
      this.duration = '1s'
      this.ease = 'ease-in-out'
    }
    if (options.transitions && options.transitions.effects) {
      var fx_0 = ''
      var fx_1 = ''
      options.transitions.effects.map(effect => {
        fx_0 += `${effect === 'blur' ? 'blur(0px) ' : effect === 'sepia' ? 'sepia(0) ' : effect === 'saturate' ? 'saturate(0)' : 'none'}`
        fx_1 += `${effect === 'blur' ? 'blur(0.8px) ' : effect === 'sepia' ? 'sepia(5) ' : effect === 'saturate' ? 'saturate(8)' : 'none'}`
      })
    } else {
      fx_0 = 'none'
      fx_1 = 'none'
    }
    this.effects = [fx_0, fx_1]
    if (options.transitions && options.transitions.cover) {
      this.cover = options.transitions.cover || 'width'
    } else {
      this.cover = 'width'
    }
    this.storedViews = []
    this.storedPreviousScale = [1]
    this.blockEvents = false
    this.canvas = document.querySelector(this.app.mount)
    this.canvas.setAttribute('tabindex', this.instance)
    // events
    this._onZoom = this.onZoom.bind(this)
    this._onZoomInHandlerStart = this.onZoomInHandlerStart.bind(this)
    this._onZoomInHandlerEnd = this.onZoomInHandlerEnd.bind(this)
    this._onZoomOutHandlerStart = this.onZoomOutHandlerStart.bind(this)
    this._onZoomOutHandlerEnd = this.onZoomOutHandlerEnd.bind(this)
    /// gestures
    this.touchstartX = 0
    this.touchstartY = 0
    this.touchendX = 0
    this.touchendY = 0
    this._onTouchStart = this.onTouchStart.bind(this)
    this._onTouchEnd = this.onTouchEnd.bind(this)
    this._onKeyUp = this.onKeyUp.bind(this)
    this._onWeel = this.onWeel.bind(this)

    this.currentStage = null
    // event registration
    this.canvas.addEventListener('mouseup', this._onZoom, false)
    this.canvas.addEventListener('touchend', this._onZoom, false)
    this.canvas.addEventListener('touchstart', this._onTouchStart, false)
    this.canvas.addEventListener('touchend', this._onTouchEnd, false)
    this.canvas.addEventListener('keyup', this._onKeyUp, false)
    this.canvas.addEventListener('wheel', this._onWeel, false)
  }
  // Private methods
  static get counter () {
    Zumly._counter = (Zumly._counter || 0) + 1
    return Zumly._counter
  }
  onZoom (event) {
     if (this.storedViews.length > 1 && !this.blockEvents && !event.target.classList.contains('zoom-me')) {
      event.stopPropagation()
      this.zoomOut()
     } 
     if (!this.blockEvents && event.target.classList.contains('zoom-me')){
       event.stopPropagation()
      this.zoomIn(event.target)
    }
  }
  onKeyUp (event) {
    // Possible conflict with usar inputs
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault()
      console.log(event.key)
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.zoomOut()
      } else {
        console.log("zoomOut disabled")
      }
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault()
      console.log(event.key)
    }
  }
  onWeel (event) {
    // inertia need to be fixed
     if (!this.blockEvents) {
      event.preventDefault()
      if (event.deltaY < 0) {
        console.log('wheel ')
      }
      if (event.deltaY > 0) {
        if (this.storedViews.length > 1 && !this.blockEvents) {
          this.zoomOut()
        } else {
          console.log("zoomOut disabled")
        }
      }
    }
  }
  onTouchStart (event) {
    this.touchstartX = event.changedTouches[0].screenX
    this.touchstartY = event.changedTouches[0].screenY
    event.preventDefault()
  }
  onTouchEnd (event) {
    if (!this.blockEvents) {
      this.touchendX = event.changedTouches[0].screenX
      this.touchendY = event.changedTouches[0].screenY
      this.handleGesture(event)
      event.preventDefault()
    }
  }
  handleGesture(event) {
    event.stopPropagation()
    if (this.touchendX < this.touchstartX - 30) {
      console.log('Swiped left')
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.zoomOut()
      } else {
        console.log("zoomOut disabled")
      }
    }
    if (this.touchendY < this.touchstartY - 10) {
      console.log('Swiped up')
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.zoomOut()
      } else {
        console.log("zoomOut disabled")
      }
    }
    // if (this.touchendY > this.touchstartY + 10) {}
    // if (this.touchendX === this.touchstartX) {}
  }
  onZoomOutHandlerStart(event) {
    this.blockEvents = true
    event.target.removeEventListener('animationstart', this._onZoomOutHandlerStart)
  }
  onZoomOutHandlerEnd(event) {
    let element = event.target
    var currentZoomLevel = this.currentStage
    element.removeEventListener('animationend', this._onZoomOutHandlerEnd)
    // current
    if (element.classList.contains(`zoom-current-view-${this.instance}`)) {
      this.canvas.removeChild(element)
      this.blockEvents = false
    } 
    if (element.classList.contains(`zoom-previous-view-${this.instance}`)) {
      var origin = currentZoomLevel.views[1].backwardState.origin
      var transform = currentZoomLevel.views[1].backwardState.transform
      element.style.willChange = 'auto'
      element.classList.remove(`zoom-previous-view-${this.instance}`)
      element.style.transformOrigin = origin
      element.style.transform = transform
      element.style.filter = 'none'
    } 
    if (element.classList.contains(`zoom-last-view-${this.instance}`)) {
      origin = currentZoomLevel.views[2].backwardState.origin
      transform = currentZoomLevel.views[2].backwardState.transform
      element.style.willChange = 'auto'
      element.classList.remove(`zoom-last-view-${this.instance}`)
      element.style.transformOrigin = origin
      element.style.transform = transform
    }
  }
  onZoomInHandlerStart (event) {
    this.blockEvents = true
    event.target.removeEventListener('animationstart', this._onZoomInHandlerStart)
  }
  onZoomInHandlerEnd (event) {
    let element = event.target
    var currentZoomLevel = this.currentStage
    if (event.target.classList.contains('is-new-current-view')) {
      this.blockEvents = false
      var viewName = 'current-view'
      var transform = currentZoomLevel.views[0].forwardState.transform
      var origin = currentZoomLevel.views[0].forwardState.origin
      element.classList.remove('is-new-current-view')
      element.classList.add('is-current-view')
    } else if (event.target.classList.contains('is-previous-view')) {
      viewName = 'previous-view'
      transform = currentZoomLevel.views[1].forwardState.transform
      origin = currentZoomLevel.views[1].forwardState.origin
    } else {
      viewName = 'last-view'
      transform = currentZoomLevel.views[2].forwardState.transform
      origin = currentZoomLevel.views[2].forwardState.origin
    }
    element.style.willChange = 'auto'
    element.classList.remove(`zoom-${viewName}-${this.instance}`)
    element.classList.remove('has-no-events')
    element.style.transformOrigin = origin
    element.style.transform = transform
    element.style.filter = getComputedStyle(document.documentElement).getPropertyValue(`--${viewName}-filter-end-${this.instance}`)
    element.removeEventListener('animationend', this._onZoomInHandlerEnd)
  }
  storeViews(data) {
    this.storedViews.push(data)
  }
  setPreviousScale(scale) {
    this.storedPreviousScale.push(scale)
  }

  async renderView (el, options) {
    return new Promise((resolve) => {
      requestIdleCallback(async () => {
        var newView = document.createElement('template')
        newView.innerHTML = await this.app.views[el.dataset.to].render()
        let vv = newView.content.querySelector('.z-view')
        vv.style.opacity = 0
        vv.classList.add('is-new-current-view')
        vv.classList.add('has-no-events')
        vv.style.transformOrigin = `0 0`
        vv.style.willChange = 'transform, opacity, filter'
        vv.dataset.viewName = el.dataset.to
        var rect = this.canvas.append(newView.content)
        resolve(rect)
      })
    })
  }
  // Public methods
  async init() {
    // add instance style
    prepareCSS(this.instance)
    const canvas = this.canvas
    var newView = document.createElement('template')
    newView.innerHTML = await this.app.views[this.app.initialView].render()
    canvas.prepend(newView.content)
    var view = canvas.querySelector('.z-view')
    view.classList.add('is-current-view')
    view.dataset.viewName = this.app.initialView
    // add to storage. OPTIMIZAR
    this.storeViews({
      zoomLevel: this.storedViews.length,
      views: [
        {
          location: 'current-view',
          viewName: this.app.initialView,
          backwardState: {
              origin: view.style.transformOrigin,
              transform: view.style.transform
          },
          forwardState: null
        }
      ]
    })
  }
  async zoomIn(el) {
    // only runs if there is no transition running
    var instance = this.instance
    let canvas = this.canvas
    canvas.style.perspective = '1000px'
    let coordenadasCanvas = canvas.getBoundingClientRect()
    var offsetX = coordenadasCanvas.left
    var offsetY = coordenadasCanvas.top
    let preScale = this.storedPreviousScale[this.storedPreviousScale.length - 1]
    // generated new view from activated .zoom-me element
    // generateNewView(el)
    await this.renderView(el)
    el.classList.add('zoomed')
    let coordenadasEl = el.getBoundingClientRect()
    // create new view in a template tag
    // select VIEWS from DOM
    var currentView = canvas.querySelector('.is-new-current-view')
    var previousView = canvas.querySelector('.is-current-view')
    var lastView = canvas.querySelector('.is-previous-view')
    var removeView = canvas.querySelector('.is-last-view')
    if (removeView !== null) canvas.removeChild(removeView)
    // do changes
    let cc = currentView.getBoundingClientRect()
    let scale = cc.width / coordenadasEl.width
    let scaleInv = 1 / scale
    let scaleh = cc.height / coordenadasEl.height
    let scaleInvh = 1 / scaleh
    // muy interesante featura... usar el zoom de acuardo a la h o w mayor y agra
    var duration = el.dataset.withDuration || this.duration
    var ease = el.dataset.withEease || this.ease
    var filterIn = this.effects[0]
    var filterOut = this.effects[1]
    var cover = this.cover
    
    if (cover === 'width') {
      var laScala = scale
      var laScalaInv = scaleInv
    } else if (cover === 'height') {
      laScala = scaleh
      laScalaInv = scaleInvh
    } else {
      laScala = scale
      laScalaInv = scaleInv
      console.log('cover no width no height')
    }
    this.setPreviousScale(laScala)
    var transformCurrentView_0 = `translate(${coordenadasEl.x - offsetX + (coordenadasEl.width - cc.width * laScalaInv) / 2}px, ${coordenadasEl.y - offsetY + (coordenadasEl.height - cc.height * laScalaInv) / 2}px) scale(${laScalaInv})`
    currentView.style.transform = transformCurrentView_0
    //
    previousView.classList.add('is-previous-view')
    previousView.classList.remove('is-current-view')
    let coordenadasPreviousView = previousView.getBoundingClientRect()
    // PREVIOUS VIEW EXACTAMENTE ONDE ESTANA ANTES COMO CURRENT
    var transformPreviousView_0 = previousView.style.transform
    previousView.style.transformOrigin = `${coordenadasEl.x + coordenadasEl.width / 2 - coordenadasPreviousView.x}px ${coordenadasEl.y + coordenadasEl.height / 2 - coordenadasPreviousView.y}px`
    
    let x = coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + coordenadasPreviousView.x
    let y = coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + coordenadasPreviousView.y

    let transformPreviousView_1 = `translate(${x}px, ${y}px) scale(${laScala})`
    // PREVIOUS VIEW FINAL STAGE
    previousView.style.transform = transformPreviousView_1
    // ACA CAMBIA LA COSA, LEVANTO LAS COORDENADAS DEL ELEMENTO CLICLEADO QUE ESTBA DNRO DE PREVIOUS VIEW
    var newcoordenadasEl = el.getBoundingClientRect()
    // LO QUE DETERMINA LA POSICINES FONAL DEL CURRENT VIEW
    var transformCurrentView_1 = `translate(${newcoordenadasEl.x - offsetX + (newcoordenadasEl.width - cc.width) / 2}px, ${newcoordenadasEl.y - offsetY + (newcoordenadasEl.height - cc.height) / 2}px)`

    if (lastView !== null) {
      lastView.classList.remove('is-previous-view')
      lastView.classList.add('is-last-view')
      var transformLastView_0 = lastView.style.transform
      var newcoordenadasPV = previousView.getBoundingClientRect()
      lastView.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px) scale(${laScala * preScale})`
      let last = lastView.querySelector('.zoomed')
      var coorLast = last.getBoundingClientRect()
      lastView.style.transform = transformLastView_0
      previousView.style.transform = transformPreviousView_0
      var coorPrev = previousView.getBoundingClientRect()
      var transformLastView_1 = `translate(${coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + (coorPrev.x - coorLast.x) + newcoordenadasPV.x - offsetX + (newcoordenadasPV.width - coorLast.width) / 2}px, ${coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + (coorPrev.y - coorLast.y) + newcoordenadasPV.y - offsetY 
        + (newcoordenadasPV.height - coorLast.height) / 2}px) scale(${laScala * preScale})`
    } else {
      previousView.style.transform = transformPreviousView_0
    }
    // arrays
    var snapShoot = {
      zoomLevel: this.storedViews.length,
      views: []
    }
    let currentv = currentView ? {
      location: 'current-view',
      viewName: currentView.dataset.viewName,
      backwardState: {
        origin: currentView.style.transformOrigin,
        duration: duration,
        ease: ease,
        transform: transformCurrentView_0,
        filter: filterIn
      },
      forwardState: {
        origin: currentView.style.transformOrigin,
        duration: duration,
        ease: ease,
        transform: transformCurrentView_1,
        filter: filterOut
      }
    } : null
    let previousv = previousView ? {
      location: 'previous-view',
      viewName: previousView.dataset.viewName,
      backwardState: {
        origin: previousView.style.transformOrigin,
        duration: duration,
        ease: ease,
        transform: transformPreviousView_0,
        filter: getComputedStyle(document.documentElement).getPropertyValue(`--previous-view-filter-end-${instance}`)
      },
      forwardState: {
        origin: previousView.style.transformOrigin,
        duration: duration,
        ease: ease,
        transform: transformPreviousView_1,
        filter: filterOut
      }
    } : null
    let lastv = lastView ? {
      location: 'last-view',
      viewName: lastView.dataset.viewName,
      backwardState: {
        origin: lastView.style.transformOrigin,
        duration: duration,
        ease: ease,
        transform: transformLastView_0,
        filter: getComputedStyle(document.documentElement).getPropertyValue(`--previous-view-filter-end-${instance}`)
      },
      forwardState: {
        origin: lastView.style.transformOrigin,
        duration: duration,
        ease: ease,
        transform: transformLastView_1,
        filter: filterOut
      }
    } : null
    let gonev = removeView ? { // ACA VA LA VISTA ENTERA FALTA REALIZAR UN ZOOM IGUAL ANTES DE SACARLA DE JUEGO
        location: 'removed-view',
        viewName: removeView
    } : null
    if (currentv !== null) snapShoot.views.push(currentv)
    if (previousv !== null) snapShoot.views.push(previousv)
    if (lastv !== null) snapShoot.views.push(lastv)
    if (gonev !== null) snapShoot.views.push(gonev)
    this.storeViews(snapShoot)
    this.currentStage = this.storedViews[this.storedViews.length - 1]
    // animation
    setCSSVariables('zoomIn', this.currentStage, this.instance)
    previousView.style.willChange = 'transform, opacity, filter'
    if (lastView !== null) lastView.style.willChange = 'transform, opacity, filter'
    //
  currentView.style.opacity = 1
    currentView.addEventListener('animationstart', this._onZoomInHandlerStart)
    currentView.addEventListener('animationend', this._onZoomInHandlerEnd)
    previousView.addEventListener('animationend', this._onZoomInHandlerEnd)
    if (lastView !== null) lastView.addEventListener('animationend', this._onZoomInHandlerEnd)
    //
    currentView.classList.add(`zoom-current-view-${instance}`)
    previousView.classList.add(`zoom-previous-view-${instance}`)
    if (lastView !== null) lastView.classList.add(`zoom-last-view-${instance}`)
  }
  zoomOut() {
    this.blockEvents = true
    this.storedPreviousScale.pop()
    var instance = this.instance
    const canvas = this.canvas
    this.currentStage = this.storedViews[this.storedViews.length - 1]
    let reAttachView = this.currentStage.views[3]
    var currentView = canvas.querySelector('.is-current-view')
    var previousView = canvas.querySelector('.is-previous-view')
    var lastView = canvas.querySelector('.is-last-view')
    //
    setCSSVariables('zoomOut', this.currentStage, this.instance)
    //
    canvas.style.perspective = '1000px'
    //
    currentView.style.willChange = 'auto'
    //
    previousView.querySelector('.zoomed').classList.remove('zoomed')
    previousView.classList.remove('is-previous-view')
    previousView.classList.add('is-current-view')
    previousView.style.willChange = 'auto'
    //
    if (lastView !== null) {
      lastView.style.willChange = 'transform, opacity, filter'
      lastView.classList.add('is-previous-view')
      lastView.classList.remove('is-last-view')
      lastView.style.opacity = 1
    }
    //
    if (reAttachView !== undefined) {
      canvas.prepend(reAttachView.viewName)
      var newlastView = canvas.querySelector('.z-view:first-child')
      newlastView.style.opacity = 0
    }
    //
    currentView.addEventListener('animationstart', this._onZoomOutHandlerStart)
    currentView.addEventListener('animationend', this._onZoomOutHandlerEnd)
    previousView.addEventListener('animationend', this._onZoomOutHandlerEnd)
    if (lastView !== null) lastView.addEventListener('animationend', this._onZoomOutHandlerEnd)
    //
    currentView.classList.add(`zoom-current-view-${instance}`)
    previousView.classList.add(`zoom-previous-view-${instance}`)
    if (lastView !== null) lastView.classList.add(`zoom-last-view-${instance}`)
    this.storedViews.pop()
  }
}
export default Zumly
