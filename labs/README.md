# Zumly Labs

Ideas a prueba antes de llevarlas a `src/`. Corren con el motor de este repo tal como está en `src/`, sin compilar, y con SnapDOM de `node_modules`.

No se publican: `labs/` no está en el `files` de `package.json` (no va a npm) y GitHub Pages sirve `docs/` (no va al sitio). Cuando algo esté listo para mostrarse, se pasa a `docs/`.

## Cómo se corre

```sh
npm install                # SnapDOM y sus plugins vienen como devDependencies
node labs/serve.mjs        # http://localhost:9292/labs/
```

El servidor también expone `../snapdom` y `../orbit` en `/snapdom/` y `/orbit/`, para probar cambios en esos repos.

## Labs

| Lab | Qué prueba | Estado |
|---|---|---|
| [Vistas pesadas](heavy-views/) | Fluidez del zoom con vistas de miles de nodos y vidrio: `flatten`, marca de movimiento, capa de vidrio fija, `will-change`, `perspective`, preparar y después animar (`launch=1`), todo en WebGL (`gl=1`). [Reporte](heavy-views/REPORT.md) | Experimentos 1 y 7 medidos (28/10) |

## Cómo medimos

- dpr 2 (la pantalla de la Mac es Retina), con contenido en vivo, y cada variante contra su control.
- Se cuentan los cuadros que llegaron a la pantalla y los que se perdieron, del trace de Chromium (`PipelineReporter`), no la media de `requestAnimationFrame`: las transformaciones corren en el compositor y el hilo principal no las ve.
- Mirar a ojo, con un contador grande en la vista: las métricas de cuadros no ven una foto vieja.
- En corridas largas, `caffeinate -d`, porque la pantalla se apaga a los 2 minutos. Usar la Mac durante la corrida no cambia los números.
- Con la interfaz quieta no hay cuadros que contar: un hueco sin cuadros no es un tirón.
- Los traces de DevTools, del MCP de chrome-devtools o de `trace.mjs` se comparan zoom por zoom con `heavy-views/read-trace.mjs`, que no necesita marcas de la demo. Mirar también sus capturas: una foto vacía que se mueve da números excelentes.
- `read-trace.mjs` encuentra los zooms por sus animaciones CSS: con `gl=1` no hay ninguna, y para esa variante valen las marcas de la demo (`measure.mjs`).

## Relación con `experiments/`

`experiments/snapdom-compositor/` es el estudio del 25 al 27/10 que terminó en `flatten`. Sus herramientas (`fluidity.mjs`, `filmstrip.mjs`, `compare.html`) siguen ahí, y labs mide de la misma forma.
