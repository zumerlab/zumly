/**
 * ViewCache — stores resolved view nodes with optional TTL.
 * Returns a clone on get so the cached node is not mutated by the consumer.
 */

export class ViewCache {
  #store = new Map()

  /**
   * @param {string} key - View name or source id.
   * @param {HTMLElement} node - Resolved node to store (will be cloned).
   * @param {number|null} [ttl=null] - TTL in ms; null = no expiry.
   */
  set (key, node, ttl = null) {
    this.#store.set(key, {
      node: node.cloneNode(true),
      expires: ttl ? Date.now() + ttl : null
    })
  }

  /**
   * @param {string} key
   * @returns {HTMLElement|null} Cloned node or null if missing/expired.
   */
  get (key) {
    const entry = this.#store.get(key)
    if (!entry) return null
    if (entry.expires !== null && Date.now() > entry.expires) {
      this.#store.delete(key)
      return null
    }
    return entry.node.cloneNode(true)
  }

  has (key) {
    return this.get(key) !== null
  }

  invalidate (key) {
    this.#store.delete(key)
  }

  clear () {
    this.#store.clear()
  }
}
