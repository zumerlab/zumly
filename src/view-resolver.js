/**
 * ViewResolver — step 1 of the view rendering pipeline: resolves a view source to a DOM element.
 * Used by ViewPrefetcher. Prioritizes "name" (key in views) so hyphenated
 * view names like 'my-dashboard' are not mistaken for web components.
 * Does NOT add .z-view, insert, or call mounted(); that is done by prepareAndInsertView().
 */

import { createViewLifecycle } from './view-lifecycle.js'

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
    if (/^https?:\/\/|^\/|\.(?:html|php)(?:[?#].*)?$/i.test(source)) return 'url'
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
    const seen = new Set()
    while (typeof source === 'string' && Object.prototype.hasOwnProperty.call(this.#views, source)) {
      if (seen.has(source)) throw new Error(`Zumly: circular view alias "${source}"`)
      seen.add(source)
      source = this.#views[source]
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
        let html
        try {
          const res = await fetch(source, { signal: controller.signal })
          if (!res.ok) throw new Error(`Zumly: fetch failed for "${source}" (${res.status})`)
          html = await res.text()
        } finally {
          clearTimeout(timer)
        }
        const wrapper = document.createElement('div')
        wrapper.innerHTML = html.trim()
        const el = wrapper.firstElementChild
        if (!el) throw new Error(`Zumly: view produced no element (url)`)
        return el
      }
      case 'function':
      case 'object': {
        const lifecycle = createViewLifecycle()
        const target = context?.target || document.createElement('div')
        // The engine owns this preparation target before render resolves, so
        // destroy can release registered resources even if render never settles.
        lifecycle.attach(target)
        const resolvedContext = {
          ...context,
          target,
          props: context?.props || {},
          context: context?.context || new Map(),
          onCleanup: lifecycle.onCleanup
        }
        try {
          const result = await (type === 'function' ? source(resolvedContext) : source.render(resolvedContext))
          let node
          if (typeof result === 'string') node = await this.resolve(result, resolvedContext)
          else if (result instanceof HTMLElement) node = result
          // Preserve a framework's mount container and all of its root nodes.
          else if (type === 'function') {
            node = target
            // .z-view has size containment. Give an unstyled mount container a
            // useful canvas-sized default; authored classes/inline sizes win.
            if (!target.classList.length) {
              if (!target.style.width) target.style.width = '100%'
              if (!target.style.height) target.style.height = '100%'
            }
          }
          else throw new Error('Zumly: view render() must return a string or HTMLElement')
          lifecycle.attach(node)
          return node
        } catch (error) {
          lifecycle.dispose()
          throw error
        }
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
