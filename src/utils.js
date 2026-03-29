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
  node.style.position = 'absolute'
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

  // Deferred rendering: render view content after zoom animation completes.
  // true = all views deferred, false = all views immediate (default).
  // Per-trigger override via data-deferred attribute on .zoom-me elements.
  instance.deferred = typeof parameters.deferred === 'boolean' ? parameters.deferred : false

  // hideTrigger: hide or crossfade the trigger element during zoom-in.
  // true = visibility:hidden, 'fade' = opacity crossfade, false = do nothing (default)
  const htIn = t && t.hideTrigger
  if (htIn === true || htIn === 'fade') {
    instance.hideTrigger = htIn
  } else {
    instance.hideTrigger = false
    if (htIn !== undefined && htIn !== null && htIn !== false) {
      notification(false, '\'transitions.hideTrigger\' must be true or "fade". Falling back to false.', 'warn')
    }
  }

  // Effects: CSS filter values for background views [previousView, lastView].
  // e.g. ['blur(3px)', 'blur(8px) saturate(0)']
  const effectsIn = t && t.effects
  if (Array.isArray(effectsIn) && effectsIn.length >= 2 &&
      typeof effectsIn[0] === 'string' && typeof effectsIn[1] === 'string') {
    instance.effects = [effectsIn[0], effectsIn[1]]
  } else if (Array.isArray(effectsIn) && effectsIn.length === 1 && typeof effectsIn[0] === 'string') {
    instance.effects = [effectsIn[0], effectsIn[0]]
  } else {
    instance.effects = ['none', 'none']
    if (effectsIn !== undefined && effectsIn !== null) {
      notification(false, '\'transitions.effects\' must be an array of 1-2 CSS filter strings (e.g. ["blur(3px)", "blur(8px) saturate(0)"]). Falling back to no effects.', 'warn')
    }
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

  // Stagger: progressive delay (ms) between view layers during zoom transitions.
  // Current starts immediately, previous after 1*stagger ms, last after 2*stagger ms.
  const staggerIn = t && t.stagger
  if (typeof staggerIn === 'number' && staggerIn > 0) {
    instance.stagger = staggerIn
  } else {
    instance.stagger = 0
    if (staggerIn !== undefined && staggerIn !== null && staggerIn !== 0) {
      notification(false, '\'transitions.stagger\' must be a positive number (ms). Falling back to 0 (disabled).', 'warn')
    }
  }

  // Parallax: disabled (reserved for future use).
  instance.parallax = 0

  // Threshold (elastic zoom): press-and-hold preview before committing zoom.
  // { enabled: true, duration: 300, commitAt: 0.5 }
  instance.threshold = null
  const thIn = t && t.threshold
  if (thIn && typeof thIn === 'object' && thIn.enabled) {
    instance.threshold = {
      duration: typeof thIn.duration === 'number' && thIn.duration > 0 ? thIn.duration : 300,
      commitAt: typeof thIn.commitAt === 'number' && thIn.commitAt > 0 && thIn.commitAt <= 1 ? thIn.commitAt : 0.5
    }
  }

  // Lateral navigation UI: auto-generated arrows and dots when siblings exist.
  // true = default (arrows + dots), false = disabled,
  // or object: { arrows: true, dots: true }
  const lnIn = parameters.lateralNav
  if (lnIn === false) {
    instance.lateralNav = false
  } else if (lnIn && typeof lnIn === 'object') {
    instance.lateralNav = {
      arrows: typeof lnIn.arrows === 'boolean' ? lnIn.arrows : true,
      dots: typeof lnIn.dots === 'boolean' ? lnIn.dots : true,
      keepAlive: (lnIn.keepAlive === true || lnIn.keepAlive === 'visible') ? lnIn.keepAlive : false
    }
  } else {
    instance.lateralNav = { arrows: true, dots: true, keepAlive: false }
  }

  // Depth navigation UI: zoom-out button + level indicator.
  // true = default (button + indicator), false = disabled,
  // or object: { button: true, indicator: true }
  const dnIn = parameters.depthNav
  if (dnIn === false) {
    instance.depthNav = false
  } else if (dnIn && typeof dnIn === 'object') {
    instance.depthNav = {
      button: typeof dnIn.button === 'boolean' ? dnIn.button : true,
      indicator: typeof dnIn.indicator === 'boolean' ? dnIn.indicator : true
    }
  } else {
    instance.depthNav = { button: true, indicator: true }
  }

  // Navigation inputs: control which user interactions trigger zoom/navigation.
  // All enabled by default. Set individual keys to false to disable.
  const niIn = parameters.inputs
  if (niIn && typeof niIn === 'object') {
    instance.inputs = {
      wheel: typeof niIn.wheel === 'boolean' ? niIn.wheel : true,
      keyboard: typeof niIn.keyboard === 'boolean' ? niIn.keyboard : true,
      click: typeof niIn.click === 'boolean' ? niIn.click : true,
      touch: typeof niIn.touch === 'boolean' ? niIn.touch : true
    }
  } else {
    instance.inputs = { wheel: true, keyboard: true, click: true, touch: true }
  }
}
