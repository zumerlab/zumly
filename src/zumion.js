export default class Zumly {
  constructor (options) {
    this.app = options
    this.storedViews = []
  }
// methods
  init () {
    const rootDiv = document.querySelector(this.app.mount)
    var self = this
    rootDiv.addEventListener('click', function (e) {
      e.stopPropagation()
      self.zoomOut()
    })
    var newView = document.createElement('template')
    newView.innerHTML = this.app.views[this.app.initialView]
    rootDiv.prepend(newView.content)
    var view = document.querySelector('.view')
    view.classList.add('current')
    view.dataset.viewName = this.app.initialView
    var coords = view.getBoundingClientRect()
    // add to storage
    this.storeViews({
        zoomLevel: this.storedViews.length,
        views: [
      // se guardan datos previos
          { 
            location: 'current',
            viewName: this.app.initialView,
            backwardState: {
              origin: view.style.transformOrigin,
              transition: view.style.transition,
              transform: view.style.transform
            },
            forwardState: null
          }
        ]
    })
    // agrega eventos a todos los .zoomable
    var self = this
    view.querySelectorAll('.zoomable')
      .forEach(el => el.addEventListener('click', function (e) {
        e.stopPropagation()
        self.zoomIn(el)
      }))
  }
  storeViews (data) {
    this.storedViews.push(data)
    // console.log(this.storedViews)
  }
  zoomOut () {
    console.log(this.storedViews.length)
    if (this.storedViews.length > 1) {
        console.log(this.storedViews)
        var ultimaVista = this.storedViews[this.storedViews.length - 1]
        let current = ultimaVista.views[0]
        let previous = ultimaVista.views[1]
        let last = ultimaVista.views[2]
        let gone = ultimaVista.views[3]
        console.log(gone)
        const canvas = document.querySelector(this.app.mount)
        var currentView = canvas.querySelector('.view.current')
        var previousView = canvas.querySelector('.view.previous')
        var lastView = canvas.querySelector('.view.last')
        //console.log(currentView, previousView)
        currentView.style.transformOrigin = current.backwardState.origin
        currentView.style.transition = current.backwardState.transition
        currentView.style.transform = current.backwardState.transform
        currentView.addEventListener('transitionend', () => {
          canvas.removeChild(canvas.querySelector('.view.current'))
          })
        previousView.style.filter = ''
        previousView.classList.remove('previous')
        previousView.classList.add('current')
        previousView.style.transformOrigin = previous.backwardState.origin
        previousView.style.transition = previous.backwardState.transition
        previousView.style.transform =previous.backwardState.transform
        if (last !== undefined) {
          lastView.classList.remove('last')
          lastView.classList.add('previous')
          lastView.style.opacity = 1 // hack opacity
          lastView.style.transformOrigin = last.backwardState.origin
          lastView.style.transition = last.backwardState.transition
          lastView.style.transform =last.backwardState.transform
          // canvas.removeChild(canvas.querySelector('div:nth-child(1)'))
        }
        if (gone !== undefined) {
          //var newView = document.createElement('template')
          //newView.innerHTML = gone.viewName
          canvas.append(gone.viewName)
          var newlastView = canvas.querySelector('.view:last-child')
          newlastView.style.opacity = 0 // hack opacity
          //newlastView.classList.add('last')
          //newlastView.style.transformOrigin = gone.backwardState.origin
          //newlastView.style.transition = gone.backwardState.transition
          //newlastView.style.transform = gone.backwardState.transform
        }
        this.storedViews.pop()
    }
    
    //FALTA INCORPORAR VIEWS SACADAS Y CAMBIAR LAS CLASES 
  }
  zoomIn (el) {
    // clicked element with .zoomable
    el.classList.add('active')
    let coordenadasEl = el.getBoundingClientRect()
    let canvas = document.querySelector('.canvas')
    let coordenadasCanvas = canvas.getBoundingClientRect()
    // create new view
    var newView = document.createElement('template')
    newView.innerHTML = this.app.views[el.dataset.goTo]
    // transforma current view en previous view
    var previousView = document.querySelector('.current')
    let coordenadasPreviousView = previousView.getBoundingClientRect()
    var lastView = null 
    var goneView = null
    goneView = document.querySelector('.last')
    if (goneView !== null) {
        canvas.removeChild(goneView)
    }
    // si existe transforma previous view en last view
    lastView = document.querySelector('.previous')
    if (lastView !== null) {
      lastView.classList.remove('previous')
      lastView.classList.add('last')
      var coordenadasLastView = lastView.getBoundingClientRect()
      var clvt = lastView.style.transform
    }
    //
    previousView.classList.add('previous')
    previousView.classList.remove('current')
    // transforma new view en current view y la agrega al DOM al ppio del container
    newView.classList.add('current')
    var mountPoint = document.querySelector(this.app.mount)
    mountPoint.prepend(newView.content)
    document.querySelector('.view').classList.add('current')
    var currentView = document.querySelector('.current')
    currentView.dataset.viewName = el.dataset.goTo
    currentView.classList.add('no-events')
    let coordenadasCurrentView = currentView.getBoundingClientRect()
    // agrega eventos al currentview
    var self = this
    currentView.querySelectorAll('.zoomable')
      .forEach(vx => vx.addEventListener('click', function (e) {
        e.stopPropagation()
        self.zoomIn(vx)
      })) // HANBRIA QUE REMOVCER EL EVENTO AL REMOVER LA VIEW
    currentView.onclick = function (e) {
      e.stopPropagation()
      console.log('ff')
    }
    // canvas
    let scale = coordenadasCurrentView.width / coordenadasEl.width
    let scaleInv = 1 / scale
    previousView.style.transition = 'transform 0s'
    previousView.style.transformOrigin = `
    ${coordenadasEl.x + coordenadasEl.width / 2 - coordenadasPreviousView.x}px
    ${coordenadasEl.y + coordenadasEl.height / 2 - coordenadasPreviousView.y}px
    `
    let x = coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + coordenadasPreviousView.x
    let y = coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + coordenadasPreviousView.y
    let move = `translate(${x}px, ${y}px) scale(${scale})`
    previousView.style.transform = move
    var newcoordenadasEl = el.getBoundingClientRect()
    // vuelve a setear coordenadas
    if (lastView !== null) {
        var newcoordenadasPV = previousView.getBoundingClientRect()
        // var prevEl = document.querySelector('.previous > .zoomable')
        //var cpe = prevEl.getBoundingClientRect()
        lastView.style.transition = 'transform 0s'
        // var scale1 = coordenadasLastView.width / cpe.width
        lastView.style.transform = `translate(${x}px, ${y}px) scale(${scale * scale})`
        var last = document.querySelector('.last > .active') // BUG A RESOLVER... CUANDO SE VUELVE A METER LA VIEW...
        // QUIZAS LA SOLUCION ES METER LA VIEW ENTERA EN GONE... :)
        var coorLast = last.getBoundingClientRect()
        lastView.style.transform = clvt
    }
    previousView.style.transform = `translate(${coordenadasPreviousView.x}px, ${coordenadasPreviousView.y}px)`
    var prePrevTransform = previousView.style.transform
    el.getBoundingClientRect()
    previousView.style.filter = 'blur(2px)'
    previousView.style.transition = `transform ${scale * 0.5}s`
    // requestAnimationFrame(function() {
        previousView.style.transform = move
    // })
    ///
    currentView.style.transformOrigin = 'top left'
    // requestAnimationFrame(function() {
        currentView.style.transform = `translate(${coordenadasEl.x}px, ${coordenadasEl.y}px) scale(${scaleInv})`
        var preCurrentTransform = currentView.style.transform
    // })
    if (lastView !== null) {
        lastView.style.transition = `transform ${scale * 0.5}s`
        var prev = document.querySelector('.previous')
        var coorPrev = prev.getBoundingClientRect()
        // requestAnimationFrame(function() {
            lastView.style.transform = `translate(${coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + (coorPrev.x - coorLast.x) + newcoordenadasPV.x}px, ${coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + (coorPrev.y - coorLast.y) + newcoordenadasPV.y}px) scale(${scale * scale})`
        // })
    } 
    el.getBoundingClientRect()
    currentView.style.transition = `transform ${scale * 0.5}s`
    // requestAnimationFrame(function() {
        currentView.style.transform = `translate(${newcoordenadasEl.x}px, ${newcoordenadasEl.y}px)`
        currentView.addEventListener('transitionend', () => currentView.classList.remove('no-events'))
    // })

    // ADD GONE VIIEW Y LISTO EL POLLO
    var snapShoot = {
      zoomLevel: this.storedViews.length,
      views: []
    }
    let currentv = currentView ? 
          { 
            location: 'current',
            viewName: currentView.dataset.viewName,
            backwardState: {
              origin: currentView.style.transformOrigin,
              transition: currentView.style.transition,
              transform: preCurrentTransform
            },
            forwardState: {
              origin: currentView.style.transformOrigin,
              transition: currentView.style.transition,
              transform: currentView.style.transform
            }
          } : null
    let previousv = previousView ? 
          { 
            location: 'previous',
            viewName: previousView.dataset.viewName, // dsp poner nombre
            backwardState: {
              origin: previousView.style.transformOrigin,
              transition: previousView.style.transition,
              transform: prePrevTransform
            },
            forwardState: {
              origin: previousView.style.transformOrigin,
              transition: previousView.style.transition,
              transform: previousView.style.transform
            }
          } : null
    let lastv = lastView ? 
          { 
            location: 'last',
            viewName: lastView.dataset.viewName, // dsp poner nombre
            backwardState: {
              origin: lastView.style.transformOrigin,
              transition: lastView.style.transition,
              transform: clvt
            },
            forwardState: {
              origin: lastView.style.transformOrigin,
              transition: lastView.style.transition,
              transform: lastView.style.transform
            }
          } : null
    let gonev = goneView ? 
          { // ACA VA LA VISTA ENTERA FALTA REALIZAR UN ZOOM IGUAL ANTES DE SACARLA DE JUEGO
            location: 'gone',
            viewName: goneView, //.dataset.viewName, // dsp poner nombre
            backwardState: {
              origin: goneView.style.transformOrigin,
              transition: goneView.style.transition,
              transform: goneView.style.transform
            },
            forwardState: null
          } : null
    if (currentv !== null) snapShoot.views.push(currentv)
      if (previousv !== null) snapShoot.views.push(previousv)
        if (lastv !== null) snapShoot.views.push(lastv)
          if (gonev !== null) snapShoot.views.push(gonev)
    this.storeViews(snapShoot)
  }
}
// TEMAS A RESOLVER:
// 
// - dsp usar css vars
// - LISTO DESHABILITAR CLICK ON TRANSITIONS VIA JS O CSS. VIA CSS. FALTA DESHABILITAR LA NEW CURRENT VIEW VIA UNA CLASS TEMPORAIA
// LISTO AUMENTAR SCALE DE LASTVIEW. 
// - CAMBIAR EL NOMBRE ADEMAS lasrvoew
// WIP ZOOM BACK: - se hace por dataset.viewName
// - USR FLIP (PODRIA ANDAR)
// LISTO ver tema de centrar new view en duferebte elementos
// LISTO identificar zoombale el clickeado
// LISTO tener en cuenta posicion inicial de las vistas, que afecta como se renderizan en la nueva vista. quizas hacer un overrride de esas cosas en caso que no sea la vista inicial.
// LISTO ver tema de tamano diferente de las .views
// LISTO zoom infinito YEAHH!!
// LISTO el resultado de previus view aka last se resta al resultado freal de prevuous
