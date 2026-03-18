/**
 * Transition driver factory.
 * Returns a driver object with runTransition(spec, onComplete).
 * @param {string|function} driverOption - 'css' | 'waapi' | 'none' or custom function(spec, onComplete)
 * @returns {{ runTransition: function }}
 */
import { runTransition as cssRun } from './css-transition.js'
import { runTransition as noneRun } from './none-transition.js'
import { runTransition as waapiRun } from './waapi-transition.js'

export function getDriver (driverOption) {
  if (typeof driverOption === 'function') {
    return {
      runTransition (spec, onComplete) {
        driverOption(spec, onComplete)
      }
    }
  }
  const name = typeof driverOption === 'string' ? driverOption.toLowerCase() : 'css'
  switch (name) {
    case 'waapi':
      return { runTransition: waapiRun }
    case 'none':
      return { runTransition: noneRun }
    case 'css':
    default:
      return { runTransition: cssRun }
  }
}

export { runTransition as cssTransition } from './css-transition.js'
export { runTransition as noneTransition } from './none-transition.js'
export { runTransition as waapiTransition } from './waapi-transition.js'
