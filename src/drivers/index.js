/**
 * Transition driver factory.
 * Returns a driver object with runTransition(spec, onComplete).
 *
 * Built-in drivers: 'css' (default), 'waapi', 'none', 'anime', 'gsap', 'motion'.
 * Custom drivers: pass a function(spec, onComplete) directly.
 *
 * @param {string|function} driverOption
 * @returns {{ runTransition: function }}
 */
import { runTransition as cssRun } from './css-transition.js'
import { runTransition as noneRun } from './none-transition.js'
import { runTransition as waapiRun } from './waapi-transition.js'
import { runTransition as animeRun } from './anime-transition.js'
import { runTransition as gsapRun } from './gsap-transition.js'
import { runTransition as motionRun } from './motion-transition.js'

const DRIVERS = {
  css: cssRun,
  waapi: waapiRun,
  none: noneRun,
  anime: animeRun,
  gsap: gsapRun,
  motion: motionRun,
}

export function getDriver (driverOption) {
  if (typeof driverOption === 'function') {
    return {
      runTransition (spec, onComplete) {
        driverOption(spec, onComplete)
      }
    }
  }
  const name = typeof driverOption === 'string' ? driverOption.toLowerCase() : 'css'
  const run = DRIVERS[name] || DRIVERS.css
  return { runTransition: run }
}

// Named exports for direct imports and tests
export { runTransition as cssTransition } from './css-transition.js'
export { runTransition as noneTransition } from './none-transition.js'
export { runTransition as waapiTransition } from './waapi-transition.js'
export { runTransition as animeTransition } from './anime-transition.js'
export { runTransition as gsapTransition } from './gsap-transition.js'
export { runTransition as motionTransition } from './motion-transition.js'

// Re-export helpers for community drivers
export * from './driver-helpers.js'
