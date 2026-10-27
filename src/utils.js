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
import { disposeView } from './view-lifecycle.js'
import { didYouMean, unknownKeys, unknownViewMessage, CSS_TIME, isCssEasingSyntax, isValidCssEasing } from './diagnostics.js'

const OPTION_KEYS = ['mount', 'initialView', 'views', 'preload', 'transitions', 'debug', 'componentContext', 'lateralNav', 'depthNav', 'inputs', 'deferred', 'labels', 'gestures', 'flatten']
const TRANSITION_KEYS = ['driver', 'cover', 'duration', 'ease', 'effects', 'animateEffects', 'stagger', 'parallax', 'hideTrigger']
const LATERAL_NAV_KEYS = ['mode', 'arrows', 'dots', 'keepAlive', 'position', 'siblings', 'swipe']
const DEPTH_NAV_KEYS = ['position', 'style']
const DEPTH_NAV_STYLES = ['button', 'title', 'rings']
const INPUT_KEYS = ['click', 'keyboard', 'wheel', 'touch', 'pinch']
const GESTURE_KEYS = ['follow', 'threshold']
const FLATTEN_KEYS = ['snapdom', 'minNodes', 'scale', 'refresh']
const LABEL_KEYS = ['back', 'prev', 'next', 'goTo']
/** Accessible names of the navigation controls. {title} and {name} name the target view. */
const DEFAULT_LABELS = { back: 'Back to {title}', prev: 'Previous sibling view', next: 'Next sibling view', goTo: 'Go to {title}' }

/** Warn once per unknown key, with the closest known key when there is one. */
function warnUnknownKeys (object, known, path) {
  for (const key of unknownKeys(object, known)) {
    notification(false, `unknown option '${path}${key}' is ignored.${didYouMean(key, known)}`, 'warn')
  }
}

/** Raw view templates that the resolver accepts in place of a view name. */
function isRawViewSource (source) {
  return source.includes('<') || source.includes('-') || /^https?:\/\/|^\/|\.(?:html|php)(?:[?#].*)?$/i.test(source)
}

/**
 * The `title` a view definition declares (`{ render, title }`, a function
 * view with a `title` property, or the root data-title of an HTML string), if any.
 * @param {*} definition - Value from the views map
 * @returns {string|undefined}
 */
export function definitionTitle (definition) {
  // An HTML string view: the data-title on its root element
  if (typeof definition === 'string') {
    const match = /^\s*<[^>]*?\sdata-title="([^"]*)"/.exec(definition)
    if (!match) return undefined
    const decode = document.createElement('textarea')
    decode.innerHTML = match[1]
    return decode.value || undefined
  }
  if (!definition || (typeof definition !== 'object' && typeof definition !== 'function')) return undefined
  return typeof definition.title === 'string' && definition.title ? definition.title : undefined
}

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
 * @param {(node: HTMLElement) => void} [onInsert] - Called right after the node enters the canvas
 * @returns {Promise<HTMLElement>} The inserted node (with .z-view, dataset, classes applied)
 */
