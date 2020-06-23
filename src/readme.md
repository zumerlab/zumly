
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
🔪 FXS de capas anteriores
✅ PARAMETRIZAR: poner opciones para los devs: efectos blur, velocidad variable, constante, custom de transicion, zoom on different shapes yeahp



TODOS
⭕️ DESAMBIGUAR CSS CLASSES, ARMAR CLASS SI HACE FALTA
⭕️ Testear views con react, svelte y vuejs
    PARA QUE ANDE ZUMLY TENDRE QUE ARMAR UN WARPPER PARA VUE Y REACT
PARA CASOS MAS VANILLA: NO HABURA PROBLEMA: VIEWS CON vanilla-js y lit-html
⭕️ RESPONSIVE, pasar px a %.. o up to you diria 
⭕️ horizontal same level mavigation:no necesita agregar nueva vista porque esta el mismo nivel.
⭕️ ⭐️ third party animation libraries, animejs
⭕️ ⭐️ notificaciones al methods: imporrtante por si hay errores del usuario y del sistema.
⭕️ agregar router, 
⭕️ ⭐️ agregar eventos disparadores de navegacion, NAVEGACION: por mouse scroll,  teclas, etc como en github trending:
https://gist.github.com/SleepWalker/da5636b1abcbaff48c4d

O armer borders fancy para zoom, como recuadros, coloreado de areas, etc
si se quiere cubir todo el canvas la view nueva debe tener 100% o mismo widht o hegiht


las vistas con bordes, fondos, etc son cosas opcionales.... bien podrian ser invisibles o bien podria activarse onhover tipo mira, o con backgrounds semitransparents.

Ideas:
📚 FLIP https://codepen.io/zircle/pen/wvKwRJa
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

