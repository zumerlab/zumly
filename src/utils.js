/** 
 * utils.js: a set of useful functions for Zumly
 */
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
  if (msg && debug && type === 'info' || type === undefined) {
    console.info(`%c Zumly %c ${msg}`, `background: #6679A3; color: #304157; border-radius: 3px;`, `color: #6679A3`) // eslint-disable-line no-console
  }
  if (msg && type === 'warn') {
    console.warn(`%c Zumly %c ${msg}`, `background: #DCBF53; color: #424085; border-radius: 3px;`, `color: #424085`) // eslint-disable-line no-console
  }
   if (msg && type === 'error') {
    console.error(`%c Zumly %c ${msg}`, `background: #BE4747; color: white; border-radius: 3px;`, `color: #424085`) // eslint-disable-line no-console
  }
}

