/**
 * Anime.js transition driver. Works with Anime.js v4 (`animate`) and v3 (`anime()`).
 *
 * Script tag: load Anime.js before Zumly and use `driver: 'anime'` (global `anime`).
 *   <script src="https://cdn.jsdelivr.net/npm/animejs@4/dist/bundles/anime.umd.min.js"></script>
 * Bundler: pass the library — `driver: animeDriver(anime)` with
 *   `import * as anime from 'animejs'` (v4) or `import anime from 'animejs'` (v3).
 *
 * CSS easing strings follow the same curve as the CSS driver; other strings
 * are Anime.js ease names ('outExpo' in v4, 'easeOutExpo' in v3).
 *
 * @param {Object} spec - Transition spec from the engine
 * @param {function} onComplete - MUST be called exactly once when done
 * @param {object|function} [lib] - Anime.js module or function; defaults to global `anime`
 */
import { runProgressTransition, warnMissingLibrary } from './progress-tween.js'

function resolveAnime (lib) {
  const anime = lib ?? globalThis.anime
  if (anime && typeof anime.animate === 'function') return { version: 4, animate: anime.animate }
  if (typeof anime === 'function') return { version: 3, anime }
  if (anime && typeof anime.default === 'function') return { version: 3, anime: anime.default }
  return null
}

export function runTransition (spec, onComplete, lib) {
  const api = resolveAnime(lib)
  if (!api) {
    warnMissingLibrary('anime', 'Anime.js not found. Load it with a <script> tag before using driver: \'anime\', or pass it: driver: animeDriver(anime).')
    runProgressTransition(spec, onComplete, ({ onUpdate, onComplete }) => { onUpdate(1); onComplete() })
    return
  }

  runProgressTransition(spec, onComplete, ({ durationMs, nativeEase, onUpdate, onComplete }) => {
    const progress = { value: 0 }
    if (api.version === 4) {
      const animation = api.animate(progress, {
        value: 1,
        duration: durationMs,
        ease: nativeEase ?? 'linear',
        onUpdate: () => onUpdate(progress.value),
        onComplete
      })
      return () => animation?.pause?.()
    } else {
      const animation = api.anime({
        targets: progress,
        value: 1,
        duration: durationMs,
        easing: nativeEase ?? 'linear',
        update: () => onUpdate(progress.value),
        complete: onComplete
      })
      return () => animation?.pause?.()
    }
  })
}

/**
 * Driver bound to an Anime.js instance (for bundlers, where there is no global).
 * @param {object|function} anime
 */
export function animeDriver (anime) {
  return (spec, onComplete) => runTransition(spec, onComplete, anime)
}
