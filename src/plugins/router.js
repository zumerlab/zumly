/**
 * Zumly Router Plugin
 *
 * Syncs browser URL hash with Zumly navigation state.
 * Supports browser back (zoom-out, lateral) and hash updates on navigation.
 * Forward/deep-linking is intentionally not supported — in a ZUI the zoom
 * origin depends on the trigger element which doesn't exist without context.
 *
 * Usage:
 *   import { ZumlyRouter } from 'zumly'
 *   const app = new Zumly({ ... })
 *   app.use(ZumlyRouter, { separator: '/' })
 *   app.init()
 *
 * Or with <script> tag:
 *   app.use(Zumly.Router)
 *
 * A view reached from a trigger with data params carries them in its segment,
 * so siblings such as data-to="room" data-id="kitchen" stay apart:
 *   #/house/room?id=kitchen
 */
import { viewKey, parseViewKey } from '../view-identity.js'

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
 * @returns {string} e.g. 'home/dashboard/revenue' or 'house/room?id=kitchen'
 */
function buildPath (instance, separator) {
  const path = []
  for (const snap of instance.storedViews) {
    const current = snap.views && snap.views[0]
    if (current && current.viewName) path.push(viewKey(current.viewName, current.params))
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
    let processing = false
    let pendingTarget = null
    let destroyed = false

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

    // A zoom-in or a move to a sibling writes its entry as it starts: a browser back during
    // the motion then comes back to the view it left, instead of the entry before it (which
    // can be outside the app). Its end only keeps the hash right.
    instance.on('zoomInStart', pushHash)
    instance.on('lateralStart', pushHash)
    instance.on('afterZoomIn', replaceHash)
    instance.on('afterLateral', replaceHash)
    instance.on('afterZoomOut', replaceHash)

    // ─── Popstate → Zumly (back only) ───────────────────────

    async function reconcile () {
      if (processing || destroyed) return
      processing = true
      syncing = true
      try {
        while (pendingTarget && !destroyed) {
          const target = pendingTarget
          pendingTarget = null
          // Browser history can move while a view is loading or animating.
          // Finish that navigation before applying the latest requested path.
          await instance._navigationTask?.promise
          if (destroyed) return
          if (pendingTarget) continue

          let current = buildPath(instance, sep).split(sep).filter(Boolean)
          if (target.join(sep) === current.join(sep)) continue

          if (target.length > current.length) {
            // Forward and cold deep links remain intentionally unsupported.
            window.history.back()
            continue
          }

          while (current.length > target.length && current.length > 1) {
            const depth = current.length
            await instance.zoomOut(current.length - target.length)
            if (destroyed) return
            current = buildPath(instance, sep).split(sep).filter(Boolean)
            if (pendingTarget || current.length >= depth) break
          }
          if (pendingTarget) continue

          if (target.length === current.length && target.length > 0) {
            const lastTarget = target[target.length - 1]
            if (lastTarget !== current[current.length - 1]) {
              const history = instance.lateralHistory || []
              const keyOf = entry => typeof entry === 'object'
                ? viewKey(entry?.name, entry?.params ?? entry?.entry?.params)
                : entry
              const historyIndex = history.map(keyOf).lastIndexOf(lastTarget)
              // Use the engine's back path when possible, preserving keepAlive
              // nodes and consuming every entry in a multi-step history jump.
              if (historyIndex !== -1) {
                while (instance.lateralHistory.length > historyIndex) {
                  const length = instance.lateralHistory.length
                  await instance.back()
                  if (destroyed || pendingTarget || instance.lateralHistory.length >= length) break
                }
              } else {
                await instance.goTo(lastTarget, { mode: 'lateral' })
              }
            }
          }
        }
      } finally {
        syncing = false
        processing = false
      }
      // A navigation of the user's while the back was applied did not write its hash: the
      // hash follows where the view ended up, as a new entry if it went further in.
      if (!destroyed) {
        const path = window.location.hash.slice(1 + prefix.length)
        const now = buildPath(instance, sep)
        setHash(path && now.startsWith(path + sep) ? 'pushState' : 'replaceState')
      }
    }

    function onPopState () {
      if (destroyed) return
      // A hash this router did not write (another part of the page, or an
      // entry from before the app started) is left alone.
      if (!window.location.hash.slice(1).startsWith(prefix) && window.location.hash !== '') return
      const target = parsePath(prefix, sep)
      if (target.length && (target[0] !== instance.storedViews[0]?.views?.[0]?.viewName ||
        target.some(key => !Object.prototype.hasOwnProperty.call(instance.views, parseViewKey(key).name)))) return
      pendingTarget = target
      void reconcile()
    }

    window.addEventListener('popstate', onPopState)

    // ─── Set initial hash ────────────────────────────────────

    replaceHash()

    // ─── Cleanup on destroy ──────────────────────────────────

    instance.on('destroy', function () {
      destroyed = true
      pendingTarget = null
      instance.off('zoomInStart', pushHash)
      instance.off('lateralStart', pushHash)
      instance.off('afterZoomIn', replaceHash)
      instance.off('afterLateral', replaceHash)
      instance.off('afterZoomOut', replaceHash)
      window.removeEventListener('popstate', onPopState)
    })
  }
}
