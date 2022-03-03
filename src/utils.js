export async function renderView (el, canvas, views, init, componentContext) {
  // TODO ESPERAR A QUE RENDER Y MOUNTED ESTEN TERMINADAS
  // RETURN ELEMENT
    var viewName = null
    init ? viewName = el : viewName = el.dataset.to
    var newView = document.createElement('template')
    
    if(typeof views[viewName] === 'object' && views[viewName].render !== undefined) {      
      // makes optional de 'render' function
      newView.innerHTML = await views[viewName].render()
    } else if(typeof views[viewName] === 'function') {
      // view is a component constructor
      var newViewInner = document.createElement('div')
      new views[viewName]({ 
        target: newViewInner, 
        context: componentContext,
        props: el.dataset
      })
      newViewInner.classList.add('z-view')
      newView.content.appendChild(newViewInner)      
    } else {
      // view is plain HTML
      newView.innerHTML = views[viewName]
    }

    let vv = newView.content.querySelector('.z-view')

    if (!init) {
      vv.classList.add('is-new-current-view')
      vv.classList.add('has-no-events')
      vv.classList.add('hide')
      vv.classList.add('performance')
    } else {
      vv.classList.add('is-current-view')
    }
    vv.style.transformOrigin = '0 0'
    vv.dataset.viewName = viewName
    
    canvas.append(newView.content)
    // makes optional de 'mounted' hook
    if (typeof views[viewName] === 'object' 
    && views[viewName].mounted !== undefined 
    && typeof views[viewName].mounted() === 'function') await views[viewName].mounted()

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

export function validateUserSettings (parameters) {
  var schema = {
    initialView: value => typeof value === 'string',
    views: value => typeof value === 'object',
    componentContext: value => typeof value === 'object',
    zoom_duration: value => parseInt(value) === Number(value) && value >= 0,
    zoom_ease: value => typeof value === 'string',
    zoom_cover: value => typeof value === 'string',
    zoom_effects: value =>  Array.isArray(value),
    debug: value => typeof value === 'boolean',
    mount: value => typeof value === 'string'
  }

  schema.initialView.required = true
  schema.mount.required = true
  schema.views.required = true

  var validator = (object, schema) => Object
    .entries(schema)
    .map(([key, val]) => [key,
      !val.required && !object.hasOwnProperty(key) ? 'valid_true' :
      val.required && object.hasOwnProperty(key) ? 'valid_' + val(object[key]) :
      !val.required && object.hasOwnProperty(key) ? 'valid_' + val(object[key]) : 
      'required_true'])
    .map(([key, response]) => {
      let data = response === 'valid_false' ? 'invalid' :
      response === 'required_true' ? 'required' : false
      var response
      if (data) {
        notification(false, `User settings: ${key} is ${data}.`, 'error')
        response = 'invalid'
      } else { response = 'valid' }
      return response
      })
    .find(el => el === 'invalid')
  
  return validator(parameters, schema) !== undefined ? false : true
}
