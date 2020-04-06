//REF https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes#Defining_classes
class Zumly {
constructor(options) {
  this.app = options
  this.storedViews = []
  this.storedPreviousScale = [1]
  this.instance = Zumly.counter
  this.blockEvents = false
  this.canvas = document.querySelector(this.app.mount)
}
// Private methods
static get counter () {
  Zumly._counter = (Zumly._counter || 0) + 1
  return Zumly._counter
}

static capitalize (value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

static get instance () {
  return Zumly._counter
}
static prepareCSS () {
  var instanceStyle = document.createElement('style')
  let views = ['current', 'previous', 'last']
  let instance = Zumly.instance
  let result = ''
  views.map(view => {
  result += `
  .zoom-${view}-view-${instance} {
      -webkit-animation-name: zoom${Zumly.capitalize(view)}View${instance};
              animation-name: zoom${Zumly.capitalize(view)}View${instance};
      -webkit-animation-duration: var(--animation-duration-${instance});
              animation-duration: var(--animation-duration-${instance});
      -webkit-animation-timing-function: ease-in-out;
              animation-timing-function: ease-in-out;
      -webkit-animation-fill-mode: forwards;
              animation-fill-mode: forwards;
    }
  @-webkit-keyframes zoom${Zumly.capitalize(view)}View${instance} {
      0% {
        transform-origin: var(--${view}View-transformOrigin-start-${instance});
        transform: var(--${view}View-transform-start-${instance});
        opacity: var(--${view}View-opacity-start-${instance})
      }

      100% {
        transform-origin: var(--${view}View-transformOrigin-end-${instance});
        transform: var(--${view}View-transform-end-${instance});
        opacity: var(--${view}View-opacity-end-${instance})
      }
    }
  @keyframes zoom${Zumly.capitalize(view)}View${instance} {
      0% {
        transform-origin: var(--${view}View-transformOrigin-start-${instance});
        transform: var(--${view}View-transform-start-${instance});
        opacity: var(--${view}View-opacity-start-${instance})
      }

      100% {
        transform-origin: var(--${view}View-transformOrigin-end-${instance});
        transform: var(--${view}View-transform-end-${instance});
        opacity: var(--${view}View-opacity-end-${instance})
      }
    }
  `
  })
  instanceStyle.innerHTML = result
  document.head.appendChild(instanceStyle)
}

setCSSVariables (transition) {
  let viewStage = this.storedViews[this.storedViews.length - 1]
  let current = viewStage.views[0]
  let previous = viewStage.views[1]
  let last = viewStage.views[2]
  let views = [{name:'current', stage: current}, {name:'previous', stage: previous}, {name:'last', stage: last}]
  let instance = Zumly.instance
  views.map(view => {
    if (transition === 'zoomOut' && view.stage !== undefined) {
      document.documentElement.style.setProperty(`--${view.name}View-transform-start-${instance}`, view.stage.forwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}View-transform-end-${instance}`, view.stage.backwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-start-${instance}`, view.stage.forwardState.origin)
      document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-end-${instance}`, view.stage.backwardState.origin)
      document.documentElement.style.setProperty(`--${view.name}View-opacity-start-${instance}`, 1)
      if (view.name === 'current') { 
        document.documentElement.style.setProperty(`--animation-duration-${instance}`, view.stage.backwardState.duration)
        document.documentElement.style.setProperty(`--${view.name}View-opacity-end-${instance}`, 0)
      } else {
        document.documentElement.style.setProperty(`--${view.name}View-opacity-end-${instance}`, 1)
      }
    }
      if (transition === 'zoomIn' && view.stage !== undefined) {
      document.documentElement.style.setProperty(`--${view.name}View-transform-start-${instance}`, view.stage.backwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}View-transform-end-${instance}`, view.stage.forwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-start-${instance}`, view.stage.backwardState.origin)
      document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-end-${instance}`, view.stage.forwardState.origin)
      if (view.name === 'current') { 
        document.documentElement.style.setProperty(`--animation-duration-${instance}`, view.stage.forwardState.duration)
        document.documentElement.style.setProperty(`--${view.name}View-opacity-start-${instance}`, 0)
      } else {
        document.documentElement.style.setProperty(`--${view.name}View-opacity-start-${instance}`, 1)
      }
      document.documentElement.style.setProperty(`--${view.name}View-opacity-end-${instance}`, 1)
    }
    
  })
}

