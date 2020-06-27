/** 
 * utils.js: a set of useful functions for Zumly
 */

function checkArray (array) {
 // remove duplicates and map
 if(array.length === 1 && array[0].toLowerCase() === 'none') {
    return true
  } else {
    let unique = array => [...new Set(array)]
    let lowerArray = array.map(e => e.toLowerCase())
    return unique(lowerArray).every(value => ['blur', 'sepia', 'saturate'].indexOf(value) !== -1)
  }
}

function setFx (values) {
    var start = ''
    var end = ''
    values.map(effect => {
      start += `${effect.toLowerCase() === 'blur' ? 'blur(0px) ' : effect.toLowerCase() === 'sepia' ? 'sepia(0) ' : effect.toLowerCase() === 'saturate' ? 'saturate(0) ' : 'none'}`
        end += `${effect.toLowerCase() === 'blur' ? 'blur(0.8px) ' : effect.toLowerCase() === 'sepia' ? 'sepia(5) ' : effect.toLowerCase() === 'saturate' ? 'saturate(8) ' : 'none'}`
    })
    return [start, end]
}
function assignProperty(instance, propertiesToAdd, value) {
    return instance[propertiesToAdd] = value;
}

function validate (instance, name, value, type, options = {isRequired: false, defaultValue: 0, allowedValues: 0, hasValidation: 0, hasAssignFunction: 0}) {
  var msg = `'${name}' property is required when instance is defined`
  var checkValue = value !== undefined ? true : false
  var checkDefault = options.defaultValue !== undefined ? true : false
  var checkCustomValidation = options.hasValidation !== undefined ? true : false
  var checkCustomAssign = options.hasAssignFunction !== undefined ? true : false
  if (type === 'string' || type === 'object' || type === 'boolean') {
    var checkTypeof = typeof value === type
    var value = checkTypeof && type === 'string' ? value.toLowerCase() : value
  } else if (type === 'array') {
    checkTypeof = Array.isArray(value)
  }
  if (options.isRequired) {
    checkValue && checkTypeof ? assignProperty(instance, name, value) : notification(false, msg, `error`)
  }
  if (checkDefault) {
    checkValue && checkTypeof ? assignProperty(instance, name, value) : value === undefined ? assignProperty(instance, name, options.defaultValue) : notification(false, msg, `error`)
  }
  if (checkCustomValidation && checkDefault) {
    checkValue && checkTypeof && options.hasValidation ? assignProperty(instance, name, value) : value === undefined ? assignProperty(instance, name, options.defaultValue) : notification(false, msg, `error`)
  }
  if (checkCustomValidation && checkDefault && checkCustomAssign) {
    checkValue && checkTypeof && options.hasValidation ? assignProperty(instance, name, options.hasAssignFunction) : value === undefined ? assignProperty(instance, name, options.defaultValue) : notification(false, msg, `error`)
  }

}

export function shimIdleCallBack (cb) {
  var start = Date.now();
  return setTimeout(() => {
    cb({ didTimeout: false, timeRemaining () { return Math.max(0, 50 - (Date.now() - start)) }})
  }, 1)
}

