/**
 * ViewPrefetcher — orchestrates view resolution (step 1 of the rendering pipeline) and caching.
 * Returns raw DOM nodes; callers use prepareAndInsertView() for normalize + insert + mounted().
 * Strategies: (A) eager on init, (B) on hover/focus over .zoom-me, (C) scan on view activation.
 *
 * CACHING POLICY:
 * - Static HTML string views: no TTL, subject to the cache's LRU entry limit.
 *   Only actual get() consumers receive a clone; prefetch never clones.
 * - URL-backed views (http(s)://, /path, *.html, *.php): cached with TTL (5 min). Expired
 *   entries are removed on access or insertion; a fresh fetch occurs.
 * - Function/object views: NOT cached. They depend on context (trigger, props, etc.); reusing
 *   a cached result across different contexts would be incorrect. Each get() resolves fresh.
 * - In-flight deduplication: only for cacheable views. Non-cacheable views are never
 *   deduplicated so each request gets its own context-sensitive resolution.
 */

import { ViewResolver } from './view-resolver.js'
import { ViewCache } from './view-cache.js'
import { prepareViewTriggers } from './view-accessibility.js'

/** TTL in ms for URL-backed views (fetch). */
export const REMOTE_TTL = 5 * 60 * 1000

/** Regex: string looks like a remote or path-based URL. */
const URL_LIKE = /^https?:\/\/|^\/|\.(?:html|php)(?:[?#].*)?$/i

export class ViewPrefetcher {
  #resolver
  #cache
  #views
  #inFlight = new Map()
  #scanQueue = new Map()
  #scanTimer = null
  #activeScans = 0
  #prefetchConcurrency
  #maxPendingPrefetch
  #destroyed = false
  #paused = false

  constructor (views = {}, { maxCacheEntries = 64, prefetchConcurrency = 2, maxPendingPrefetch = 32 } = {}) {
    this.#views = views
    this.#resolver = new ViewResolver(views)
    this.#cache = new ViewCache({ maxEntries: maxCacheEntries })
    this.#prefetchConcurrency = Number.isInteger(prefetchConcurrency) && prefetchConcurrency > 0 ? prefetchConcurrency : 2
    this.#maxPendingPrefetch = Number.isInteger(maxPendingPrefetch) && maxPendingPrefetch >= 0 ? maxPendingPrefetch : 32
  }

  /**
   * Resolve aliases and return only a cacheable HTML/URL template. Function/object
   * views and custom element tags must not be executed by background prefetch.
   * @param {string} source - View name (key in views).
   * @returns {string|null}
   */
  #cacheableTemplate (source) {
    const seen = new Set()
    while (typeof source === 'string' && Object.prototype.hasOwnProperty.call(this.#views, source)) {
      if (seen.has(source)) return null
      seen.add(source)
      source = this.#views[source]
    }
    return typeof source === 'string' && (source.includes('<') || URL_LIKE.test(source)) ? source : null
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
    if (this.#destroyed) throw new Error('Zumly: view prefetcher has been destroyed')
    // Navigation takes priority over queued scan work, even when scan slots are full.
    this.#scanQueue.delete(source)
    const template = this.#cacheableTemplate(source)
    if (template !== null) {
      const cached = this.#cache.get(source)
      if (cached) return cached

      // Clone directly from the resolution result: another concurrent resolution
      // may evict this entry before this consumer's continuation runs.
      return (await this.#resolveAndCache(source, template, context)).cloneNode(true)
    }

    // Non-cacheable (function, object, etc.): always resolve fresh. No cache, no in-flight dedup.
    return this.#resolver.resolve(source, context)
  }

  #resolveAndCache (source, template, context) {
    if (this.#inFlight.has(source)) return this.#inFlight.get(source)
    const promise = (async () => {
      try {
        const node = await this.#resolver.resolve(source, context)
        if (!this.#destroyed) this.#cache.adopt(source, node, this.#getTtlForTemplate(template))
        return node
      } finally {
        // A rejected resolution must not poison subsequent retries.
        this.#inFlight.delete(source)
      }
    })()
    this.#inFlight.set(source, promise)
    return promise
  }

  async #ensureCached (source, context) {
    if (this.#destroyed) return
    this.#scanQueue.delete(source)
    const template = this.#cacheableTemplate(source)
    if (template === null || this.#cache.has(source)) return
    // A prefetch only warms the cache. Do not allocate a consumer clone or retain
    // the resolved node in Promise.all results from preloadEager().
    await this.#resolveAndCache(source, template, context)
  }

  /**
   * Eager preload: resolve and cache the given view names (e.g. on init).
   * @param {string[]} keys - View names to preload.
   * @param {object} [context=null]
   * @returns {Promise<void>}
   */
  async preloadEager (keys, context = null) {
    if (!Array.isArray(keys) || keys.length === 0) return
    await Promise.all([...new Set(keys)].map(key => this.#ensureCached(key, context)))
  }

  /**
   * Prefetch a view in background (call from mouseover, focusin, or scan).
   * Hover/focus requests start immediately unless paused for navigation;
   * cached/in-flight work is reused without allocating a consumer clone.
   * @param {string} source - View name.
   * @param {object} [context=null]
   */
  prefetch (source, context = null) {
    if (this.#paused) {
      this.#queuePrefetch(source, context)
      return
    }
    this.#ensureCached(source, context).catch(() => {})
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
    if (this.#destroyed || !node || !node.querySelectorAll) return
    const triggers = prepareViewTriggers(node)
    // Prefer the newly activated view over stale, not-yet-started scan work.
    this.#scanQueue.clear()
    const seen = new Set()
    for (const el of triggers) {
      const to = el.dataset.to
      if (!to || seen.has(to)) continue
      seen.add(to)
      if (this.#scanQueue.size >= this.#maxPendingPrefetch) break
      this.#queuePrefetch(to, context)
    }
    this.#scheduleScan()
  }

  #queuePrefetch (source, context) {
    if (this.#destroyed || this.#scanQueue.size >= this.#maxPendingPrefetch || this.#scanQueue.has(source)) return
    if (this.#cacheableTemplate(source) === null || this.#cache.has(source) || this.#inFlight.has(source)) return
    this.#scanQueue.set(source, context)
  }

  #scheduleScan () {
    if (this.#destroyed || this.#paused || this.#scanTimer !== null || this.#scanQueue.size === 0 || this.#activeScans >= this.#prefetchConcurrency) return
    // One start per task yields between static HTML parses instead of doing all
    // speculative work synchronously inside the navigation's insertion path.
    this.#scanTimer = setTimeout(() => {
      this.#scanTimer = null
      if (this.#destroyed || this.#scanQueue.size === 0) return
      const [source, context] = this.#scanQueue.entries().next().value
      this.#scanQueue.delete(source)
      this.#activeScans++
      this.#ensureCached(source, context).catch(() => {}).finally(() => {
        this.#activeScans--
        this.#scheduleScan()
      })
      this.#scheduleScan()
    }, 0)
  }

  /** Stop starting speculative work while navigation prepares or animates. */
  pause () {
    this.#paused = true
    if (this.#scanTimer !== null) clearTimeout(this.#scanTimer)
    this.#scanTimer = null
  }

  resume () {
    this.#paused = false
    this.#scheduleScan()
  }

  /** Cancel speculative work; running resolutions can finish for their consumers. */
  destroy () {
    this.#destroyed = true
    if (this.#scanTimer !== null) clearTimeout(this.#scanTimer)
    this.#scanTimer = null
    this.#scanQueue.clear()
    this.#cache.clear()
  }
}
