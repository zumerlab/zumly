/**
 * ViewPrefetcher — orchestrates view resolution (step 1 of the rendering pipeline) and caching.
 * Returns raw DOM nodes; callers use prepareAndInsertView() for normalize + insert + mounted().
 * Strategies: (A) eager on init, (B) on hover/focus over .zoom-me, (C) scan on view activation.
 *
 * CACHING POLICY:
 * - Static HTML string views: cached indefinitely (no TTL). Result is cloned on each get().
 * - URL-backed views (http(s)://, /path, *.html, *.php): cached with TTL (5 min). Expired
 *   entries are removed on next get(); a fresh fetch occurs.
 * - Function/object views: NOT cached. They depend on context (trigger, props, etc.); reusing
 *   a cached result across different contexts would be incorrect. Each get() resolves fresh.
 * - In-flight deduplication: only for cacheable views. Non-cacheable views are never
 *   deduplicated so each request gets its own context-sensitive resolution.
 */

import { ViewResolver } from './view-resolver.js'
import { ViewCache } from './view-cache.js'

/** TTL in ms for URL-backed views (fetch). */
export const REMOTE_TTL = 5 * 60 * 1000

/** Regex: string looks like a remote or path-based URL. */
const URL_LIKE = /^https?:\/\/|^\/|\.html$|\.php$/i

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
   * Returns true if the view template is safe to cache. Only string templates (HTML or URL)
   * are cacheable; function/object views depend on context and must not be reused.
   * @param {string} source - View name (key in views).
   * @returns {boolean}
   */
  #isCacheable (source) {
    const template = this.#views[source]
    return typeof template === 'string'
  }

  /**
   * Get TTL for a cacheable string template. URLs get REMOTE_TTL; static HTML gets null (no expiry).
   * @param {string} template
   * @returns {number|null}
   */
  #getTtlForTemplate (template) {
    return URL_LIKE.test(template) ? REMOTE_TTL : null
  }

  /**
   * Get a view node by name/source. Uses cache when applicable; deduplicates in-flight for cacheable views only.
   * @param {string} source - View name (key in views) or raw source.
   * @param {object} [context=null] - Context for function/object views.
   * @returns {Promise<HTMLElement>}
   */
  async get (source, context = null) {
    if (this.#isCacheable(source)) {
      const cached = this.#cache.get(source)
      if (cached) return cached

      if (this.#inFlight.has(source)) {
        return this.#inFlight.get(source)
      }

      const promise = (async () => {
        const node = await this.#resolver.resolve(source, context)
        const template = this.#views[source]
        const ttl = this.#getTtlForTemplate(template)
        this.#cache.set(source, node, ttl)
        this.#inFlight.delete(source)
        return node
      })()

      this.#inFlight.set(source, promise)
      return promise
    }

    // Non-cacheable (function, object, etc.): always resolve fresh. No cache, no in-flight dedup.
    return this.#resolver.resolve(source, context)
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
   * Prefetch a view in background (call from mouseover, focusin, or scan).
   * get() deduplicates: cached or in-flight requests avoid duplicate work.
   * @param {string} source - View name.
   * @param {object} [context=null]
   */
  prefetch (source, context = null) {
    this.get(source, context).catch(() => {})
  }

  /** @deprecated Use prefetch() instead. Kept for backward compatibility. */
  prefetchOnHover (source, context = null) {
    this.prefetch(source, context)
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
      if (to) {
        if (!el.hasAttribute('role')) el.setAttribute('role', 'button')
        if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', `Zoom to ${to}`)
        this.prefetch(to, context)
      }
    })
  }
}