export function prepareCSS (instance) {
  var instanceStyle = document.createElement('style')
  let views = ['current-view', 'previous-view', 'last-view']
  let result = ''
  views.map(view => {
  result += `
  .zoom-${view}-${instance} {
    -webkit-animation-name: zoom-${view}-${instance};
            animation-name: zoom-${view}-${instance};
    -webkit-animation-duration: var(--zoom-duration-${instance});
            animation-duration: var(--zoom-duration-${instance});
    -webkit-animation-timing-function: var(--zoom-ease-${instance});
            animation-timing-function: var(--zoom-ease-${instance});
  }
  @-webkit-keyframes zoom-${view}-${instance} {
    0% {
      transform-origin: var(--${view}-transformOrigin-start-${instance});
      transform: var(--${view}-transform-start-${instance});
      opacity: var(--${view}-opacity-start-${instance});
      filter: var(--${view}-filter-start-${instance})
    }
    100% {
      transform-origin: var(--${view}-transformOrigin-end-${instance});
      transform: var(--${view}-transform-end-${instance});
      opacity: var(--${view}-opacity-end-${instance});
      filter: var(--${view}-filter-end-${instance})
    }
  }
  @keyframes zoom-${view}-${instance} {
    0% {
      transform-origin: var(--${view}-transformOrigin-start-${instance});
      transform: var(--${view}-transform-start-${instance});
      opacity: var(--${view}-opacity-start-${instance});
      filter: var(--${view}-filter-start-${instance})
    }
    100% {
      transform-origin: var(--${view}-transformOrigin-end-${instance});
      transform: var(--${view}-transform-end-${instance});
      opacity: var(--${view}-opacity-end-${instance});
      filter: var(--${view}-filter-end-${instance})
    }
  }
  `})
  instanceStyle.innerHTML = result
  document.head.appendChild(instanceStyle)
}

export function setCSSVariables (transition, currentStage, instance) {
  let viewStage = currentStage
  let current = viewStage.views[0]
  let previous = viewStage.views[1]
  let last = viewStage.views[2]
  let views = [{name:'current-view', stage: current}, {name:'previous-view', stage: previous}, {name:'last-view', stage: last}]
  views.map(view => {
    if (transition === 'zoomOut' && view.stage !== undefined) {
      document.documentElement.style.setProperty(`--${view.name}-transform-start-${instance}`, view.stage.forwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}-transform-end-${instance}`, view.stage.backwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}-transformOrigin-start-${instance}`, view.stage.forwardState.origin)
      document.documentElement.style.setProperty(`--${view.name}-transformOrigin-end-${instance}`, view.stage.backwardState.origin)
      document.documentElement.style.setProperty(`--${view.name}-opacity-start-${instance}`, 1)
      document.documentElement.style.setProperty(`--${view.name}-filter-start-${instance}`, view.stage.forwardState.filter)
      document.documentElement.style.setProperty(`--${view.name}-filter-end-${instance}`, view.stage.backwardState.filter)
      if (view.name === 'current-view') { 
        document.documentElement.style.setProperty(`--zoom-duration-${instance}`, view.stage.backwardState.duration)
        document.documentElement.style.setProperty(`--zoom-ease-${instance}`, view.stage.backwardState.ease)
        document.documentElement.style.setProperty(`--${view.name}-opacity-end-${instance}`, 0)
        document.documentElement.style.setProperty(`--${view.name}-filter-start-${instance}`, `none`)
        document.documentElement.style.setProperty(`--${view.name}-filter-end-${instance}`, `none`)
      } else {
        document.documentElement.style.setProperty(`--${view.name}-opacity-end-${instance}`, 1)
      }
    }
    if (transition === 'zoomIn' && view.stage !== undefined) {
      document.documentElement.style.setProperty(`--${view.name}-transform-start-${instance}`, view.stage.backwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}-transform-end-${instance}`, view.stage.forwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}-transformOrigin-start-${instance}`, view.stage.backwardState.origin)
      document.documentElement.style.setProperty(`--${view.name}-transformOrigin-end-${instance}`, view.stage.forwardState.origin)
      document.documentElement.style.setProperty(`--${view.name}-filter-start-${instance}`, view.stage.backwardState.filter)
      document.documentElement.style.setProperty(`--${view.name}-filter-end-${instance}`, view.stage.forwardState.filter)
      if (view.name === 'current-view') { 
        document.documentElement.style.setProperty(`--zoom-duration-${instance}`, view.stage.forwardState.duration)
        document.documentElement.style.setProperty(`--zoom-ease-${instance}`, view.stage.forwardState.ease)
        document.documentElement.style.setProperty(`--${view.name}-opacity-start-${instance}`, 0)
        document.documentElement.style.setProperty(`--${view.name}-filter-start-${instance}`, `none`)
        document.documentElement.style.setProperty(`--${view.name}-filter-end-${instance}`, `none`)
      } else {
        document.documentElement.style.setProperty(`--${view.name}-opacity-start-${instance}`, 1)
      }
      document.documentElement.style.setProperty(`--${view.name}-opacity-end-${instance}`, 1)
    }
  })
}

