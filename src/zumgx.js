export default class Zumly {
  constructor (options) {
    this.app = options
  }
// methods
  init () {
    const rootDiv = document.querySelector(this.app.mount)
    // mete la primera view en el dom
    // agregar dompurify o algo asi mas adelante
    var newView = document.createElement('template')
    newView.innerHTML = this.app.initialView
    rootDiv.prepend(newView.content)
    document.querySelector('.view').classList.add('current')
    // agrega eventos a todos los .zoomable
    var views = this.app.views
    //console.log(typeof views)
    document.querySelectorAll('.zoomable')
      .forEach(el => el.addEventListener('click', () => this.zoomIn(el)))
  }

  zoomIn (el) {
    // TEMAS A RESOLVER:
    // - DESHABILITAR CLICK ON TRANSITIONS VIA JS O CSS
    // - AUMENTAR SCALE DE LASTVIEW. CAMBIAR EL NOMBRE ADEMAS
    // - ZOOM BACK
    // - tener en cuenta posicion inicial de las vistas, que afecta como se renderizan en la nueva vista. 
    // quizas hacer un overrride de esas cosas en caso que no sea la vista inicial.
    // - ver tema de tamano diferente de las .views

    // clicked element with .zoomable
    let coordenadasEl = el.getBoundingClientRect()
    // create new view
    var newView = document.createElement('template')
    newView.innerHTML = this.app.views[el.dataset.goTo]
    // transforma current view en previous view
    var previousView = document.querySelector('.current')
    let coordenadasPreviousView = previousView.getBoundingClientRect()
    var lastView = null 
    // si existe transforma previous view en last view
    lastView = document.querySelector('.previous')
    if (lastView !== null) {
      lastView.classList.remove('previous')
      lastView.classList.add('last')
      var coordenadasLastView = lastView.getBoundingClientRect()
      var subcanvas = document.querySelector('.subcanvas')
      subcanvas.appendChild(lastView)
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
    // agrega eventos
    document.querySelectorAll('.zoomable')
      .forEach(vx => vx.addEventListener('click', () => this.zoomIn(vx)))
    // canvas
    let canvas = document.querySelector('.canvas')
    // let subcanvas = document.querySelector('.subcanvas')
    // subcanvas.appendChild(previousView)
    let coordenadasCanvas = canvas.getBoundingClientRect()
    // DETERMINA ESCALAS
    let scale = coordenadasCurrentView.width / coordenadasEl.width
    let scaleInv = 1 / scale
    // previousView.style.opacity = 0
    previousView.style.transition = 'transform 0s'
    previousView.style.transformOrigin = `
    ${coordenadasEl.x + (coordenadasEl.width / 2) - coordenadasPreviousView.x}px
    ${coordenadasEl.y + (coordenadasEl.height / 2) - coordenadasPreviousView.y}px
    `
    let move = `
    translate(${coordenadasCanvas.width / 2 - (coordenadasEl.width / 2) - coordenadasEl.x + coordenadasPreviousView.x}px,
    ${coordenadasCanvas.height / 2 - (coordenadasEl.height / 2) - coordenadasEl.y + coordenadasPreviousView.y}px)
    scale(${scale})
    `
    if (lastView !== null) {
      subcanvas.style.transform = `scale(${scale})`
    }
    previousView.style.transform = move
    let newcoordenadasEl = el.getBoundingClientRect()
    // vuelve a setear coordenadas
    previousView.style.transform = `translate(${coordenadasPreviousView.x}px, ${coordenadasPreviousView.y}px)`
    //
    el.getBoundingClientRect()
    // previousView.style.opacity = 1
    // previousView.style.filter = 'blur(2px)'
    previousView.style.transition = 'transform 2s'
    previousView.style.transform = move
    ///
    currentView.style.transformOrigin = 'top left'
    currentView.style.transform = `translate(${coordenadasEl.x}px, ${coordenadasEl.y}px) scale(${scaleInv})`
    el.getBoundingClientRect()
    currentView.style.transition = 'transform 2s'
    currentView.style.transform = `translate(${newcoordenadasEl.x}px, ${newcoordenadasEl.y}px)`
    console.log(previousView.getBoundingClientRect())
}

}

