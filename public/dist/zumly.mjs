function checkArray (array) {
  // remove duplicates and map
  if (array !== undefined && array[0].toLowerCase() === 'none') {
    return true
  }
  if (array !== undefined && array.length > 0) {
    const unique = array => [...new Set(array)];
    const lowerArray = array.map(e => e.toLowerCase());
    return unique(lowerArray).every(value => ['blur', 'sepia', 'saturate'].indexOf(value) !== -1)
  }
}

function setFx (values) {
  var start = '';
  var end = '';
  if (values !== undefined) {
    values.map(effect => {
      start += `${effect.toLowerCase() === 'blur' ? 'blur(0px) ' : effect.toLowerCase() === 'sepia' ? 'sepia(0) ' : effect.toLowerCase() === 'saturate' ? 'saturate(0) ' : 'none'}`;
      end += `${effect.toLowerCase() === 'blur' ? 'blur(0.8px) ' : effect.toLowerCase() === 'sepia' ? 'sepia(5) ' : effect.toLowerCase() === 'saturate' ? 'saturate(8) ' : 'none'}`;
    });
    return [start, end]
  }
}
function assignProperty (instance, propertiesToAdd, value) {
  instance[propertiesToAdd] = value;
}

function validate (instance, name, value, type, options = { isRequired: false, defaultValue: 0, allowedValues: 0, hasValidation: 0, hasAssignFunction: 0 }) {
  var msg = `'${name}' property is required when instance is defined`;
  var msg1 = `'${name}' property has problems`;
  var checkValue = value !== undefined;
  var checkDefault = options.defaultValue !== undefined;
  var checkCustomValidation = options.hasValidation !== undefined;
  var checkCustomAssign = options.hasAssignFunction !== undefined;
  if (type === 'string' || type === 'object' || type === 'boolean') {
    var checkTypeof = typeof value === type; // eslint-disable-line
    // value = checkTypeof && type === 'string' ? value.toLowerCase() : value
  } else if (type === 'array') {
    checkTypeof = Array.isArray(value);
  }
  if (options.isRequired) {
    checkValue && checkTypeof ? assignProperty(instance, name, value) : notification(false, msg, 'error');
  }
  if (checkDefault && !checkCustomValidation && !checkCustomAssign) {
    checkValue && checkTypeof ? assignProperty(instance, name, value) : value === undefined ? assignProperty(instance, name, options.defaultValue) : notification(false, msg1, 'error');
  }
  if (checkCustomValidation && checkDefault && !checkCustomAssign) {
    checkValue && checkTypeof && options.hasValidation ? assignProperty(instance, name, value) : value === undefined ? assignProperty(instance, name, options.defaultValue) : notification(false, msg1, 'error');
  }
  // console.log(name, checkCustomValidation, checkDefault, checkCustomAssign)
  if (checkCustomValidation && checkDefault && checkCustomAssign) {
    checkValue && checkTypeof && options.hasValidation ? assignProperty(instance, name, options.hasAssignFunction) : value === undefined ? assignProperty(instance, name, options.defaultValue) : notification(false, msg1, 'error');
  }
}



async function renderView (el, canvas, views, init, componentContext) {
  // TODO ESPERAR A QUE RENDER Y MOUNTED ESTEN TERMINADAS
  // RETURN ELEMENT
    var viewName = null;
    init ? viewName = el : viewName = el.dataset.to;
    var newView = document.createElement('template');
    
    if(typeof views[viewName] === 'object' && views[viewName].render !== undefined) {      
      // makes optional de 'render' function
      newView.innerHTML = await views[viewName].render();
    } else if(typeof views[viewName] === 'function') {
      // view is a component constructor
      var newViewInner = document.createElement('div');
      new views[viewName]({ 
        target: newViewInner, 
        context: componentContext,
        props: el.dataset
      });
      newViewInner.classList.add('z-view');
      newView.content.appendChild(newViewInner);      
    } else {
      // view is plain HTML
      newView.innerHTML = views[viewName];
    }

    let vv = newView.content.querySelector('.z-view');

    if (!init) {
      vv.classList.add('is-new-current-view');
      vv.classList.add('has-no-events');
      vv.classList.add('hide');
      vv.classList.add('performance');
    } else {
      vv.classList.add('is-current-view');
    }
    vv.style.transformOrigin = '0 0';
    vv.dataset.viewName = viewName;
    
    canvas.append(newView.content);
    // makes optional de 'mounted' hook
    if (typeof views[viewName] === 'object' 
    && views[viewName].mounted !== undefined 
    && typeof views[viewName].mounted() === 'function') await views[viewName].mounted();

    return init ? canvas.querySelector('.is-current-view') : canvas.querySelector('.is-new-current-view')
}