export async function renderView (el, canvas, views, init) {
  return new Promise((resolve) => {
    var viewName = null
    init ? viewName = el : viewName = el.dataset.to 
    requestIdleCallback(async () => {
      var newView = document.createElement('template')
      newView.innerHTML = await views[viewName].render()
      let vv = newView.content.querySelector('.z-view')
      if (!init) {
        vv.classList.add('is-new-current-view')
        vv.classList.add('has-no-events')
        vv.classList.add('hide')
        vv.classList.add('performance')
      } else {
        vv.classList.add('is-current-view')
      }
      vv.style.transformOrigin = `0 0`
      vv.dataset.viewName = viewName
      var rect = canvas.append(newView.content)
      resolve(rect)
    })
  })
}

export function notification (debug, msg, type) {
  if (msg && type === 'welcome') {
    console.info(`%c Zumly %c ${msg}`, `background: #424085; color: white; border-radius: 3px;`, `color: #424085`) // eslint-disable-line no-console
  }
  if (msg && debug && (type === 'info' || type === undefined)) {
    console.info(`%c Zumly %c ${msg}`, `background: #6679A3; color: #304157; border-radius: 3px;`, `color: #6679A3`) // eslint-disable-line no-console
  }
  if (msg && type === 'warn') {
    console.warn(`%c Zumly %c ${msg}`, `background: #DCBF53; color: #424085; border-radius: 3px;`, `color: #424085`) // eslint-disable-line no-console
  }
   if (msg && type === 'error') {
    console.error(`%c Zumly %c ${msg}`, `background: #BE4747; color: white; border-radius: 3px;`, `color: #424085`) // eslint-disable-line no-console
  }
}

export function checkParameters (parameters, instance) {
  // First check if options are provided
  if (parameters && typeof parameters === 'object') {
    assignProperty(instance, 'options', true)
    // Then check its properties
    // mount property. String DOM element. Required
    validate(instance, 'mount', parameters.mount, 'string', {isRequired: true})
    // initialView property. Strng view name. Required
    validate(instance, 'initialView', parameters.initialView, 'string', {isRequired: true})
    // views property. Object with views. Required
    validate(instance, 'views', parameters.views, 'object', {isRequired: true})
    // debug property. Boolean. Optional. Default false
    validate(instance, 'debug', parameters.debug, 'boolean', {defaultValue: false})
    // Check transtions
    if (parameters.transitions && typeof parameters.transitions === 'object') {
      //value exist; type, allowed, deafult
      validate(instance, 'cover', parameters.transitions.cover, 'string', {defaultValue: 'width', hasValidation: () => {['height', 'width'].indexOf(parameters.transitions.cover.toLowerCase()) !== -1}})
      //value, type, , default
      validate(instance, 'duration', parameters.transitions.duration, 'string', {defaultValue: '1s'})
      //value, type, ,default
      validate(instance, 'ease', parameters.transitions.ease, 'string', {defaultValue: 'ease-in-out'})
      //value, type, custom validation, custom asignament, default
      validate(instance, 'effects', parameters.transitions.effects, 'array', {defaultValue: ['none','none'], hasValidation: checkArray(parameters.transitions.effects), hasAssignFunction: setFx(parameters.transitions.effects)})
    } else {
      // assign deafult values
      assignProperty(instance, 'cover', `width`)
      assignProperty(instance, 'duration', `1s`)
      assignProperty(instance, 'ease', `ease-in-out`)
      assignProperty(instance, 'effects', ['none','none'])
    }
  } else {
    notification(false, `'options' object has to be provided when instance is defined`, `error`)
  }
}
