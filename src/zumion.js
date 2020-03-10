export default class Zumly {
  constructor (options) {
    this.app = options
    this.storedViews = []
  }
// methods
  init () {
    const rootDiv = document.querySelector(this.app.mount)
    var newView = document.createElement('template')
    newView.innerHTML = this.app.initialView
    rootDiv.prepend(newView.content)
    var view = document.querySelector('.view')
    view.classList.add('current')
    var coords = view.getBoundingClientRect()
    // add to storage
    this.storeViews({
      view: view,
      x: coords.x,
      y: coords.y
    })
    // agrega eventos a todos los .zoomable
    view.querySelectorAll('.zoomable')
      .forEach(el => el.addEventListener('click', () => this.zoomIn(el)))
  }
  storeViews (data) {
    this.storedViews.push(data)
  }
  zoomOut () {

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
    let coordenadasCurrentView = currentView.getBoundingClientRect()
    // agrega eventos al currentview
    currentView.querySelectorAll('.zoomable')
      .forEach(vx => vx.addEventListener('click', () => this.zoomIn(vx))) // HANBRIA QUE REMOVCER EL EVENTO AL REMOVER LA VIEW
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
        var last = document.querySelector('.last > .active')
        var coorLast = last.getBoundingClientRect()
        lastView.style.transform = clvt
    }
    previousView.style.transform = `translate(${coordenadasPreviousView.x}px, ${coordenadasPreviousView.y}px)`
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
    // })
    this.storeViews({x: newcoordenadasEl.x, y: newcoordenadasEl.y})
  }
}
// TEMAS A RESOLVER:
// - dsp usar css vars
// - DESHABILITAR CLICK ON TRANSITIONS VIA JS O CSS. VIA CSS. FALTA DESHABILITAR LA NEW CURRENT VIEW VIA UNA CLASS TEMPORAIA
// LISTO AUMENTAR SCALE DE LASTVIEW. 
// - CAMBIAR EL NOMBRE ADEMAS lasrvoew
// - ZOOM BACK
// - USR FLIP
// LISTO ver tema de centrar new view en duferebte elementos
// LISTO identificar zoombale el clickeado
// LISTO tener en cuenta posicion inicial de las vistas, que afecta como se renderizan en la nueva vista. 
// quizas hacer un overrride de esas cosas en caso que no sea la vista inicial.
// LISTO ver tema de tamano diferente de las .views
// LISTO zoom infinito YEAHH!!
// LISTO el resultado de previus view aka last se resta al resultado freal de prevuous