function notification (debug, msg, type) {
  if (msg && type === 'welcome') {
    console.info(`%c Zumly %c ${msg}`, 'background: #424085; color: white; border-radius: 3px;', 'color: #424085'); // eslint-disable-line no-console
  }
  if (msg && debug && (type === 'info' || type === undefined)) {
    console.info(`%c Zumly %c ${msg}`, 'background: #6679A3; color: #304157; border-radius: 3px;', 'color: #6679A3'); // eslint-disable-line no-console
  }
  if (msg && type === 'warn') {
    console.warn(`%c Zumly %c ${msg}`, 'background: #DCBF53; color: #424085; border-radius: 3px;', 'color: #424085'); // eslint-disable-line no-console
  }
  if (msg && type === 'error') {
    console.error(`%c Zumly %c ${msg}`, 'background: #BE4747; color: white; border-radius: 3px;', 'color: #424085'); // eslint-disable-line no-console
  }
}

function checkParameters (parameters, instance) {
  // First check if options are provided
  if (parameters && typeof parameters === 'object') {
    assignProperty(instance, 'options', true);
    // Then check its properties
    // mount property. String DOM element. Required
    validate(instance, 'mount', parameters.mount, 'string', { isRequired: true });
    // initialView property. Strng view name. Required
    validate(instance, 'initialView', parameters.initialView, 'string', { isRequired: true });
    // views property. Object with views. Required
    validate(instance, 'views', parameters.views, 'object', { isRequired: true });
    // debug property. Boolean. Optional. Default false
    validate(instance, 'debug', parameters.debug, 'boolean', { defaultValue: false });
    // Svelte component context
    validate(instance, 'componentContext', parameters.componentContext, 'object', { isRequired: false, defaultValue: new Map() });
    // Check transtions
    if (parameters.transitions && typeof parameters.transitions === 'object') {
      // value exist; type, allowed, deafult
      validate(instance, 'cover', parameters.transitions.cover, 'string', { defaultValue: 'width', hasValidation: () => { ['height', 'width'].indexOf(parameters.transitions.cover.toLowerCase()) !== -1; } }); // eslint-disable-line
      // value, type, , default
      validate(instance, 'duration', parameters.transitions.duration, 'string', { defaultValue: '1s' });
      // value, type, ,default
      validate(instance, 'ease', parameters.transitions.ease, 'string', { defaultValue: 'ease-in-out' });
      // value, type, custom validation, custom asignament, default
      validate(instance, 'effects', parameters.transitions.effects, 'array', { defaultValue: ['none', 'none'], hasValidation: checkArray(parameters.transitions.effects), hasAssignFunction: setFx(parameters.transitions.effects) });
    } else {
      // assign deafult values
      assignProperty(instance, 'cover', 'width');
      assignProperty(instance, 'duration', '1s');
      assignProperty(instance, 'ease', 'ease-in-out');
      assignProperty(instance, 'effects', ['none', 'none']);
    }
  } else {
    notification(false, '\'options\' object has to be provided when instance is defined', 'error');
  }
}

/**
 * Zumly
 * Powers your apps with a zoomable user interface (ZUI) taste.
 * @class
 */
