/**
 * ViewResolver — step 1 of the view rendering pipeline: resolves a view source to a DOM element.
 * Used by ViewPrefetcher. Prioritizes "name" (key in views) so hyphenated
 * view names like 'my-dashboard' are not mistaken for web components.
 * Does NOT add .z-view, insert, or call mounted(); that is done by prepareAndInsertView().
 */

import { createViewLifecycle } from './view-lifecycle.js'
import { unknownViewMessage } from './diagnostics.js'

/** Default fetch timeout in ms for URL-backed views. */
const FETCH_TIMEOUT_MS = 10000

/** How long a custom element tag may stay undefined before resolution fails. */
const CUSTOM_ELEMENT_TIMEOUT_MS = 10000

/**
 * Parse an HTML template into one element. A single root element is used as
 * is; several roots (or top-level text) are wrapped in a .z-view so no content
 * is dropped.
 */
function htmlToElement (html, kind) {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html.trim()
  const roots = [...wrapper.childNodes].filter(node =>
    node.nodeType === 1 || (node.nodeType === 3 && node.textContent.trim()))
  if (roots.length === 0) throw new Error(`Zumly: view produced no element (${kind})`)
  if (roots.length === 1 && roots[0].nodeType === 1) return roots[0]
  const view = document.createElement('div')
  view.className = 'z-view'
  view.append(...wrapper.childNodes)
  return view
}

function describe (source) {
  if (source === null) return 'null'
  if (Array.isArray(source)) return 'an array'
  if (typeof source === 'string') return `the string "${source.length > 40 ? source.slice(0, 40) + '…' : source}"`
  return typeof source === 'object' ? 'an object without render()' : `a ${typeof source}`
}

export class ViewResolver {
  #views = {}
  #customElementTimeoutMs

  constructor (views = {}, { customElementTimeoutMs } = {}) {
    this.#views = views
    this.#customElementTimeoutMs = customElementTimeoutMs ?? CUSTOM_ELEMENT_TIMEOUT_MS
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
    const requested = source
    const seen = new Set()
    while (typeof source === 'string' && Object.prototype.hasOwnProperty.call(this.#views, source)) {
      if (seen.has(source)) throw new Error(`Zumly: circular view alias "${source}"`)
      seen.add(source)
      source = this.#views[source]
    }

    const type = this.#detectType(source)
    switch (type) {
      case 'html':
        return htmlToElement(source, 'html')
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
        return htmlToElement(html, `url ${source}`)
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
          onCleanup: lifecycle.onCleanup,
          onActivate: lifecycle.onActivate
        }
        try {
          const result = await (type === 'function' ? source(resolvedContext) : source.render(resolvedContext))
          let node
          if (typeof result === 'string') node = await this.resolve(result, resolvedContext)
          else if (result instanceof HTMLElement) node = result
          // Preserve a framework's mount container and all of its root nodes.
          else if (type === 'function') {
            node = target
            if (target.children.length === 1 && target.firstElementChild.classList.contains('z-view') && !target.classList.contains('z-view')) {
              console.warn(`Zumly: view ${typeof requested === 'string' ? `"${requested}" ` : ''}filled ctx.target with another .z-view. ctx.target already is the view: put the classes on it (ctx.target.className = 'z-view card') and render only the content, or return the HTML string.`) // eslint-disable-line no-console
            }
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
        if (!customElements.get(source)) {
          // An undefined tag usually means a mistyped view name: fail with a
          // clear message instead of waiting forever with navigation locked.
          let timer
          const timeout = new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error(typeof requested === 'string' && requested === source
              ? `Zumly: ${unknownViewMessage(source, this.#views)} No custom element <${source}> was defined within ${this.#customElementTimeoutMs / 1000}s either.`
              : `Zumly: custom element <${source}> was not defined within ${this.#customElementTimeoutMs / 1000}s. Register it with customElements.define().`)), this.#customElementTimeoutMs)
          })
          try {
            await Promise.race([customElements.whenDefined(source), timeout])
          } finally {
            clearTimeout(timer)
          }
        }
        return document.createElement(source)
      }
      default:
        if (typeof requested === 'string' && requested === source) {
          throw new Error(`Zumly: ${unknownViewMessage(source, this.#views)}`)
        }
        throw new Error(`Zumly: view ${typeof requested === 'string' ? `"${requested}" ` : ''}has an unsupported source (${describe(source)}). Use an HTML string, a URL, a function, an object with render(), an HTMLElement or a custom element tag.`)
    }
  }
}
