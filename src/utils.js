/**
 * VIEW RENDERING PIPELINE (official contract)
 * ------------------------------------------
 * 1. Resolve: ViewResolver.resolve(source, context) → DOM node
 * 2. Normalize: ensure node has .z-view (wrap or add class)
 * 3. Insert: set dataset.viewName, classes (is-current-view / is-new-current-view), append to canvas
 * 4. Mounted: call views[viewName].mounted() only AFTER insertion
 *
 * The engine uses ViewPrefetcher.get() for resolution and prepareAndInsertView() for steps 2–4.
 */

import { ViewResolver } from './view-resolver.js'

/**
 * Prepare a resolved view node and insert it into the canvas.
 * Steps 2–4 of the pipeline: normalize .z-view, set classes, append, then mounted().
 * Contract: mounted() is invoked only after the node is in the canvas.
 *
 * @param {HTMLElement} node - Resolved view node from ViewResolver / ViewPrefetcher.get()
 * @param {string} viewName - View name (key in views)
 * @param {HTMLElement} canvas - Mount element
 * @param {boolean} isInit - True for initial view, false for zoom-in
 * @param {object} views - Views map
 * @param {object} componentContext - Passed to object views
 * @returns {Promise<HTMLElement>} The inserted node (with .z-view, dataset, classes applied)
 */
export async function prepareAndInsertView (node, viewName, canvas, isInit, views, componentContext) {
  if (!node || !node.classList) {
    const wrap = document.createElement('div')
    wrap.classList.add('z-view')
    if (node) wrap.appendChild(node)
    node = wrap
  } else if (!node.classList.contains('z-view')) {
    node.classList.add('z-view')
  }
  node.dataset.viewName = viewName
  if (!node.getAttribute('aria-label')) {
    node.setAttribute('aria-label', `View: ${viewName}`)
  }
  node.style.transformOrigin = '0 0'
  if (isInit) {
    node.classList.add('is-current-view')
  } else {
    node.classList.add('is-new-current-view', 'has-no-events', 'hide')
  }
  canvas.append(node)
  if (typeof views[viewName] === 'object' && typeof views[viewName].mounted === 'function') {
    await views[viewName].mounted()
  }
  return node
}

/**
 * @deprecated Use ViewPrefetcher.get() + prepareAndInsertView() instead.
 * This wrapper delegates to ViewResolver + prepareAndInsertView for backward compatibility.
 *
 * @param {HTMLElement|string} el - Trigger element (zoom) or view name string (init)
 * @param {HTMLElement} canvas - Mount element
 * @param {object} views - Views map
 * @param {boolean} init - True for initial view
 * @param {object} componentContext - Passed to object/function views
 * @returns {Promise<HTMLElement>} The inserted node
 */
export async function renderView (el, canvas, views, init, componentContext) {
  const viewName = init ? el : el.dataset.to
  const context = init ? null : {
    trigger: el,
    target: document.createElement('div'),
    context: componentContext,
    props: Object.assign({}, el.dataset)
  }
  const resolver = new ViewResolver(views)
  const node = await resolver.resolve(viewName, context)
  return prepareAndInsertView(node, viewName, canvas, init, views, componentContext)
}

export function notification (debug, msg, type) {
  if (msg && type === 'welcome') {
    console.info(`%c Zumly %c ${msg}`, 'background: #424085; color: white; border-radius: 3px;', 'color: #424085') // eslint-disable-line no-console
  }
  if (msg && debug && (type === 'info' || type === undefined)) {
    console.info(`%c Zumly %c ${msg}`, 'background: #6679A3; color: #304157; border-radius: 3px;', 'color: #6679A3') // eslint-disable-line no-console
  }
  if (msg && type === 'warn') {
    console.warn(`%c Zumly %c ${msg}`, 'background: #DCBF53; color: #424085; border-radius: 3px;', 'color: #424085') // eslint-disable-line no-console
  }
  if (msg && type === 'error') {
    console.error(`%c Zumly %c ${msg}`, 'background: #BE4747; color: white; border-radius: 3px;', 'color: #424085') // eslint-disable-line no-console
  }
}

export function checkParameters (parameters, instance) {
  // Minimal, explicit normalization with safe defaults.
  // Strictness: invalid values warn/error and fall back to safe defaults.
  instance.isValid = false

  if (!parameters || typeof parameters !== 'object') {
    notification(false, '\'options\' object has to be provided when instance is defined', 'error')
    return
  }

  // Required: all must pass for instance to be valid
  if (typeof parameters.mount !== 'string') {
    notification(false, '\'mount\' must be a string selector', 'error')
    return
  }
  instance.mount = parameters.mount

  if (typeof parameters.initialView !== 'string') {
    notification(false, '\'initialView\' must be a string', 'error')
    return
  }
  instance.initialView = parameters.initialView

  if (!parameters.views || typeof parameters.views !== 'object') {
    notification(false, '\'views\' must be an object', 'error')
    return
  }
  instance.views = parameters.views

  instance.isValid = true

  // Optional
  instance.preload = Array.isArray(parameters.preload) ? parameters.preload : []
  instance.debug = typeof parameters.debug === 'boolean' ? parameters.debug : false
  instance.componentContext = (parameters.componentContext && typeof parameters.componentContext === 'object') ? parameters.componentContext : new Map()

  // Transitions normalization
  const t = parameters.transitions && typeof parameters.transitions === 'object' ? parameters.transitions : null

  const coverIn = t && t.cover
  const coverLower = typeof coverIn === 'string' ? coverIn.toLowerCase() : null
  const coverOk = coverLower === 'width' || coverLower === 'height'
  instance.cover = coverOk ? coverLower : 'width'
  if (!coverOk && t && coverIn !== undefined) {
    notification(false, '\'transitions.cover\' must be either \"width\" or \"height\". Falling back to \"width\".', 'warn')
  }

  instance.duration = (t && typeof t.duration === 'string') ? t.duration : '1s'
  instance.ease = (t && typeof t.ease === 'string') ? t.ease : 'ease-in-out'

  // Effects: not implemented; reserved for future filter animations on background views.
  instance.effects = ['none', 'none']
  if (t && t.effects !== undefined) {
    notification(false, '\'transitions.effects\' is not implemented and is ignored.', 'warn')
  }

  // Transition driver: 'css' | 'waapi' | 'none' | 'anime' | 'gsap' | 'motion' or custom function(spec, onComplete)
  const driverIn = t && t.driver
  const driverStr = typeof driverIn === 'string' ? driverIn.toLowerCase() : null
  const driverFn = typeof driverIn === 'function' ? driverIn : null
  if (driverStr !== null) {
    const allowed = ['css', 'waapi', 'none', 'anime', 'gsap', 'motion']
    instance.transitionDriver = allowed.includes(driverStr) ? driverStr : 'css'
    if (!allowed.includes(driverStr)) {
      notification(false, `'transitions.driver' must be "css", "waapi", "none", "anime", "gsap", "motion", or a function. Got "${driverIn}". Falling back to "css".`, 'warn')
    }
  } else if (driverFn !== null) {
    instance.transitionDriver = driverFn
  } else {
    instance.transitionDriver = 'css'
  }
}
