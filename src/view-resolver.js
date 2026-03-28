/**
 * ViewResolver — step 1 of the view rendering pipeline: resolves a view source to a DOM element.
 * Used by ViewPrefetcher. Prioritizes "name" (key in views) so hyphenated
 * view names like 'my-dashboard' are not mistaken for web components.
 * Does NOT add .z-view, insert, or call mounted(); that is done by prepareAndInsertView().
 */

/** Default fetch timeout in ms for URL-backed views. */
const FETCH_TIMEOUT_MS = 10000

export class ViewResolver {
  #views = {}

  constructor (views = {}) {
    this.#views = views
  }

  #detectType (source) {
    if (typeof source === 'function') return 'function'
    if (source instanceof HTMLElement) return 'element'
    if (typeof source === 'object' && source !== null && typeof source.render === 'function') return 'object'
    if (typeof source !== 'string') return 'unknown'
    if (/^https?:\/\/|^\/|\.html$|\.php$/i.test(source)) return 'url'
    if (source.includes('<')) return 'html'
    if (source.includes('-')) return 'webcomponent'
    return 'unknown'
  }

  /**
   * Resolve a view source to a DOM element.
   * @param {string|Function|HTMLElement|object} source - View name (key in views), or raw template (HTML string, URL, function, element, { render }, tag name).
   * @param {object} [context=null] - Context passed to function views and render().
   * @returns {Promise<HTMLElement>}
   */
  async resolve (source, context = null) {
    // Name: source is a key in views → resolve the value
    if (typeof source === 'string' && Object.prototype.hasOwnProperty.call(this.#views, source)) {
      const template = this.#views[source]
      return this.resolve(template, context)
    }

    const type = this.#detectType(source)
    switch (type) {
      case 'html': {
        const wrapper = document.createElement('div')
        wrapper.innerHTML = source.trim()
        const el = wrapper.firstElementChild
        if (!el) throw new Error(`Zumly: view produced no element (html)`)
        return el
      }
      case 'url': {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
        let res
        try {
          res = await fetch(source, { signal: controller.signal })
        } finally {
          clearTimeout(timer)
        }
        if (!res.ok) throw new Error(`Zumly: fetch failed for "${source}" (${res.status})`)
        const html = await res.text()
        const wrapper = document.createElement('div')
        wrapper.innerHTML = html.trim()
        const el = wrapper.firstElementChild
        if (!el) throw new Error(`Zumly: view produced no element (url)`)
        return el
      }
      case 'function': {
        const target = (context && context.target) || document.createElement('div')
        const result = await source({ ...context, target })
        if (typeof result === 'string') return this.resolve(result, context)
        if (result instanceof HTMLElement) return result
        // Constructor-style: mounted into context.target
        const node = target.firstElementChild || target
        if (!node.classList.contains('z-view')) node.classList.add('z-view')
        return node
      }
      case 'object': {
        const html = await source.render(context)
        if (typeof html !== 'string') throw new Error('Zumly: view render() must return string')
        return this.resolve(html, context)
      }
      case 'element':
        return source.cloneNode(true)
      case 'webcomponent': {
        await customElements.whenDefined(source)
        return document.createElement(source)
      }
      default:
        throw new Error(`Zumly: unknown view type for source`)
    }
  }
}