finalState (transition, currentView, previousView, lastView) {
  var instance = Zumly.instance
  var viewStage = this.storedViews[this.storedViews.length - 1]
  let views = [{
    name:'current', element: currentView, stage: viewStage.views[0]
  }, {
    name:'previous', element: previousView, stage: viewStage.views[1]
  }, {
    name:'last', element: lastView, stage: viewStage.views[2]
  }]
  views.map(view => {
    if (transition === 'zoomOut' && view.element !== null) {
      if (view.name === 'current') this.canvas.removeChild(view.element)
      view.element.classList.remove(`zoom-${view.name}-view-${instance}`)
      view.element.style.willChange = 'auto'
      view.element.style.transition = 'all 0s'
      view.element.style.transformOrigin = view.stage.backwardState.origin
      view.element.style.transform = view.stage.backwardState.transform
    }
    if (transition === 'zoomIn' && view.element !== null) {
      if (view.name === 'current')  view.element.classList.remove('no-events')
      view.element.style.willChange = 'auto'
      view.element.classList.remove(`zoom-${view.name}-view-${instance}`)
      view.element.style.transition = 'all 0s'
      view.element.style.transformOrigin = view.stage.forwardState.origin
      view.element.style.transform = view.stage.forwardState.transform
    }
  })
  if (transition === 'zoomOut') {
    // Delete current zoom level
    this.storedViews.pop()
    // Delete previous scale
    this.storedPreviousScale.pop()
  }
  this.blockEvents = false
}
// Public methods
init() {
  // add instance style
  Zumly.prepareCSS()
  const canvas = this.canvas
  canvas.addEventListener('click', e => {
      e.stopPropagation()
      this.zoomOut()
  })
  var newView = document.createElement('template')
  newView.innerHTML = this.app.views[this.app.initialView]
  canvas.prepend(newView.content)
  var view = canvas.querySelector('.view')
  view.classList.add('current')
  view.dataset.viewName = this.app.initialView
  // agrega eventos a todos los .zoomable
  view.querySelectorAll('.zoomable').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation()
      this.zoomIn(el)
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
        }
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
    let instance = Zumly.instance
    var placeOldView = this.storedViews[this.storedViews.length - 1].views[3]
    // Call method to prepare CSS Variables
    this.setCSSVariables('zoomOut')
    // Select elements in DOM
    const canvas = this.canvas
    var currentView = canvas.querySelector('.view.current')
    var previousView = canvas.querySelector('.view.previous')
    var lastView = canvas.querySelector('.view.last')
    // Modify views in DOM for next zoom level
    currentView.style.willChange = 'transform, opacity'
    previousView.style.willChange = 'transform, opacity'
    previousView.querySelector('.active').classList.remove('active')
    previousView.classList.replace('previous', 'current')
    if (lastView !== null) {
      lastView.classList.replace('last', 'previous')
      lastView.style.opacity = 1
      lastView.classList.remove('last')
      lastView.style.willChange = 'transform, opacity'
    }
    if (placeOldView !== undefined) {
      canvas.prepend(placeOldView.view)
      canvas.querySelector('.view:first-child').style.opacity = 0
    }
    // Add events
    currentView.addEventListener('animationstart', () => this.blockEvents = true)
    currentView.addEventListener('animationend', () => this.finalState('zoomOut', currentView, previousView, lastView))
    // Add css classes to start animation
    currentView.classList.add(`zoom-current-view-${instance}`)
    previousView.classList.add(`zoom-previous-view-${instance}`)
    if (lastView !== null) lastView.classList.add(`zoom-last-view-${instance}`)
  } else {
    console.info(`Zumly: zoomOut disabled`)
  }
}
zoomIn(el) {
  if (!this.blockEvents) {
    let instance = Zumly.instance
    // clicked element with .zoomable
    el.classList.add('active')
    let coordenadasEl = el.getBoundingClientRect()
    // canvas data
    let canvas = this.canvas
    let coordenadasCanvas = canvas.getBoundingClientRect()
    var offsetX = coordenadasCanvas.left
    var offsetY = coordenadasCanvas.top
    //  select existent views
    var previousView = canvas.querySelector('.current')
    var lastView = canvas.querySelector('.previous')
    var toBeArchivedView = canvas.querySelector('.last')
    // modify selected views
    previousView.classList.replace('current', 'previous')
    // esto lo puede sacar de currentview backsate.
    let coordenadasPreviousView = previousView.getBoundingClientRect()
    console.log(lastView)
    if (lastView !== null) {
      lastView.classList.replace('previous', 'last')
      // esto lo puede sacar de previousview.backstate
      var coordenadasLastView = lastView.getBoundingClientRect()
      var clvt = lastView.style.transform
    }
    
    if (toBeArchivedView !== null) {
      // habria que hacer un fade out lento
      canvas.removeChild(toBeArchivedView)
    }
    // create new view
    var newView = document.createElement('template')
    newView.innerHTML = this.app.views[el.dataset.goTo]
    canvas.append(newView.content)
    var currentView = canvas.querySelector('.view:last-child')
    currentView.classList.add('current', 'no-events')
    currentView.dataset.viewName = el.dataset.goTo
    let coordenadasCurrentView = currentView.getBoundingClientRect()
    // agrega eventos al currentview
    currentView.querySelectorAll('.zoomable').forEach(vx => vx.addEventListener('click', e => {
        e.stopPropagation()
        this.zoomIn(vx)
    }))
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
    currentView.style.transformOrigin = '0 0'
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
    let currentv = {
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
    }
    let previousv = {
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
    }
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
    // se guarda la vista entera
    let gonev = toBeArchivedView ? {
      location: 'gone',
      view: toBeArchivedView
    } : null
    snapShoot.views.push(currentv)
    snapShoot.views.push(previousv)
    if (lastv !== null) snapShoot.views.push(lastv)
    if (gonev !== null) snapShoot.views.push(gonev)
    this.storeViews(snapShoot)
    this.setCSSVariables('zoomIn')
    // animation
    currentView.style.willChange = 'transform, opacity'
    previousView.style.willChange = 'transform, opacity'
    if (lastView !== null) lastView.style.willChange = 'transform, opacity'
    currentView.addEventListener('animationstart', () => this.blockEvents = true)
    currentView.addEventListener('animationend', () => this.finalState('zoomIn', currentView, previousView, lastView))
    // run animations
    currentView.classList.add(`zoom-current-view-${instance}`)
    previousView.classList.add(`zoom-previous-view-${instance}`)
    if (lastView !== null) lastView.classList.add(`zoom-last-view-${instance}`)
    } else {
      console.info(`Zumly: zoomIn disabled`)
    } 
  }
}

/*
TEMAS A RESOLVER:
DO IT : elemtno canvas desde constructor.
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
