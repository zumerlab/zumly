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

`gl=1` en la demo, con el renderer en [`gl.js`](gl.js). Es la idea 3 completa, no solo el fondo: el experimento 1 resolvió lo que la frenaba, que la vista que entra no tenía foto antes de moverse.

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
- **En vivo, el stream del tablero se apaga desde la segunda visita, con WebGL o sin él.** Los valores cambian dentro de tarjetas con `backdrop-filter`. El stream no encuentra dónde repintarlos (`no host for <span.v>`), hace un cuadro completo de 320-420 ms y `flatten` lo apaga. Es el pendiente de SnapDOM con el vidrio y los gradientes. Con WebGL hay que fotografiar el tablero antes de cada zoom-in (~100 ms). Antes del arreglo del blur costaba otra foto más en el zoom-out, y el tablero se ocultaba recién al arrancar: de ahí salían el 15 % de GPU y el tirón. Ahora queda oculto desde el final del zoom-in.

Falta:

- Mirarlo a ojo otra vez, después del arreglo del blur. Martin lo vio muy fluido.
- Hermanos: hoy un zoom lateral cae al driver real, con todas las vistas en DOM.
- Más de dos niveles (`lastView`): el código lo contempla, pero no está probado, porque la demo tiene dos.
- Gestos (seguir el dedo), pérdida de contexto (hoy vuelve al DOM y no se recupera) y redimensionar en medio de un zoom.
- Mantener la vista actual en una textura con stream, para que el zoom-out arranque sin foto.
- Medir con CPU 4× y en Chrome real.

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
3. **Capa de vidrio (idea 1)** como forma de los efectos: 0 % en el zoom-out en todas las corridas, sin SnapDOM. Falta que Martin mire el look.
4. **Marca de movimiento (opción 2)** como receta de la guía: la GPU del zoom baja de ~60 % a ~17 %.
5. **La primera transición en frío:** 14,5 % de cuadros perdidos en la primera corrida. Ver si se puede calentar al cargar.
6. **SnapDOM:** emular el vidrio una sola vez, gradientes como fondo sólido, tramos y `signal`. Abaratan el stream en vistas de vidrio. Se hace en su repo.
7. **WebGL (idea 3).** Hecho de lleno el 28/10, en `dev` (ver Experimento 7): GPU del zoom de ~40 % a 5,5-6,5 %, y en vivo de ~65 % a 5-6,5 %, con la misma espera del experimento 1. Martin lo vio muy fluido. Falta hermanos, gestos y más de dos niveles. Después: el movimiento en un worker.
8. **Driver con View Transitions (opción 1).**
9. **Foto ya desenfocada y la vista de dos niveles atrás como velo (opciones 7 y 8)**, si las tablets lo piden.

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
