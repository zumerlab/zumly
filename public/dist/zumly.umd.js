(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.zumly = factory());
})(this, (function () { 'use strict';

  function styleInject(css, ref) {
    if ( ref === void 0 ) ref = {};
    var insertAt = ref.insertAt;

    if (!css || typeof document === 'undefined') { return; }

    var head = document.head || document.getElementsByTagName('head')[0];
    var style = document.createElement('style');
    style.type = 'text/css';

    if (insertAt === 'top') {
      if (head.firstChild) {
        head.insertBefore(style, head.firstChild);
      } else {
        head.appendChild(style);
      }
    } else {
      head.appendChild(style);
    }

    if (style.styleSheet) {
      style.styleSheet.cssText = css;
    } else {
      style.appendChild(document.createTextNode(css));
    }
  }

  var css_248z = "\n.zumly-canvas {\n  position: absolute;\n  width: 100%;\n  height: 100%;\n  overflow: hidden;\n  margin: 0;\n  padding: 0;\n  perspective: 1000px;\n  cursor: zoom-out;\n  contain: strict;\n}\n\n.zumly-canvas:focus {\n  outline: none;\n}\n\n.z-view {\n  position: absolute;\n  contain: strict;\n}\n\n.z-view.is-current-view {\n  cursor: default;\n}\n\n.z-view.is-previous-view, .z-view.is-last-view, .z-view.has-no-events  {\n  pointer-events: none;\n  user-select: none;\n}\n\n.z-view.performance {\n  will-change: transform, opacity;\n}\n\n.z-view.hide {\n  opacity: 0\n}\n\n.zoom-me {\n  cursor: zoom-in;\n}\n";
  styleInject(css_248z);

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

  function validateUserSettings (parameters) {
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
    };

    schema.initialView.required = true;
    schema.mount.required = true;
    schema.views.required = true;

    var validator = (object, schema) => Object
      .entries(schema)
      .map(([key, val]) => [key,
        !val.required && !object.hasOwnProperty(key) ? 'valid_true' :
        val.required && object.hasOwnProperty(key) ? 'valid_' + val(object[key]) :
        !val.required && object.hasOwnProperty(key) ? 'valid_' + val(object[key]) : 
        'required_true'])
      .map(([key, response]) => {
        let data = response === 'valid_false' ? 'invalid' :
        response === 'required_true' ? 'required' : false;
        var response;
        if (data) {
          notification(false, `User settings: ${key} is ${data}.`, 'error');
          response = 'invalid';
        } else { response = 'valid'; }
        return response
        })
      .find(el => el === 'invalid');
    
    return validator(parameters, schema) !== undefined ? false : true
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
    * @params {Object} settings
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
    constructor (settings) {
      // Internal state:
      // Usser settings available properties
      // Check if user settings exist
      this.validated = validateUserSettings(settings);
      if (this.validated) {
        // set user properties
        this.initialView = settings.initialView;
        this.views = settings.views || {};
        this.componentContext = settings.componentContext || null;
        this.duration = settings.zoom_duration || 1000;
        this.ease =  settings.zoom_ease  || 'ease-in-out';
        this.debug =  settings.debug || false;
        this.cover =  settings.zoom_cover || 'width';
        this.effects =  settings.zoom_effects || ['none', 'none'];
        this.canvas = document.querySelector(settings.mount);
        // Register global instances of Zumly
        this.instance = Zumly.counter;
        // Store snapshots of each zoom transition
        this.storedViews = [];
        // Show current zoom level properties
        this.currentStage = null;
        // Store the scale of previous zoom transition
        this.storedPreviousScale = [1];
        // Deactive events during transtions
        this.blockEvents = false;
        // Initial values for gesture events
        this.touchstartX = 0;
        this.touchstartY = 0;
        this.touchendX = 0;
        this.touchendY = 0;
        this.touching = false;
        // Event bindings:
        this._onZoom = this.onZoom.bind(this);
        this._onTouchStart = this.onTouchStart.bind(this);
        this._onTouchEnd = this.onTouchEnd.bind(this);
        this._onKeyUp = this.onKeyUp.bind(this);
        this._onWeel = this.onWeel.bind(this);
        // Prepare the instance:
        this.canvas.setAttribute('tabindex', 0);
        this.canvas.addEventListener('mouseup', this._onZoom, false);
        this.canvas.addEventListener('touchend', this._onZoom, false);
        this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: true });
        this.canvas.addEventListener('touchend', this._onTouchEnd, false);
        this.canvas.addEventListener('keyup', this._onKeyUp, false);
        this.canvas.addEventListener('wheel', this._onWeel, { passive: true });
      }
    }

    /**
     * Helpers
     */
    storeViews (data) {
      this.storedViews.push(data);
    }

    setPreviousScale (scale) {
      this.storedPreviousScale.push(scale);
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
      if (this.validated) {
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
        this.notify(`${this.instance > 1 ? 
      `instance nº ${this.instance} is active.\n` : 
      `is running! Instance nº ${this.instance} is active.\n`}`, 'welcome');
        if (this.debug) {
          this.notify(`Debug is active, can be deactivate by setting \'debug: false\' when you define the instance.\n'`, 'welcome');
          this.notify(`More tips & docs at https://zumly.org`, 'welcome');
        }
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
          zoomViewState = view;
        }
        snapShoot.views.push(zoomViewState);
      });
      this.storeViews(snapShoot);
    }

    setZoomTransition (viewState, mode, viewToRemove) {
      if (mode === 'in') {
        // Just before first animation has started, fires an event
        this.blockEvents = true;
        const zoomInStarted = new Event('zoom-in-started');
        viewState[0].view.dispatchEvent(zoomInStarted);
        viewState.forEach((view, index) => {
          if (index < 3) {
            var animationStage = view.view.animate(
              [
                { transform: view.transform[0] },
                { transform: view.transform[1] }
              ],
              { duration: 1000, easing: view.ease}
            );
            viewState[0].view.classList.remove('hide');       
            animationStage.pause();
            animationStage.onfinish = event => {

              if (index === 0) {
                this.blockEvents = false;
                viewState[index].view.classList.replace('is-new-current-view', 'is-current-view');
              }
              viewState[index].view.classList.remove('performance');
              viewState[index].view.classList.remove('has-no-events');
              viewState[index].view.style.transformOrigin = view.origin;
              viewState[index].view.style.transform = view.transform[1];
              // After last animation finished, fires an event
              if (index === viewState.length - 1) {
                
                const zoomInFinished = new Event('zoom-in-finished');
                viewState[0].view.dispatchEvent(zoomInFinished);
              }
            };
            animationStage.play();
          }
        });
      } else {
        this.blockEvents = true;
        const zoomOutStarted = new Event('zoom-out-started');
        viewState[0].effect.target.dispatchEvent(zoomOutStarted);
        viewState.forEach((anim, index) => {
          if (index < 3) {
            anim.pause();
            anim.onfinish = event => {
              if (index === 0) {
                anim.effect.target.remove();
              }  
              if (index > 0) {
                anim.effect.target.classList.remove('performance');
                anim.effect.target.style.transformOrigin = index === 1 ? '0 0' : this.currentStage.views[index].backwardState.origin;
                anim.effect.target.style.transform = this.currentStage.views[index].backwardState.transform;
              }
              if (index === viewState.length - 1) {
                this.blockEvents = false;
                if (viewToRemove) {    
                  this.canvas.prepend(viewToRemove.view);
                  var newlastView = this.canvas.querySelector('.z-view:first-child');
                  newlastView.classList.add('hide');
                }
                const zoomOutFinished = new Event('zoom-out-finished');
                viewState[0].effect.target.dispatchEvent(zoomOutFinished);
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
        previousView.classList.replace('is-current-view', 'is-previous-view');
        if (lastView !== null) lastView.classList.replace('is-previous-view', 'is-last-view');
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
        // usar solo el currentStage.
        this.setZoomTransition(viewState, 'in');
      }
    }

    zoomOut () {
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
      previousView.classList.replace('is-previous-view', 'is-current-view');
      previousView.classList.remove('performance');
      //
      if (lastView !== null) {
        lastView.classList.add('performance');
        lastView.classList.replace('is-last-view', 'is-previous-view');
        lastView.classList.remove('hide');
      }
      //
      var currentViewAnimation = currentView.animate(
        [
          { transform: this.currentStage.views[0].forwardState.transform },
          { transform: this.currentStage.views[0].backwardState.transform }
        ],
        { duration: 1000, easing: this.currentStage.views[0].ease }
      );
      if (lastView !== null) {
        var lastViewAnimation = lastView.animate(
          [
            { transform: this.currentStage.views[2].forwardState.transform },
            { transform: this.currentStage.views[2].backwardState.transform }
          ],
          { duration: 1000, easing: this.currentStage.views[2].ease  }
        );
        var previousViewAnimation = previousView.animate(
          [
            { transform: this.currentStage.views[1].forwardState.transform },
            { transform: this.currentStage.views[1].backwardState.transform }
          ],
          { duration: 1000, easing: this.currentStage.views[1].ease }
        );
      } else {
        previousViewAnimation = previousView.animate(
          [
            { transform: this.currentStage.views[1].forwardState.transform },
            { transform: 'translate(0, 0)' }
          ],
          { duration: 1000, easing: this.currentStage.views[1].ease }
        );
      }
      let viewState = [];
      viewState.push(currentViewAnimation, previousViewAnimation);
      if (lastViewAnimation) viewState.push(lastViewAnimation);
      this.storedViews.pop();
      // usar solo currentStage
      this.setZoomTransition(viewState, 'out', reAttachView);
    }
    /**
     * Event hangling
     */
    onZoom (event) {
      if (this.storedViews.length > 1 && !this.blockEvents && !event.target.classList.contains('zoom-me') && event.target.closest('.is-current-view') === null && !this.touching) {
        event.stopPropagation();
        this.zoomOut();
      }
      if (!this.blockEvents && event.target.classList.contains('zoom-me') && !this.touching) {
        event.stopPropagation();
        this.zoomIn(event.target);
      }
    }

    onKeyUp (event) {
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
      // Inertia may need to be fixed
      if (!this.blockEvents && event.deltaY > 0 && this.storedViews.length > 1 && !this.blockEvents) 
        this.zoomOut();
    }

    onTouchStart (event) {
      this.touching = true;
      this.touchstartX = event.changedTouches[0].screenX;
      this.touchstartY = event.changedTouches[0].screenY;
    }

    onTouchEnd (event) {
      if (!this.blockEvents) {
        this.touchendX = event.changedTouches[0].screenX;
        this.touchendY = event.changedTouches[0].screenY;
        this.handleGesture(event);
      }
    }

    handleGesture (event) {
      event.stopPropagation();
      if (this.touchendX < this.touchstartX - 30) {
        if (this.storedViews.length > 1 && !this.blockEvents) {
          this.zoomOut();
        } else {
          this.notify("is on level zero. Can't zoom out. Trigger: Swipe left", 'warn');
        }
      }
      if (this.touchendY < this.touchstartY - 10) {
        if (this.storedViews.length > 1 && !this.blockEvents) ; else {
          this.notify("is on level zero. Can't zoom out. Trigger: Swipe up", 'warn');
        }
      }
      if (this.touchendY === this.touchstartY && !this.blockEvents &&
        event.target.classList.contains('zoom-me') && this.touching) {
        this.touching = false;
        event.preventDefault();
        this.zoomIn(event.target);
      }
      if (this.touchendY === this.touchstartY && this.storedViews.length > 1 && 
        !this.blockEvents && !event.target.classList.contains('zoom-me') && 
        event.target.closest('.is-current-view') === null && this.touching) {
        this.touching = false;
        this.zoomOut();
      }
    }
  }

  return Zumly;

}));
