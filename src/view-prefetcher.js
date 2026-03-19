/**
 * ViewPrefetcher — orchestrates view resolution (step 1 of the rendering pipeline) and caching.
 * Returns raw DOM nodes; callers use prepareAndInsertView() for normalize + insert + mounted().
 * Strategies: (A) eager on init, (B) on hover over .zoom-me, (C) scan on view activation.
 */

import { ViewResolver } from './view-resolver.js'
import { ViewCache } from './view-cache.js'

const REMOTE_TTL = 5 * 60 * 1000 // 5 minutes for URL-backed views

export class ViewPrefetcher {
  #resolver
  #cache
  #views
  #inFlight = new Map()

  constructor (views = {}) {
    this.#views = views
    this.#resolver = new ViewResolver(views)
    this.#cache = new ViewCache()
  }

  /**
   * Get a view node by name/source. Uses cache when applicable; deduplicates in-flight requests.
   * @param {string} source - View name (key in views) or raw source.
   * @param {object} [context=null] - Context for function/object views.
   * @returns {Promise<HTMLElement>}
   */
  async get (source, context = null) {
    const cached = this.#cache.get(source)
    if (cached) return cached

    if (this.#inFlight.has(source)) {
      return this.#inFlight.get(source)
    }

    const promise = (async () => {
      const node = await this.#resolver.resolve(source, context)
      const template = this.#views[source]
      if (typeof template === 'string') {
        const ttl = /^https?:\/\/|^\/|\.html$|\.php$/i.test(template) ? REMOTE_TTL : null
        this.#cache.set(source, node, ttl)
      }
      this.#inFlight.delete(source)
      return node
    })()

    this.#inFlight.set(source, promise)
    return promise
  }

  /**
   * Eager preload: resolve and cache the given view names (e.g. on init).
   * @param {string[]} keys - View names to preload.
   * @param {object} [context=null]
   * @returns {Promise<void>}
   */
  async preloadEager (keys, context = null) {
    if (!Array.isArray(keys) || keys.length === 0) return
    await Promise.all(keys.map(key => this.get(key, context)))
  }

  /**
   * Prefetch on hover: resolve and cache in background (call from mouseover/focus).
   * @param {string} source - View name.
   * @param {object} [context=null]
   */
  prefetchOnHover (source, context = null) {
    this.get(source, context).catch(() => {})
  }

  /**
   * Scan a node for .zoom-me and prefetch their data-to targets in background.
   * @param {HTMLElement} node - Container (e.g. current view).
   * @param {object} [context=null]
   */
  scanAndPrefetch (node, context = null) {
    if (!node || !node.querySelectorAll) return
    const triggers = node.querySelectorAll('.zoom-me[data-to]')
    triggers.forEach(el => {
      const to = el.dataset.to
      if (to) this.prefetchOnHover(to, context)
    })
  }
}
