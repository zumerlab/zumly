class Zumly {
constructor(options) {
    this.app = options;
    this.storedViews = [];
}
init() {
    const canvas = document.querySelector(this.app.mount);
    var self = this; //OPTIMIZAR
    canvas.addEventListener('click', function(e) {
        e.stopPropagation();
        self.zoomOut();
    });
    var newView = document.createElement('template');
    newView.innerHTML = this.app.views[this.app.initialView];
    canvas.prepend(newView.content);
    var view = canvas.querySelector('.view');
    view.classList.add('current');
    view.dataset.viewName = this.app.initialView;
    // agrega eventos a todos los .zoomable
    view.querySelectorAll('.zoomable').forEach(el => el.addEventListener('click', function(e) {
        e.stopPropagation();
        self.zoomIn(el);
    }));
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
                    transition: view.style.transition,
                    transform: view.style.transform
                },
                forwardState: null
            }
        ]
    });
}
storeViews(data) {
    this.storedViews.push(data);
}
zoomOut() {
    if (this.storedViews.length > 1) {
        var ultimaVista = this.storedViews[this.storedViews.length - 1];
        let current = ultimaVista.views[0];
        let previous = ultimaVista.views[1];
        let last = ultimaVista.views[2];
        let gone = ultimaVista.views[3];
        const canvas = document.querySelector(this.app.mount);
        var currentView = canvas.querySelector('.view.current');
        var previousView = canvas.querySelector('.view.previous');
        var lastView = canvas.querySelector('.view.last');
        currentView.style.willChange = 'transform, opacity';
        document.documentElement.style.setProperty('--current-transform-one', current.forwardState.transform);
        document.documentElement.style.setProperty('--current-transform-two', current.backwardState.transform);
        document.documentElement.style.setProperty('--current-origin-one', current.forwardState.origin);
        document.documentElement.style.setProperty('--current-origin-two', current.backwardState.origin);
        document.documentElement.style.setProperty('--animation-duration-back', current.backwardState.duration);
        
        previousView.querySelector('.active').classList.remove('active');
        previousView.classList.remove('previous');
        previousView.classList.add('current');
        previousView.style.willChange = 'transform';
        document.documentElement.style.setProperty('--previous-transform-one', previous.forwardState.transform);
        document.documentElement.style.setProperty('--previous-transform-two', previous.backwardState.transform);
        document.documentElement.style.setProperty('--previous-origin-one', previous.forwardState.origin);
        document.documentElement.style.setProperty('--previous-origin-two', previous.backwardState.origin);
        if (last !== undefined) {
            lastView.style.willChange = 'transform';
            lastView.classList.add('previous');
            lastView.style.opacity = 1;
            lastView.classList.remove('last');
            document.documentElement.style.setProperty('--last-transform-one', last.forwardState.transform);
            document.documentElement.style.setProperty('--last-transform-two', last.backwardState.transform);
            document.documentElement.style.setProperty('--last-origin-one', last.forwardState.origin);
            document.documentElement.style.setProperty('--last-origin-two', last.backwardState.origin);
            
        }
        if (gone !== undefined) {
            canvas.prepend(gone.viewName);
            var newlastView = canvas.querySelector('.view:first-child');
            newlastView.style.opacity = 0;

        }
        this.storedViews.pop();

        currentView.addEventListener('animationend', () => {
            canvas.removeChild(currentView);
        });
        previousView.addEventListener('animationend', () => {
            previousView.classList.remove('zoom-out-previous');
            previousView.style.willChange = 'auto';
            previousView.style.transition = 'transform 0s';
            previousView.style.transformOrigin = previous.backwardState.origin;
            previousView.style.transform = previous.backwardState.transform;
        });
        if (last !== undefined) {
            lastView.addEventListener('animationend', () => {
                lastView.style.willChange = 'auto';
                lastView.classList.remove('zoom-out-last');
                lastView.style.transition = 'transform 0s';
                lastView.style.transformOrigin = last.backwardState.origin;
                lastView.style.transform = last.backwardState.transform;
            });
        }
        currentView.classList.add('zoom-out-current');
        previousView.classList.add('zoom-out-previous');
        if (last !== undefined) lastView.classList.add('zoom-out-last');
    }
}
zoomIn(el) {
    // clicked element with .zoomable
    el.classList.add('active');
    let coordenadasEl = el.getBoundingClientRect();
    let canvas = document.querySelector(this.app.mount);
    let coordenadasCanvas = canvas.getBoundingClientRect();
    console.log(coordenadasCanvas);
    var offsetX = coordenadasCanvas.left;
    var offsetY = coordenadasCanvas.top;
    // create new view
    var newView = document.createElement('template');
    newView.innerHTML = this.app.views[el.dataset.goTo];
    var previousView = canvas.querySelector('.current');
    // esto lo puede sacar de currentview backsate.
    let coordenadasPreviousView = previousView.getBoundingClientRect();
    var lastView = null;
    var goneView = null;
    goneView = canvas.querySelector('.last');
    if (goneView !== null) {
        canvas.removeChild(goneView);
    }
    // si existe transforma previous view en last view
    lastView = canvas.querySelector('.previous');
    if (lastView !== null) {
        lastView.classList.remove('previous');
        lastView.classList.add('last');
        // esto lo puede sacar de previousview.backstate
        var coordenadasLastView = lastView.getBoundingClientRect();
        var clvt = lastView.style.transform;
    }
    //
    previousView.classList.add('previous');
    previousView.classList.remove('current');
    // transforma new view en current view y la agrega al DOM al ppio del container
    newView.classList.add('current');
    //mountPoint.prepend(overlay.content)
    canvas.append(newView.content);
    canvas.querySelector('.view:last-child').classList.add('current');
    var currentView = canvas.querySelector('.current');
    // currentView.classList.add('appear')
    currentView.dataset.viewName = el.dataset.goTo;
    currentView.classList.add('no-events');
    // esto deberia ser iguaal a el.getbounding
    let coordenadasCurrentView = currentView.getBoundingClientRect();
    // agrega eventos al currentview
    var self = this;
    currentView.querySelectorAll('.zoomable').forEach(vx => vx.addEventListener('click', function(e) {
        e.stopPropagation();
        self.zoomIn(vx);
    }));
    currentView.onclick = function(e) {
        e.stopPropagation();
    };
    // canvas
    //ver esto cuando ya no queda history back
    let preScale = getComputedStyle(document.documentElement).getPropertyValue('--previous-scale-two');

    let scale = coordenadasCurrentView.width / coordenadasEl.width;
    let scaleInv = 1 / scale;
    document.documentElement.style.setProperty('--previous-scale-two', scale);
    // let scaley = coordenadasCurrentView.height / coordenadasEl.height
    // let scaleInvy = 1 / scaley
    // arreglos previous
    previousView.style.transition = 'transform 0s';
    previousView.style.transformOrigin = `
    ${coordenadasEl.x + coordenadasEl.width / 2 - coordenadasPreviousView.x}px
    ${coordenadasEl.y + coordenadasEl.height / 2 - coordenadasPreviousView.y}px
    `;
    var duration = `1s`;
    let x = coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + coordenadasPreviousView.x;
    let y = coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + coordenadasPreviousView.y;
    let move = `translate3d(${x}px, ${y}px, 0px) scale(${scale})`;
    previousView.style.transform = move;
    var newcoordenadasEl = el.getBoundingClientRect();
    if (lastView !== null) {
        var newcoordenadasPV = previousView.getBoundingClientRect();
        lastView.style.transition = 'transform 0s';
        lastView.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0px) scale(${scale * preScale})`;
        let dd = canvas.querySelector('.last');
        var last = dd.querySelector('.active');
        var coorLast = last.getBoundingClientRect();
        lastView.style.transform = clvt;
    }
    previousView.style.transform = `translate3d(${coordenadasPreviousView.x - offsetX}px, ${coordenadasPreviousView.y  - offsetY}px, 0px)`;
    var prePrevTransform = previousView.style.transform;
    var prorigin = previousView.style.transformOrigin;
    currentView.style.transformOrigin = 'top left';
    currentView.style.transform = `translate3d(${coordenadasEl.x - offsetX}px, ${coordenadasEl.y - offsetY}px, 0px) scale(${scaleInv})`;
    var preCurrentTransform = currentView.style.transform;
    if (lastView !== null) {
      var prev = canvas.querySelector('.previous');
      var coorPrev = prev.getBoundingClientRect();
      var lastransform = `translate3d(${coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + (coorPrev.x - coorLast.x) + newcoordenadasPV.x - offsetX}px, ${coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + (coorPrev.y - coorLast.y) + newcoordenadasPV.y - offsetY}px, 0px) scale(${scale * preScale})`;
      }
    el.getBoundingClientRect();
    var cutransition = `transform ${duration} ease-in-out`;
    var cutransform = `translate3d(${newcoordenadasEl.x - offsetX}px, ${newcoordenadasEl.y - offsetY}px, 0px)`;
    // arrays
    var snapShoot = {
        zoomLevel: this.storedViews.length,
        views: []
    };
    let currentv = currentView ? {
        location: 'current',
        viewName: currentView.dataset.viewName,
        backwardState: {
            origin: currentView.style.transformOrigin,
            transition: currentView.style.transition,
            duration: duration,
            transform: preCurrentTransform
        },
        forwardState: {
            origin: currentView.style.transformOrigin,
            transition: cutransition,
            duration: duration,
            transform: cutransform
        }
    } : null;
    let previousv = previousView ? {
        location: 'previous',
        viewName: previousView.dataset.viewName,
        backwardState: {
            origin: previousView.style.transformOrigin,
            transition: previousView.style.transition,
            duration: duration,
            transform: prePrevTransform
        },
        forwardState: {
            origin: previousView.style.transformOrigin,
            transition: previousView.style.transition,
            duration: duration,
            transform: move
        }
    } : null;
    let lastv = lastView ? {
        location: 'last',
        viewName: lastView.dataset.viewName,
        backwardState: {
            origin: lastView.style.transformOrigin,
            transition: lastView.style.transition,
            duration: duration,
            transform: clvt
        },
        forwardState: {
            origin: lastView.style.transformOrigin,
            transition: lastView.style.transition,
            duration: duration,
            transform: lastransform
        }
    } : null;
    let gonev = goneView ? { // ACA VA LA VISTA ENTERA FALTA REALIZAR UN ZOOM IGUAL ANTES DE SACARLA DE JUEGO
        location: 'gone',
        viewName: goneView,
        backwardState: {
            origin: goneView.style.transformOrigin,
            transition: goneView.style.transition,
            duration: duration,
            transform: goneView.style.transform
        },
        forwardState: null
    } : null;
    if (currentv !== null) snapShoot.views.push(currentv);
    if (previousv !== null) snapShoot.views.push(previousv);
    if (lastv !== null) snapShoot.views.push(lastv);
    if (gonev !== null) snapShoot.views.push(gonev);
    this.storeViews(snapShoot);
    // animation
    currentView.style.willChange = 'transform, opacity';
    document.documentElement.style.setProperty('--current-transform-one', `translate3d(${coordenadasEl.x - offsetX}px, ${coordenadasEl.y - offsetY}px, 0px) scale(${scaleInv})`);
    document.documentElement.style.setProperty('--current-transform-two', `translate3d(${newcoordenadasEl.x - offsetX}px, ${newcoordenadasEl.y - offsetY}px, 0px)`);
    document.documentElement.style.setProperty('--current-origin-one', '50% 50%');
    document.documentElement.style.setProperty('--current-origin-two', 'top left');
    document.documentElement.style.setProperty('--animation-duration-back', duration);
    
    previousView.style.willChange = 'transform';
    document.documentElement.style.setProperty('--previous-transform-one', prePrevTransform);
    document.documentElement.style.setProperty('--previous-transform-two', move);
    document.documentElement.style.setProperty('--previous-origin-one', previousView.style.transformOrigin);
    document.documentElement.style.setProperty('--previous-origin-two', previousView.style.transformOrigin);
    // document.documentElement.style.setProperty('--animation-duration-back', duration);
    if (lastView !== null) {
      lastView.style.willChange = 'transform';
        document.documentElement.style.setProperty('--last-transform-one', clvt);
        document.documentElement.style.setProperty('--last-transform-two', lastransform);
        document.documentElement.style.setProperty('--last-origin-one', lastView.style.transformOrigin);
        document.documentElement.style.setProperty('--last-origin-two', lastView.style.transformOrigin);
    }
    currentView.addEventListener('animationend', () => {
        currentView.style.willChange = 'auto';
        currentView.classList.remove('zoom-in-current');
        currentView.classList.remove('no-events');
        currentView.style.transition = 'all 0s';
        currentView.style.transformOrigin = 'top left';
        currentView.style.transform = getComputedStyle(document.documentElement).getPropertyValue('--current-transform-two');
    });
    previousView.addEventListener('animationend', () => {
        previousView.style.willChange = 'auto';
        previousView.classList.remove('zoom-in-previous');
        //previousView.classList.remove('no-events')
        previousView.style.transition = 'transform 0s';
        previousView.style.transformOrigin = getComputedStyle(document.documentElement).getPropertyValue('--previous-origin-two');
        previousView.style.transform = getComputedStyle(document.documentElement).getPropertyValue('--previous-transform-two');
    });
    if (lastView !== null) {
      lastView.addEventListener('animationend', () => {
            lastView.style.willChange = 'auto';
            lastView.classList.remove('zoom-in-last');
            //lastView.classList.remove('no-events')
            lastView.style.transition = 'transform 0s';
            lastView.style.transformOrigin = getComputedStyle(document.documentElement).getPropertyValue('--last-origin-two');
            lastView.style.transform = lastransform;
        });
    }
    currentView.classList.add('zoom-in-current');
    previousView.classList.add('zoom-in-previous');
    if (lastView !== null) lastView.classList.add('zoom-in-last');
  }
}

/*
TEMAS A RESOLVER:
TODOS: RESPONSIVE, VER REMOVEEVENTS, optiomizar mem staorage, agregar router, agregar eventos disparadores de navegacion, ver temita de losefectos de capas anteriores
WIP MULTIPLES INSTANCES. FALTA VER TEMA CSS VARIABLES UNICAS
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
