/**
 * ViewCache — stores resolved view nodes with optional TTL and bounded LRU eviction.
 * Used by ViewPrefetcher for static HTML (ttl=null) and URL-backed views (ttl=REMOTE_TTL).
 * Returns a clone on get so the cached node is not mutated by the consumer.
 * Function/object views are never stored here; they are resolved fresh each time.
 */

export class ViewCache {
  #store = new Map()
  #maxEntries

  constructor ({ maxEntries = 64 } = {}) {
    this.#maxEntries = Number.isInteger(maxEntries) && maxEntries >= 0 ? maxEntries : 64
  }

  /**
   * @param {string} key - View name or source id.
   * @param {HTMLElement} node - Resolved node to store (will be cloned).
   * @param {number|null} [ttl=null] - TTL in ms; null = no expiry.
   */
  set (key, node, ttl = null) {
    if (this.#maxEntries === 0) return
    this.adopt(key, node.cloneNode(true), ttl)
  }

  /**
   * Internal ownership transfer for a freshly resolved node that never escapes
   * the prefetcher. Other callers must use set() to preserve snapshot isolation.
   */
  adopt (key, node, ttl = null) {
    const now = Date.now()
    // Expired, never-visited prefetches must not displace live entries on insert.
    for (const [storedKey, entry] of this.#store) {
      if (entry.expires !== null && now >= entry.expires) this.#store.delete(storedKey)
    }
    if (this.#maxEntries === 0) return
    this.#store.delete(key)
    this.#store.set(key, {
      node,
      expires: ttl === null ? null : now + ttl
    })
    while (this.#store.size > this.#maxEntries) {
      this.#store.delete(this.#store.keys().next().value)
    }
  }

  /**
   * @param {string} key
   * @returns {HTMLElement|null} Cloned node or null if missing/expired.
   */
  get (key) {
    const entry = this.#store.get(key)
    if (!entry) return null
    if (entry.expires !== null && Date.now() >= entry.expires) {
      this.#store.delete(key)
      return null
    }
    // Actual consumption refreshes LRU order; speculative has() checks do not.
    this.#store.delete(key)
    this.#store.set(key, entry)
    return entry.node.cloneNode(true)
  }

  /**
   * @param {string} key
   * @returns {boolean} True if entry exists and is not expired. Does not clone.
   */
  has (key) {
    const entry = this.#store.get(key)
    if (!entry) return false
    if (entry.expires !== null && Date.now() >= entry.expires) {
      this.#store.delete(key)
      return false
    }
    return true
  }

  invalidate (key) {
    this.#store.delete(key)
  }

  clear () {
    this.#store.clear()
  }
}
