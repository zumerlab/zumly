
function setFx (values) {
  var start = ''
  var end = ''
  if (values !== undefined) {
    values.map(effect => {
      start += `${effect.toLowerCase() === 'blur' ? 'blur(0px) ' : effect.toLowerCase() === 'sepia' ? 'sepia(0) ' : effect.toLowerCase() === 'saturate' ? 'saturate(0) ' : 'none'}`
      end += `${effect.toLowerCase() === 'blur' ? 'blur(0.8px) ' : effect.toLowerCase() === 'sepia' ? 'sepia(5) ' : effect.toLowerCase() === 'saturate' ? 'saturate(8) ' : 'none'}`
    })
    return [start, end]
  }
}

/**
 * Prepare a resolved view node and insert it into the canvas.
 * Used when ViewPrefetcher is in use. Ensures .z-view, dataset.viewName, classes, and mounted().
 * @returns {Promise<HTMLElement>} The inserted node.
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
 * @deprecated Prefer ViewPrefetcher.get() + prepareAndInsertView(). Kept for backward compatibility.
 */
export async function renderView (el, canvas, views, init, componentContext) {
  var viewName = null
  init ? viewName = el : viewName = el.dataset.to
  var newView = document.createElement('template')

  if (typeof views[viewName] === 'object' && views[viewName].render !== undefined) {
    newView.innerHTML = await views[viewName].render()
  } else if (typeof views[viewName] === 'function') {
    var newViewInner = document.createElement('div')
    new views[viewName]({
      target: newViewInner,
      context: componentContext,
      props: el.dataset
    })
    newViewInner.classList.add('z-view')
    newView.content.appendChild(newViewInner)
  } else {
    newView.innerHTML = views[viewName]
  }

  let vv = newView.content.querySelector('.z-view')
  if (!vv) vv = newView.content.firstElementChild
  if (!vv) throw new Error(`Zumly: view "${viewName}" produced no element`)

  if (!vv.classList.contains('z-view')) vv.classList.add('z-view')
  if (!init) {
    vv.classList.add('is-new-current-view', 'has-no-events', 'hide')
  } else {
    vv.classList.add('is-current-view')
  }
  vv.style.transformOrigin = '0 0'
  vv.dataset.viewName = viewName

  canvas.append(newView.content)
  if (typeof views[viewName] === 'object' && typeof views[viewName].mounted === 'function') {
    await views[viewName].mounted()
  }

  return init ? canvas.querySelector('.is-current-view') : canvas.querySelector('.is-new-current-view')
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
  if (!parameters || typeof parameters !== 'object') {
    notification(false, '\'options\' object has to be provided when instance is defined', 'error')
    return
  }

  instance.options = true

  // Required
  if (typeof parameters.mount === 'string') instance.mount = parameters.mount
  else notification(false, '\'mount\' must be a string selector', 'error')

  if (typeof parameters.initialView === 'string') instance.initialView = parameters.initialView
  else notification(false, '\'initialView\' must be a string', 'error')

  if (parameters.views && typeof parameters.views === 'object') instance.views = parameters.views
  else notification(false, '\'views\' must be an object', 'error')

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

  // Effects: used by setFx() to produce filter start/end strings.
  // If transitions.effects is missing/invalid -> ['none','none'].
  if (!t || t.effects === undefined) {
    instance.effects = ['none', 'none']
  } else {
    const effectsInput = t.effects
    if (!Array.isArray(effectsInput) || effectsInput.length === 0 || !effectsInput.every(e => typeof e === 'string')) {
      notification(false, '\'transitions.effects\' must be an array of strings: blur|sepia|saturate (or [\"none\",...]). Falling back to [\"none\",\"none\"].', 'warn')
      instance.effects = ['none', 'none']
    } else {
      const effectsLower = effectsInput.map(e => e.toLowerCase())
      const firstIsNone = effectsLower[0] === 'none'
      const allowed = ['blur', 'sepia', 'saturate']
      const valid = firstIsNone || [...new Set(effectsLower)].every(v => allowed.indexOf(v) !== -1)
      if (!valid) {
        notification(false, '\'transitions.effects\' contains invalid values. Falling back to [\"none\",\"none\"].', 'warn')
        instance.effects = ['none', 'none']
      } else {
        instance.effects = setFx(effectsLower)
        // setFx() can return undefined only if effectsLower is undefined (we guard above).
        if (!instance.effects) instance.effects = ['none', 'none']
      }
    }
  }

  // Transition driver: 'css' | 'waapi' | 'none' or custom function(spec, onComplete)
  const driverIn = t && t.driver
  const driverStr = typeof driverIn === 'string' ? driverIn.toLowerCase() : null
  const driverFn = typeof driverIn === 'function' ? driverIn : null
  if (driverStr !== null) {
    const allowed = ['css', 'waapi', 'none']
    instance.transitionDriver = allowed.includes(driverStr) ? driverStr : 'css'
    if (!allowed.includes(driverStr)) {
      notification(false, `'transitions.driver' must be "css", "waapi", "none", or a function. Got "${driverIn}". Falling back to "css".`, 'warn')
    }
  } else if (driverFn !== null) {
    instance.transitionDriver = driverFn
  } else {
    instance.transitionDriver = 'css'
  }
}
