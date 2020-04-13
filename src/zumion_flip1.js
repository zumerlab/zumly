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
    let instance = this.instance
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
      var instance = this.instance
      const canvas = this.canvas
      var currentView = canvas.querySelector('.view.current')
      var previousView = canvas.querySelector('.view.previous')
      var lastView = canvas.querySelector('.view.last')
      currentView.style.willChange = 'transform, opacity'
      this.setCSSVariables('zoomOut')
      //
      previousView.querySelector('.active').classList.remove('active')
      previousView.classList.remove('previous')
      previousView.classList.add('current')
      previousView.style.willChange = 'transform, opacity'
     
      if (last !== undefined) {
        lastView.style.willChange = 'transform, opacity'
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
      var currentEvent1 = () => {
        this.blockEvents = false
        currentView.removeEventListener('animationend', currentEvent1)
      }
      var currentEvent = () => {
        canvas.removeChild(currentView)
        this.blockEvents = false
        currentView.removeEventListener('animationend', currentEvent)
      }
      var previousEvent = () => {
        previousView.classList.remove(`zoom-previous-view-${instance}`)
        previousView.style.willChange = 'auto'
        previousView.style.transformOrigin = previous.backwardState.origin
        previousView.style.transform = previous.backwardState.transform
        previousView.removeEventListener('animationend', previousEvent)
      }
      var lastEvent = () => {
        lastView.style.willChange = 'auto'
        lastView.classList.remove(`zoom-last-view-${instance}`)
        lastView.style.transformOrigin = last.backwardState.origin
        lastView.style.transform = last.backwardState.transform
        lastView.removeEventListener('animationend', lastEvent)
      }
      
        currentView.addEventListener('animationstart', currentEvent1)
        currentView.addEventListener('animationend', currentEvent)
        previousView.addEventListener('animationend', previousEvent)
        if (last !== undefined) lastView.addEventListener('animationend', lastEvent)

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
      var currentEvent2 = (e) => {
        e.stopPropagation()
        this.zoomIn(e.target)
      }
      currentView.querySelectorAll('.zoomable').forEach(vx => vx.addEventListener('click', currentEvent2))
      // calculateLayers('previous'
      currentView.classList.add('current')
      currentView.classList.add('no-events')
      currentView.dataset.viewName = el.dataset.goTo
      let scale = currentView.getBoundingClientRect().width / coordenadasEl.width
      let scaleInv = 1 / scale
      let scaleh = currentView.getBoundingClientRect().height / coordenadasEl.height
      let scaleInvh = 1 / scaleh
      // muy interesante featura... usar el zoom de acuardo a la h o w mayor y agra
      this.setPreviousScale(scale)
      var duration = `1s`
      let cc = currentView.getBoundingClientRect()
      currentView.style.transformOrigin = `0 0`
      var transformCurrentView_0 = `translate3d(${coordenadasEl.x - offsetX + (coordenadasEl.width - cc.width * scaleInv) / 2}px, ${coordenadasEl.y - offsetY + (coordenadasEl.height - cc.height * scaleInv) / 2}px, 0px) scale(${scaleInv})`
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

      let transformPreviousView_1 = `translate3d(${x}px, ${y}px, 0px) scale(${scale})`
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
        lastView.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0px) scale(${scale * preScale})`
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
        scale(${scale * preScale})`
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
          transform: transformCurrentView_0
        },
        forwardState: {
          origin: currentView.style.transformOrigin,
          duration: duration,
          transform: transformCurrentView_1
        }
      } : null
      let previousv = previousView ? {
        location: 'previous',
        viewName: previousView.dataset.viewName,
        backwardState: {
          origin: previousView.style.transformOrigin,
          duration: duration,
          transform: transformPreviousView_0
        },
        forwardState: {
          origin: previousView.style.transformOrigin,
          duration: duration,
          transform: transformPreviousView_1
        }
      } : null
      let lastv = lastView ? {
        location: 'last',
        viewName: lastView.dataset.viewName,
        backwardState: {
          origin: lastView.style.transformOrigin,
          duration: duration,
          transform: transformLastView_0
        },
        forwardState: {
          origin: lastView.style.transformOrigin,
          duration: duration,
          transform: transformLastView_1
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
      currentView.style.willChange = 'transform, opacity'
      previousView.style.willChange = 'transform, opacity'
      if (lastView !== null) lastView.style.willChange = 'transform, opacity'
      var currentEvent1 = () => {
        this.blockEvents = true
        currentView.removeEventListener('animationstart', currentEvent1)
      }
      var currentEvent = () => {
        currentView.style.willChange = 'auto'
        currentView.classList.remove(`zoom-current-view-${instance}`)
        currentView.classList.remove('no-events')
        currentView.style.transformOrigin =  currentView.style.transformOrigin
        currentView.style.transform =  transformCurrentView_1
        this.blockEvents = false
        currentView.removeEventListener('animationend', currentEvent)
      }
      var previousEvent = () => {
        previousView.style.willChange = 'auto'
        previousView.classList.remove(`zoom-previous-view-${instance}`)
        previousView.style.transformOrigin =  previousView.style.transformOrigin
        previousView.style.transform = transformPreviousView_1
        previousView.removeEventListener('animationend', previousEvent)
      }
      var lastEvent = () => {
        lastView.style.willChange = 'auto'
        lastView.classList.remove(`zoom-last-view-${instance}`)
        lastView.style.transformOrigin =  lastView.style.transformOrigin
        lastView.style.transform = transformLastView_1
        lastView.removeEventListener('animationend', lastEvent)
      }
      currentView.addEventListener('animationstart', currentEvent1)
      currentView.addEventListener('animationend', currentEvent)
      previousView.addEventListener('animationend', previousEvent)
      if (lastView !== null) lastView.addEventListener('animationend', lastEvent)
      currentView.classList.add(`zoom-current-view-${instance}`)
      previousView.classList.add(`zoom-previous-view-${instance}`)
      if (lastView !== null) lastView.classList.add(`zoom-last-view-${instance}`)
    } else {
      console.info(`Zumly: zoomIn disabled`)
    } 
  }
}
/*
var elem = document.querySelectorAll('.element');

for (i = 0; i < elem.length; i++ ) {

  elem[i].addEventListener('click', function(){
       
    if (this.classList.contains('collapsed')) {
      
      var that = this;

      that.classList.remove('collapsed');
      that.classList.add('expanded');
      var collapsed = that.getBoundingClientRect();
      that.classList.remove('expanded');
      that.classList.add('collapsed');
      var expanded = that.getBoundingClientRect();
      that.classList.add('expanding');

      var invertedTop = collapsed.top - expanded.top;
      var invertedLeft = collapsed.left - expanded.left;
      var invertedWidth = collapsed.width / expanded.width;
      var invertedHeight = collapsed.height / expanded.height;

      that.style.transformOrigin = 'top left';

      that.style.transform = 'translateX(' + invertedLeft + 'px) translateY(' + invertedTop + 'px) translateZ(0) scaleX(' + invertedWidth + ') scaleY(' + invertedHeight + ')';

      that.addEventListener('transitionend', function handler(event) {
          that.style.transform = '';
          that.style.transformOrigin = '';
          that.classList.remove('expanding');
          that.classList.remove('collapsed');
          that.classList.add('expanded');
          that.removeEventListener('transitionend', handler);  
      });
       
    } else if (this.classList.contains('expanded') && !this.classList.contains('collapsing')) { 
    
      var that = this;
      
      requestAnimationFrame(function(){
        

        that.classList.remove('expanded');
        that.classList.add('collapsed');
        var collapsed = that.getBoundingClientRect();
        that.classList.remove('collapsed');
        that.classList.add('expanded');
        var expanded = that.getBoundingClientRect();
        that.classList.add('collapsing');
        
        var invertedTop = collapsed.top - expanded.top;
        var invertedLeft = collapsed.left - expanded.left;
        var invertedWidth = collapsed.width / expanded.width;
        var invertedHeight = collapsed.height / expanded.height;
        
        that.style.transformOrigin = 'top left';
        that.style.transform = 'translate(' + invertedLeft + 'px, ' + invertedTop + 'px) scale(' + invertedWidth + ', ' + invertedHeight + ')';
                
        that.addEventListener('transitionend', function handler(event) {
            that.style.transform = '';
            that.style.transformOrigin = '';
            that.style.webkitTransform = '';
            that.style.webkitTransformationOrigin = '';
            that.classList.remove('collapsing');
            that.classList.remove('expanded');
            that.classList.add('collapsed');
            that.removeEventListener('transitionend', handler);
        });
        
      });
      
    }
    
  });
  
};


* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: center;
  background-color: #e67e22;
  align-items: center;
  height: 100%;
  font-family: 'Roboto', sans-serif;
}

body {
  padding: 20px 0 ;
}

.app {
    width: 375px;
    max-height: 620px;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.content {
  flex: 1;
  overflow: hidden;
  position: relative;
  height: 100%;
}

.container {
  height: 155px;
}

.element {
  cursor: pointer;
}


.element.collapsed {
  height: 155px;
  width: 375px;
}

.element.expanded {
    top: 0;
    height: 100%;
    width: 1200px;
    z-index: 1;
    opacity: 1;
    position: absolute;
    left: 50%;
    margin-left: -600px;
  filter: blur(2px)
  
} 

.expanding {
    transition: transform 330ms ease-in;
}

.collapsing {
    transition: transform 270ms ease-in;
}





















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
