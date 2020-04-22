import './style.css'
import Zumly from './zumly.js'
export default Zumly

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
