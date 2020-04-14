//REF https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes#Defining_classes 
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
          fx_1 += `${effect === 'blur' ? 'blur(2px) ' : effect === 'sepia' ? 'sepia(5) ' : effect === 'saturate' ? 'saturate(8)' : 'none'}`
        })
      } else {
        fx_0 = 'none'
        fx_1 = 'none'
      }
      console.log(fx_0, fx_1)
      this.effects = [fx_0, fx_1]
      this.storedViews = []
      this.storedPreviousScale = [1]
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

  prepareCSS () {
    var instanceStyle = document.createElement('style')
    let views = ['current', 'previous', 'last']
    let instance = this.instance
    let result = ''
    views.map(view => {
    result += `
    .zoom-${view}-view-${instance} {
        -webkit-animation-name: zoom${Zumly.capitalize(view)}View${instance};
                animation-name: zoom${Zumly.capitalize(view)}View${instance};
        -webkit-animation-duration: var(--animation-duration-${instance});
                animation-duration: var(--animation-duration-${instance});
        -webkit-animation-timing-function: var(--animation-ease-${instance});
                animation-timing-function: var(--animation-ease-${instance});
      }
    @-webkit-keyframes zoom${Zumly.capitalize(view)}View${instance} {
        0% {
          transform-origin: var(--${view}View-transformOrigin-start-${instance});
          transform: var(--${view}View-transform-start-${instance});
          opacity: var(--${view}View-opacity-start-${instance});
          filter: var(--${view}View-filter-start-${instance})
        }

        100% {
          transform-origin: var(--${view}View-transformOrigin-end-${instance});
          transform: var(--${view}View-transform-end-${instance});
          opacity: var(--${view}View-opacity-end-${instance});
          filter: var(--${view}View-filter-end-${instance})
        }
      }
    @keyframes zoom${Zumly.capitalize(view)}View${instance} {
        0% {
          transform-origin: var(--${view}View-transformOrigin-start-${instance});
          transform: var(--${view}View-transform-start-${instance});
          opacity: var(--${view}View-opacity-start-${instance});
          filter: var(--${view}View-filter-start-${instance})
        }

        100% {
          transform-origin: var(--${view}View-transformOrigin-end-${instance});
          transform: var(--${view}View-transform-end-${instance});
          opacity: var(--${view}View-opacity-end-${instance});
          filter: var(--${view}View-filter-end-${instance})
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
    let instance = this.instance
    views.map(view => {
      if (transition === 'zoomOut' && view.stage !== undefined) {
        document.documentElement.style.setProperty(`--${view.name}View-transform-start-${instance}`, view.stage.forwardState.transform)
        document.documentElement.style.setProperty(`--${view.name}View-transform-end-${instance}`, view.stage.backwardState.transform)
        document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-start-${instance}`, view.stage.forwardState.origin)
        document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-end-${instance}`, view.stage.backwardState.origin)
        document.documentElement.style.setProperty(`--${view.name}View-opacity-start-${instance}`, 1)
        document.documentElement.style.setProperty(`--${view.name}View-filter-start-${instance}`, view.stage.forwardState.filter)
        document.documentElement.style.setProperty(`--${view.name}View-filter-end-${instance}`, view.stage.backwardState.filter)
        if (view.name === 'current') { 
          document.documentElement.style.setProperty(`--animation-duration-${instance}`, view.stage.backwardState.duration)
          document.documentElement.style.setProperty(`--animation-ease-${instance}`, view.stage.backwardState.ease)
          document.documentElement.style.setProperty(`--${view.name}View-opacity-end-${instance}`, 0)
          document.documentElement.style.setProperty(`--${view.name}View-filter-start-${instance}`, `none`)
          document.documentElement.style.setProperty(`--${view.name}View-filter-end-${instance}`, `none`)
        } else {
          document.documentElement.style.setProperty(`--${view.name}View-opacity-end-${instance}`, 1)
        }
      }
      if (transition === 'zoomIn' && view.stage !== undefined) {
        document.documentElement.style.setProperty(`--${view.name}View-transform-start-${instance}`, view.stage.backwardState.transform)
        document.documentElement.style.setProperty(`--${view.name}View-transform-end-${instance}`, view.stage.forwardState.transform)
        document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-start-${instance}`, view.stage.backwardState.origin)
        document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-end-${instance}`, view.stage.forwardState.origin)
        document.documentElement.style.setProperty(`--${view.name}View-filter-start-${instance}`, view.stage.backwardState.filter)
        document.documentElement.style.setProperty(`--${view.name}View-filter-end-${instance}`, view.stage.forwardState.filter)
        if (view.name === 'current') { 
          document.documentElement.style.setProperty(`--animation-duration-${instance}`, view.stage.forwardState.duration)
          document.documentElement.style.setProperty(`--animation-ease-${instance}`, view.stage.forwardState.ease)
          document.documentElement.style.setProperty(`--${view.name}View-opacity-start-${instance}`, 0)
          document.documentElement.style.setProperty(`--${view.name}View-filter-start-${instance}`, `none`)
          document.documentElement.style.setProperty(`--${view.name}View-filter-end-${instance}`, `none`)
        } else {
          document.documentElement.style.setProperty(`--${view.name}View-opacity-start-${instance}`, 1)
        }
        document.documentElement.style.setProperty(`--${view.name}View-opacity-end-${instance}`, 1)
      }
    })
  }
  // Public methods
  init() {
    // add instance style
    this.prepareCSS()
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
    view.querySelectorAll('.zoomable').forEach(el => el.addEventListener('click', this.addZoomInEvent.bind(this)))
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
  disableBlockEvents() {
    this.blockEvents = false
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
      var instance = this.instance
      const canvas = this.canvas
      var currentView = canvas.querySelector('.view.current')
      var previousView = canvas.querySelector('.view.previous')
      var lastView = canvas.querySelector('.view.last')
      currentView.style.willChange = 'transform, opacity, filter'
      this.setCSSVariables('zoomOut')
      //
      previousView.querySelector('.active').classList.remove('active')
      previousView.classList.remove('previous')
      previousView.classList.add('current')
      previousView.style.willChange = 'transform, opacity, filter'
     
      if (last !== undefined) {
        lastView.style.willChange = 'transform, opacity, filter'
        lastView.classList.add('previous')
        lastView.style.opacity = 1
        lastView.classList.remove('last')
      }
      if (gone !== undefined) {
        canvas.prepend(gone.viewName)
        var newlastView = canvas.querySelector('.view:first-child')
        newlastView.style.opacity = 0
      }
      this.storedViews.pop()
      var self = this
      function handler (event) {
        let element = event.target
        if (event.target.classList.contains(`zoom-previous-view-${instance}`)) {
          var origin = previous.backwardState.origin
          var transform = previous.backwardState.transform
          element.style.willChange = 'auto'
          element.classList.remove(`zoom-previous-view-${instance}`)
          element.style.transformOrigin = origin
          element.style.transform = transform
          element.style.filter = 'none'
          element.removeEventListener('animationend', handler)
        } else {
          origin = last.backwardState.origin
          transform = last.backwardState.transform
          element.style.willChange = 'auto'
          element.classList.remove(`zoom-last-view-${instance}`)
          element.style.transformOrigin = origin
          element.style.transform = transform
          element.style.filter = getComputedStyle(document.documentElement).getPropertyValue(`--previousView-filter-end-${instance}`)
          element.removeEventListener('animationend', handler)
        }
      }
      currentView.addEventListener('animationstart', function handlerStart () {
        self.blockEvents = true
        currentView.querySelectorAll('.zoomable').forEach(vx => vx.removeEventListener('click', self.addZoomInEvent.bind(self)))
        currentView.removeEventListener('animationstart', handlerStart)
      })
      currentView.addEventListener('animationend', function handlerEnd () {
        canvas.removeChild(currentView)
        self.blockEvents = false
        currentView.removeEventListener('animationstart', handlerEnd)
      })
      previousView.addEventListener('animationend', handler)
      if (last !== undefined) lastView.addEventListener('animationend', handler)

      currentView.classList.add(`zoom-current-view-${instance}`)
      previousView.classList.add(`zoom-previous-view-${instance}`)
      if (last !== undefined) lastView.classList.add(`zoom-last-view-${instance}`)

    } else {
      console.info(`Zumly: zoomOut disabled`)
    }
  }
  zoomIn(el) {
    // only runs if there is no transition running
    if (!this.blockEvents) {
      console.log(this)
      // getContext()
      var instance = this.instance
      let canvas = this.canvas
      let coordenadasCanvas = canvas.getBoundingClientRect()
      var offsetX = coordenadasCanvas.left
      var offsetY = coordenadasCanvas.top
      let preScale = this.storedPreviousScale[this.storedPreviousScale.length - 1]
      // generated new view from activated .zoomable element
      // generateNewView(el)
      el.classList.add('active')
      let coordenadasEl = el.getBoundingClientRect()
      // create new view in a template tag
      var newView = document.createElement('template')
      newView.innerHTML = this.app.views[el.dataset.goTo]
      canvas.append(newView.content)
      // select VIEWS from DOM
      var currentView = canvas.querySelector('.view:last-child')
      var previousView = canvas.querySelector('.current')
      var lastView = canvas.querySelector('.previous')
      var goneView = canvas.querySelector('.last')
      if (goneView !== null) canvas.removeChild(goneView)
      // do changes
      // Add events to currentView
      currentView.querySelectorAll('.zoomable').forEach(vx => vx.addEventListener('click', this.addZoomInEvent.bind(this)))
      // calculateLayers('previous'
      currentView.classList.add('current')
      currentView.classList.add('no-events')
      currentView.dataset.viewName = el.dataset.goTo
      let cc = currentView.getBoundingClientRect()
      let scale = cc.width / coordenadasEl.width
      let scaleInv = 1 / scale
      let scaleh = cc.height / coordenadasEl.height
      let scaleInvh = 1 / scaleh
      // muy interesante featura... usar el zoom de acuardo a la h o w mayor y agra
      
      var duration = el.dataset.duration || this.duration
      var ease = el.dataset.ease || this.ease
      var filterIn = this.effects[0]
      var filterOut = this.effects[1]
      // var filter = el.dataset.filter || `none`
      console.log(filterIn, filterOut)
      currentView.style.transformOrigin = `0 0`
      if (coordenadasEl.width > coordenadasEl.height) {
        var laScala = scale
        var laScalaInv = scaleInv
      } else {
        laScala = scaleh
        laScalaInv = scaleInvh
      }
      this.setPreviousScale(laScala)
      var transformCurrentView_0 = `translate3d(${coordenadasEl.x - offsetX + (coordenadasEl.width - cc.width * laScalaInv) / 2}px, ${coordenadasEl.y - offsetY + (coordenadasEl.height - cc.height * laScalaInv) / 2}px, 0px) scale(${laScalaInv})`
      currentView.style.transform = transformCurrentView_0
      // currentView.style.transformOrigin = '50% 50%'
      //
      previousView.classList.add('previous')
      previousView.classList.remove('current')
      let coordenadasPreviousView = previousView.getBoundingClientRect()
      // PREVIOUS VIEW EXACTAMENTE ONDE ESTANA ANTES COMO CURRENT
      var transformPreviousView_0 = previousView.style.transform
      previousView.style.transformOrigin = `${coordenadasEl.x + coordenadasEl.width / 2 - coordenadasPreviousView.x}px ${coordenadasEl.y + coordenadasEl.height / 2 - coordenadasPreviousView.y}px`
      
      let x = coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + coordenadasPreviousView.x
      let y = coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + coordenadasPreviousView.y

      let transformPreviousView_1 = `translate3d(${x}px, ${y}px, 0px) scale(${laScala})`
      // PREVIOUS VIEW FINAL STAGE
      previousView.style.transform = transformPreviousView_1
      // ACA CAMBIA LA COSA, LEVANTO LAS COORDENADAS DEL ELEMENTO CLICLEADO QUE ESTBA DNRO DE PREVIOUS VIEW
      var newcoordenadasEl = el.getBoundingClientRect()
      // LO QUE DETERMINA LA POSICINES FONAL DEL CURRENT VIEW
      var transformCurrentView_1 = `translate3d(${newcoordenadasEl.x - offsetX + (newcoordenadasEl.width - cc.width) / 2}px, ${newcoordenadasEl.y - offsetY + (newcoordenadasEl.height - cc.height) / 2}px, 0px)`

      if (lastView !== null) {
        lastView.classList.remove('previous')
        lastView.classList.add('last')
        var transformLastView_0 = lastView.style.transform
        var newcoordenadasPV = previousView.getBoundingClientRect()
        lastView.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0px) scale(${laScala * preScale})`
        let last = lastView.querySelector('.active')
        var coorLast = last.getBoundingClientRect()
        lastView.style.transform = transformLastView_0
        previousView.style.transform = transformPreviousView_0
        var coorPrev = previousView.getBoundingClientRect()
        var transformLastView_1 = `
        translate3d(
        ${coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + (coorPrev.x - coorLast.x) + newcoordenadasPV.x - offsetX
          + (newcoordenadasPV.width - coorLast.width) / 2}px, 
        ${coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + (coorPrev.y - coorLast.y) + newcoordenadasPV.y - offsetY 
          + (newcoordenadasPV.height - coorLast.height) / 2}px, 0px)
        scale(${laScala * preScale})`
      } else {
        previousView.style.transform = transformPreviousView_0
      }
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
        location: 'previous',
        viewName: previousView.dataset.viewName,
        backwardState: {
          origin: previousView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: transformPreviousView_0,
          filter: filterIn
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
        location: 'last',
        viewName: lastView.dataset.viewName,
        backwardState: {
          origin: lastView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: transformLastView_0,
          filter: filterIn
        },
        forwardState: {
          origin: lastView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: transformLastView_1,
          filter: filterOut
        }
      } : null
      let gonev = goneView ? { // ACA VA LA VISTA ENTERA FALTA REALIZAR UN ZOOM IGUAL ANTES DE SACARLA DE JUEGO
          location: 'gone',
          viewName: goneView
      } : null
      if (currentv !== null) snapShoot.views.push(currentv)
      if (previousv !== null) snapShoot.views.push(previousv)
      if (lastv !== null) snapShoot.views.push(lastv)
      if (gonev !== null) snapShoot.views.push(gonev)
      this.storeViews(snapShoot)
      // animation
      this.setCSSVariables('zoomIn')
      currentView.style.willChange = 'transform, opacity, filter'
      previousView.style.willChange = 'transform, opacity, filter'
      if (lastView !== null) lastView.style.willChange = 'transform, opacity, filter'
      var self = this
      function handler (event) {
        let element = event.target
        if (event.target.classList.contains('current')) {
          self.blockEvents = false
          var viewName = 'current'
          var transform = transformCurrentView_1
        } else if (event.target.classList.contains('previous')) {
          viewName = 'previous'
          transform = transformPreviousView_1
        } else {
          viewName = 'last'
          transform = transformLastView_1
        }
        element.style.willChange = 'auto'
        element.classList.remove(`zoom-${viewName}-view-${instance}`)
        element.classList.remove('no-events')
        element.style.transformOrigin = element.style.transformOrigin
        element.style.transform = transform
        element.style.filter = getComputedStyle(document.documentElement).getPropertyValue(`--${viewName}View-filter-end-${instance}`)
        element.removeEventListener('animationend', handler)
      }
      currentView.addEventListener('animationstart', function handlerStart () {
        self.blockEvents = true
        currentView.removeEventListener('animationstart', handlerStart)
      })
      currentView.addEventListener('animationend', handler)
      previousView.addEventListener('animationend', handler)
      if (lastView !== null) lastView.addEventListener('animationend', handler)
      currentView.classList.add(`zoom-current-view-${instance}`)
      previousView.classList.add(`zoom-previous-view-${instance}`)
      if (lastView !== null) lastView.classList.add(`zoom-last-view-${instance}`)
    } else {
      console.info(`Zumly: zoomIn disabled`)
    } 
  }
  addZoomInEvent (event) {
    event.stopPropagation()
    this.zoomIn(event.target)
  }
}
/*
TEMAS A RESOLVER:
✅ BUG EN 3 NIVEL AL HACER IN Y DSP OUT Y DSP IN .... RARO. es por la escale
✅ ARREGLAR TRANSFORM ORIGN PARA QUE SEA SIEMPRE 50% 50% (OJO CON LOS SVG)
✅ MULTIPLES INSTANCES. FALTA VER TEMA CSS VARIABLES UNICAS
✅ FALTA VER TEMA DE BOTNES ZOOMABLES NO REGUALRES.
✅ HAY UN BUG FEO SI SE USA UN BOTON CON TAMANO DIFERENTE. pasa cuando el boton zoomable es distinto de tamno a otro boton zoombale.
👀 no tan mal excepto en ffox, anda muy  muy mal un efecto blur 
✅ BAUG FIERO: LASTVIEW
✅ modo full zoom view . se hace armando views mas anches que el vireport
✅ CAMBIAR ORDEN LAYERS ESTAN INVERTIDOS.
✅: PASAR A ANIMATINS CSS CON CSS VARIABLES
✅: ver tema de transicion de la nueva vista in and out
✅: ver buG de ejecucion de transition aun en movimiento
✅ Set will-change when the element is hovered
✅ dsp usar css vars
🔪 WIP events
🔪 WIP ultra optimizar el zoomin, zoomout...FALTA HACER FUNCIONES
✅ multiple instances 💪

📚 FLIP https://codepen.io/zircle/pen/wvKwRJa

TODOS
⭕️ DESAMBIGUAR CSS CLASSES, ARMAR CLASS SI HACE FALTA
⭕️ Testear views con react, svelte y vuejs
⭕️ RESPONSIVE, 
⭕️ horizontal same level mavigation:no necesita agregar nueva vista porque esta el mismo nivel.
⭕️ third party animation libraries, 
⭕️ notificaciones al methods: imporrtante por si hay errores del usuario y del sistema.
⭕️ agregar router, 
⭕️ agregar eventos disparadores de navegacion, NAVEGACION: por mouse scroll,  teclas, etc como en github trending
⭕️ FXS de capas anteriores
✅ PARAMETRIZAR: poner opciones para los devs: efectos blur, velocidad variable, constante, custom de transicion, zoom on different shapes


las vistas con bordes, fondos, etc son cosas opcionales.... bien podrian ser invisibles o bien podria activarse onhover tipo mira, o con backgrounds semitransparents.
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
