export default class Zumly {
constructor(options) {
    this.app = options
    this.storedViews = []
}
init() {
    const rootDiv = document.querySelector(this.app.mount)
    var self = this
    rootDiv.addEventListener('click', function(e) {
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
    view.querySelectorAll('.zoomable').forEach(el => el.addEventListener('click', function(e) {
        e.stopPropagation()
        self.zoomIn(el)
    }))
}
storeViews(data) {
    this.storedViews.push(data)
}
zoomOut() {
    if (this.storedViews.length > 1) {
        var ultimaVista = this.storedViews[this.storedViews.length - 1]
        let current = ultimaVista.views[0]
        let previous = ultimaVista.views[1]
        let last = ultimaVista.views[2]
        let gone = ultimaVista.views[3]
        const canvas = document.querySelector(this.app.mount)
        var currentView = canvas.querySelector('.view.current')
        currentView.classList.remove('current')
        currentView.classList.add('disappear')
        var previousView = canvas.querySelector('.view.previous')
        var lastView = canvas.querySelector('.view.last')
        //console.log(currentView, previousView)
        currentView.style.transformOrigin = current.backwardState.origin
        currentView.style.transition = current.backwardState.transition
        currentView.style.transform = current.backwardState.transform
        currentView.addEventListener('transitionend', () => {
            canvas.removeChild(canvas.querySelector('.view.disappear'))
        })
        let elementoClickeado = previousView.querySelector('.active')
        elementoClickeado.classList.remove('active')
        // previousView.style.filter = ''
        previousView.classList.remove('previous')
        previousView.classList.add('current')
        previousView.style.transformOrigin = previous.backwardState.origin
        previousView.style.transition = previous.backwardState.transition
        previousView.style.transform = previous.backwardState.transform
        if (last !== undefined) {
            lastView.classList.remove('last')
            lastView.classList.add('previous')
            lastView.style.opacity = 1
            lastView.style.transformOrigin = last.backwardState.origin
            lastView.style.transition = last.backwardState.transition
            lastView.style.transform = last.backwardState.transform
        }
        if (gone !== undefined) {
            canvas.prepend(gone.viewName)
            var newlastView = canvas.querySelector('.view:last-child')
            newlastView.style.opacity = 0
        }
        this.storedViews.pop()
    }
}
zoomIn(el) {
    // clicked element with .zoomable
    el.classList.add('active')
    let coordenadasEl = el.getBoundingClientRect()
    let canvas = document.querySelector('.canvas')
    let coordenadasCanvas = canvas.getBoundingClientRect()
    // create new view
    var newView = document.createElement('template')
    newView.innerHTML = this.app.views[el.dataset.goTo]
    // create overlay effect
    //var overlay = document.createElement('template')
    //overlay.innerHTML = `<div class='overlay'></div>`
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
    //mountPoint.prepend(overlay.content)
    mountPoint.append(newView.content)
    mountPoint.querySelector('.view:last-child').classList.add('current')
    var currentView = document.querySelector('.current')
    currentView.classList.add('appear')
    currentView.dataset.viewName = el.dataset.goTo
    currentView.classList.add('no-events')
    let coordenadasCurrentView = currentView.getBoundingClientRect()
    // agrega eventos al currentview
    var self = this
    currentView.querySelectorAll('.zoomable').forEach(vx => vx.addEventListener('click', function(e) {
        e.stopPropagation()
        self.zoomIn(vx)
    }))
    currentView.onclick = function(e) {
        e.stopPropagation()
    }
    // canvas
    let scale = coordenadasCurrentView.width / coordenadasEl.width
    let scaleInv = 1 / scale
    let scaley = coordenadasCurrentView.height / coordenadasEl.height
    let scaleInvy = 1 / scaley
    previousView.style.transition = 'transform 0s'
    previousView.style.transformOrigin = `
${coordenadasEl.x + coordenadasEl.width / 2 - coordenadasPreviousView.x}px
${coordenadasEl.y + coordenadasEl.height / 2 - coordenadasPreviousView.y}px
`
    let x = coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + coordenadasPreviousView.x
    let y = coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + coordenadasPreviousView.y
    let move = `translate3d(${x}px, ${y}px, 0px) scale(${scale})`
    previousView.style.transform = move
    var newcoordenadasEl = el.getBoundingClientRect()
    // vuelve a setear coordenadas
    if (lastView !== null) {
        var newcoordenadasPV = previousView.getBoundingClientRect()
        lastView.style.transition = 'transform 0s'
        lastView.style.transform = `translate3d(${x}px, ${y}px, 0px) scale(${scale * scale})`
        var last = document.querySelector('.last > .active')
        var coorLast = last.getBoundingClientRect()
        lastView.style.transform = clvt
    }
    previousView.style.transform = `translate3d(${coordenadasPreviousView.x}px, ${coordenadasPreviousView.y}px, 0px)`
    var prePrevTransform = previousView.style.transform
    el.getBoundingClientRect()
    previousView.style.transition = `transform ${scale * 0.4}s ease-in-out`
    previousView.style.transform = move
    currentView.style.transformOrigin = 'top left'
    currentView.style.transform = `translate3d(${coordenadasEl.x}px, ${coordenadasEl.y}px, 0px) scale(${scaleInv})`
    var preCurrentTransform = currentView.style.transform
    if (lastView !== null) {
        lastView.style.transition = `transform ${scale * 0.4}s ease-in-out`
        var prev = document.querySelector('.previous')
        var coorPrev = prev.getBoundingClientRect()
        lastView.style.transform = `translate3d(${coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + (coorPrev.x - coorLast.x) + newcoordenadasPV.x}px, ${coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + (coorPrev.y - coorLast.y) + newcoordenadasPV.y}px, 0px) scale(${scale * scale})`
    }
    el.getBoundingClientRect()
    currentView.style.transition = `transform ${scale * 0.4}s ease-in-out`
    currentView.style.transform = `translate3d(${newcoordenadasEl.x}px, ${newcoordenadasEl.y}px, 0px)`
    currentView.addEventListener('transitionend', () => {
      currentView.classList.remove('no-events')
      currentView.classList.remove('appear')
    })
    var snapShoot = {
        zoomLevel: this.storedViews.length,
        views: []
    }
    let currentv = currentView ? {
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
    let previousv = previousView ? {
        location: 'previous',
        viewName: previousView.dataset.viewName,
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
    let lastv = lastView ? {
        location: 'last',
        viewName: lastView.dataset.viewName,
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
    let gonev = goneView ? { // ACA VA LA VISTA ENTERA FALTA REALIZAR UN ZOOM IGUAL ANTES DE SACARLA DE JUEGO
        location: 'gone',
        viewName: goneView,
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
/*(function() {
  var requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                              window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
  window.requestAnimationFrame = requestAnimationFrame;
})();

var start = null;
var element = document.getElementById('SomeElementYouWantToAnimate');

function step(timestamp) {
  if (!start) start = timestamp;
  var progress = timestamp - start;
  element.style.transform = 'translateX(' + Math.min(progress / 10, 200) + 'px)';
  if (progress < 2000) {
    window.requestAnimationFrame(step);
  }
}

window.requestAnimationFrame(step);*/
// TEMAS A RESOLVER:
// CAMBIAR ORDEN LAYERS ESTAN INVERTIDOS.
// crear un layer blur o de diferrente estilos para no afectar el rendimiento de la navegacion
// usando backdrop-filter. no anda no ffox
// limitar scale factor en altura? limitar tamanos de los zoomable y views?
// PASAR A ANIMATINS CSS CON CSS VARIABLES
// ver tema de transicion de la nueva vista in and out
// ver bus de ejecucion de transition aun en movimiento
// poner opciones para los devs: efectos blur, velocidad variable, constante, custom de transicion
// ultra optimizar el zoomin, zoomout...
// // Set will-change when the element is hovered
/*el.addEventListener('mouseenter', hintBrowser);
el.addEventListener('animationEnd', removeHint);

function hintBrowser() {
  // The optimizable properties that are going to change
  // in the animation's keyframes block
  this.style.willChange = 'transform, opacity';
}

function removeHint() {
  this.style.willChange = 'auto';
}*/
// - dsp usar css vars