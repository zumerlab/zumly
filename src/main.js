export default class Zumly {
  constructor (options) {
    this.app = options
  }
// methods
  init () {
    const rootDiv = document.querySelector(this.app.mount)
    // mete la primera view en el dom
    // agregar dompurify o algo asi mas adelante
    rootDiv.innerHTML = this.app.initialView
    document.querySelector('.view').classList.add('current')
    // agrega eventos a todos los .zoomable
    var views = this.app.views
    //console.log(typeof views)
    document.querySelectorAll('.zoomable')
      .forEach(el => el.addEventListener('click', () => this.zoomIn(el)))
  }

  zoomIn (el) {
    // clicked element with .zoomable
    let coordenadasEl = el.getBoundingClientRect()
    let centerXEl = coordenadasEl.width / 2
    let centerYEl = coordenadasEl.height / 2
    // create new view
    var newView = document.createElement('template')
    newView.innerHTML = this.app.views[el.dataset.goTo]
    // transforma current view en previous view
    const previousView = document.querySelector('.current')
    let coordenadasPreviousView = previousView.getBoundingClientRect()
    let centerXPreviousView = coordenadasPreviousView.width / 2
    let centerYPreviousView = coordenadasPreviousView.height / 2
    previousView.classList.remove('current')
    var lastView = null
    lastView = document.querySelector('.previous')
    if (lastView !== null) {
      lastView.classList.remove('previous')
      lastView.classList.add('last')
    }
    //
    previousView.classList.add('previous')
    // previousView.style.filter = 'blur(4px)'
    // transforma new view es current view y la agrega al DOM al ppio del container
    newView.classList.add('current')
    var rootDiv = document.querySelector(this.app.mount)
    rootDiv.prepend(newView.content)
    document.querySelector('.view').classList.add('current')
    const currentView = document.querySelector('.current')
    // agrega eventos
    document.querySelectorAll('.zoomable')
      .forEach(el => el.addEventListener('click', () => this.zoomIn(el)))
    // seleccionar el view container relativo a current
    const viewContainer = document.querySelector('.current > .view-container')
    let coordenadasViewContainer = viewContainer.getBoundingClientRect()
    let centerXViewContainer = coordenadasViewContainer.width / 2
    let centerYViewContainer = coordenadasViewContainer.height / 2
    // canvas
    let canvas = document.querySelector('.canvas')
    let coordenadasCanvas = canvas.getBoundingClientRect()
    let centerXCanvas = coordenadasCanvas.width / 2
    let centerYCanvas = coordenadasCanvas.height / 2
    // DETERMINA ESCALAS
    let scale = coordenadasViewContainer.width / coordenadasEl.width
    let scaleInv = Math.pow(scale, -1)
    // MUEVE VISTAS EN FORMA IDENTICA
    if (lastView !== null) {
      let coordenadasLastView = lastView.getBoundingClientRect()
      let centerXLastView = coordenadasLastView.width / 2
      let centerYLastView = coordenadasLastView.height / 2
      let scale1 = coordenadasLastView.width / coordenadasViewContainer.width
      let scaleInv1 = Math.pow(scale1, -1)
      console.log(coordenadasLastView)
      currentView.style.transform = `translate(${(centerXCanvas) * scale}px, ${(centerYCanvas) * scale}px) scale(${scale})`
      previousView.style.transform = `translate(${(centerXCanvas) * scale}px, ${(centerYCanvas) * scale}px) scale(${scale})`
      lastView.style.transform = `translate(${(centerXCanvas)}px, ${(centerYCanvas)}px) scale(${scale})`
    } else {
      currentView.style.transform = `translate(${(centerXCanvas - centerXEl - coordenadasEl.left) * scale}px, ${(centerYCanvas - centerYEl - coordenadasEl.top) * scale}px) scale(${scale})`
      previousView.style.transform = `translate(${(centerXCanvas - centerXEl - coordenadasEl.left) * scale}px, ${(centerYCanvas - centerYEl - coordenadasEl.top) * scale}px) scale(${scale})`
    }
    // SETEA QUE LA VISTA NUEVA APAREZCA EN EL ELEMENTO CLICKEADO
    viewContainer.style.transformOrigin = '0 0'
    viewContainer.style.transform = `translate(${coordenadasEl.x}px, ${coordenadasEl.y}px) scale(${scaleInv})`
  }

}

