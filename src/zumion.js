//REF https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes#Defining_classes 
class Zumly {
constructor(options) {
    this.app = options
    this.storedViews = []
    this.storedPreviousScale = [1]
    this._sessionId = Zumly.counter
    this.blockEvents = false
}

get sessionId () {
  return this._sessionId
}

static get counter () {
  Zumly._counter = (Zumly._counter || 0) + 1
  return Zumly._counter
}

init() {
    // add instance style
    var instanceStyle = document.createElement('style')
    instanceStyle.innerHTML = `
    .zoom-in-current-view-${this._sessionId} {
      -webkit-animation-name: zoomInCurrentView${this._sessionId};
              animation-name: zoomInCurrentView${this._sessionId};
      -webkit-animation-duration: var(--animation-duration-${this._sessionId});
              animation-duration: var(--animation-duration-${this._sessionId});
      -webkit-animation-timing-function: ease-in-out;
              animation-timing-function: ease-in-out;
      -webkit-animation-fill-mode: forwards;
              animation-fill-mode: forwards;
    }
    .zoom-out-current-view-${this._sessionId} {
      -webkit-animation-name: zoomOutCurrentView${this._sessionId};
              animation-name: zoomOutCurrentView${this._sessionId};
      -webkit-animation-duration: var(--animation-duration-${this._sessionId});
              animation-duration: var(--animation-duration-${this._sessionId});
      -webkit-animation-timing-function: ease-in-out;
              animation-timing-function: ease-in-out;
      -webkit-animation-fill-mode: forwards;
              animation-fill-mode: forwards;
    }
    .zoom-previous-view-${this._sessionId} {
      -webkit-animation-name: zoomPreviousView${this._sessionId};
              animation-name: zoomPreviousView${this._sessionId};
      -webkit-animation-duration: var(--animation-duration-${this._sessionId});
              animation-duration: var(--animation-duration-${this._sessionId});
      -webkit-animation-timing-function: ease-in-out;
              animation-timing-function: ease-in-out;
      -webkit-animation-fill-mode: forwards;
              animation-fill-mode: forwards;
    }
    .zoom-last-view-${this._sessionId} {
      -webkit-animation-name: zoomLastView${this._sessionId};
              animation-name: zoomLastView${this._sessionId};
      -webkit-animation-duration: var(--animation-duration-${this._sessionId});
              animation-duration: var(--animation-duration-${this._sessionId});
      -webkit-animation-timing-function: ease-in-out;
              animation-timing-function: ease-in-out;
      -webkit-animation-fill-mode: forwards;
              animation-fill-mode: forwards;
    }
    @-webkit-keyframes zoomInCurrentView${this._sessionId} {
      0% {
        transform: var(--currentView-transform-start-${this._sessionId});
        opacity: var(--currentView-opacity-start-${this._sessionId})
      }

      100% {
        transform: var(--currentView-transform-end-${this._sessionId});
        opacity: var(--currentView-opacity-end-${this._sessionId})
      }
    }
    @keyframes zoomInCurrentView${this._sessionId} {
      0% {
        transform: var(--currentView-transform-start-${this._sessionId});
        opacity: var(--currentView-opacity-start-${this._sessionId})
      }

      100% {
        transform: var(--currentView-transform-end-${this._sessionId});
        opacity: var(--currentView-opacity-end-${this._sessionId})
      }
    }
    @-webkit-keyframes zoomOutCurrentView${this._sessionId} {
      0% {
        transform-origin: var(--currentView-transformOrigin-start-${this._sessionId});
        transform: var(--currentView-transform-start-${this._sessionId});
        opacity: var(--currentView-opacity-start-${this._sessionId})
      }

      100% {
        transform-origin: var(--currentView-transformOrigin-end-${this._sessionId});
        transform: var(--currentView-transform-end-${this._sessionId});
        opacity: var(--currentView-opacity-end-${this._sessionId})
      }
    }
    @keyframes zoomOutCurrentView${this._sessionId} {
      0% {
        transform-origin: var(--currentView-transformOrigin-start-${this._sessionId});
        transform: var(--currentView-transform-start-${this._sessionId});
        opacity: var(--currentView-opacity-start-${this._sessionId})
      }

      100% {
        transform-origin: var(--currentView-transformOrigin-end-${this._sessionId});
        transform: var(--currentView-transform-end-${this._sessionId});
        opacity: var(--currentView-opacity-end-${this._sessionId})
      }
    }
    @-webkit-keyframes zoomPreviousView${this._sessionId} {
      0% {
        transform-origin: var(--previousView-transformOrigin-start-${this._sessionId});
        transform: var(--previousView-transform-start-${this._sessionId})
      }

      100% {
        transform-origin: var(--previousView-transformOrigin-end-${this._sessionId});
        transform: var(--previousView-transform-end-${this._sessionId})
      }
    }
    @keyframes zoomPreviousView${this._sessionId} {
      0% {
        transform-origin: var(--previousView-transformOrigin-start-${this._sessionId});
        transform: var(--previousView-transform-start-${this._sessionId})
      }

      100% {
        transform-origin: var(--previousView-transformOrigin-end-${this._sessionId});
        transform: var(--previousView-transform-end-${this._sessionId})
      }
    }
    @-webkit-keyframes zoomLastView${this._sessionId} {
      0% {
        transform-origin: var(--lastView-transformOrigin-start-${this._sessionId});
        transform: var(--lastView-transform-start-${this._sessionId})
      }

      100% {
        transform-origin: var(--lastView-transformOrigin-end-${this._sessionId});
        transform: var(--lastView-transform-end-${this._sessionId})
      }
    }
    @keyframes zoomLastView${this._sessionId} {
      0% {
        transform-origin: var(--lastView-transformOrigin-start-${this._sessionId});
        transform: var(--lastView-transform-start-${this._sessionId})
      }

      100% {
        transform-origin: var(--lastView-transformOrigin-end-${this._sessionId});
        transform: var(--lastView-transform-end-${this._sessionId})
      }
    }
    `
    document.head.appendChild(instanceStyle)
    const canvas = document.querySelector(this.app.mount)
    var self = this //OPTIMIZAR
    canvas.addEventListener('click', function(e) {
        e.stopPropagation()
        self.zoomOut()
    })
    var newView = document.createElement('template')
    newView.innerHTML = this.app.views[this.app.initialView]
    canvas.prepend(newView.content)
    var view = canvas.querySelector('.view')
    view.classList.add('current')
    view.dataset.viewName = this.app.initialView
    // agrega eventos a todos los .zoomable
    view.querySelectorAll('.zoomable').forEach(el => el.addEventListener('click', function(e) {
        e.stopPropagation()
        self.zoomIn(el)
    }))
    // add to storage. OPTIMIZAR
    this.storeViews({
        zoomLevel: this.storedViews.length,
        views: [
            // se guardan datos previos
            {
                location: 'current',
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
storeViews(data) {
    this.storedViews.push(data)
}
setPreviousScale(scale) {
    this.storedPreviousScale.push(scale)
}
zoomOut() {
    if (this.storedViews.length > 1 && !this.blockEvents) {
        this.storedPreviousScale.pop()
        var ultimaVista = this.storedViews[this.storedViews.length - 1]
        let current = ultimaVista.views[0]
        let previous = ultimaVista.views[1]
        let last = ultimaVista.views[2]
        let gone = ultimaVista.views[3]
        const canvas = document.querySelector(this.app.mount)
        var currentView = canvas.querySelector('.view.current')
        var previousView = canvas.querySelector('.view.previous')
        var lastView = canvas.querySelector('.view.last')
        currentView.style.willChange = 'transform, opacity'
        // currentView-transform-start-z1
        // currentView-transform-end-z1
        // currentView-transformOrigin-start-z1
        // animation-duration-z1
        document.documentElement.style.setProperty(`--currentView-transform-start-${this._sessionId}`, current.forwardState.transform)
        document.documentElement.style.setProperty(`--currentView-transform-end-${this._sessionId}`, current.backwardState.transform)
        document.documentElement.style.setProperty(`--currentView-transformOrigin-start-${this._sessionId}`, current.forwardState.origin)
        document.documentElement.style.setProperty(`--currentView-transformOrigin-end-${this._sessionId}`, current.backwardState.origin)
        document.documentElement.style.setProperty(`--animation-duration-${this._sessionId}`, current.backwardState.duration)
        document.documentElement.style.setProperty(`--currentView-opacity-start-${this._sessionId}`, 1)
        document.documentElement.style.setProperty(`--currentView-opacity-end-${this._sessionId}`, 0)
        
        previousView.querySelector('.active').classList.remove('active')
        previousView.classList.remove('previous')
        previousView.classList.add('current')
        previousView.style.willChange = 'transform'
        document.documentElement.style.setProperty(`--previousView-transform-start-${this._sessionId}`, previous.forwardState.transform)
        document.documentElement.style.setProperty(`--previousView-transform-end-${this._sessionId}`, previous.backwardState.transform)
        document.documentElement.style.setProperty(`--previousView-transformOrigin-start-${this._sessionId}`, previous.forwardState.origin)
        document.documentElement.style.setProperty(`--previousView-transformOrigin-end-${this._sessionId}`, previous.backwardState.origin)
        if (last !== undefined) {
            lastView.style.willChange = 'transform'
            lastView.classList.add('previous')
            lastView.style.opacity = 1
            lastView.classList.remove('last')
            document.documentElement.style.setProperty(`--lastView-transform-start-${this._sessionId}`, last.forwardState.transform)
            document.documentElement.style.setProperty(`--lastView-transform-end-${this._sessionId}`, last.backwardState.transform)
            document.documentElement.style.setProperty(`--lastView-transformOrigin-start-${this._sessionId}`, last.forwardState.origin)
            document.documentElement.style.setProperty(`--lastView-transformOrigin-end-${this._sessionId}`, last.backwardState.origin)
            
        }
        if (gone !== undefined) {
            canvas.prepend(gone.viewName)
            var newlastView = canvas.querySelector('.view:first-child')
            newlastView.style.opacity = 0

        }
        this.storedViews.pop()
        currentView.addEventListener('animationstart', () => {
            this.blockEvents = true
        })
        currentView.addEventListener('animationend', () => {
            canvas.removeChild(currentView)
            this.blockEvents = false
        })
        previousView.addEventListener('animationend', () => {
            previousView.classList.remove(`zoom-previous-view-${this._sessionId}`)
            previousView.style.willChange = 'auto'
            previousView.style.transition = 'transform 0s'
            previousView.style.transformOrigin = previous.backwardState.origin
            previousView.style.transform = previous.backwardState.transform
        })
        if (last !== undefined) {
            lastView.addEventListener('animationend', () => {
                lastView.style.willChange = 'auto'
                lastView.classList.remove(`zoom-last-view-${this._sessionId}`)
                lastView.style.transition = 'transform 0s'
                lastView.style.transformOrigin = last.backwardState.origin
                lastView.style.transform = last.backwardState.transform
            })
        }
        currentView.classList.add(`zoom-out-current-view-${this._sessionId}`)
        previousView.classList.add(`zoom-previous-view-${this._sessionId}`)
        if (last !== undefined) lastView.classList.add(`zoom-last-view-${this._sessionId}`)
    } else {
      console.info(`Zumly: zoomOut disabled`)
    }
}
zoomIn(el) {
  if (!this.blockEvents) {
    // clicked element with .zoomable
    el.classList.add('active')
    let coordenadasEl = el.getBoundingClientRect()
    let canvas = document.querySelector(this.app.mount)
    let coordenadasCanvas = canvas.getBoundingClientRect()
    var offsetX = coordenadasCanvas.left
    var offsetY = coordenadasCanvas.top
    // create new view
    var newView = document.createElement('template')
    newView.innerHTML = this.app.views[el.dataset.goTo]
    var previousView = canvas.querySelector('.current')
    // esto lo puede sacar de currentview backsate.
    let coordenadasPreviousView = previousView.getBoundingClientRect()
    var lastView = null
    var goneView = null
    goneView = canvas.querySelector('.last')
    if (goneView !== null) {
        canvas.removeChild(goneView)
    }
    // si existe transforma previous view en last view
    lastView = canvas.querySelector('.previous')
    if (lastView !== null) {
        lastView.classList.remove('previous')
        lastView.classList.add('last')
        // esto lo puede sacar de previousview.backstate
        var coordenadasLastView = lastView.getBoundingClientRect()
        var clvt = lastView.style.transform
    }
    //
    previousView.classList.add('previous')
    previousView.classList.remove('current')
    // transforma new view en current view y la agrega al DOM al ppio del container
    newView.classList.add('current')
    //mountPoint.prepend(overlay.content)
    canvas.append(newView.content)
    canvas.querySelector('.view:last-child').classList.add('current')
    var currentView = canvas.querySelector('.current')
    // currentView.classList.add('appear')
    currentView.dataset.viewName = el.dataset.goTo
    currentView.classList.add('no-events')
    // esto deberia ser iguaal a el.getbounding
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
    //ver esto cuando ya no queda history back
    let preScale = this.storedPreviousScale[this.storedPreviousScale.length - 1]

    let scale = coordenadasCurrentView.width / coordenadasEl.width
    let scaleInv = 1 / scale
    this.setPreviousScale(scale)
    // let scaley = coordenadasCurrentView.height / coordenadasEl.height
    // let scaleInvy = 1 / scaley
    // arreglos previous
    previousView.style.transition = 'transform 0s'
    previousView.style.transformOrigin = `
    ${coordenadasEl.x + coordenadasEl.width / 2 - coordenadasPreviousView.x}px
    ${coordenadasEl.y + coordenadasEl.height / 2 - coordenadasPreviousView.y}px
    `
    var duration = `1s`
    let x = coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + coordenadasPreviousView.x
    let y = coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + coordenadasPreviousView.y
    let move = `translate3d(${x}px, ${y}px, 0px) scale(${scale})`
    previousView.style.transform = move
    var newcoordenadasEl = el.getBoundingClientRect()
    if (lastView !== null) {
        var newcoordenadasPV = previousView.getBoundingClientRect()
        lastView.style.transition = 'transform 0s'
        lastView.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0px) scale(${scale * preScale})`
        let dd = canvas.querySelector('.last')
        var last = dd.querySelector('.active')
        var coorLast = last.getBoundingClientRect()
        lastView.style.transform = clvt
    }
    previousView.style.transform = `translate3d(${coordenadasPreviousView.x - offsetX}px, ${coordenadasPreviousView.y  - offsetY}px, 0px)`
    var prePrevTransform = previousView.style.transform
    var prorigin = previousView.style.transformOrigin
    currentView.style.transformOrigin = 'top left'
    currentView.style.transform = `translate3d(${coordenadasEl.x - offsetX}px, ${coordenadasEl.y - offsetY}px, 0px) scale(${scaleInv})`
    var preCurrentTransform = currentView.style.transform
    if (lastView !== null) {
      var prev = canvas.querySelector('.previous')
      var coorPrev = prev.getBoundingClientRect()
      var lastransform = `translate3d(${coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + (coorPrev.x - coorLast.x) + newcoordenadasPV.x - offsetX}px, ${coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + (coorPrev.y - coorLast.y) + newcoordenadasPV.y - offsetY}px, 0px) scale(${scale * preScale})`
      }
    el.getBoundingClientRect()
    var cutransform = `translate3d(${newcoordenadasEl.x - offsetX}px, ${newcoordenadasEl.y - offsetY}px, 0px)`
    // arrays
    var snapShoot = {
        zoomLevel: this.storedViews.length,
        views: []
    }
    let currentv = currentView ? {
        location: 'current',
        viewName: currentView.dataset.viewName,
        backwardState: {
            origin: currentView.style.transformOrigin,
            duration: duration,
            transform: preCurrentTransform
        },
        forwardState: {
            origin: currentView.style.transformOrigin,
            duration: duration,
            transform: cutransform
        }
    } : null
    let previousv = previousView ? {
        location: 'previous',
        viewName: previousView.dataset.viewName,
        backwardState: {
            origin: previousView.style.transformOrigin,
            duration: duration,
            transform: prePrevTransform
        },
        forwardState: {
            origin: previousView.style.transformOrigin,
            duration: duration,
            transform: move
        }
    } : null
    let lastv = lastView ? {
        location: 'last',
        viewName: lastView.dataset.viewName,
        backwardState: {
            origin: lastView.style.transformOrigin,
            duration: duration,
            transform: clvt
        },
        forwardState: {
            origin: lastView.style.transformOrigin,
            duration: duration,
            transform: lastransform
        }
    } : null
    let gonev = goneView ? { // ACA VA LA VISTA ENTERA FALTA REALIZAR UN ZOOM IGUAL ANTES DE SACARLA DE JUEGO
        location: 'gone',
        viewName: goneView,
        backwardState: {
            origin: goneView.style.transformOrigin,
            duration: duration,
            transform: goneView.style.transform
        },
        forwardState: null
    } : null
    if (currentv !== null) snapShoot.views.push(currentv)
    if (previousv !== null) snapShoot.views.push(previousv)
    if (lastv !== null) snapShoot.views.push(lastv)
    if (gonev !== null) snapShoot.views.push(gonev)
    this.storeViews(snapShoot)
    // animation
    currentView.style.willChange = 'transform, opacity'
    document.documentElement.style.setProperty(`--currentView-transform-start-${this._sessionId}`, `translate3d(${coordenadasEl.x - offsetX}px, ${coordenadasEl.y - offsetY}px, 0px) scale(${scaleInv})`)
    document.documentElement.style.setProperty(`--currentView-transform-end-${this._sessionId}`, `translate3d(${newcoordenadasEl.x - offsetX}px, ${newcoordenadasEl.y - offsetY}px, 0px)`)
    document.documentElement.style.setProperty(`--currentView-transformOrigin-start-${this._sessionId}`, '50% 50%')
    document.documentElement.style.setProperty(`--currentView-transformOrigin-end-${this._sessionId}`, 'top left')
    document.documentElement.style.setProperty(`--animation-duration-${this._sessionId}`, duration)
    document.documentElement.style.setProperty(`--currentView-opacity-start-${this._sessionId}`, 0)
    document.documentElement.style.setProperty(`--currentView-opacity-end-${this._sessionId}`, 1)
    
    previousView.style.willChange = 'transform'
    document.documentElement.style.setProperty(`--previousView-transform-start-${this._sessionId}`, prePrevTransform)
    document.documentElement.style.setProperty(`--previousView-transform-end-${this._sessionId}`, move)
    document.documentElement.style.setProperty(`--previousView-transformOrigin-start-${this._sessionId}`, previousView.style.transformOrigin)
    document.documentElement.style.setProperty(`--previousView-transformOrigin-end-${this._sessionId}`, previousView.style.transformOrigin)
    // document.documentElement.style.setProperty('--animation-duration-back', duration)
    if (lastView !== null) {
      lastView.style.willChange = 'transform'
        document.documentElement.style.setProperty(`--lastView-transform-start-${this._sessionId}`, clvt)
        document.documentElement.style.setProperty(`--lastView-transform-end-${this._sessionId}`, lastransform)
        document.documentElement.style.setProperty(`--lastView-transformOrigin-start-${this._sessionId}`, lastView.style.transformOrigin)
        document.documentElement.style.setProperty(`--lastView-transformOrigin-end-${this._sessionId}`, lastView.style.transformOrigin)
    }
    currentView.addEventListener('animationstart', () => {
        this.blockEvents = true
    })
    currentView.addEventListener('animationend', () => {
        currentView.style.willChange = 'auto'
        currentView.classList.remove(`zoom-in-current-view-${this._sessionId}`)
        currentView.classList.remove('no-events')
        currentView.style.transition = 'all 0s'
        currentView.style.transformOrigin = 'top left'
        currentView.style.transform = getComputedStyle(document.documentElement).getPropertyValue(`--currentView-transform-end-${this._sessionId}`)
        this.blockEvents = false
    })
    previousView.addEventListener('animationend', () => {
        previousView.style.willChange = 'auto'
        previousView.classList.remove(`zoom-previous-view-${this._sessionId}`)
        //previousView.classList.remove('no-events')
        previousView.style.transition = 'transform 0s'
        previousView.style.transformOrigin = getComputedStyle(document.documentElement).getPropertyValue(`--previousView-transformOrigin-end-${this._sessionId}`)
        previousView.style.transform = move
        //document.documentElement.style.setProperty(`--previousView-transform-end-${this._sessionId}`, '')
    })
    if (lastView !== null) {
      lastView.addEventListener('animationend', () => {
            lastView.style.willChange = 'auto'
            lastView.classList.remove(`zoom-last-view-${this._sessionId}`)
            //lastView.classList.remove('no-events')
            lastView.style.transition = 'transform 0s'
            lastView.style.transformOrigin = getComputedStyle(document.documentElement).getPropertyValue(`--lastView-transformOrigin-end-${this._sessionId}`)
            lastView.style.transform = lastransform
            //document.documentElement.style.setProperty(`--lastView-transform-end-${this._sessionId}`, '')
        })
    }
    currentView.classList.add(`zoom-in-current-view-${this._sessionId}`)
    previousView.classList.add(`zoom-previous-view-${this._sessionId}`)
    if (lastView !== null) lastView.classList.add(`zoom-last-view-${this._sessionId}`)
  } else {
    console.info(`Zumly: zoomIn disabled`)
  } 
}
}

/*
TEMAS A RESOLVER:
LISTO BUG EN 3 NIVEL AL HACER IN Y DSP OUT Y DSP IN .... RARO. es por la escale
TODOS: RESPONSIVE, VER REMOVEEVENTS, optiomizar mem staorage, agregar router, agregar eventos disparadores de navegacion, ver temita de losefectos de capas anteriores
ARREGLAR TRANSFORM ORIGN PARA QUE SEA SIEMPRE 50% 50% (OJO CON LOS SVG)
LISTO MULTIPLES INSTANCES. FALTA VER TEMA CSS VARIABLES UNICAS
FALTA VER TEMA DE BOTNES ZOOMABLES NO REGUALRES.
VER TEMA DE PRESCALE VIA CSS VARIABLES ...
LISTO HAY UN BUG FEO SI SE USA UN BOTON CON TAMANO DIFERENTE. pasa cuando el boton zoomable es distinto de tamno a otro boton zoombale.
anda muy  muy mal un efecto blur 
LISTO BAUG FIERO: LASTVIEW
Testear views con react, svelte y vuejs
NAVEGACION: por mouse scroll,  teclas, etc como en github trending
LISTO modo full zoom view . se hace armando views mas anches que el vireport
LISTO CAMBIAR ORDEN LAYERS ESTAN INVERTIDOS.
NO POSSIBLE: crear un layer blur o de diferrente estilos para no afectar el rendimiento de la navegacion usando backdrop-filter. no anda no ffox
limitar scale factor en altura? limitar tamanos de los zoomable y views?
LISTO: PASAR A ANIMATINS CSS CON CSS VARIABLES
LISTO: ver tema de transicion de la nueva vista in and out
LISTO: ver buG de ejecucion de transition aun en movimiento
poner opciones para los devs: efectos blur, velocidad variable, constante, custom de transicion
WIP ultra optimizar el zoomin, zoomout...FALTA HACER FUNCIONES
LISTO Set will-change when the element is hovered
LISTO dsp usar css vars
*/

/*
Ideas:
- No hacer views.
- Los elementos estaran dentro de un container "view-container".
- Solo puede haber un view-container por vista.
- La vista activa sera "current-view".
- Las demas vista seran "previous-view" y "last-view".
- Captar una clase o "data-" tipo "is-zoomable" o "zoom-me" que capture via getBoundingRect(), el tamaño y posicion de ese elemento.
- Luego en base a esos datos pasan cosas:
- La nueva vista invocada hereda los datos del elemento tocado, pero arranca con una escala invertida porque
al final debe renderizar con escala 1.
- Por otro lado, la ahora previous view debe aumentar en escala normal
- La vista last tambien. Es decir se le sumara la escala a la que ya poseia.
- Ademas creo que la animacion debe usar el transform origin del centro del primer elemento cliqueado con clase is-zoomable. Esto datos tambien se sacan del getBoundingRect().
- Tema historial de navegación: cada view tiene que ser guardada en un array de objetos, con todas sus coordenadas.
- Las vistas se apilan en un view-manager asi que en el layout deberia estar eso? si, algo asi tiene que haber pero podemos hacerlo mas sencillo quizas insertando un template... ver.

const app = New zumly({
el: '#app',
views: [
'home',
'contact',
'n'
],
initialView: 'home'
})

entonces en el elemento app inyecta el view-manager y las views as array.

- me gustaria mucho usar plain html as views.
https://github.com/rishavs/vanillajs-spa
https://medium.com/altcampus/implementing-simple-spa-routing-using-vanilla-javascript-53abe399bf3c
https://codepen.io/Tsapko/pen/eMeKVE
https://wesbos.com/template-strings-html/
https://mfrachet.github.io/create-frontend-framework/templating/content-in-dom.html
https://codepen.io/Tsapko/pen/eMeKVE?editors=1111
https://github.com/rishavs/vanillajs-spa/tree/master/src

- capaz hay que usar un data-target y listo:

div class is-zoomable
div data-target=contacts
esto busca el elemento is-zoomable, captura la informacion via getClientRect(), mete la nueva view en el array de vistas y va a la view contacts

- Engine separado totalmente de los shapes asi no necesito sass ni nada de eso.

Features:
- infinitum zoom.
- shape free, but frame friendly.
- navegacion programada, para atras y adelante.
- tipos de zoom: zumly default (aka zircle), full-transition (elimina la vistas prev y last)
- Eventos por scroll, botones como en github-trending.
- multiple instances 💪
- responsive first

Zircle legacy - otro repo:
- Armar un theme de views circulares con svg, que permita tambien diferenters shapoes y formas geometricas comnbinadas.

*/

export default Zumly;
