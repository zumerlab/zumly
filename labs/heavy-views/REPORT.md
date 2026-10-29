# Fluidez con vistas pesadas

Sesión del 28/10/2026, sobre Zumly 1.1.0 (`main`, `d4484fc`). Martin pidió más fluidez en las transiciones con vistas pesadas: la guía [Heavy views](https://zumerlab.com/zumly/guides/heavy-views.html) todavía no llega a ser óptima. Antes de tocar código quiso ver los caminos posibles y lo que puede ganar cada uno. Después pidió evaluar tres ideas suyas de la época de Zircle UI y sumó una cuarta: preparar todo antes de animar, con un aviso si tarda. En la sesión no se cambió nada en `src/`; lo nuevo es esta carpeta `labs/`.

## Dónde estamos

`flatten` (1.1.0) muestra las vistas de atrás como una foto de SnapDOM, que `stream` mantiene al día, y la foto se mueve como una textura. En el banco de vidrio de `experiments/snapdom-compositor/`, en vivo y con dpr 2, los cuadros perdidos bajaron de 54,8 % a 6,1 %.

Lo que queda, en ese mismo banco con `flatten` y `stream` ([stream-dpr2.json](../../experiments/snapdom-compositor/results/fluidity/stream-dpr2.json)):

| Momento | Medido |
|---|---|
| Zoom-in | 10,7 % de cuadros perdidos |
| Zoom-out | 1,9 % |
| Zooms con tirón (3 o más cuadros perdidos seguidos) | 3 de 6 |
| Reposo | 12,7 %, con huecos de hasta 168 ms |
| Al llegar a una vista | una tarea de ~69 ms |
| Arranque del zoom-in | 25 ms más tarde que sin `flatten` (65 ms con CPU 4×) |

La vista que entra o sale se mueve viva: `flatten` no la toca. En la demo de la guía esa vista es `detail`, con 90 filas con `backdrop-filter`, y el tablero tiene 48 mosaicos de vidrio. Como lo de atrás se mueve, cada vidrio recalcula su desenfoque en cada cuadro. La hipótesis principal, todavía sin medir, es que eso es lo que más se nota en la demo.

## Cómo cuesta una transición

- Chrome rasteriza por baldosas y solo las que caen en pantalla, más un margen. Lo que una vista escalada saca del lienzo no se rasteriza ni se dibuja.
- Cuando una vista cambia de escala, la parte visible se vuelve a rasterizar a la escala nueva. Si la vista ocupa el lienzo, a 4× esa parte tiene tantos píxeles como la vista entera a 1×.
- Con `will-change: transform`, Chrome no re-rasteriza al cambiar la escala: agranda la textura que ya tiene. Zumly lo pone en las clases de animación ([style.css:87](../../src/style.css#L87)) y, al sacarlas, Chrome re-rasteriza a la escala final.
- El `filter` de los efectos se dibuja aparte, en una superficie por vista, y va en coordenadas de la vista: `blur(3px)` a 4× son 12 px en pantalla, y `blur(8px)` a 16× son 128 px.
- Un `backdrop-filter` se recalcula cada vez que cambia lo que tiene detrás. Durante un zoom, eso pasa en cada cuadro.
- El hilo principal recorre la vista entera (estilo, layout, pintado) cuando algo cambia adentro, se vea o no.
- Animar `filter` es caro con vistas vivas detrás: en `cards`, el cuadro medio bajó de 28 a 19,7 ms aplicando el blur de golpe. Con fotos detrás, animarlo o no da lo mismo (18,3 contra 18,2 ms).

En resumen: lo caro es lo vivo que se mueve, y la salida es que lo que se mueve sea una textura.

## Opciones

| # | Opción | Ataca | Qué puede ganar | Esfuerzo | Certeza | Dónde |
|---|---|---|---|---|---|---|
| 1 | Driver con View Transitions | la vista que entra o sale | que cueste como una foto | alto | hipótesis | driver propio |
| 2 | Marca de movimiento | el vidrio de la vista que se mueve | los desenfoques por cuadro | bajo | hipótesis | motor y guía |
| 3 | Aplanar la vista que se achica | zoom-out con vidrio | el zoom-out como las vistas de atrás | bajo a medio | depende de la demo | `flatten.js` |
| 4 | Preparar la vista al presionar | primeros cuadros del zoom-in | la traba de 50-80 ms del inicio | medio | hipótesis | motor |
| 5 | `deferred` en la guía | la vista que entra | no animar su contenido | ninguno | conocido | guía |
| 6 | Ocultar al presionar | el arranque | 25 ms (65 ms con CPU 4×) | bajo a medio | costo medido | `flatten.js` |
| 7 | Foto ya desenfocada | el blur por cuadro | mucho en GPU flojas | medio | hipótesis | `flatten.js` |
| 8 | La vista de dos niveles atrás como velo | memoria y GPU | una capa pesada menos | bajo | hipótesis | motor |
| 9 | Gradientes opacos como fondo sólido | reposo | 12,7 % a cerca de 0 | sin estimar | costo medido | SnapDOM |
| 10 | Emular el vidrio una sola vez | llegada y cuadros completos | la tarea de 69 ms | medio | probable | SnapDOM |
| 11 | Tramos y `signal` | huecos largos | menos huecos; un clic que no espera | medio | probable | SnapDOM |
| 12 | `will-change` justo | superficies de más | una pasada por vista y por cuadro | bajo | hipótesis | `style.css` |
| 13 | Sin `perspective` en el lienzo | escala de raster, superficies | sin estimar | bajo | hipótesis | `style.css` |
| 14 | `zoomOut(n)` sin estilo forzado por cuadro | zoom-out de varios niveles | un recálculo de estilo por cuadro | bajo | seguro | motor |
| 15 | Driver `waapi` sin doble rAF | latencia | ~33 ms | bajo | seguro | driver |

### La vista que entra o sale

**1. Driver con View Transitions.** El navegador saca su propia foto de cada vista, una textura del cuadro ya pintado, siempre al día y sin SnapDOM, y la anima en el compositor. Es el único camino que cubre también la vista que entra. El `filter` de la vista entra en la captura, así que el desenfoque pasa a ser un fundido entre dos fotos.

- No se sabe si Chrome reutiliza la captura de la vista nueva o recalcula sus vidrios en cada cuadro. Eso lo dice un prototipo.
- La versión de documento anda en Chrome 111+, Safari 18+ y Firefox 144+, pero dibuja encima de toda la página sin recortar al lienzo. Sirve para lienzos a pantalla completa (Pulse, la demo), no para los embebidos. La versión con alcance de elemento resuelve eso, pero solo está en Chrome 147+.
- Durante la transición cada vista se dibuja sola: un vidrio que desenfoca lo que hay detrás de la vista (los mosaicos del tablero sobre el gradiente) se ve distinto mientras se mueve.
- GSAP, anime y Motion no pueden animar esos pseudo-elementos: sería un driver más, con WAAPI. El zoom-out que sigue al gesto habría que rehacerlo pausando sus animaciones.
- No reemplaza a `flatten` en reposo.
- Zumly acepta drivers propios, así que el prototipo puede vivir en `labs/` sin tocar `src/`.

**2. Marca de movimiento.** Zumly pone un atributo en el lienzo durante cada transición y cada gesto (`data-z-moving`, por ejemplo), y la guía enseña a apagar vidrio y sombras mientras tanto, como hacen los mapas al desplazarse. Saca los desenfoques por cuadro de la vista que se mueve; a cambio, el vidrio aparece de golpe al final. Hoy se puede armar con los hooks, pero no cubre bien el gesto, el lateral ni `zoomOut(n)`. La misma marca le sirve a Pulse para pausar los datos de HA durante el zoom.

**3. Aplanar también la vista que se achica.** Con stream, su foto ya está al día al empezar el zoom-out. Hoy queda viva a propósito ([flatten.js:135](../../src/flatten.js#L135)), porque ocultar su contenido sumaba 30-160 ms al arranque. En el banco, el zoom-out ya da 1,9 %, así que vale solo si la demo de la guía muestra algo peor. Junto con la opción 6, el costo del arranque se esconde. También alivia el zoom-out que sigue al gesto.

**4. Preparar la vista al presionar.** En `pointerdown` sobre un disparador (no en hover), resolver e insertar la vista nueva oculta y en su tamaño final. Estilo, layout, imágenes y raster se hacen durante la presión, que suele durar unos 100 ms. Ataca la traba de los primeros cuadros, que el estudio midió en 50-80 ms en todas las variantes. No arregla el vidrio que se mueve. Riesgos: corre la función de la vista antes del clic, y hay que comprobar que Chrome rasterice una capa invisible.

**5. `deferred` en la guía.** Ya existe: la vista entra vacía y el contenido aparece al terminar el zoom. La guía de vistas pesadas no lo nombra.

### El arranque

**6. Ocultar al presionar.** En `pointerdown` sobre un disparador se muestra la foto, que con stream está al día, y el disparador sigue vivo encima: un hijo con `visibility: visible` se ve aunque su padre esté oculto. Los 25 ms del arranque caen durante la presión. Si la presión se cancela, vuelve la vista real; con teclado queda como hoy. Es el pendiente "el zoom-in arranca ~25 ms más tarde".

### Los efectos sobre la foto

**7. Foto ya desenfocada.** Al pasar atrás se dibuja una sola vez una copia borrosa y oscura de la foto, a baja resolución, y el zoom funde las dos con opacidad en vez de animar `filter`. En reposo no queda ningún `filter` vivo. En la Mac gana poco (el estudio vio casi lo mismo con el blur horneado); en una GPU floja, probablemente mucho. Un fundido no es igual a un blur que crece: a mitad de camino se ven las dos imágenes.

**8. La vista de dos niveles atrás como velo.** A 16× y con `blur(8px)` es casi un lavado de color. Alcanza con una copia chica de su foto o, sin `flatten`, con `content-visibility: hidden` dejando solo su fondo.

### Reposo y llegada (en SnapDOM)

**9. Gradientes opacos como fondo sólido.** Un dato que cambia sobre una tarjeta con gradiente obliga a un cuadro completo del stream por segundo. De ahí sale el 12,7 % en reposo.

**10. Emular el vidrio una sola vez.** `emulateBackdropFilters` clona la vista entera por cada elemento con `backdrop-filter`: 100-170 ms con 24 paneles, y la demo tiene 48 en el tablero y 90 en `detail`. La idea es pintar el fondo una vez y recortarlo por elemento. Probablemente es lo que más rinde de este lado: ataca la tarea al llegar y los cuadros completos en vistas de vidrio.

**11. Tramos y `signal`.** Partir lo que todavía corre de un tirón (preparación, emulación, serializado) y poder abortar una captura cuando empieza una navegación. Si con 9, 10 y 11 no alcanza, el stream podría bajar de 10 cuadros por segundo cuando el puntero está quieto.

### Higiene del motor

**12. `will-change` justo.** Las tres vistas que se mueven llevan `will-change: transform, opacity, filter`. Es probable que eso le dé a cada una una superficie aparte: una pasada extra a pantalla completa por vista y por cuadro, con dpr 2. La idea es dejar `transform`, y sumar `filter` u `opacity` solo donde haya efecto o fundido.

**13. La `perspective` del lienzo.** `perspective: 1000px` ([style.css:15](../../src/style.css#L15)) está desde 2020 (`35d074d`) y las vistas no usan 3D. Con perspectiva en la matriz, Chrome puede no saber a qué escala rasterizar cada vista. Pulse tiene su propia perspectiva dentro de la vista (`.stage`), pero su README nombra la del lienzo en la prueba de 3D: si se cambia, hay que probar Pulse.

**14. `zoomOut(n)`.** Las vistas que acompañan a la que vuelve leen `getComputedStyle` en cada cuadro ([zumly.js:2083](../../src/zumly.js#L2083)). Se puede calcular su animación de antemano.

**15. Driver `waapi`.** El zoom-out espera dos `requestAnimationFrame` antes de animar ([waapi-transition.js:115](../../src/drivers/waapi-transition.js#L115)), unos 33 ms.

### Descartado o para más adelante

- Compositar los ancestros (depth): ya medido en el estudio, no rinde.
- GSAP, anime y Motion corren en el hilo principal. Con vistas pesadas, la guía debería recomendar `css` o `waapi`.

## Las ideas de Martin

### 1. Una capa fija de vidrio entre la vista actual y las de atrás

Un elemento quieto, del tamaño del lienzo, con `backdrop-filter`, entre la vista actual y las de atrás. Las de atrás se mueven debajo sin `filter` propio.

- **Gana:** una sola pasada de desenfoque para todo lo de atrás (hoy es una por vista), con radio fijo en pantalla. El blur aparece animando la opacidad de la capa, que el compositor hace barato: el blur gradual al precio del blur de golpe. Oscurecer es gratis con un fondo semitransparente. No necesita SnapDOM y anda con cualquier driver.
- **No gana:** que la capa esté quieta no la hace cacheable. Lo de abajo se mueve, así que el desenfoque se recalcula en cada cuadro: pasa de dos pasadas a una, no a cero. Con `flatten`, en la Mac, casi nada, porque el `filter` sobre fotos ya es barato. En una GPU floja rinde más la foto ya desenfocada (opción 7).
- **Cambia el look:** el fondo queda detrás de un vidrio esmerilado fijo, en vez de ser la misma imagen borrosa que se agranda. Dos niveles de profundidad piden dos capas. En cada navegación una vista cruza una capa; es orden en el DOM.
- **Riesgo:** un `backdrop-filter` del tamaño del lienzo es de lo más caro en móviles flojos, y cualquier animación encima obliga a re-desenfocar esa zona.
- **Veredicto:** medirla, sobre todo para lo que `flatten` deja vivo (iframes, video, `data-flatten="false"`) y para quien no use SnapDOM. Antes, decidir si gusta el look.

### 2. Que la vista que crece detrás no cueste lo que no se ve

La previa crece 4× y casi toda sale del lienzo; la idea es que el navegador no trabaje en esa parte.

- **Ya pasa:** el recorte existe donde más cuesta, en el raster y el dibujo por baldosas. `contain: strict` ya está en el lienzo y en cada vista; `contain: paint` recorta a la caja de la vista, no a la pantalla.
- **El costo real** está en la parte que sí se ve (re-raster a la escala nueva, blur, vidrios) y en el hilo principal, que recorre la vista entera cuando algo cambia.
- **Desde CSS sirve:**
  - Dejar `will-change: transform` en las vistas de atrás. Chrome agranda la textura en vez de re-rasterizar; queda blanda, pero detrás de un blur no se nota. Con `flatten` no hace falta.
  - `content-visibility: hidden` en lo que no se va a ver en todo el zoom, como la vista de dos niveles atrás cuando la previa la tapa.
  - `content-visibility: auto` por bloques sirve en reposo, no durante el zoom: los bloques entran y salen de pantalla en pleno movimiento.
- **Variante de diseño:** que el fondo crezca menos. Hoy `parallax` solo achica el desplazamiento, no la escala. Con el fondo a 1,3× en vez de 4× casi no habría píxeles nuevos que rasterizar, pero ya no se "entra" en el disparador.
- **Veredicto:** la intuición es correcta, pero la herramienta no es recortar, sino que la vista sea una textura que se escala. Eso hace `flatten`, y lo harían View Transitions o WebGL. Desde CSS quedan dos ajustes chicos.

### 3. Todo en WebGL

La transición se dibuja en un canvas WebGL, con cada vista como textura y el escalado, el blur y el oscurecido en shaders. El DOM real aparece solo en reposo.

- **Por qué ahora sí:** WebGL2 y OffscreenCanvas en workers están en los tres motores. Además, el plugin `stream` de SnapDOM ya trae `streamTexture(gl)`, que mantiene una textura al día subiendo solo los rectángulos que cambian (ver Hallazgos).
- **Gana:**
  - Blur casi gratis, con mipmaps o dos pasadas a baja resolución.
  - Profundidad real por nivel: blur, niebla, viñeta, inclinación.
  - Todas las vistas de atrás en una sola capa, con su DOM en `content-visibility: hidden`.
  - En un worker, el movimiento no depende del hilo principal.
  - Seguir el gesto es cambiar un número por cuadro.
- **No resuelve:**
  - Las texturas salen de SnapDOM (110-190 ms por vista en la Mac, hasta un segundo con CPU 4×). Es el mismo cuello de botella que `flatten`.
  - La vista que entra no tiene foto antes del clic. Animarla como DOM encima obliga a sincronizar dos relojes, y un cuadro de diferencia se ve como un salto. Arrancar desde el disparador de la foto de atrás muestra la miniatura al principio.
  - Lo que SnapDOM no fotografía (iframes, video) sigue aparte.
  - Hay que reconstruir si se pierde el contexto WebGL.
  - GSAP, anime y Motion no tienen lugar: sería un renderer, no un driver.
- **Lo cambiaría todo:** HTML-in-Canvas, con el que el navegador pone un elemento vivo del DOM en una textura. Está en origin trial en Chrome desde la 148 y no salió estable en ningún navegador.
- **Veredicto:** posible hoy, con el techo y el costo más altos. No como modo principal todavía. Sí como experimento acotado: solo el fondo, sobre las fotos de `flatten`, medido en una tablet floja o una Pi.
- **La regla que lo hace manejable:** WebGL solo mientras algo se mueve, DOM cuando está quieto. Así clics, foco, texto y accesibilidad siguen siendo del navegador. El DOM no es lento para pintar; lo que no tiene es una forma de decirle "esto ya está pintado, movelo como imagen", y WebGL da ese control.
- **Lo difícil ya no es escribirlo**, son los bordes: el cuadro en que se pasa de DOM a textura y de vuelta sin salto ni cambio de nitidez, el texto escalado, la pérdida de contexto, iframes y video, la memoria en una tablet. Eso se resuelve midiendo y mirando.

### 4. Preparar y después animar, con aviso

Al hacer clic, primero se prepara todo (la foto de la vista que entra, o sus texturas) y recién después se anima. Si tarda, el disparador muestra un anillo de progreso.

- **Por qué conviene:** un tirón en pleno movimiento se nota más que una espera corta antes de arrancar. iOS hace esto al abrir una app: anima una imagen de la app y recién al final pone la app viva.
- **Lo que destraba:** la vista que entra tiene foto antes de moverse, que era lo que faltaba. Se anima como foto y al final se funde con la vista real, como hoy vuelve la vista de atrás en el zoom-out. No hace falta WebGL para eso. También absorbe los 25 ms de ocultar (opción 6) y hace la opción 4 sin correr nada antes del clic. Si después se va a WebGL, es el momento de subir las texturas.
- **El aviso:** por debajo de 0,1 s se siente inmediato; hasta ~300 ms alcanza con que el disparador se vea apretado; más que eso, el anillo, y una vez que aparece, con un mínimo de duración para que no parpadee. Para un progreso real, SnapDOM tendría que avisar cuánto le falta; si no, un anillo indeterminado. Encaja con el botón de volver y los anillos de profundidad.
- **Solo para vistas pesadas**, con la misma regla que usa `flatten` (`minNodes`, `backdrop-filter`); las livianas arrancan al toque. El zoom-out no necesita preparación: la foto de la vista que vuelve ya existe y la de la que se va está al día con `stream`.
- **Costos:** la espera, porque una captura tarda 110-190 ms en la Mac y hasta un segundo con CPU 4×. Con vidrio tarda más, porque SnapDOM emula cada `backdrop-filter` por separado (opción 10); para la foto del movimiento se podría saltear el vidrio, porque la vista es chica y se mueve. Hay que poder cancelar con Escape o el gesto de volver (la opción `signal` de SnapDOM). Lo que cambie durante el movimiento aparece en el fundido final.
- **Cómo probarlo:** una variante `launch=1` en la demo, con el driver propio. Retrasa el movimiento hasta tener la foto, muestra el anillo si tarda, anima la foto y funde al final. Se mide el tiempo del clic al movimiento y los cuadros perdidos en el movimiento, y se mira a ojo.

### Cómo se conectan

- La 2 explica por qué anda `flatten`: lo caro es lo visible que cambia de escala.
- La 1 y la 3 atacan el mismo costo, el blur: con CSS y sin SnapDOM, o con shaders sobre las fotos.
- La 1 con la variante de la 2 da el fondo más barato posible: con el fondo quieto, el blur se calcula una sola vez. Pero cambia la identidad del zoom.
- Las ideas 1 a 3 no resuelven la vista que entra. La 4 sí, igual que las opciones 1, 2 y 4.

## Hallazgos

- `@zumer/snapdom-plugins` 4.4.0 trae `streamTexture(gl)` (`stream/src/webgl.js`): una textura WebGL que sigue a un stream y, en WebGL2, sube solo los rectángulos de cada parche. Es la pieza que le faltaba a la idea 3.
- La demo de la guía (`docs/guides/examples/heavy.html`) tiene 48 mosaicos con `backdrop-filter` en el tablero y 90 filas con `backdrop-filter` en `detail`. Las barras de navegación de Zumly (`.z-lateral-nav`, `.z-nav-back`) también son de vidrio.
- `transitions.parallax` solo achica el desplazamiento de las vistas de atrás, no su escala.
- La guía de vistas pesadas no menciona `deferred`.
- View Transitions:
  - de documento: Chrome 111+, Safari 18+, Firefox 144+;
  - con alcance de elemento: solo Chrome 147+ (no es Baseline);
  - grupos anidados: desde Chrome 140, sin Firefox ni Safari a octubre de 2025.

  El `filter` y la opacidad de la vista entran en su captura.
- HTML-in-Canvas: origin trial en Chrome desde la 148, extendido; en WebGL el método pasó a `texElementSubImage2D`. Sin versión estable en ningún navegador.

## Diagnóstico (28/10)

La demo de la guía con el motor local, en la MacBook Air M5 de Martin: dpr 2, pantalla de 60 Hz, ventana de 1280×800, CPU 1×. Dos corridas por variante, cada una con 3 zooms de ida y 3 de vuelta y 2 s de reposo en cada nivel.

- **Tal cual:** la demo como está en la guía, con un reloj.
- **En vivo:** suma valores que cambian cada segundo en los mosaicos y en las filas, y un contador grande.

Datos en `results/step0.json` y `results/step0.log`.

Cuadros perdidos en las dos corridas y en las dos condiciones, y cuánto estuvo ocupado el hilo principal de la GPU durante el zoom-in (tal cual / en vivo). Las variantes sin aclarar llevan `flatten`.

| Variante | Zoom-in | Zoom-out | Reposo en `detail`, en vivo | GPU en el zoom-in |
|---|---|---|---|---|
| Sin `flatten` | 0 % | 0-15 % | 0 % | 66 / 66 % |
| `flatten` (1.1.0) | 0 % | 0-6,5 % | 20-30 % | 56 / 62 % |
| Sin `flatten`, blur de golpe | 0 % | 0-1 % | 0 % | 64 / 67 % |
| Marca de movimiento | 0 % | 0-2 % | 17-27 % | 17 / 20 % |
| `will-change` justo | 0-0,5 % | 0-1 % | 17-21 % | 56 / 70 % |
| Sin `perspective` | 0-4 % | 0-1 % | 18-20 % | 59 / 81 % |
| Sin `flatten`, `will-change` sostenido | 0 % | 8-12 % | 0 % | 63 / 63 % |
| Sin `flatten`, capa de vidrio | 0 % | 0 % | 0 % | 63 / 65 % |
| Capa de vidrio con `flatten` | 0 % | 0 % | 21-24 % | 50 / 63 % |

La primera corrida de todas arrancó con el navegador en frío (caches y shaders vacíos): 14,5 % en el zoom-in, 11 % en el zoom-out y 4 tirones. Quedó afuera de la tabla. Desde entonces `measure.mjs` hace una ronda de calentamiento sin medir.

Lo que dice:

1. **El movimiento ya es fluido con `flatten`.** En esta Mac, a 60 Hz, la demo tal cual da 0 % en el zoom-in, 0,5 % en el zoom-out y 0 % en reposo.
2. **Lo que más se pierde ahora es el reposo con `flatten` y datos en vivo:** 20-30 % en `detail`, contra 0 % sin `flatten`. Es el stream siguiendo 90 vidrios cuyos valores cambian: el hilo principal pasa de 2 % a 14 % ocupado, en tareas largas. Además, esa foto casi no se usa: `detail` no tiene disparadores, así que nunca queda atrás, salvo en el lateral.
3. **La GPU tiene poco margen.** Trabaja 50-65 % de cada cuadro durante el zoom, y casi todo es el vidrio de la vista que se mueve: con la marca de movimiento baja a 17-20 %. A 60 Hz en esta Mac alcanza; en una tablet o una pantalla de 120 Hz no alcanzaría.
4. **Sin `flatten`, el zoom-out pierde hasta 15 %** por animar el filtro de la vista que vuelve, que está viva y tiene 48 vidrios. Con el blur de golpe o con la capa de vidrio baja a 0-1 %, sin SnapDOM.
5. **La capa de vidrio (idea 1) no bajó la GPU, pero dejó el zoom-out en 0 % en todas las corridas,** con el blur que aparece de a poco. Lo que ahorra es animar el filtro, no pasadas de blur.
6. **Descartadas:**
   - `will-change` sostenido: el zoom-out sigue en 8-12 %.
   - Sacar `perspective`: en vivo empeora, con 4 % en el zoom-in y hasta 81 % de GPU. Con perspectiva, Chrome parece rasterizar menos.
   - `will-change` justo: no cambia nada visible a 60 Hz.
7. **La primera transición en frío se traba,** y es lo que ve quien entra por primera vez a la guía. Ninguna variante lo toca. Es una sola muestra.

## El zoom-out (28/10)

Martin miró la demo a mano y lo que más nota es el zoom-out. El conteo de cuadros no lo veía, porque el problema es una espera sin cuadros nuevos, no cuadros perdidos. Se vio con [`film.mjs`](film.mjs), que arma tiras con las capturas del trace, cuadro por cuadro (`results/film/`).

- **Bug del driver CSS: el zoom-out termina siempre por el temporizador de seguridad.** En la corrida grande, los 108 zoom-in duraron 995-1063 ms (mediana 1013) y los 108 zoom-out, 1151-1155 ms.
  - La causa: el zoom-out espera `animationend` con los nombres de las clases (`zoom-current-view-reverse`…), pero esas clases usan los keyframes `zoom-current-view`…, y el evento trae el nombre del keyframe ([css-transition.js:251](../../src/drivers/css-transition.js#L251), [style.css:137](../../src/style.css#L137)). Descarta todos los eventos.
  - Entró el 26/07 con `9891bf5` y está en todas las versiones desde la 0.92.6 hasta la 1.1.0.
- **Lo que se ve:** el movimiento termina, la vista achicada queda quieta sobre su disparador unos 150 ms y después desaparece de golpe. Pasa con y sin `flatten`, en cualquier vista, pesada o no.
- **Con `flatten` se suma un destello.** Al volver, la foto se funde con el tablero real durante 160 ms. Como el tablero es translúcido, durante el fundido se ven las dos capas a la vez, y el primer cuadro cambia mucho: 13,5-15,1 de diferencia media con el anterior, contra 3,5 sin `flatten`. Terminado el fundido, el tablero queda igual que antes del zoom (diferencia 0,2-0,5).
- **El final del zoom-out en sí:** con `hideTrigger: false`, que es el valor por defecto, la vista achicada termina encima de su disparador y se saca de una vez. Aun sin la espera, es un cambio brusco. Con `hideTrigger: 'fade'`, las dos se funden.

Arreglos:

1. En el zoom-out del driver CSS, esperar los nombres de los keyframes. Es una línea, con un test que compruebe que el zoom-out termina por `animationend`. `measure.mjs` ahora muestra la duración de cada transición, para verificarlo.
2. Decidir cómo termina el zoom-out: fundir la vista achicada con su disparador en el último tramo.
3. En `flatten`, probar en labs alternativas al fundido para vistas translúcidas: un cambio seco cuando la foto está al día, o fundir solo si la vista es opaca.

## El trace de Martin (DevTools, 28/10)

Martin grabó la demo de la guía con el panel Performance de DevTools: 23 s, tres zoom-in y tres zoom-out, con `flatten` y `stream` de esm.sh, la versión publicada. Se analizó con las capturas que trae el trace (384).

- **Cuadros:** 806 vsyncs y solo 5 perdidos. Lo que se ve mal no son cuadros perdidos.
- **El zoom-out confirma el bug.** En los tres, la pantalla queda quieta al terminar la animación y a los +147, +162 y +161 ms la vista achicada desaparece de golpe. En sus capturas, a +51 ms la tablita de `detail` todavía está sobre "Sensor 25" y a +162 ms ya no. Los zoom-in terminan continuos.
- **Tareas largas al volver al tablero:** ~1,3 s después de cada zoom-out hay cuatro tareas de 80-145 ms seguidas (~480 ms). Es el stream de SnapDOM arrancando sobre el tablero: parseo de un documento (35 ms), recálculo de estilos (48 ms) y su JS. Un clic en ese momento espera. Después de cada zoom-in a `detail` había otra de 64 ms; esa ya no pasa con el arreglo de abajo, porque `detail` no tiene disparadores.
- **El blur de los efectos no corre en el compositor** (`compositeFailed: 4096`; la causa más probable es que el blur mueve píxeles). Chrome lo anima desde el hilo principal en cada cuadro. Acá el hilo principal estaba ocupado ~4 % durante el zoom y no se notó. Con carga, el blur se trabaría mientras las transformaciones siguen fluidas. Suma a favor de la capa de vidrio (idea 1) y de la foto ya desenfocada (opción 7), que animan opacidad, y la opacidad sí corre en el compositor.

## Cambios en el motor (28/10, sin commitear)

La lista base, hecha salvo el parche:

1. **Driver CSS:** el zoom-out espera los nombres de los keyframes ([css-transition.js](../../src/drivers/css-transition.js)). Test en `css-driver-safety.test.js`.
2. **El final del zoom-out:** la vista se funde con su disparador en el último tercio del movimiento. Lo hace el motor animando solo `opacity`, así que anda con cualquier driver, en `zoomOut(n)` (con las vistas que acompañan) y al soltar un gesto. Con `hideTrigger: 'fade'` no se suma, porque ese modo ya funde todo el zoom-out. Tests en `zoomout-fade.test.js` y `gesture-follow.test.js`.
3. **`flatten` en reposo:** no fotografía ni sigue una vista sin disparadores; si después aparece uno, la sigue desde ahí. Es lo que sacaba el 20-30 % en reposo en `detail`.
   - El freno por tareas largas quedó afuera: en una vista con disparadores, apagar el stream le saca la foto justo cuando hace falta. En el banco de vidrio, el zoom pasaba de 6,1 % a 52,4 % de cuadros perdidos. Ese costo se ataca mejor en SnapDOM (opciones 10 y 9).
4. **Destello de `flatten` al volver:** el fundido de la foto queda solo para vistas con fondo opaco; una translúcida cambia de una vez.
6. **Driver `waapi`:** el zoom-out arranca en el próximo cuadro, sin los dos de espera.
7. **`zoomOut(n)`:** las vistas que acompañan llevan `will-change: transform` mientras se mueven, así Chrome no las vuelve a rasterizar cada cuadro.
8. **Guía de vistas pesadas, API y `llms-full.txt`:** `deferred`, drivers `css`/`waapi`, el blur que no corre en el compositor, y las reglas nuevas de `flatten` y del zoom-out.

9. **El foco al volver de una foto.** El motor movía el foco a la vista que vuelve cuando todavía era foto. Su contenido está oculto y no se puede enfocar, así que enfocaba la vista entera con `tabindex="-1"`.
   - Con el anillo de foco visible (teclado, o en automatización), SnapDOM le pone a la raíz un borde transparente durante cada captura (`stabilizeLayout`).
   - El stream de SnapDOM ve ese cambio en la raíz, que no tiene caja opaca, y hace un cuadro completo. Ese cuadro vuelve a poner el borde: un bucle que sigue hasta que `flatten` lo apaga.
   - En el lab, el tablero volvía vivo una visita sí y otra no.
   - Ahora la vista recupera su contenido antes de recibir el foco. La otra mitad, que el stream no reaccione a sus propios cambios, va en SnapDOM.

Pendiente el 5: publicar el parche y pasar Pulse a esa versión. Es decisión de Martin.

### Verificación

Dos corridas por variante, dpr 2 ([`results/after-base.log`](results/after-base.log)):

- **La demo tal cual, con `flatten`:** 0 % de cuadros perdidos en el zoom-in, el zoom-out, la cola y el reposo, sin tirones. El zoom-out dura lo que su animación (~1010 ms).
- **En vivo, con `flatten`:**
  - el reposo en `detail` queda en 0 % (antes 20-30 %);
  - el zoom-out pierde 1-9,5 %. Con valores que cambian sobre mosaicos translúcidos, el stream a veces se apaga por costo y el tablero vuelve vivo. Eso se arregla en SnapDOM.
- **Sin `flatten`:** el zoom-out pierde 10-17 % (el blur animado del tablero vivo).
- **Capa de vidrio sin SnapDOM:** 0 % en todo.
- **Al final del zoom-out** ya no hay pausa ni salto: la vista se funde con su mosaico. Con `flatten`, el cambio de foto a tablero real baja de 13,5-15,1 a 7,7. Lo que queda es que el vidrio de la foto no ve el degradado de la página, que está detrás del tablero.
- **Tests:** suite completa en Chromium, 536 OK. Los archivos tocados en Firefox y WebKit pasan, salvo los 22 de `new Touch()` que ya fallaban.

## Chrome real, con el MCP (28/10, tarde)

Traces de la demo del lab con el motor local, grabados con el MCP de chrome-devtools en Chrome 156 estable, con la secuencia de `trace.mjs`: 3 zoom-in y 3 zoom-out, 2,5 s entre cada uno. La página queda en 1280×699 porque la pantalla no da para 800 de alto. Los clics son eventos sintéticos dentro de la página.

Se leen con [`read-trace.mjs`](read-trace.mjs). No necesita las marcas de la demo, así que también lee el trace de la guía publicada. Para cada zoom da: la espera desde que se suelta el clic, los cuadros perdidos, el salto más grande en las capturas después del final, el trabajo del hilo principal y de la GPU durante el movimiento, y las tareas largas de después.

| | 1.1.0 publicada (Playwright) | Local, Chrome en frío | Local, Chrome caliente |
|---|---|---|---|
| Zoom-in: cuadros perdidos | 0,5 % | 9,8 % (racha de 6) | 0 % |
| Zoom-in: GPU durante el movimiento | 30 % | 31 % | 31 % |
| Zoom-out: cuadros perdidos | 5,9 % (racha de 11) | 0,5 % | 0 % |
| Zoom-out: salto después del final | 14,5 a +146 ms | 5,2 a +27 ms | 5,2 a +31 ms |
| Zoom-out: hilo principal durante el movimiento | 3 % | 2 % | 2 % (22 ms en 1 s) |
| Zoom-out: tareas largas después (suma) | 231 ms | 249 ms | 259 ms |

Lo que dice:

1. **El arreglo del zoom-out se ve en Chrome real.** Ya no está el salto a +146 ms. Queda el cambio de foto a tablero real a +30 ms, que es el del tablero translúcido.
2. **La primera vez, en frío, el primer zoom-in se traba:** 18 cuadros perdidos, un hueco de 123 ms. El primer zoom-out tiene uno de 100 ms. Es la GPU: tareas de 88-134 ms en `CrGpuMain`, con el hilo principal libre. Después de esa vez, 0. Es el experimento 5 (la primera transición en frío). El trace del MCP no trae las categorías internas de la GPU, así que no se ve qué compila.
3. **Las tareas largas después del zoom-out siguen:** dos o tres de 50-190 ms, entre 380 y 550 ms después del final. Es el stream de SnapDOM que arranca sobre el tablero: recálculo de estilos (47-77 ms), parseo del SVG (35-38 ms) y su JS. No caen durante el movimiento, pero un clic en ese momento espera. Se arregla en SnapDOM.
4. En caliente, Chrome estable y el Chromium de Playwright dan lo mismo.

Traces en `results/traces/` (`mcp-local`, `mcp-local-warm`, `mcp-launch-ng`, `mcp-launch`), y la comparación en `compare.json`.

## Experimento 1: preparar y después animar (28/10, tarde)

`launch=1` en la demo, sin tocar `src/`. Antes de mover un zoom-in, el driver de la demo:

- muestra el disparador apretado, y un anillo que gira si la espera pasa de 300 ms (una vez visible, queda 400 ms como mínimo);
- frena el desenfoque del tablero, que el motor arranca antes de llamar al driver, para que corra junto con el movimiento;
- saca la foto de la vista que entra con SnapDOM, fuera de pantalla y a escala 1;
- pone la foto en lugar del contenido, como hace `flatten` con las vistas de atrás, y recién entonces llama al driver real;
- al terminar el movimiento saca la foto y queda la vista real.

`glass=0` saca la foto sin `backdrop-filter`.

Medido con `measure.mjs` (Playwright, 1280×800, dpr 2, mediana de dos corridas; [`results/launch.log`](results/launch.log) y [`results/launch-cpu4.log`](results/launch-cpu4.log)):

| | Sin `launch` | `launch`, sin vidrio | `launch`, con vidrio |
|---|---|---|---|
| Del clic al movimiento | 13 ms | 49 ms | 128 ms |
| Ídem, CPU 4× | 15 ms | 85 ms | 714 ms, con anillo |
| GPU en el zoom-in, tal cual | 39 % | 11 % | 13 % |
| GPU en el zoom-in, en vivo | 63 % | 41 % | 41 % |
| GPU en el zoom-in, CPU 4× | 30 % | 2 % | 17 % |
| Cuadros perdidos en el zoom-in | 0-0,5 % | 0,5-1 % | 0 % |

En Chrome real (MCP, caliente) da lo mismo: GPU de 31 % a 3 %, 41 ms de espera sin vidrio y 158 ms con vidrio, 0 cuadros perdidos. En mitad del movimiento las capturas se ven iguales con y sin `launch`, desenfoque del tablero incluido.

Lo que dice:

1. **El vidrio de la vista que entra era casi toda la GPU del zoom-in.** Con la foto baja de 39 % a 11 %, y a 2 % con CPU 4×. En esta Mac, a 60 Hz, ya no se perdían cuadros, así que no cambia el conteo: lo que gana es margen para una tablet o una pantalla de 120 Hz. En vivo queda en 41 %; lo más probable es el tablero, que con datos en vivo a veces vuelve vivo porque el stream se apaga por costo. Eso no lo toca (sin medir).
2. **Sin vidrio, la espera queda debajo de los 100 ms** que se sienten inmediatos: 25-60 ms de foto, 85 ms con CPU 4×, y el anillo no aparece. Con vidrio, SnapDOM emula cada `backdrop-filter` por separado (opción 10): 110-170 ms en la Mac y 450-560 ms con CPU 4×. Además, con vidrio y CPU 4× el reposo en el tablero pierde 50 % de cuadros. No lo expliqué; alcanza para descartar el vidrio en la foto del movimiento.
3. **La foto sin vidrio se parece más a la vista real que la que emula el vidrio:** diferencia de 1,8 contra 2,2 en una captura quieta, porque en `detail` las filas están sobre un fondo casi liso. El cambio de foto a vista real al final no se nota (1,3 contra 1,6 sin `launch`).
4. **El costo es la espera:** 36 ms más en la Mac y 70 ms más con CPU 4×.

Dos trampas que salieron:

- **El motor entrega la vista nueva con `.hide` (`opacity: 0`)** hasta que el driver la muestra. SnapDOM copia esa opacidad a la raíz y la foto sale transparente. La primera medición dio 3 % de GPU con una caja vacía moviéndose: lo mostraron las capturas del trace, no los números.
- **El canvas de SnapDOM trae un margen alrededor de la caja:** 1 px por lado, 3 px si la raíz tiene `transform`. Encajado en la caja, la foto queda 1 % más chica y corrida (diferencia de 14,0 contra 1,8 con la vista real). **`flatten.js` tiene lo mismo:** la foto del tablero mide 1282×616 para una caja de 1280×614, y [`_flat`](../../src/flatten.js#L400) la encaja en la caja. Puede ser parte del cambio de 5,2 al volver al tablero. Queda para `src/`.

### Al volver (`out=1`)

Martin preguntó si se hizo lo mismo al revés: nada pesado durante el movimiento, todo antes o después.

Sin `out`, el zoom-out ya no procesa casi nada durante el movimiento: el hilo principal trabaja 22 ms en 1 s, y del clic al movimiento pasan 3 ms. Lo pesado viene después: el stream que arranca sobre el tablero, de 380 a 550 ms después del final (ver Chrome real). Lo que sí trabajaba durante el movimiento era la GPU, con 33-40 %: `detail` se achica viva, con sus 90 vidrios.

`out=1` hace en el zoom-out lo mismo que `launch` en el zoom-in: saca la foto de la vista que se va, donde está, y achica la foto. Frena el fundido con el disparador, que el motor arranca antes de llamar al driver, para que corra con el movimiento. La vista se saca al final, con foto y todo. Medido contra `launch=1&glass=0` ([`results/launch-out.log`](results/launch-out.log), y un trace en Chrome real):

| Zoom-out | Sin foto | Con foto |
|---|---|---|
| GPU, tal cual | 39,5 % | 11,5 % |
| GPU, en vivo | 66,5 % | 48,5 % |
| GPU en Chrome real | 33 % | 3 % |
| Cuadros perdidos, en vivo | 4,3 % (un tirón por corrida) | 0 % |
| Del clic al primer cuadro | 5-9 ms | 59-70 ms |
| Tareas largas después | 249 ms | 242 ms |

Lo mismo que en el zoom-in: la GPU baja a un cuarto, a cambio de unos 40 ms antes de arrancar. En vivo, los cuadros perdidos del zoom-out pasaron de 4,3 % a 0 % en las dos corridas. Las tareas largas de después no cambian: son del stream del tablero, y se arreglan en SnapDOM.

Mientras se saca la foto (~40 ms) la vista que se va está quieta y sin vidrio, porque `glass=0` lo apaga en la vista real. En `detail` no se nota; en una vista con vidrio sobre algo con más contraste podría notarse.

Falta: cancelar con Escape durante la espera, mirarlo a ojo con datos en vivo (lo que cambia durante el movimiento aparece de golpe al final) y probarlo con una vista que tarde en armarse.

## Experimento 7: todo en WebGL (28/10, noche, rama `dev`)

`gl=1` en la demo. El renderer empezó en `labs/heavy-views/gl.js`; desde el 28/10 está en el motor, en [`src/webgl.js`](../../src/webgl.js) (opción `webgl`, ver más abajo). Es la idea 3 completa, no solo el fondo: el experimento 1 resolvió lo que la frenaba, que la vista que entra no tenía foto antes de moverse.

- Un canvas WebGL2 vive dentro del lienzo de Zumly, debajo de las vistas.
- Mientras hay movimiento, cada vista es una textura en ese canvas. Las vistas del DOM quedan en `opacity: 0` y siguen respondiendo clics. La geometría es la del motor: las mismas matrices que interpolan los drivers de anime y Motion, alrededor del `transform-origin` de cada vista.
- En reposo, la vista de atrás sigue siendo textura, con el desenfoque y el brillo en el shader en vez de un `filter` de CSS. Solo la vista actual es DOM.
- La textura del tablero la mantiene al día `streamTexture`, del plugin `stream` de SnapDOM, con los cuadros del stream de `flatten`: sube solo los rectángulos que cambian. La vista que entra, o la que se va en un zoom-out, es una foto sin vidrio sacada antes del movimiento, como en el experimento 1.
- El desenfoque es un gaussiano en dos pasadas, sobre el nivel de mip donde σ queda en 2 texels y nunca a tamaño completo. En el mismo recorte, la diferencia media con el `blur()` de CSS es de 0,3 sobre 255.

Medido con `measure.mjs` (mediana de dos corridas, dpr 2). Los números de WebGL son de [`results/gl-3.log`](results/gl-3.log), después del arreglo del blur al final del zoom-in (abajo). Los de antes están en [`results/gl.log`](results/gl.log) y [`results/gl-2.log`](results/gl-2.log):

| | `flatten` | Experimento 1, sin vidrio, ida y vuelta | WebGL |
|---|---|---|---|
| GPU en el zoom-in, tal cual | 42,5 % | 11 % | 5,5 % |
| GPU en el zoom-out, tal cual | 44,5 % | 12 % | 6,5 % |
| GPU en el zoom-in, en vivo | 64,5 % | 41 % | 5 % |
| GPU en el zoom-out, en vivo | 64 % | 48,5 % | 6,5 % |
| Compositor (viz), en vivo | 17-18,5 % | 7-11 % | 1,5 % |
| Del clic al movimiento, tal cual | 13,5 ms | 47 ms | 45,5 ms |
| Del clic al movimiento, en vivo | 6,5 ms | 43 ms | 149 ms |
| Del clic al movimiento, zoom-out, en vivo | 11,5 ms | 57,5 ms | 58 ms |
| Cuadros perdidos, zoom-in / zoom-out, tal cual | 0,3 / 0 % | 0,5 / 0,8 % | 0,5 / 0,8 % |
| Cuadros perdidos, zoom-in / zoom-out, en vivo | 0 / 5,3 % | 0,8 / 0,3 % | 0,3 / 0,8 % |

**El blur volvía a empezar al final del zoom-in** (lo vio Martin a ojo). Si `flatten` no tenía foto del tablero, la vista volvía al DOM un cuadro después del final, y la transición del `filter` del motor arrancaba otra vez de cero: un segundo entero de 0 a 3 px. Pasaba en el primer zoom de cada carga, porque el stream del tablero se apaga en la primera visita por el reloj (`no host`), y en vivo, en todos. Ahora el tablero queda en WebGL con la foto que el zoom le sacó al irse atrás, hasta que vuelve al frente. Y cuando una vista vuelve al DOM, por ejemplo antes de un zoom lateral, su efecto aparece donde estaba, sin transición. De paso, el zoom-out en vivo ya no tiene que fotografiar el tablero: arranca en 58 ms en vez de 141, y su GPU baja del 14 % al 6,5 %.

**Lo que esconde el `overflow` de la vista de atrás** (también lo vio Martin a ojo). En la demo, la última fila del tablero no entra: el tablero mide lo mismo que el lienzo (715 px), su contenido 824, y tiene `overflow: hidden`. Al hacer zoom en una tarjeta de esa fila, el tablero crece con su borde, y las tarjetas de al lado quedan cortadas por una línea recta en medio de la pantalla. En el DOM pasa lo mismo, con WebGL o sin él: el navegador no dibuja lo que una vista recorta. Con WebGL, en cambio, la textura puede ser más grande que la vista:
- Al preparar un zoom-in, si el zoom va a mostrar algo de lo que el `overflow` esconde, la vista se agranda un momento hasta que entre todo su contenido, y SnapDOM fotografía solo las franjas que quedan fuera (`clip`). Con la vista al frente esas franjas caen fuera del lienzo, así que agrandarla no se ve.
- Las franjas y la textura de la vista se juntan en la GPU en una sola textura, que es la que se desenfoca: no queda costura.
- Las franjas solo se toman cuando el zoom las muestra. Como la escala y la posición se interpolan de forma pareja, alcanza con mirar dónde termina la vista. Zoom en Sensor 4: nada, 44 ms hasta arrancar. En Sensor 39 o 46: unos 55 ms más (35 en vivo, sin vidrio).
- Solo vistas que scrollean, o que lo piden con `data-gl-overflow` (el tablero de la demo). Con `overflow: hidden` alguien puede estar escondiendo algo a propósito, como un menú fuera del lienzo.
- La vuelta queda igual que antes de entrar. Antes y después del zoom, el tablero difiere solo en el reloj y en el anillo de foco que pone el motor.

**Hermanos en WebGL.** Un zoom lateral ya no vuelve al DOM: la vista que entra se fotografía fuera de pantalla, como en un zoom-in, y la que sale se toma de su stream (o se fotografía donde está). Las de atrás se mueven como texturas, con su efecto quieto. Es el mismo movimiento de los drivers: la que entra se desliza y aparece, la que sale se desliza y se va, el tablero se corre hasta la tarjeta nueva. Preparar un lateral toma ~40 ms. Dos casos siguen en el driver real, con todo en el DOM: `keepAlive: 'visible'`, donde la vista que sale queda en su lugar por encima de todo, y cuando falta la textura de una vista de atrás. Un lateral puede llevar el tablero a una zona que el zoom-in no mostró, por ejemplo de Sensor 25 a Sensor 46. Primero lo resolví en el zoom-in, fotografiando también las franjas a las que puede llevar cualquier hermano, pero así cada zoom-in desde el tablero tardaba 55 ms más en arrancar (de 45 a 108 ms), porque Sensor 46 es hermano de todos. Ahora las fotografía el lateral que llega ahí: el tablero, que está atrás y oculto, sale de la pantalla a su tamaño, se muestra a SnapDOM y vuelve. WebGL lo sigue dibujando en su lugar, y en ningún cuadro ni cambio de estilo se ve en el DOM. Ese lateral tarda ~55 ms más en arrancar; los que vuelven a una zona ya fotografiada, no.

**Efectos en el shader.** La cadena de efectos del motor (`transitions.effects`, sintaxis de `filter`) ahora se lee función por función, y cada una es un paso del shader con su valor animado durante el zoom. Vienen las de CSS, con las fórmulas de CSS: `blur`, `brightness`, `contrast`, `saturate`, `grayscale`, `sepia`, `invert`, `opacity`, `hue-rotate`. Una nueva son unas líneas de GLSL que se le pasan por nombre (`webgl.effects`; los de CSS están en `EFFECTS`, en [`src/webgl.js`](../../src/webgl.js)): pueden mover el punto que se lee de la vista (`uv`) o cambiar su color (`color`), y releer la textura alrededor. La demo trae tres que solo dibuja WebGL, `pixelate`, `chroma` y `vignette`, y cuatro looks para elegir con `look=`: `css`, `mono`, `pixel` y `lens`. Un efecto en su valor neutro cuesta una comparación por píxel. Un error en el GLSL de uno nuevo deja solo los de CSS, no la página sin WebGL. Medido ([`results/gl-4.log`](results/gl-4.log), hermanos y efectos ya adentro): la GPU queda en 5,5-6 % en el zoom-in y 7-7,5 % en el zoom-out tal cual (6,5-7 y 7,5-8 en vivo), un punto más que en `gl-3`; el look `lens`, que lee la textura tres veces por píxel, cuesta lo mismo que el blur. Del clic al movimiento: 52-56 ms tal cual y 155-163 en vivo. Sin cuadros perdidos al final de ningún zoom.

Un efecto también sabe dónde está el disparador de la vista (`focus`, `focusSize`) y cuánto avanzó el zoom (`progress`, de 0 a 1; en reposo, 1). Con eso, la demo trae `rubber` (`look=rubber`, "goma"): el tablero es de goma. El disparador queda pegado a la vista que sale de él y el resto se atrasa en el zoom, más cuanto más lejos, estirado entre los dos. Pasada la mitad, la goma se suelta: el tablero lo alcanza, se pasa y se acomoda con un rebote. En reposo queda plano, así que el paso al DOM no salta. Son seis líneas de GLSL. Primero lo hice al revés, inflando el tablero alrededor del disparador, pero así la tarjeta crecía más que la vista que salía de ella y su borde se veía alrededor. Con el motor sin WebGL, esa cadena va al `filter` de CSS. Una función que CSS no conoce la invalida entera y la vista queda sin efecto, pero en esta demo eso ya no pasa: todo lo que se mueve pasa por WebGL.

El cambio de WebGL al DOM al final no se nota más que el de la foto a la vista real ([`film.mjs`](film.mjs)): 1,3 contra 1,1 en el zoom-in y 3,5 contra 3,2 en el zoom-out.

Lo que dice:

1. **Donde más gana es en vivo.** Con datos que cambian, el experimento 1 queda en 41-48 % de GPU, porque el tablero se queda sin foto y se mueve como DOM, con su vidrio y su filtro. WebGL lo mueve como textura: 5 % en el zoom-in y 6,5 % en el zoom-out.
2. **Tal cual, baja un poco más que el experimento 1** (de 11 % a 5,5 % y de 12 % a 6,5 %), y el compositor trabaja la cuarta parte.
3. **El costo es la misma espera del experimento 1:** ~45 ms para la foto de la vista que entra. En vivo, el zoom-in sube a 150 ms, porque además hay que fotografiar el tablero (ver la última trampa). El zoom-out usa esa misma foto y arranca en 58 ms.
4. **Pierde un cuadro suelto por zoom:** casi siempre el primero del zoom-in o el último del zoom-out, cuando el tablero vuelve a ser DOM. Ningún tirón, tampoco en vivo, desde el arreglo del blur.

Trampas:

- **El vidrio de la navegación de Zumly sobre WebGL.** El botón de volver, las bandas de profundidad y la barra de hermanos tienen `backdrop-filter`. Sobre un canvas WebGL que cambia en cada cuadro, la GPU espera a que ese canvas termine, también en cada cuadro (`WaitForCommandsToBeScheduled` en el trace). Con ese vidrio, el zoom-out costaba 21 % de GPU; sin él, 7 %. En la demo, mientras WebGL mueve las vistas, la navegación pierde el desenfoque y toma un fondo más opaco. `navglass=0` lo apaga siempre, para comparar. Si WebGL va al motor, esto va con él.
- **El blur a tamaño completo.** Con σ chico, las pasadas corrían sobre 2564×1274 y el zoom-out costaba 28 %. Ahora nunca bajan del nivel 1.
- **Ocultar el contenido con `visibility`, como hace `flatten`, rompe el stream del tablero.** Al volver, el stream ve cambiar la raíz del tablero, no tiene dónde repintar, hace cuadros completos y `flatten` lo apaga; WebGL tiene que fotografiar el tablero antes de cada zoom (147 ms). No encontré por qué. Se descartó: queda `opacity: 0`.
- **SnapDOM rompe un contenedor grid scrolleado.** Con el tablero scrolleado (`scrollTop` 60), una captura común de SnapDOM 3.5.0, y también su stream, sale con las tarjetas en una sola columna y sin el scroll. Parece que corre el contenido metiéndolo en un `div`, que pasa a ser el único elemento de la grilla. Pasa también sin WebGL: con `flatten`, el tablero de atrás queda mal y en el zoom-in no se ve. Las franjas de arriba no tienen el problema, porque se sacan con la vista agrandada y el scroll en 0. Arreglado en SnapDOM el mismo día (`cb77f4b`, sale en 3.6.1; ya está como `3.6.1-dev.0` con el tag `dev`): el contenedor que envuelve los hijos toma el layout del grid o el flex. Probado contra esta escena con el `dist/` local, sirviéndolo con una ruta de Playwright: captura, `fast` y stream salen bien, y con `flatten` el tablero scrolleado vuelve a verse detrás. Zumly sigue en 3.5.0 hasta subir la dependencia.
- **En vivo, el stream del tablero se apaga desde la segunda visita, con WebGL o sin él.** Los valores cambian dentro de tarjetas con `backdrop-filter`. El stream no encuentra dónde repintarlos (`no host for <span.v>`), hace un cuadro completo de 320-420 ms y `flatten` lo apaga. Es el pendiente de SnapDOM con el vidrio y los gradientes. Con WebGL hay que fotografiar el tablero antes de cada zoom-in (~100 ms). Antes del arreglo del blur costaba otra foto más en el zoom-out, y el tablero se ocultaba recién al arrancar: de ahí salían el 15 % de GPU y el tirón. Ahora queda oculto desde el final del zoom-in.

Falta:

- Mirarlo a ojo otra vez: el arreglo del blur, el `overflow`, los hermanos y los looks. Martin lo vio muy fluido.
- `overflow`: una barra de scroll clásica (no superpuesta) cambia el ancho al agrandar la vista; un borde en la vista quedaría dibujado entre la vista y las franjas; con `lastView` (más de dos niveles) no se agranda; si un hermano tiene otro tamaño, el lateral cambia la escala y las franjas calculadas pueden no alcanzar.
- Efectos: uno que cambia con el tiempo (`time`) solo se anima mientras algo se mueve, porque en reposo WebGL no redibuja. Hace falta un bucle mientras haya uno en pantalla, y cuesta GPU. También faltan efectos con más de un valor (un color, por ejemplo).
- Más de dos niveles (`lastView`): el código lo contempla, pero no está probado, porque la demo tiene dos.
- Gestos (seguir el dedo), pérdida de contexto (hoy vuelve al DOM y no se recupera) y redimensionar en medio de un zoom.
- Mantener la vista actual en una textura con stream, para que el zoom-out arranque sin foto.
- Medir con CPU 4× y en Chrome real.

## WebGL en el motor (28/10, noche, `dev`)

Martin: "terminar todo lo de WebGL y pasarlo a `src` en `dev`". El renderer pasó de la demo a [`src/webgl.js`](../../src/webgl.js), detrás de una opción nueva:

```js
new Zumly({ ..., flatten: { snapdom, stream }, webgl: true })            // o { effects, glass }
```

- **Necesita `flatten`.** Usa su SnapDOM para las fotos, y cada cuadro de su stream actualiza la textura de la vista. `streamTexture` está escrito adentro, así que no suma dependencias. Sin WebGL2, las vistas quedan en el DOM, como antes.
- **Cada navegación pasa por WebGL:** zoom-in, zoom-out y hermanos. Mientras se sacan las texturas, el disparador se ve apretado, y si tarda más de 300 ms aparece un anillo (lo del experimento 1, ahora en el motor). Lo demás va al driver, con las vistas devueltas al DOM: una transición sin animación (movimiento reducido), `keepAlive: 'visible'` o una textura que no se pudo sacar.
- **Gestos:** en un zoom-out que sigue la rueda, el swipe o el pinch, la vista bajo el dedo sigue en el DOM (como antes, con WAAPI), y WebGL mueve las de atrás con el mismo progreso, el mismo largo y la misma curva al soltar. Probado yendo hasta el final y volviendo.
- **El zoom-out sin foto, probado y descartado.** Con `webgl`, `flatten` seguía con stream también a las vistas sin disparadores, y el zoom-out salía de esa textura: arrancaba en 8-11 ms en vez de ~50. Pero con datos en vivo ese stream cuesta en reposo: 16,7 % de cuadros perdidos sobre el detalle, contra 0. Una foto de 25-45 ms en el momento del zoom-out sale más barata que seguir todo el tiempo una vista que cambia. Las vistas que `flatten` ya sigue (pesadas, con disparadores) siguen arrancando sin foto.
- **Tres niveles:** probado tablero → detalle → lectura y vuelta (`levels=3` en la demo). Había un error: el efecto de la vista que pasa de previa a última (de 3 a 8 px) saltaba de golpe, porque el motor ya había escrito el efecto nuevo. Ahora arranca del último efecto con que se dibujó en reposo.
- **Contexto perdido:** las vistas vuelven al DOM; cuando vuelve el contexto, WebGL rearma programas y texturas y vuelve a fotografiar las vistas de atrás.
- **Redimensionar:** en reposo, una vista cuya foto ya no entra vuelve al DOM, y cuando el tamaño se queda quieto se fotografía de nuevo donde está, sin su efecto y a su tamaño. Probado redimensionando a mitad de un zoom-in y de un zoom-out.
- **Efectos:** aceptan hasta cuatro números, y un color `#hex` cuenta como tres (`tint(#ff0066 .5)`). `animate: true` sigue redibujando mientras uno de esos efectos esté en pantalla: la demo trae `ripple`, que ondula el tablero de atrás todo el tiempo (look `liquid`), y deja de dibujar cuando el tablero vuelve al frente.
- **Medido en el motor** (mediana de dos corridas, dpr 2). `flatten` en el DOM sale de [`results/gl-src-chrome.log`](results/gl-src-chrome.log) y [`results/gl-src-cpu4.log`](results/gl-src-cpu4.log); WebGL, de [`results/gl-src-chrome-2.log`](results/gl-src-chrome-2.log) y [`results/gl-src-cpu4-2.log`](results/gl-src-cpu4-2.log), que miden después del arreglo de abajo:

  | | `flatten`, Chrome 156 | WebGL, Chrome 156 | `flatten`, CPU 4× | WebGL, CPU 4× |
  |---|---|---|---|---|
  | GPU zoom-in / zoom-out, tal cual | 42,5 / 43,5 % | 8 / 8 % | 42,5 / 42 % | 1 / 1 % |
  | GPU zoom-in / zoom-out, en vivo | 69 / 71 % | 7 / 8,5 % | 57,5 / 60,5 % | 2 / 1 % |
  | Cuadros perdidos, zoom-in / zoom-out, tal cual | 1,4 / 0 % | 0,3 / 1,6 % | 0 / 9,4 % | 0 / 0,8 % |
  | Cuadros perdidos, zoom-in / zoom-out, en vivo | 2,4 / 9 % | 0 / 1,1 % | 0 / 10,1 % | 0 / 0 % |
  | Tirones en vivo | 2 de 6 | 0 de 6 | 1 de 6 | 0 de 6 |
  | Del clic al movimiento, zoom-in, tal cual | 14 ms | 46,5 ms | 12 ms | 99,5 ms (el primero, en frío, 840) |
  | Del clic al movimiento, zoom-in, en vivo | 7 ms | 159 ms | 10,5 ms | 713 ms |
  | Del clic al movimiento, zoom-out | 10,5 ms | 57-67 ms | 9,5 ms | 111 ms |

  En Chrome real da lo mismo que en el Chromium de Playwright. Con la CPU 4× más lenta, la GPU de WebGL baja todavía más (1-2 %), porque cada cuadro tiene menos que dibujar que lo que el DOM tiene que recomponer, y los cuadros perdidos del zoom-out pasan de 9-10 % a 0-1 %. El costo es la espera: con CPU 4× y datos en vivo, el tablero necesita una foto en cada zoom-in (su stream se apaga por el vidrio) y pasa de 300 ms, así que aparece el anillo y la espera llega a 713 ms. Es el pendiente de SnapDOM con el vidrio; con eso, el tablero tendría textura y el zoom-in arrancaría en ~100 ms.
- **Un error que encontró la medición:** al preparar un zoom-in, el motor ya marcó el tablero como vista previa, y el arreglo de redimensionar lo trataba como una vista que ya está atrás. Lo fotografiaba con vidrio y sin escala: 411 ms en vez de 106, y en vivo cada zoom-in después del primero esperaba 708 ms. Ahora ese trato es solo para una vista que ya está atrás y perdió su textura.
- **Tests:** [`__tests__/webgl.test.js`](../../__tests__/webgl.test.js) prueba la opción, las cadenas de efectos y, donde hay WebGL2 (el Chromium headless no lo tiene, así que corren con ventana), los zooms, un hermano, un gesto hasta el final y de vuelta, tres niveles, el contexto perdido y `destroy`. La suite completa sigue en verde.

## Experimento 10: preparar en el hover (29/10, `dev`)

Martin: "eso es importante". La espera antes de un zoom-in con WebGL es armar la vista que entra y sacarle la foto. Con `webgl: { hover: true }` eso pasa mientras el puntero o el foco están sobre el disparador, y el clic usa ese mismo nodo y su textura.

- **Cómo anda:**
  - Al pasar por un disparador de la vista actual, el motor arma la vista como lo haría en el clic, también si la arma una función. Después, WebGL la mete un momento en el lienzo fuera de pantalla, le saca la foto y la sube.
  - En el clic, `zoomIn` toma ese nodo en vez de armarlo de nuevo, y WebGL usa la textura si la vista mide lo mismo. Si la foto todavía no terminó, el clic la espera en vez de empezar de cero.
  - Hay una sola preparación a la vez. Se tira, con sus cleanups, cuando el puntero pasa a otro disparador, cuando hay cualquier movimiento o cuando se pierde el contexto.
  - El tacto también entra: `pointerover` llega al apoyar el dedo, antes del `touchend` que dispara el zoom.
- **Queda afuera:** las vistas con `mounted()` y los custom elements, que corren algo al insertarse, y las vistas `deferred`. Esas esperan el clic, como antes.
- **El costo:** las funciones de vista corren en el hover, y si no hay clic su trabajo se tira. Por eso es opcional.
- **Medido** (dpr 2, 250 ms de hover antes de cada clic, mediana de dos corridas; [`results/hover.log`](results/hover.log), [`results/hover-2.log`](results/hover-2.log), [`results/hover-cpu4.log`](results/hover-cpu4.log)):

  | Del clic al movimiento, zoom-in | sin hover | con hover |
  |---|---|---|
  | Tal cual | 45-48 ms | 15-17,5 ms |
  | En vivo | 28-33 ms | 6,5-7,5 ms |
  | Detalle que tarda 300 ms en traer sus datos (`slow=300`) | 348-361 ms | 96-108 ms |
  | CPU 4×, tal cual | 76,5 ms | 21,5 ms |
  | CPU 4×, en vivo | 709 ms | 708 ms |

  - La foto de la vista que entra (15-25 ms; 50-57 con CPU 4×) sale del camino, y también armarla y esperar un cuadro.
  - Con una vista que trae sus datos, el hover esconde lo que dura el hover: de 300 ms quedan ~100.
  - Los zooms en sí no cambian (0-1 % de cuadros perdidos).
  - Mientras el puntero está quieto, preparar se lleva un cuadro en 2 de 6 hovers. Es una tarea de 25-40 ms; un efecto de hover en el disparador hecho en el hilo principal lo notaría.
- **Con CPU 4× y en vivo no ayuda**, y no es por la vista que entra: su foto ya está, pero el tablero no tiene textura. `flatten` le apaga el stream por presupuesto, así que cada zoom-in le saca una foto en el momento (400-450 ms).
  - Según la sesión de SnapDOM, el vidrio no es el costo: lo que pesa es vestir las tarjetas recortadas.
  - La tarea larga venía de las ventanas de un parche capturadas una detrás de otra en la misma tarea. En su árbol de trabajo cada ventana va en su tarea: en reposo, de 11,4 % de cuadros perdidos a 0, y con CPU 4× de 9,5 % a 3,5 %, sin tareas largas.
  - Pero `frame.ms` sigue siendo tiempo de reloj, y `flatten` presupuesta con eso. Les pedí `frame.busyMs` (lo que el cuadro bloquea), y `flatten` ya lo usa si viene, si no `ms`.
  - Con eso el stream debería aguantar con CPU 4×, y el zoom-in en vivo bajaría de ~709 ms a lo de tal cual. Falta una build dev nueva de los plugins (decide Martin) para medirlo.
- **Hallazgo de paso: el stream en reposo, con las versiones dev.** Con `4.4.1-dev.0`, `flatten` ya no apaga el stream del tablero en vivo (antes lo apagaban los cuadros "no host"). El zoom-in arranca sin foto, pero en reposo el tablero pierde 13-28 % de cuadros (antes 1-4 %):
  - el hilo principal está ocupado 21-29 %;
  - una vez por segundo, un parche de 16-17 rectángulos chicos (3-4 % del área) tarda 140-180 ms.

  Es lo que la sesión de SnapDOM ya arregló en su árbol de trabajo (arriba). Hasta que salga, con las versiones dev la demo en vivo se traba un poco en reposo sobre el tablero.
- **Con el stream del árbol de SnapDOM** (`measure.mjs --stream-from ../snapdom`, con el yield por ventana y `busyMs`; [`results/hover-tree.log`](results/hover-tree.log), [`results/hover-tree-cpu4.log`](results/hover-tree-cpu4.log)):
  - **En reposo**, el tablero en vivo pasa de 22-27 % de cuadros perdidos a 2,7-3,9 %.
  - **En el zoom-in en vivo** empeoraba: de 0,3 % a 2,7-5,3 %, con tramos de 2-3 cuadros seguidos. Las ventanas de un parche que ya estaba en marcha seguían capturando después de `stop()`, en pleno movimiento. La sesión de SnapDOM ya lo arregló: con eso, el zoom-in en vivo vuelve a 0,3-0,6 % sin tirones, y el tablero en reposo queda en 3,3-7 % ([`results/hover-tree-2.log`](results/hover-tree-2.log)).
  - **Con CPU 4×** el stream se sigue apagando: con `busyMs` igual pasa el 50 %. El zoom-in sigue en ~710 ms, y el tablero en reposo, en 44-46 % perdidos.
  - La palanca ahí es el costo de cada ventana (lo que cuesta vestir las tarjetas recortadas), del lado de SnapDOM. No subo el presupuesto de `flatten`: más de medio hilo principal en un equipo lento no es algo para esconder.
- **Pendiente:** que Martin lo pruebe a mano (`demo.html?gl=1&glass=0&hover=1`, y `&slow=300` para la vista lenta).

### Sin WebGL, con el stream nuevo (29/10)

Martin: "¿lograste mejorar la performance sin WebGL? Eso me interesa". `flatten` en el DOM, el mismo día y en el mismo Chromium. A la izquierda, el stream estable (4.4.0, servido por route); a la derecha, `4.4.1-dev.1`, que es lo instalado. Medianas de dos corridas, dpr 2 ([`results/dom-440.log`](results/dom-440.log), [`results/dom-dev1.log`](results/dom-dev1.log)):

| `flatten`, en vivo | stream 4.4.0 | stream 4.4.1-dev.1 |
|---|---|---|
| Tirones | 1,5 de 6 | 0 de 6 |
| Cuadros perdidos, zoom-in / zoom-out | 0,3 / 8,6 % | 0 / 0 % |
| GPU del zoom-in / zoom-out | 65 / 65,5 % | 39 / 43 % |
| Tablero en reposo | 0 % | 3,3 % |

- Con 4.4.0, `flatten` apagaba el stream del tablero en vivo (sus cuadros "no host") y el tablero se movía vivo atrás. Ahora queda como foto, y el zoom en vivo cuesta lo mismo que el tablero quieto.
- Tal cual, el zoom-out pasa de 3,2 % a 0 %.
- Sin `flatten` no cambia nada (10-17 % en el zoom-out), como era de esperar.
- El techo del DOM sigue: 39-43 % de GPU contra 7-8 % con WebGL.

## Plan

Dos listas: lo que hay que arreglar en el motor y lo que hay que probar en labs antes de decidir. Cada paso se mide como en el diagnóstico ([`demo.html`](demo.html), [`measure.mjs`](measure.mjs), [`film.mjs`](film.mjs)) y se mira a ojo con dpr 2.

### Base: arreglos en el motor

1. **Bug del zoom-out en el driver CSS.** Termina siempre por el temporizador: cada zoom-out deja ~150 ms el último cuadro quieto, en todas las vistas y en Pulse. Una línea y un test.
2. **Final del zoom-out.** La vista achicada desaparece de golpe sobre su disparador; fundirla con él en el último tramo. Chico, y Martin decide cómo se ve.
3. **`flatten` en reposo.** No seguir con stream una vista que no puede quedar atrás, y frenarlo también por tareas largas. Saca el 20-30 % de cuadros perdidos con vidrio y datos en vivo. Chico.
4. **Destello de `flatten` al volver.** Antes, una prueba corta en labs de dos alternativas: cambio seco cuando la foto está al día, o fundir solo vistas opacas. Chico.
5. **Publicar un parche** con 1 a 4 y pasar Pulse a esa versión.
6. **Driver `waapi`:** el zoom-out espera dos cuadros (~33 ms) antes de moverse. Ver si hace falta. Chico.
7. **`zoomOut(n)`:** las vistas que acompañan leen estilos en cada cuadro; calcularlas de antemano. Chico; solo afecta los saltos de varios niveles.
8. **Guía de vistas pesadas:**
   - nombrar `deferred`;
   - recomendar `css` o `waapi` con vistas pesadas;
   - decir cuándo no conviene `flatten` hasta que salga el 3.
9. **Margen de la foto de `flatten`.** El canvas de SnapDOM trae 1 px de más por lado (3 px con `transform` en la raíz) y `_flat` lo encaja en la caja: la foto queda un poco más chica y corrida. Ponerla a su tamaño, centrada. Chico; puede bajar el cambio al volver al tablero.
   Hecho el 28/10. La foto y el stream traen el mismo margen, igual en los cuatro lados, y la vista ocupa en el canvas `offsetWidth × dpr × scale`: `_flat` deduce de ahí el tamaño en CSS y la centra. Se notaba más de lo que parecía, porque toda vista a la que se llega por zoom-in queda con un `translate` y le tocan los 3 px (6 px más chica y 3 corrida). El test con SnapDOM real busca los bordes de la vista en la foto. Con el código anterior le daba 1 px de error; ahora le da menos de 0,5. El salto al volver al tablero no cambia en `film.mjs` (9,3–9,7 contra 5,1–9,3, ruido): el tablero no tiene `transform` y ahí era 1 px, que las capturas de 498 px no ven.

### Experimentación: en labs

1. **Preparar y después animar (idea 4).** Medido el 28/10 (ver Experimento 1): sin vidrio en la foto, la GPU del zoom-in baja de 39 % a 11 % y la del zoom-out de 39,5 % a 11,5 %, con ~40 ms de espera antes de arrancar y sin anillo. Falta mirarlo a ojo, cancelar con Escape y decidir si va al motor (en `flatten`, o como opción propia).
2. **Medir con menos margen de GPU:** ventana grande o dpr 3, y una tablet. Sin esto no se sabe cuánto valen 1, 3, 4 y 7 en el hardware de Pulse.
3. **Capa de vidrio (idea 1)** como forma de los efectos: 0 % en el zoom-out en todas las corridas, sin SnapDOM. Es la única que deja vivas las vistas de atrás, porque siguen siendo DOM. Martin (28/10): sin `flatten`, el zoom-in va fluido y el zoom-out "arrastra un poco".
    - **Causa:** cada zoom-out salta 5-6 cuadros (huecos de 33 ms en vez de 16), todos en la segunda mitad. Es la GPU: al achicarse el tablero entran cada vez más tarjetas con vidrio, y a eso se suman la capa y las 90 filas con vidrio del detalle que se va. El zoom-in no salta ninguno.
    - **Arreglo:** con la marca de movimiento (`moving=1`, sin vidrio en las tarjetas mientras se mueve) el zoom-out no salta ninguno, tal cual y en vivo. Falta que Martin mire cómo se ve que las tarjetas pierdan el vidrio durante el zoom.
    - **Trampa de medición:** esos cuadros no salen como perdidos en `measure.mjs` (Chrome no los marca como `affects_smoothness`), así que el 0 % los escondía. Para verlos hay que medir los huecos entre cuadros presentados. WebGL y `flatten` en el DOM no tienen huecos en ningún sentido.
4. **Marca de movimiento (opción 2)** como receta de la guía: la GPU del zoom baja de ~60 % a ~17 %.
5. **La primera transición en frío:** 14,5 % de cuadros perdidos en la primera corrida. Ver si se puede calentar al cargar.
6. **SnapDOM:** emular el vidrio una sola vez, gradientes como fondo sólido, tramos y `signal`. Abaratan el stream en vistas de vidrio. Y un contenedor grid scrolleado, que sale en una columna (ver Experimento 7). Se hace en su repo.
7. **WebGL (idea 3).** Hecho de lleno el 28/10 y pasado al motor en `dev` (`src/webgl.js`, opción `webgl`; ver Experimento 7 y "WebGL en el motor"): GPU del zoom de ~40-70 % a 7-8,5 % en Chrome, y a 1-2 % con CPU 4×. Pasan por WebGL los hermanos, los gestos, tres niveles y efectos en GLSL. Falta decidir si va a `main` (docs, guía, Pulse). El movimiento en un worker no hace falta por ahora: durante un zoom WebGL, el hilo principal trabaja 4-7 % y se pierden 0-1,6 % de cuadros.
8. **Driver con View Transitions (opción 1).**
9. **Foto ya desenfocada y la vista de dos niveles atrás como velo (opciones 7 y 8)**, si las tablets lo piden.
10. **Preparar en el hover** (Martin, 28/10: "eso es importante"). Hecho el 29/10 como `webgl: { hover: true }` (ver Experimento 10): el zoom-in arranca en 7-17 ms en vez de 28-48, y una vista que tarda 300 ms en traer sus datos, en ~100. Con CPU 4× y en vivo falta que el tablero mantenga su stream (SnapDOM). Lo que sigue es el plan original: Con WebGL, la espera antes de moverse es la foto de la vista que entra (45-160 ms; 713 con CPU 4× y datos en vivo). El prefetcher ya resuelve la vista cuando el puntero o el foco pasan por un disparador, si es HTML o viene de una URL. La idea es armarla ahí mismo fuera de pantalla, sacarle la foto y subirla como textura, para que el clic arranque casi sin espera. Hay que ver:
    - las vistas que arma una función: hoy no se guardan, porque dependen del disparador y sus props;
    - el trabajo tirado cuando el puntero pasa y no hay clic: cancelar si se va, y no hacer más de una a la vez;
    - los datos en vivo: la foto puede quedar vieja entre el hover y el clic;
    - el tacto, que no tiene hover: `pointerdown` deja unos 100 ms antes del clic;
    - la memoria de las texturas preparadas y no usadas.

    Medir la espera del clic al movimiento con y sin, tal cual y en vivo, y con CPU 4×.

Descartadas por la medición: sacar `perspective`, `will-change` sostenido y `will-change` justo.

## Fuentes

- [MDN, Element.startViewTransition](https://developer.mozilla.org/en-US/docs/Web/API/Element/startViewTransition)
- [Chrome 147: view transitions con alcance de elemento](https://developer.chrome.com/blog/element-scoped-view-transitions)
- [web.dev, novedades de octubre de 2025 (Firefox 144)](https://web.dev/blog/web-platform-10-2025)
- [Chrome, novedades de view transitions en 2025](https://developer.chrome.com/blog/view-transitions-in-2025)
- [CSS View Transitions, captura de la imagen](https://drafts.csswg.org/css-view-transitions/)
- [Chrome: re-rasterizado al cambiar la escala](https://developer.chrome.com/blog/re-rastering-composite)
- [CSSWG #7848, resolución de raster](https://github.com/w3c/csswg-drafts/issues/7848)
- [HTML-in-Canvas, origin trial](https://developer.chrome.com/blog/html-in-canvas-origin-trial)
- [HTML-in-Canvas, cambios](https://developer.chrome.com/blog/html-in-canvas-ot-changes)
- [PlayCanvas: sin versión estable (marzo de 2026)](https://forum.playcanvas.com/t/engine-v2-18-0/42156)