/*
<div class="canvas">
  
  <section class="view current">
    <div class="is-zoomable current" onClick="zoomMe()">
      hola
    </div>
    
  </section>
   <section class="view previous">
    <div class="is-zoomable previous" onClick="zoomMeBack()">
      chau
    </div>
      <div class="se" onClick="zoomMeBack()">
      chau
    </div>
  </section>
</div>
----------------
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.canvas {
  position: absolute;
  width: 100%;
  height: 100%;
  overflow: hidden;
 
}

.view {
  width: 100%;
  height: 100%;
  position: absolute;
  overflow: visible;
  transition: transform 2s;
  
 }
.is-zoomable.current {
  border: 8px solid red;
  width: 400px;
  height: 400px;
  left: 0px;
  top: 0px;
  position: absolute;
  transform-origin: 0 0;
  transform: scale(0.5);
  transition: all 2s;
   opacity: 0;
  will-change: transform;
  background-color: white;
  
}
.se {
  border: 8px solid red;
  width: 400px;
  height: 400px;
  left: 300px;
  top: 20px;
  position: absolute;
}
.is-zoomable.previous {
  border: 8px solid blue;
  width: 200px;
  height: 200px;
  left: 0px;
  top: 0px;
  position: absolute;
  transition: all 2s;
  will-transform: transform
}
.current {
 
   z-index: 20;

  
}

.previous {
 
  border-color: blue;
  
  z-index: 10;
 

}

---------------
function getPosition(el) {
  var xPos = 0;
  var yPos = 0;
 
  while (el) {
    if (el.tagName == "BODY") {
      // deal with browser quirks with body/window/document and page scroll
      var xScroll = el.scrollLeft || document.documentElement.scrollLeft;
      var yScroll = el.scrollTop || document.documentElement.scrollTop;
 
      xPos += (el.offsetLeft - xScroll + el.clientLeft);
      yPos += (el.offsetTop - yScroll + el.clientTop);
    } else {
      // for all other non-BODY elements
      xPos += (el.offsetLeft - el.scrollLeft + el.clientLeft);
      yPos += (el.offsetTop - el.scrollTop + el.clientTop);
    }
 
    el = el.offsetParent;
  }
  return {
    x: xPos,
    y: yPos
  };
}
 
// deal with the page getting resized or scrolled
window.addEventListener("scroll", updatePosition, false);
window.addEventListener("resize", updatePosition, false);
 
function updatePosition() {
  // add your code to update the position when your browser
  // is resized or scrolled
  //console.log(getPosition(document.querySelector(".current")))
   //console.log(document.querySelector(".current").getBoundingClientRect())
  // zoomMe()
}

function zoomMe() {
  let el = document.querySelector('.is-zoomable.previous')
  let coords = el.getBoundingClientRect()
  let centerXEl = coords.width/2
  let centerYEl = coords.height/2
  
  let canvas = document.querySelector(".canvas")
  let coordsCanvas = canvas.getBoundingClientRect()
  let centerXCanvas = coordsCanvas.width/2
  let centerYCanvas = coordsCanvas.height/2
 
  
  let previousEl = document.querySelector(".is-zoomable.current")
  let coordsprevEl = previousEl.getBoundingClientRect()
  let centerXpEl = coordsprevEl.width/2
  let centerYpEl = coordsprevEl.height/2
  
 
  let previousView = document.querySelector(".view.current")
  previousView.style.transform = `translate(${centerXCanvas - (centerXpEl - coordsprevEl.left) * 2}px, ${centerYCanvas - (centerYpEl - coordsprevEl.top) * 2}px) `
  
  let containerView = document.querySelector(".previous")
  containerView.style.transform = `translate(${(centerXCanvas * 2) - (centerXEl * 2) - (coords.left * 2)}px, ${(centerYCanvas * 2) - (centerYEl * 2) - (coords.top * 2)}px) scale(2)  `
  
 
 
  /**************
  La logica es que cuando se toca un elementos zoomable éste va hacia el centro y escala toda la view segun parametros de llegada (en ancho o %de pantalla a desarrollar aun), y se le agrega un efecto blur
  Al mismo tiempo se inicia un escalado de menor al tamaño final del elemento central (view n realidad) de la nueva view -container(esto trae otro problemas....queé pasa con otros elementos etc. pero bueno...)
  y listo... asi tendriamso un infinito loop de escala.
  en todo esto es clave getBoundingClientRect(),. asi nos podemos independizar de las shapes y coordenadas.
  usang getBoun... y scale 1 ... ya no hay que calcular todas las coordenas, lo que es mucho mas barato.
  **************/
  
  
  /*
  listo, ya se puede hacer zoom infinito siempre termnando en scale 1.
  falta testear con tres layers...pero quizas se podria hacer directamente en zircle.
  ahora hay que adaptarlo a zircle v1
  >>>>>> para evitar hacer calculos js en los componentes
  se podria usar css custom vars,
  >>> optimizar el uso de will-change en algunos elementos
  PROBAR TEMITA DE INSERTAR VIEWS :\
  */
  