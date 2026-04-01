/**
 * Zumly Router Plugin
 *
 * Syncs browser URL hash with Zumly navigation state.
 * Supports browser back (zoom-out, lateral) and hash updates on navigation.
 * Forward/deep-linking is intentionally not supported — in a ZUI the zoom
 * origin depends on the trigger element which doesn't exist without context.
 *
 * Usage:
 *   import { ZumlyRouter } from 'zumly/plugins/router'
 *   const app = new Zumly({ ... })
 *   app.use(ZumlyRouter, { separator: '/' })
 *   app.init()
 *
 * Or with <script> tag:
 *   app.use(Zumly.Router)
 */

const DEFAULTS = {
  /** Character used to join view path segments in the hash */
  separator: '/',
  /** Prefix before the path in the hash (e.g. '#/' or '#!') */
  prefix: '/',
}

/**
 * Build the hash path from the current Zumly navigation stack.
 * @param {object} instance - Zumly instance
 * @param {string} separator
 * @returns {string} e.g. 'home/dashboard/revenue'
 */
function buildPath (instance, separator) {
  const path = []
  for (const snap of instance.storedViews) {
    const current = snap.views && snap.views[0]
    if (current && current.viewName) path.push(current.viewName)
  }
  return path.join(separator)
}

/**
 * Parse the current hash into an array of view names.
 * @param {string} prefix
 * @param {string} separator
 * @returns {string[]}
 */
function parsePath (prefix, separator) {
  let hash = window.location.hash.slice(1) // remove '#'
  if (hash.startsWith(prefix)) hash = hash.slice(prefix.length)
  if (!hash) return []
  return hash.split(separator).filter(Boolean)
}

/**
 * @type {{ install: (instance: object, options?: object) => void }}
 */
export const ZumlyRouter = {
  install (instance, options) {
    const opts = Object.assign({}, DEFAULTS, options)
    const sep = opts.separator
    const prefix = opts.prefix

    let syncing = false // guard against circular updates

    // ─── Zumly → Hash sync ──────────────────────────────────

    function setHash (method) {
      if (syncing) return
      const path = buildPath(instance, sep)
      const newHash = '#' + prefix + path
      if (window.location.hash !== newHash) {
        syncing = true
        window.history[method](null, '', newHash)
        syncing = false
      }
    }

    function pushHash () { setHash('pushState') }
    function replaceHash () { setHash('replaceState') }

    instance.on('afterZoomIn', pushHash)
    instance.on('afterLateral', pushHash)
    instance.on('afterZoomOut', replaceHash)

    // ─── Popstate → Zumly (back only) ───────────────────────

    function onPopState () {
      if (syncing) return
      syncing = true

      const target = parsePath(prefix, sep)
      const current = buildPath(instance, sep).split(sep).filter(Boolean)

      if (target.join(sep) === current.join(sep)) {
        syncing = false
        return
      }

      if (target.length < current.length) {
        // Browser back → zoom out
        const diff = current.length - target.length
        for (let i = 0; i < diff; i++) {
          instance.zoomOut()
        }
      } else if (target.length === current.length && target.length > 0) {
        // Same depth, different view → lateral back
        const lastTarget = target[target.length - 1]
        if (lastTarget !== current[current.length - 1]) {
          instance.goTo(lastTarget, { mode: 'lateral' })
        }
      }
      else if (target.length > current.length) {
        // Forward attempt — block it by going back to current state
        window.history.back()
      }

      syncing = false
    }

    window.addEventListener('popstate', onPopState)

    // ─── Set initial hash ────────────────────────────────────

    replaceHash()

    // ─── Cleanup on destroy ──────────────────────────────────

    instance.on('destroy', function () {
      instance.off('afterZoomIn', pushHash)
      instance.off('afterLateral', pushHash)
      instance.off('afterZoomOut', replaceHash)
      window.removeEventListener('popstate', onPopState)
    })
  }
}
