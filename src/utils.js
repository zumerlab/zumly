/* Utils */
function capitalize (value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function shimIdleCallBack (cb) {
  var start = Date.now();
  return setTimeout(() => {
    cb({ didTimeout: false, timeRemaining () { return Math.max(0, 50 - (Date.now() - start)) }})
  }, 1)
}

export function prepareCSS (instance) {
  var instanceStyle = document.createElement('style')
  let views = ['current', 'previous', 'last']
  let result = ''
  views.map(view => {
  result += `.zoom-${view}-view-${instance} {
    -webkit-animation-name: zoom${capitalize(view)}View${instance};
            animation-name: zoom${capitalize(view)}View${instance};
    -webkit-animation-duration: var(--animation-duration-${instance});
            animation-duration: var(--animation-duration-${instance});
    -webkit-animation-timing-function: var(--animation-ease-${instance});
            animation-timing-function: var(--animation-ease-${instance});
  }
@-webkit-keyframes zoom${capitalize(view)}View${instance} {
    0% {
      transform-origin: var(--${view}View-transformOrigin-start-${instance});
      transform: var(--${view}View-transform-start-${instance});
      opacity: var(--${view}View-opacity-start-${instance});
      filter: var(--${view}View-filter-start-${instance})
    }
    100% {
      transform-origin: var(--${view}View-transformOrigin-end-${instance});
      transform: var(--${view}View-transform-end-${instance});
      opacity: var(--${view}View-opacity-end-${instance});
      filter: var(--${view}View-filter-end-${instance})
    }
  }
@keyframes zoom${capitalize(view)}View${instance} {
    0% {
      transform-origin: var(--${view}View-transformOrigin-start-${instance});
      transform: var(--${view}View-transform-start-${instance});
      opacity: var(--${view}View-opacity-start-${instance});
      filter: var(--${view}View-filter-start-${instance})
    }
    100% {
      transform-origin: var(--${view}View-transformOrigin-end-${instance});
      transform: var(--${view}View-transform-end-${instance});
      opacity: var(--${view}View-opacity-end-${instance});
      filter: var(--${view}View-filter-end-${instance})
    }
  }`
  })
  instanceStyle.innerHTML = result
  document.head.appendChild(instanceStyle)
}

export function setCSSVariables (transition, currentStage, instance) {
  let viewStage = currentStage
  let current = viewStage.views[0]
  let previous = viewStage.views[1]
  let last = viewStage.views[2]
  let views = [{name:'current', stage: current}, {name:'previous', stage: previous}, {name:'last', stage: last}]
  views.map(view => {
    if (transition === 'zoomOut' && view.stage !== undefined) {
      document.documentElement.style.setProperty(`--${view.name}View-transform-start-${instance}`, view.stage.forwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}View-transform-end-${instance}`, view.stage.backwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-start-${instance}`, view.stage.forwardState.origin)
      document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-end-${instance}`, view.stage.backwardState.origin)
      document.documentElement.style.setProperty(`--${view.name}View-opacity-start-${instance}`, 1)
      document.documentElement.style.setProperty(`--${view.name}View-filter-start-${instance}`, view.stage.forwardState.filter)
      document.documentElement.style.setProperty(`--${view.name}View-filter-end-${instance}`, view.stage.backwardState.filter)
      if (view.name === 'current') { 
        document.documentElement.style.setProperty(`--animation-duration-${instance}`, view.stage.backwardState.duration)
        document.documentElement.style.setProperty(`--animation-ease-${instance}`, view.stage.backwardState.ease)
        document.documentElement.style.setProperty(`--${view.name}View-opacity-end-${instance}`, 0)
        document.documentElement.style.setProperty(`--${view.name}View-filter-start-${instance}`, `none`)
        document.documentElement.style.setProperty(`--${view.name}View-filter-end-${instance}`, `none`)
      } else {
        document.documentElement.style.setProperty(`--${view.name}View-opacity-end-${instance}`, 1)
      }
    }
    if (transition === 'zoomIn' && view.stage !== undefined) {
      document.documentElement.style.setProperty(`--${view.name}View-transform-start-${instance}`, view.stage.backwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}View-transform-end-${instance}`, view.stage.forwardState.transform)
      document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-start-${instance}`, view.stage.backwardState.origin)
      document.documentElement.style.setProperty(`--${view.name}View-transformOrigin-end-${instance}`, view.stage.forwardState.origin)
      document.documentElement.style.setProperty(`--${view.name}View-filter-start-${instance}`, view.stage.backwardState.filter)
      document.documentElement.style.setProperty(`--${view.name}View-filter-end-${instance}`, view.stage.forwardState.filter)
      if (view.name === 'current') { 
        document.documentElement.style.setProperty(`--animation-duration-${instance}`, view.stage.forwardState.duration)
        document.documentElement.style.setProperty(`--animation-ease-${instance}`, view.stage.forwardState.ease)
        document.documentElement.style.setProperty(`--${view.name}View-opacity-start-${instance}`, 0)
        document.documentElement.style.setProperty(`--${view.name}View-filter-start-${instance}`, `none`)
        document.documentElement.style.setProperty(`--${view.name}View-filter-end-${instance}`, `none`)
      } else {
        document.documentElement.style.setProperty(`--${view.name}View-opacity-start-${instance}`, 1)
      }
      document.documentElement.style.setProperty(`--${view.name}View-opacity-end-${instance}`, 1)
    }
  })
}