class Zumly {
  /**
  * Creates a Zumly instance
  * @constructor
  * @params {Objet} options
  * @example
  *  new Zumly({
  *  mount: '.mount',
  *  initialView: 'home',
  *  views: {
  *   home,
  *   contact,
  *   ...
  *  },
  * debug: false
  * 
  */
  constructor (options) {
    // Internal state:
    // Register global instances of Zumly
    this.instance = Zumly.counter;
    // Store snapshots of each zoom transition
    this.storedViews = [];
    // Show current zoom level properties
    this.currentStage = null;
    // Store the scale of previous zoom transition
    this.storedPreviousScale = [1];
    // Array of events useful for debugging
    this.trace = [];
    // Deactive events during transtions
    this.blockEvents = false;
    // Initial values for gesture events
    this.touchstartX = 0;
    this.touchstartY = 0;
    this.touchendX = 0;
    this.touchendY = 0;
    this.touching = false;
    // Check if user options exist
    checkParameters(options, this);
    if (this.options) {
      // Event bindings:
      this._onZoom = this.onZoom.bind(this);
      this._onTouchStart = this.onTouchStart.bind(this);
      this._onTouchEnd = this.onTouchEnd.bind(this);
      this._onKeyUp = this.onKeyUp.bind(this);
      this._onWeel = this.onWeel.bind(this);
      // Prepare the instance:
      this.canvas = document.querySelector(this.mount);
      this.canvas.setAttribute('tabindex', 0);
      this.canvas.addEventListener('mouseup', this._onZoom, false);
      this.canvas.addEventListener('touchend', this._onZoom, false);
      this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: true });
      this.canvas.addEventListener('touchend', this._onTouchEnd, false);
      this.canvas.addEventListener('keyup', this._onKeyUp, false);
      this.canvas.addEventListener('wheel', this._onWeel, { passive: true });
    } else {
      this.notify('is unable to start: no {options} have been passed to the Zumly\'s instance.', 'error');
    }
  }

  /**
   * Helpers
   */
  storeViews (data) {
    this.tracing('storedViews()');
    this.storedViews.push(data);
  }

  setPreviousScale (scale) {
    this.tracing('setPreviousScale()');
    this.storedPreviousScale.push(scale);
  }

  tracing (data) {
    if (this.debug) {
      if (data === 'ended') {
        const parse = this.trace.map((task, index) => `${index === 0 ? `Instance ${this.instance}: ${task}` : `${task}`}`).join(' > ');
        this.notify(parse);
        this.trace = [];
      } else {
        this.trace.push(data);
      }
    } 
  }

  /**
   * Private methods
   */
  static get counter () {
    Zumly._counter = (Zumly._counter || 0) + 1;
    return Zumly._counter
  }

  notify (msg, type) {
    return notification(this.debug, msg, type)
  }

  /**
   * Public methods
   */
  zoomLevel () {
    return this.storedViews.length
  }

  async init () {
    if (this.options) {
      // add instance style
      this.tracing('init()');
    //  prepareCSS(this.instance)
      await renderView(this.initialView, this.canvas, this.views, 'init', this.componentContext);
      // add to storage. OPTIMIZAR
      this.storeViews({
        zoomLevel: this.storedViews.length,
        views: [{
          viewName: this.initialView,
          backwardState: {
            origin: '0 0',
            transform: ''
          }
        }]
      });
      //
      this.notify(`${this.instance > 1
        ? `instance nº ${this.instance} is active.`
        : `is running! Instance nº ${this.instance} is active. ${this.debug
        ? 'Debug is active, can be deactivate by setting \'debug: false\' when you define the instance.' : ''}
        More tips & docs at https://zumly.org`}`, 'welcome');
    }
  }

  setZoomLevelState (viewState, zoomLevel) {
    let snapShoot = {
      zoomLevel: zoomLevel,
      views: []
    };
    viewState.forEach((view, index) => {
      if (index < 3) {
        var zoomViewState = {
          viewName: view.view.dataset.viewName,
          backwardState: {
            origin: view.origin,
            duration: view.duration,
            ease: view.ease,
            transform: view.transform[0]
          },
          forwardState: {
            origin: view.origin,
            duration: view.duration,
            ease: view.ease,
            transform: view.transform[1]
          }
        };
      } else {
        var zoomViewState = view;
      }
      snapShoot.views.push(zoomViewState);
    });
    this.storeViews(snapShoot);
  }

  setZoomTransition (viewState, mode, viewToRemove) {
    if (mode === 'in') {
      this.blockEvents = true;
      viewState.forEach((view, index) => {
        if (index < 3) {
          var animationStage = view.view.animate(
            [
              { transform: view.transform[0] },
              { transform: view.transform[1] }
            ],
            { duration: 1000, easing: view.ease}
          );       
          animationStage.pause();
          viewState[0].view.classList.remove('hide');
          animationStage.onfinish = event => {
            viewState[index].view.classList.remove('performance');
            viewState[index].view.classList.remove('has-no-events');
            
            if (index === 0) {
              viewState[index].view.classList.remove('is-new-current-view');
              viewState[index].view.classList.add('is-current-view');
              this.blockEvents = false;
              const zoomInFinished = new Event('zumly');
              // Dispatch the event.
              viewState[index].view.dispatchEvent(zoomInFinished);
            }
            
            viewState[index].view.style.transformOrigin = view.origin;
            viewState[index].view.style.transform = view.transform[1];
          };
          animationStage.play();
        }
      });
    } else {
      viewState.forEach((anim, index) => {
        this.blockEvents = true;
        if (index < 3) {
          anim.pause();
          anim.onfinish = event => {
            if (index === 0) {
              anim.effect.target.remove();
              this.blockEvents = false;
              if (viewToRemove) {    
                this.canvas.prepend(viewToRemove.view);
                var newlastView = this.canvas.querySelector('.z-view:first-child');
                newlastView.classList.add('hide');
              }
            } else {
              anim.effect.target.classList.remove('performance');
              anim.effect.target.style.transformOrigin = index === 1 ? '0 0' : this.currentStage.views[index].backwardState.origin;
              anim.effect.target.style.transform = this.currentStage.views[index].backwardState.transform;
            }
          };
          anim.play();
        }
      });
    }
  }

  /**
   * Main methods
   */
  async zoomIn (el) {
   // RENDER
    var currentView = await renderView(el, this.canvas, this.views, false, this.componentContext);
    if (currentView) {
      // SELECCION DE ELEMENTOS
      const canvas = this.canvas;
      var previousView = canvas.querySelector('.is-current-view');
      var lastView = canvas.querySelector('.is-previous-view');
      if (lastView !== null) {var removeView = canvas.querySelector('.is-last-view');}
      // CLASES
      el.classList.add('zoomed');
      previousView.classList.add('is-previous-view');
      previousView.classList.remove('is-current-view');
      if (lastView !== null) {
        lastView.classList.remove('is-previous-view');
        lastView.classList.add('is-last-view');
      }
      // OBTENER MEDIDAS
      const coordsCanvas = canvas.getBoundingClientRect();
      const coordsEl = el.getBoundingClientRect();
      const coordsCurrentView = currentView.getBoundingClientRect();
      const coordsPreviousView = previousView.getBoundingClientRect();
      if (lastView !== null && removeView !== null) removeView.remove();
      // MEDIDAS AUXILIARES
      var offsetX = coordsCanvas.left;
      var offsetY = coordsCanvas.top;
      const previousScale = this.storedPreviousScale[this.storedPreviousScale.length - 1];
      // ELEMENTO ZOOMEABLE ACTIVO
      // Obtengo coords del elemento zoomeable qie seran usadas para el estado inical de la vista nueva
      const scale = coordsCurrentView.width / coordsEl.width;
      const scaleInv = 1 / scale;
      const scaleh = coordsCurrentView.height / coordsEl.height;
      const scaleInvh = 1 / scaleh;
      // muy interesante featura... usar el zoom de acuardo a la h o w mayor y agra
      var duration = el.dataset.withDuration || this.duration;
      var ease = el.dataset.withEease || this.ease;
      this.effects[0];
      this.effects[1];
      var cover = this.cover;

      if (cover === 'width') {
        var coverScale = scale;
        var coverScaleInv = scaleInv;
      } else if (cover === 'height') {
        coverScale = scaleh;
        coverScaleInv = scaleInvh;
      }
      this.setPreviousScale(coverScale);
      let currentX = coordsEl.x - offsetX + (coordsEl.width - coordsCurrentView.width * coverScaleInv) / 2;
      let currentY = coordsEl.y - offsetY + (coordsEl.height - coordsCurrentView.height * coverScaleInv) / 2;
      var transformCurrentView0 = `translate(${currentX}px, ${currentY}px) scale(${coverScaleInv})`;
      
      // Set previousView transform (ex CurrentView) 0
      var transformPreviousView0 = previousView.style.transform;
      // Set previousView transformOrigin
      let previousOriginX = coordsEl.x + coordsEl.width / 2 - coordsPreviousView.x;
      let previousOriginY = coordsEl.y + coordsEl.height / 2 - coordsPreviousView.y;
      previousView.style.transformOrigin = `${previousOriginX}px ${previousOriginY}px`;
     // Apply final estate
      const previousX = coordsCanvas.width / 2 - coordsEl.width / 2 - coordsEl.x + coordsPreviousView.x;
      const previousY = coordsCanvas.height / 2 - coordsEl.height / 2 - coordsEl.y + coordsPreviousView.y;
      const transformPreviousView1 = `translate(${previousX}px, ${previousY}px) scale(${coverScale})`;
      // Apply previousView transform 1
      previousView.style.transform = transformPreviousView1;
      // recapture El coords
      var newCoordsEl = el.getBoundingClientRect();
      // set CurrentView transform
      var transformCurrentView1 = `translate(${newCoordsEl.x - offsetX + (newCoordsEl.width - coordsCurrentView.width) / 2}px, ${newCoordsEl.y - offsetY + (newCoordsEl.height - coordsCurrentView.height) / 2}px)`;
      if (lastView !== null) {
        // Set lastView transform (ex previousView) 0
        var transformLastView0 = lastView.style.transform;
        // recapture previousView coords 
        var newCoordsPreviousView = previousView.getBoundingClientRect();
        // set last view final coords
        lastView.style.transform = `translate(${previousX - offsetX}px, ${previousY - offsetY}px) scale(${coverScale * previousScale})`;
        // get zoomed element inside lastview
        const lastEl = lastView.querySelector('.zoomed');
        var coordsLastViewEl = lastEl.getBoundingClientRect();
        // set lastView final state
        const lastX = coordsCanvas.width / 2 - coordsEl.width / 2 - coordsEl.x + (coordsPreviousView.x - coordsLastViewEl.x) + newCoordsPreviousView.x - offsetX + (newCoordsPreviousView.width - coordsLastViewEl.width) / 2;
        const lastY = coordsCanvas.height / 2 - coordsEl.height / 2 - coordsEl.y + (coordsPreviousView.y - coordsLastViewEl.y) + newCoordsPreviousView.y - offsetY + (newCoordsPreviousView.height - coordsLastViewEl.height) / 2;
        var transformLastView1 = `translate(${lastX}px, ${lastY}px) scale(${coverScale * previousScale})`;
      } 
      // Apply  initial states
      requestAnimationFrame(() => {
        currentView.style.transform = transformCurrentView0;
       previousView.style.transform = transformPreviousView0;
       if (lastView !== null) lastView.style.transform = transformLastView0;
      });
      
  
      // arrays
      var viewState = [];
      viewState.push({
        view: currentView,
        origin: currentView.style.transformOrigin,
        duration: duration,
        ease: ease,
        transform: [transformCurrentView0, transformCurrentView1]
      },
      {
        view: previousView,
        origin: previousView.style.transformOrigin,
        duration: duration,
        ease: ease,
        transform: [transformPreviousView0, transformPreviousView1]
      });
      if (lastView) {
        viewState.push({
          view: lastView,
          origin: lastView.style.transformOrigin,
          duration: duration,
          ease: ease,
          transform: [transformLastView0, transformLastView1]
        });
      }
      if (removeView) viewState.push({view: removeView});
      var zoomLevel = this.storedViews.length;
      this.setZoomLevelState(viewState, zoomLevel);
      this.currentStage = this.storedViews[this.storedViews.length - 1];
      // animation
      this.setZoomTransition(viewState, 'in');
    }
  }

  zoomOut () {
    this.tracing('zoomOut()');
    this.blockEvents = true;
    this.storedPreviousScale.pop();
    const canvas = this.canvas;
    this.currentStage = this.storedViews[this.storedViews.length - 1];
    const reAttachView = this.currentStage.views[3];
    var currentView = canvas.querySelector('.is-current-view');
    var previousView = canvas.querySelector('.is-previous-view');
    var lastView = canvas.querySelector('.is-last-view');
    //
    previousView.querySelector('.zoomed').classList.remove('zoomed');
    previousView.classList.remove('is-previous-view');
    previousView.classList.add('is-current-view');
    previousView.classList.remove('performance');
    //
    if (lastView !== null) {
      lastView.classList.add('performance');
      lastView.classList.add('is-previous-view');
      lastView.classList.remove('is-last-view');
      lastView.classList.remove('hide');
    }
    //
    var currentViewAnimation = currentView.animate(
      { transform: this.currentStage.views[0].backwardState.transform },
      { duration: 1000, easing: this.currentStage.views[0].ease }
    );
    if (lastView !== null) {
      var lastViewAnimation = lastView.animate(
        { transform: this.currentStage.views[2].backwardState.transform },
        { duration: 1000, easing: this.currentStage.views[2].ease  }
      );
      var previousViewAnimation = previousView.animate(
        { transform: this.currentStage.views[1].backwardState.transform },
        { duration: 1000, easing: this.currentStage.views[1].ease }
      );
    } else {
      previousViewAnimation = previousView.animate(
        { transform: 'translate(0, 0)' },
        { duration: 1000, easing: this.currentStage.views[1].ease }
      );
    }
    let viewState = [];
    viewState.push(currentViewAnimation, previousViewAnimation);
    if (lastViewAnimation) viewState.push(lastViewAnimation);
    this.storedViews.pop();
    this.setZoomTransition(viewState, 'out', reAttachView);
  }

  /**
   * Event hangling
   */
  onZoom (event) {
    if (this.storedViews.length > 1 && !this.blockEvents && !event.target.classList.contains('zoom-me') && event.target.closest('.is-current-view') === null && !this.touching) {
      this.tracing('onZoom()');
      event.stopPropagation();
      this.zoomOut();
    }
    if (!this.blockEvents && event.target.classList.contains('zoom-me') && !this.touching) {
      this.tracing('onZoom()');
      event.stopPropagation();
      this.zoomIn(event.target);
    }
  }

  onKeyUp (event) {
    this.tracing('onKeyUp()');
    // Possible conflict with usar inputs
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.zoomOut();
      } else {
        this.notify(`is on level zero. Can't zoom out. Trigger: ${event.key}`, 'warn');
      }
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.notify(event.key + 'has not actions defined');
    }
  }

  onWeel (event) {
    // inertia need to be fixed
    if (!this.blockEvents) {
      this.tracing('onWeel()');
      if (event.deltaY < 0) ;
      if (event.deltaY > 0) {
        if (this.storedViews.length > 1 && !this.blockEvents) {
          this.zoomOut();
        }
      }
    }
  }

  onTouchStart (event) {
    this.tracing('onTouchStart()');
    this.touching = true;
    this.touchstartX = event.changedTouches[0].screenX;
    this.touchstartY = event.changedTouches[0].screenY;
  }

  onTouchEnd (event) {
    if (!this.blockEvents) {
      this.tracing('onTouchEnd()');
      this.touchendX = event.changedTouches[0].screenX;
      this.touchendY = event.changedTouches[0].screenY;
      this.handleGesture(event);
    }
  }

  handleGesture (event) {
    event.stopPropagation();
    this.tracing('handleGesture()');
    if (this.touchendX < this.touchstartX - 30) {
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.tracing('swipe left');
        this.zoomOut();
      } else {
        this.notify("is on level zero. Can't zoom out. Trigger: Swipe left", 'warn');
      }
    }
    if (this.touchendY < this.touchstartY - 10) {
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.tracing('swipe up');
        // Disabled. In near future enable if Zumly is full screen
        // this.zoomOut()
      } else {
        this.notify("is on level zero. Can't zoom out. Trigger: Swipe up", 'warn');
      }
    }
    if (this.touchendY === this.touchstartY && !this.blockEvents && event.target.classList.contains('zoom-me') && this.touching) {
      this.touching = false;
      this.tracing('tap');
      event.preventDefault();
      this.zoomIn(event.target);
    }
    if (this.touchendY === this.touchstartY && this.storedViews.length > 1 && !this.blockEvents && !event.target.classList.contains('zoom-me') && event.target.closest('.is-current-view') === null && this.touching) {
      this.touching = false;
      this.tracing('tap');
      this.zoomOut();
    }
  }
}

export { Zumly as default };