export async function prepareAndInsertView (node, viewName, canvas, isInit, views, componentContext, onInsert) {
  if (!node || !node.classList) {
    const wrap = document.createElement('div')
    wrap.classList.add('z-view')
    if (node) wrap.appendChild(node)
    node = wrap
  } else if (!node.classList.contains('z-view')) {
    node.classList.add('z-view')
  }
  node.dataset.viewName = viewName
  // Human-readable name: data-title on the view wins over `title` in its definition.
  const title = node.dataset.title || definitionTitle(views[viewName])
  if (title) node.dataset.title = title
  if (!node.getAttribute('aria-label')) {
    node.setAttribute('aria-label', `View: ${title || viewName}`)
  }
  node.style.transformOrigin = '0 0'
  node.style.position = 'absolute'
  if (isInit) {
    node.classList.add('is-current-view')
  } else {
    node.classList.add('is-new-current-view', 'has-no-events', 'hide')
  }
  canvas.append(node)
  onInsert?.(node)
  try {
    if (views[viewName] && typeof views[viewName] === 'object' && typeof views[viewName].mounted === 'function') {
      await views[viewName].mounted(node)
    }
  } catch (error) {
    disposeView(node)
    node.remove()
    throw error
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
  const context = {
    trigger: init ? undefined : el,
    target: document.createElement('div'),
    context: componentContext,
    props: init ? {} : Object.assign({}, el.dataset)
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

/**
 * Normalize a duration option. Numbers are milliseconds; strings use CSS time.
 * @returns {string} CSS time
 */
export function normalizeDuration (value, label, fallback = '1s') {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return `${value}ms`
  if (typeof value === 'string' && CSS_TIME.test(value.trim())) return value.trim()
  notification(false, `'${label}' must be a CSS time ('600ms', '1s') or a number of milliseconds. Got ${JSON.stringify(value)}. Falling back to "${fallback}".`, 'warn')
  return fallback
}

/**
 * Normalize an easing option. CSS easing syntax is checked against the browser;
 * other names pass through to animation-library drivers ('power2.out', 'easeOutExpo').
 */
export function normalizeEase (value, driver, label, fallback = 'ease-in-out') {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || !value.trim()) {
    notification(false, `'${label}' must be a string such as 'ease-in-out' or 'cubic-bezier(.2,.8,.2,1)'. Falling back to "${fallback}".`, 'warn')
    return fallback
  }
  const ease = value.trim()
  const cssOnly = driver === 'css' || driver === 'waapi'
  if ((cssOnly || isCssEasingSyntax(ease)) && !isValidCssEasing(ease)) {
    const hint = cssOnly ? ` The "${driver}" driver needs a CSS timing function.` : ''
    notification(false, `'${label}' "${ease}" is not a valid CSS easing.${hint} Falling back to "${fallback}".`, 'warn')
    return fallback
  }
  return ease
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
  const mountIsElement = typeof HTMLElement !== 'undefined' && parameters.mount instanceof HTMLElement
  if (typeof parameters.mount !== 'string' && !mountIsElement) {
    notification(false, '\'mount\' must be a CSS selector string or an HTMLElement (e.g. \'.canvas\' or a framework ref).', 'error')
    return
  }
  instance.mount = parameters.mount

  if (!parameters.views || typeof parameters.views !== 'object') {
    notification(false, '\'views\' must be an object that maps view names to view sources, e.g. { home: \'<div class="z-view">…</div>\' }.', 'error')
    return
  }
  instance.views = parameters.views

  if (typeof parameters.initialView !== 'string' || !parameters.initialView) {
    notification(false, `'initialView' must be the name of a view. Available: ${Object.keys(parameters.views).join(', ') || '(none)'}.`, 'error')
    return
  }
  if (!Object.prototype.hasOwnProperty.call(parameters.views, parameters.initialView) && !isRawViewSource(parameters.initialView)) {
    notification(false, `'initialView': ${unknownViewMessage(parameters.initialView, parameters.views)}`, 'error')
    return
  }
  instance.initialView = parameters.initialView

  instance.isValid = true

  warnUnknownKeys(parameters, OPTION_KEYS, '')
  if (parameters.transitions && typeof parameters.transitions === 'object') warnUnknownKeys(parameters.transitions, TRANSITION_KEYS, 'transitions.')
  if (parameters.lateralNav && typeof parameters.lateralNav === 'object') warnUnknownKeys(parameters.lateralNav, LATERAL_NAV_KEYS, 'lateralNav.')
  if (parameters.depthNav && typeof parameters.depthNav === 'object') warnUnknownKeys(parameters.depthNav, DEPTH_NAV_KEYS, 'depthNav.')
  if (parameters.inputs && typeof parameters.inputs === 'object') warnUnknownKeys(parameters.inputs, INPUT_KEYS, 'inputs.')
  if (parameters.labels && typeof parameters.labels === 'object') warnUnknownKeys(parameters.labels, LABEL_KEYS, 'labels.')
  if (parameters.gestures && typeof parameters.gestures === 'object') warnUnknownKeys(parameters.gestures, GESTURE_KEYS, 'gestures.')
  if (parameters.flatten && typeof parameters.flatten === 'object') warnUnknownKeys(parameters.flatten, FLATTEN_KEYS, 'flatten.')

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

  instance.duration = normalizeDuration(t && t.duration, 'transitions.duration')

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

  // animateEffects: false applies background effects at once instead of transitioning the
  // filter with the zoom. A filter animating on large background layers is the costliest
  // part of a transition with heavy views.
  const aeIn = t ? t.animateEffects : undefined
  instance.animateEffects = aeIn !== false
  if (aeIn !== undefined && typeof aeIn !== 'boolean') {
    notification(false, '\'transitions.animateEffects\' must be a boolean. Falling back to true.', 'warn')
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

  instance.ease = normalizeEase(t && t.ease, instance.transitionDriver, 'transitions.ease')

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

  // Lateral navigation UI: auto-generated arrows and dots when siblings exist.
  // true = default (mode: 'auto'), false = disabled,
  // or object: { mode: 'always'|'auto', arrows: true, dots: true }
  // mode: 'always' (default) — show lateral nav whenever siblings exist.
  // mode: 'auto' — only show it when the current view doesn't cover the full canvas.
  const lnIn = parameters.lateralNav
  if (lnIn === false) {
    instance.lateralNav = false
  } else if (lnIn && typeof lnIn === 'object') {
    const modeIn = typeof lnIn.mode === 'string' ? lnIn.mode.toLowerCase() : null
    const modeOk = modeIn === 'auto' || modeIn === 'always'
    if (modeIn && !modeOk) {
      notification(false, '\'lateralNav.mode\' must be "always" or "auto". Falling back to "always".', 'warn')
    }
    // siblings: declared lateral order — first-class replacement for inferring
    // sibling order/direction from trigger positions in the parent view.
    // Array form: ['a','b','c'] (one lateral group), or map keyed by parent
    // view name: { home: ['a','b','c'], other: [...] }.
    let siblingsIn = null
    if (Array.isArray(lnIn.siblings)) {
      siblingsIn = lnIn.siblings.filter(s => typeof s === 'string' && s)
      if (siblingsIn.length < 2) {
        notification(false, '\'lateralNav.siblings\' needs at least 2 view names. Ignoring.', 'warn')
        siblingsIn = null
      }
    } else if (lnIn.siblings && typeof lnIn.siblings === 'object') {
      siblingsIn = {}
      for (const [parent, list] of Object.entries(lnIn.siblings)) {
        if (Array.isArray(list)) {
          const clean = list.filter(s => typeof s === 'string' && s)
          if (clean.length >= 2) siblingsIn[parent] = clean
        }
      }
      if (Object.keys(siblingsIn).length === 0) siblingsIn = null
    } else if (lnIn.siblings !== undefined) {
      notification(false, '\'lateralNav.siblings\' must be an array of view names or a { parentView: [...] } map. Ignoring.', 'warn')
    }
    instance.lateralNav = {
      mode: modeOk ? modeIn : 'always',
      arrows: typeof lnIn.arrows === 'boolean' ? lnIn.arrows : true,
      dots: typeof lnIn.dots === 'boolean' ? lnIn.dots : true,
      keepAlive: (lnIn.keepAlive === true || lnIn.keepAlive === 'visible') ? lnIn.keepAlive : false,
      siblings: siblingsIn,
      // swipe: a horizontal swipe moves between siblings instead of zooming out.
      swipe: lnIn.swipe === true
    }
  } else {
    instance.lateralNav = { mode: 'always', arrows: true, dots: true, keepAlive: false, siblings: null, swipe: false }
  }

  // Depth navigation UI: zoom-out back button.
  // true = default (enabled), false = disabled,
  // or object: { position: 'bottom-left'|'top-left' }
  const dnIn = parameters.depthNav
  if (dnIn === false) {
    instance.depthNav = false
  } else if (dnIn && typeof dnIn === 'object') {
    const dpIn = typeof dnIn.position === 'string' ? dnIn.position.toLowerCase() : null
    const dpOk = dpIn === 'bottom-left' || dpIn === 'top-left'
    if (dpIn && !dpOk) {
      notification(false, '\'depthNav.position\' must be "bottom-left" or "top-left". Falling back to "bottom-left".', 'warn')
    }
    // style: 'button' (chevron), 'title' (name of the view above), 'rings'
    // (a ring per level above; hover or long press to jump several).
    const dsIn = typeof dnIn.style === 'string' ? dnIn.style.toLowerCase() : null
    const dsOk = DEPTH_NAV_STYLES.includes(dsIn)
    if (dnIn.style !== undefined && !dsOk) {
      notification(false, '\'depthNav.style\' must be "button", "title" or "rings". Falling back to "button".', 'warn')
    }
    instance.depthNav = {
      position: dpOk ? dpIn : 'bottom-left',
      style: dsOk ? dsIn : 'button'
    }
  } else {
    instance.depthNav = { position: 'bottom-left', style: 'button' }
  }

  // Lateral navigation position: 'bottom-center' (default) or 'top-center'.
  const lnpIn = parameters.lateralNav && typeof parameters.lateralNav === 'object'
    ? parameters.lateralNav.position : undefined
  if (instance.lateralNav && typeof instance.lateralNav === 'object') {
    const lpOk = lnpIn === 'bottom-center' || lnpIn === 'top-center'
    if (lnpIn && !lpOk) {
      notification(false, '\'lateralNav.position\' must be "bottom-center" or "top-center". Falling back to "bottom-center".', 'warn')
    }
    instance.lateralNav.position = lpOk ? lnpIn : 'bottom-center'
  }

  // Navigation labels: each a template ('Back to {title}'), a function
  // ({ name, title }) => string, or false to leave the control without one.
  // labels: false turns them all off.
  const lbIn = parameters.labels
  instance.labels = { ...DEFAULT_LABELS }
  if (lbIn === false) {
    for (const key of LABEL_KEYS) instance.labels[key] = false
  } else if (lbIn && typeof lbIn === 'object') {
    for (const key of LABEL_KEYS) {
      const value = lbIn[key]
      if (value === undefined) continue
      if (value === false || typeof value === 'string' || typeof value === 'function') instance.labels[key] = value
      else notification(false, `'labels.${key}' must be a string, a function or false. Using the default.`, 'warn')
    }
  } else if (lbIn !== undefined) {
    notification(false, '\'labels\' must be an object or false. Using the defaults.', 'warn')
  }

  // Navigation inputs: control which user interactions trigger zoom/navigation.
  // All enabled by default. Set individual keys to false to disable.
  const niIn = parameters.inputs
  // pinch (two fingers closing zooms out) is opt-in: it competes with page zoom.
  if (niIn === false) {
    instance.inputs = { wheel: false, keyboard: false, click: false, touch: false, pinch: false }
  } else if (niIn && typeof niIn === 'object') {
    instance.inputs = {
      wheel: typeof niIn.wheel === 'boolean' ? niIn.wheel : true,
      keyboard: typeof niIn.keyboard === 'boolean' ? niIn.keyboard : true,
      click: typeof niIn.click === 'boolean' ? niIn.click : true,
      touch: typeof niIn.touch === 'boolean' ? niIn.touch : true,
      pinch: niIn.pinch === true
    }
  } else {
    instance.inputs = { wheel: true, keyboard: true, click: true, touch: true, pinch: false }
  }

  // Gestures: follow: true makes wheel/trackpad, swipe and pinch drive the
  // zoom-out with their progress; releasing past threshold (0–1) finishes it.
  const geIn = parameters.gestures
  instance.gestures = { follow: false, threshold: 0.5 }
  if (geIn === true) {
    instance.gestures.follow = true
  } else if (geIn && typeof geIn === 'object') {
    instance.gestures.follow = geIn.follow === true
    if (geIn.threshold !== undefined) {
      if (typeof geIn.threshold === 'number' && geIn.threshold > 0 && geIn.threshold < 1) instance.gestures.threshold = geIn.threshold
      else notification(false, '\'gestures.threshold\' must be a number between 0 and 1. Falling back to 0.5.', 'warn')
    }
  } else if (geIn !== undefined && geIn !== false) {
    notification(false, '\'gestures\' must be true, false or { follow, threshold }. Ignoring.', 'warn')
  }

  // Flatten: views behind are shown as a SnapDOM photo (src/flatten.js). true reads the
  // global snapdom; the instance checks that SnapDOM is there when it starts.
  const flIn = parameters.flatten
  instance.flatten = false
  if (flIn === true || (flIn && typeof flIn === 'object')) {
    const o = flIn === true ? {} : flIn
    instance.flatten = { snapdom: null, minNodes: 800, scale: 1, refresh: false }
    if (o.snapdom !== undefined) {
      if (typeof o.snapdom === 'function') instance.flatten.snapdom = o.snapdom
      else notification(false, '\'flatten.snapdom\' must be the snapdom function (import { snapdom } from \'@zumer/snapdom\'). Trying the global snapdom.', 'warn')
    }
    if (o.minNodes !== undefined) {
      if (Number.isInteger(o.minNodes) && o.minNodes >= 0) instance.flatten.minNodes = o.minNodes
      else notification(false, '\'flatten.minNodes\' must be a whole number of 0 or more. Falling back to 800.', 'warn')
    }
    if (o.scale !== undefined) {
      if (typeof o.scale === 'number' && o.scale > 0 && o.scale <= 4) instance.flatten.scale = o.scale
      else notification(false, '\'flatten.scale\' must be a number above 0 and up to 4. Falling back to 1.', 'warn')
    }
    if (o.refresh !== undefined) {
      if (o.refresh === false || (typeof o.refresh === 'number' && o.refresh >= 0)) instance.flatten.refresh = o.refresh
      else notification(false, '\'flatten.refresh\' must be a number of milliseconds or false. Falling back to false.', 'warn')
    }
  } else if (flIn !== undefined && flIn !== false) {
    notification(false, '\'flatten\' must be true, false or { snapdom, minNodes, scale, refresh }. Ignoring.', 'warn')
  }
}

/**
 * Resolve a navigation label (see the `labels` option) for a target view.
 * @param {string|Function|false} label
 * @param {{ name?: string, title?: string }} [view]
 * @returns {string|null} null when the label is turned off
 */
export function formatLabel (label, view = {}) {
  if (label === false || label == null) return null
  if (typeof label === 'function') {
    const text = label(view)
    return typeof text === 'string' && text ? text : null
  }
  return label.replace(/\{(title|name)\}/g, (_, key) => view[key] ?? '')
}
