import { renderView, notification, checkParameters } from "./utils.js";

/**
 * Zumly
 * Powers your apps with a zoomable user interface (ZUI) taste.
 * @class
 */

export class Zumly {
  /**
   * Creates a Zumly instance
   * @constructor
   * @params {Object} options
   * @example
   *  new Zumly({
   *  mount: '.mount',
   *  initialView: 'home',
   *  views: {
   *   home,
   *   contact,
   *   ...
   *  }
   *
   */
  constructor(options) {
    // Internal state:
    // Store snapshots of each zoom transition
    this.storedViews = [];
    // Show current zoom level properties
    this.currentStage = null;
    // Store the scale of previous zoom transition
    this.storedPreviousScale = [1];
    // Debugging?
    this.debug = false;
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
      this._onZoomInHandlerStart = this.onZoomInHandlerStart.bind(this);
      this._onZoomInHandlerEnd = this.onZoomInHandlerEnd.bind(this);
      this._onZoomOutHandlerStart = this.onZoomOutHandlerStart.bind(this);
      this._onZoomOutHandlerEnd = this.onZoomOutHandlerEnd.bind(this);
      this._onTouchStart = this.onTouchStart.bind(this);
      this._onTouchEnd = this.onTouchEnd.bind(this);
      this._onKeyUp = this.onKeyUp.bind(this);
      this._onWeel = this.onWeel.bind(this);
      this._onResize = this.resizeStackedViews.bind(this);
      // Prepare the instance:
      this.canvas = document.querySelector(this.mount);
      this.canvas.setAttribute("tabindex", 0);
      this.canvas.addEventListener("mouseup", this._onZoom, false);
      this.canvas.addEventListener("touchend", this._onZoom, false);
      this.canvas.addEventListener("touchstart", this._onTouchStart, {
        passive: true,
      });
      this.canvas.addEventListener("touchend", this._onTouchEnd, false);
      this.canvas.addEventListener("keyup", this._onKeyUp, false);
      this.canvas.addEventListener("wheel", this._onWeel, { passive: true });
      window.addEventListener("resize", this._onResize, false)
    } else {
      this.notify(
        "is unable to start: no {options} have been passed to the Zumly's instance.",
        "error"
      );
    }
  }

  /**
   * Helpers
   */
  storeViews(data) {
    this.storedViews.push(data);
    //console.log(data)
  }

  setPreviousScale(scale) {
    this.storedPreviousScale.push(scale);
  }

  getPreviousScale() {
    return this.storedPreviousScale[this.storedPreviousScale.length - 1];
  }

  getNewScale(bounds, update = false) {
    const previous = this.getPreviousScale();
    let newScale;
    
    if (!update) {
      if (this.cover === "width") {
        newScale = bounds.newView.width / bounds.triggeredElement.width;
      } else if (this.cover === "height") {
        newScale = bounds.newView.height / bounds.triggeredElement.height;
      }
      this.setPreviousScale(newScale);
    } else {
      if (this.cover === "width") {
        newScale = bounds.currentView.width / bounds.triggeredElement.width;
      } else if (this.cover === "height") {
        newScale = bounds.currentView.height / bounds.triggeredElement.height;
      }
    }
    return {
      scale: {
        new: newScale,
        newInverted: 1 / newScale,
        previous,
      },
    };
  }

  calculateCoords(step, data) {
    let x;
    let y;
    let translate;

    if (step === "newView") {
      x =
        data.bounds.triggeredElement.x -
        data.bounds.canvas.left +
        (data.bounds.triggeredElement.width -
          data.bounds.newView.width * data.scale.newInverted) /
          2;
      y =
        data.bounds.triggeredElement.y -
        data.bounds.canvas.top +
        (data.bounds.triggeredElement.height -
          data.bounds.newView.height * data.scale.newInverted) /
          2;
      translate = `translate(${x}px, ${y}px) scale(${data.scale.newInverted})`;
    }
    if (step === "currentView") {
      x =
        data.bounds.canvas.width / 2 -
        data.bounds.triggeredElement.width / 2 -
        data.bounds.triggeredElement.x +
        data.bounds.currentView.x;
      y =
        data.bounds.canvas.height / 2 -
        data.bounds.triggeredElement.height / 2 -
        data.bounds.triggeredElement.y +
        data.bounds.currentView.y;
      translate = `translate(${x}px, ${y}px) scale(${data.scale.new})`;
    }
    if (step === "newViewEnd") {
      x =
        data.reDoTriggeredElementBounds.x -
        data.bounds.canvas.left +
        (data.reDoTriggeredElementBounds.width - data.bounds.newView.width) / 2;
      y =
        data.reDoTriggeredElementBounds.y -
        data.bounds.canvas.top +
        (data.reDoTriggeredElementBounds.height - data.bounds.newView.height) /
          2;
      translate = `translate(${x}px, ${y}px)`;
    }
    if (step === "previousToLastViewEnd") {
      x =
        data.bounds.canvas.width / 2 -
        data.bounds.triggeredElement.width / 2 -
        data.bounds.triggeredElement.x +
        (data.reReDoCurrentViewBounds.x - data.zoomedElementBounds.x) +
        data.reDoCurrentViewBounds.x -
        data.bounds.canvas.left +
        (data.reDoCurrentViewBounds.width - data.zoomedElementBounds.width) / 2;
      y =
        data.bounds.canvas.height / 2 -
        data.bounds.triggeredElement.height / 2 -
        data.bounds.triggeredElement.y +
        (data.reReDoCurrentViewBounds.y - data.zoomedElementBounds.y) +
        data.reDoCurrentViewBounds.y -
        data.bounds.canvas.top +
        (data.reDoCurrentViewBounds.height - data.zoomedElementBounds.height) /
          2;
      translate = `translate(${x}px, ${y}px) scale(${
        data.scale.new * data.scale.previous
      })`;
    }
    if (step === "previousViewSimulated") {
      x = data.currentViewEnd.x - data.bounds.canvas.left;
      y = data.currentViewEnd.y - data.bounds.canvas.top;
      translate = `translate(${x}px, ${y}px) scale(${
        data.scale.new * data.scale.previous
      })`;
    }

    return {
      x,
      y,
      translate,
    };
  }
  
  calculateTransformOriginCoords(step, bounds) {
    let x;
    let y;
    let transformOrigin;
    if (step === "currentToPreviusView") {
      x =
        bounds.triggeredElement.x +
        bounds.triggeredElement.width / 2 -
        bounds.currentView.x;
      y =
        bounds.triggeredElement.y +
        bounds.triggeredElement.height / 2 -
        bounds.currentView.y;
      transformOrigin = `${x}px ${y}px`;
    }
    return {
      x,
      y,
      transformOrigin,
    };
  }

  async getDOMRect(element) {
    return element.getBoundingClientRect();
    /*  esta opcion no causa reflow pero no anda en safari
    return new Promise((resolve) => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.boundingClientRect) {
                    const { x, y, width, height, top, left } = entry.boundingClientRect;
                    resolve({ x, y, width, height,top,left }); // Return only essential properties
                    observer.disconnect(); // Stop observing after getting the data
                }
            });
        }, { threshold: 1 });

        observer.observe(element);
    }); */
  }

  tracing(data) {
    if (this.debug) {
      if (data === "ended") {
        const parse = this.trace
          .map(
            (task, index) =>
              `${
                index === 0 ? `Instance ${this.instance}: ${task}` : `${task}`
              }`
          )
          .join(" > ");
        this.notify(parse);
        this.trace = [];
      } else {
        this.trace.push(data);
      }
    }
  }

  notify(msg, type) {
    return notification(this.debug, msg, type);
  }

  /**
   * Public methods
   */
  zoomLevel() {
    return this.storedViews.length;
  }

  async init() {
    if (this.options) {
      await renderView(
        this.initialView,
        this.canvas,
        this.views,
        "init",
        this.componentContext
      );
      this.storeViews({
        zoomLevel: this.storedViews.length,
        views: [
          {
            viewName: this.initialView,
            backwardState: {
              origin: "0 0",
              transform: "",
            },
          },
        ],
      });
    }
  }

  async calculateStackedViews(triggeredElement, sameLevel) {
    // Obtener las vistas del DOM
    const { canvas, views } = this.getViewsFromDOM();

    // Renderizar la nueva vista
    const newView = await this.renderNewView(triggeredElement, canvas);

    // Obtener dimensiones
    const { bounds } = await this.getBounds(
      canvas,
      newView,
      views,
      triggeredElement
    );

    // Modificar los estilos
    this.modifyStyles(triggeredElement, newView, views, canvas, sameLevel);

    // Obtener y modificar escala
    const { scale } = this.getNewScale(bounds);

    // Calcular y aplicar transformaciones
    const { transforms } = this.calculateAndApplyTransforms(
      triggeredElement,
      bounds,
      scale,
      views,
      newView,
      sameLevel
    );

    // Guardar el estado de las vistas
    this.storeViewsState(views, newView, transforms);

    return {
      views: {
        newView,
        current: views.current,
        previous: views.previous,
      },
    };
  }



  // Función para obtener las vistas del DOM
  getViewsFromDOM() {
    const canvas = this.canvas;
    return {
      canvas,
      views: {
        current: canvas.querySelector(".is-current-view"),
        previous: canvas.querySelector(".is-previous-view"),
        last: canvas.querySelector(".is-last-view"),
      },
    };
  }

  // Función para renderizar la nueva vista
  async renderNewView(triggeredElement, canvas) {
    return await renderView(
      triggeredElement,
      canvas,
      this.views,
      false,
      this.componentContext
    );
  }

  // Función para obtener dimensiones
  async getBounds(canvas, newView, views, triggeredElement) {
    return {
      bounds: {
        canvas: await this.getDOMRect(canvas),
        newView: await this.getDOMRect(newView),
        currentView: await this.getDOMRect(views.current),
        triggeredElement: await this.getDOMRect(triggeredElement),
      },
    };
  }

  // Función para modificar los estilos
  modifyStyles(triggeredElement, newView, views, canvas, sameLevel) {
    console.log(sameLevel)
    triggeredElement.classList.add("zoomed");
    newView.style.contentVisibility = "hidden";
    views.current.style.contentVisibility = "hidden";
    if (sameLevel) canvas.removeChild(views.current);
    // aca en lateral zoom is-current-view tiene que desaparacer remove
    if (!sameLevel) views.current.classList.replace("is-current-view", "is-previous-view");
    if (views.previous !== null) {
      views.previous.style.contentVisibility = "hidden";
      // aca en lateral, no hay que cambiar nada
      if (!sameLevel) views.previous.classList.replace("is-previous-view", "is-last-view");
    }
    if (views.last !== null) {
      // aca tampoco. no debe removere
      if (!sameLevel) canvas.removeChild(views.last);
    }
  }

  // Función para calcular y aplicar las transformaciones
  calculateAndApplyTransforms(triggeredElement, bounds, scale, views, newView, sameLevel) {
    // Lógica de transformaciones y coordenadas
    var newViewStart = this.calculateCoords("newView", { bounds, scale });
    // apply sate
    newView.style.transform = newViewStart.translate;
    // save state
    var currentViewTransformStart = views.current.style.transform;
    // calculate transform origin
    const { transformOrigin } = this.calculateTransformOriginCoords(
      "currentToPreviusView",
      bounds
    );
    // apply
    views.current.style.transformOrigin = transformOrigin;
    // Calculates and applies final transform coordinates of views.current.
    const currentViewEnd = this.calculateCoords("currentView", {
      bounds,
      scale,
    });
    // apply
    views.current.style.transform = currentViewEnd.translate;
    // recalcular dimensiones del elemento clickeado
    var reDoTriggeredElementBounds = triggeredElement.getBoundingClientRect();
    // calculated
    var newViewEnd = this.calculateCoords("newViewEnd", {
      reDoTriggeredElementBounds,
      bounds,
    });
    // save state

    if (views.previous !== null && !sameLevel) {
      // save sate
      var previousViewTransformStart = views.previous.style.transform;
      // get dimensions
      var reDoCurrentViewBounds = views.current.getBoundingClientRect();
      var previousViewSimulated = this.calculateCoords(
        "previousViewSimulated",
        { currentViewEnd, bounds, scale }
      );
      // apply
      views.previous.style.transform = previousViewSimulated.translate;
      // get dimensions
      var zoomedElement = views.previous.querySelector(".zoomed");
      var zoomedElementBounds = zoomedElement.getBoundingClientRect();
      // apply
      views.previous.style.transform = previousViewTransformStart;
      views.current.style.transform = currentViewTransformStart;
      // get dimensions
      var reReDoCurrentViewBounds = views.current.getBoundingClientRect();
      // calculate
      var previousToLastViewEnd = this.calculateCoords(
        "previousToLastViewEnd",
        {
          zoomedElementBounds,
          reDoCurrentViewBounds,
          reReDoCurrentViewBounds,
          bounds,
          scale,
        }
      );
      // save sate
      var previousViewTransformEnd = previousToLastViewEnd.translate;
    } else {
      // apply
      views.current.style.transform = currentViewTransformStart;
    }

    return {
      transforms: {
        newViewTransformStart: newViewStart.translate,
        newViewTransformEnd: newViewEnd.translate,
        currentViewTransformStart,
        currentViewTransformEnd: currentViewEnd.translate,
        previousViewTransformStart,
        previousViewTransformEnd,
      },
    };
  }



  // Función para guardar el estado de las vistas
  updateViewsState(views, newView, transforms) {
    this.storedViews.pop()
    const snapShoot = this.createSnapshot(newView, views, transforms);
    this.storeViews(snapShoot);
    this.currentStage = this.storedViews[this.storedViews.length - 1];
  }
  // Función para guardar el estado de las vistas
  storeViewsState(views, newView, transforms) {
    const snapShoot = this.createSnapshot(newView, views, transforms);
    this.storeViews(snapShoot);
    this.currentStage = this.storedViews[this.storedViews.length - 1];
  }

  // Crear snapshot de las vistas
  createSnapshot(newView, views, transforms) {
    let snapShoot = {
      zoomLevel: this.storedViews.length,
      views: [],
    };

    if (newView)
      snapShoot.views.push(
        this.createViewSnapShoot(
          newView,
          transforms.newViewTransformStart,
          transforms.newViewTransformEnd
        )
      );
    if (views.current)
      snapShoot.views.push(
        this.createViewSnapShoot(
          views.current,
          transforms.currentViewTransformStart,
          transforms.currentViewTransformEnd
        )
      );
    if (views.previous)
      snapShoot.views.push(
        this.createViewSnapShoot(
          views.previous,
          transforms.previousViewTransformStart,
          transforms.previousViewTransformEnd
        )
      );
    if (views.last) snapShoot.views.push({ viewName: views.last });

    return snapShoot;
  }

  // Crear un snapshot de una vista específica
  createViewSnapShoot(view, transformStart, transformEnd) {
    return {
      viewName: view.dataset.viewName,
      backwardState: {
        origin: view.style.transformOrigin,
        duration: this.duration,
        ease: this.ease,
        transform: transformStart,
      },
      forwardState: {
        origin: view.style.transformOrigin,
        duration: this.duration,
        ease: this.ease,
        transform: transformEnd,
      },
    };
  }
  prepareAnimation(views, sameLevel) {
    let currentStage = this.currentStage;
    views.newView.classList.remove("hide");
    views.newView.addEventListener(
      "animationstart",
      this._onZoomInHandlerStart
    );
    views.newView.addEventListener("animationend", this._onZoomInHandlerEnd);
    views.current.addEventListener("animationend", this._onZoomInHandlerEnd);
    if (views.previous !== null)
      views.previous.addEventListener("animationend", this._onZoomInHandlerEnd);
    //
    views.newView.style.setProperty("--zoom-duration", this.duration);
    views.newView.style.setProperty("--zoom-ease", this.ease);
    views.newView.style.setProperty(
      "--current-view-transform-start",
      currentStage.views[0].backwardState.transform
    );
    views.newView.style.setProperty(
      "--current-view-transform-end",
      currentStage.views[0].forwardState.transform
    );
    if (!sameLevel) {
      views.current.style.setProperty("--zoom-duration", this.duration);
    views.current.style.setProperty("--zoom-ease", this.ease);
    views.current.style.setProperty(
      "--previous-view-transform-start",
      currentStage.views[1].backwardState.transform
    );
    views.current.style.setProperty(
      "--previous-view-transform-end",
      currentStage.views[1].forwardState.transform
    );
    if (views.previous !== null) {
      views.previous.style.setProperty("--zoom-duration", this.duration);
      views.previous.style.setProperty("--zoom-ease", this.ease);
      views.previous.style.setProperty(
        "--last-view-transform-start",
        currentStage.views[2].backwardState.transform
      );
      views.previous.style.setProperty(
        "--last-view-transform-end",
        currentStage.views[2].forwardState.transform
      );
    }
    } else {
      
    if (views.previous !== null) {
      views.previous.style.setProperty("--zoom-duration", this.duration);
      views.previous.style.setProperty("--zoom-ease", this.ease);
      views.previous.style.setProperty(
        "--previous-view-transform-start",
        currentStage.views[1].backwardState.transform
      );
      views.previous.style.setProperty(
        "--previous-view-transform-end",
        currentStage.views[1].forwardState.transform
      );
    }
    }
    

    views.newView.style.contentVisibility = "auto";
    views.current.style.contentVisibility = "auto";
    if (views.previous !== null)
      views.previous.style.contentVisibility = "auto";
  }

  // Función para ejecutar la animación
  performAnimation(views, sameLevel) {
    if (!sameLevel) {
      views.newView.classList.add("zoom-current-view");
      views.current.classList.add("zoom-previous-view");
      if (views.previous !== null) views.previous.classList.add("zoom-last-view");
    } else {
      views.newView.classList.add("zoom-current-view");
      views.previous.classList.add("zoom-previous-view");
      // if (views.previous !== null) views.previous.classList.add("zoom-last-view");
    }
   
  }

  zoomOut() {
    this.blockEvents = true;
    this.storedPreviousScale.pop();
    const { canvas, views } = this.getViewsFromDOM();
    this.currentStage = this.storedViews[this.storedViews.length - 1];
    const reAttachView = this.currentStage.views[3];

    views.previous.querySelector(".zoomed").classList.remove("zoomed");
    views.previous.classList.replace("is-previous-view", "is-current-view");

    if (views.last !== null) {
      views.last.classList.replace("is-last-view", "is-previous-view");
      views.last.classList.remove("hide");
    }

    if (reAttachView !== undefined) {
      canvas.prepend(reAttachView.viewName);
      var newlastView = canvas.querySelector(".z-view:first-child");
      newlastView.style.contentVisibility = "auto";
      newlastView.classList.add("hide");
    }
    //
    views.current.addEventListener(
      "animationstart",
      this._onZoomOutHandlerStart
    );
    views.current.addEventListener("animationend", this._onZoomOutHandlerEnd);
    views.previous.addEventListener("animationend", this._onZoomOutHandlerEnd);
    if (views.last !== null)
      views.last.addEventListener("animationend", this._onZoomOutHandlerEnd);
    //

    views.current.classList.add(`zoom-current-view-reverse`);
    views.previous.classList.add(`zoom-previous-view-reverse`);
    if (views.last !== null) views.last.classList.add(`zoom-last-view-reverse`);

    this.storedViews.pop();
  }

  /**
   * Main methods
   */
  async zoomIn(triggeredElement, sameLevel = false) {
    const { views } = await this.calculateStackedViews(triggeredElement, sameLevel);
    // Preparar la animación
    this.prepareAnimation(views, sameLevel);

    // Ejecutar la animación
    this.performAnimation(views, sameLevel);
  }

  /**
   * resize
   */
  async resizeStackedViews() {
    console.log('hola')
    //const {views} = this.getViewsFromDOM()
    //let zoomedElement = views.previous.querySelector('.zoomed')
   // await this.reCalculateStackedViews(zoomedElement);
  }

  /**
   * Event hangling
   */
  onSameZoomLevel(event) {
    // mantains stackedViews
    // prepare animation > ver como
    // cambia modifyStyles()
    // perfom animation > ver como
  }

  onZoom(event) {
    if (
      this.storedViews.length > 1 &&
      !this.blockEvents &&
      !event.target.classList.contains("zoom-me") &&
      event.target.closest(".is-current-view") === null &&
      !this.touching
    ) {
      event.stopPropagation();
      this.zoomOut();
    }
    if (
      !this.blockEvents &&
      event.target.closest(".is-current-view") &&
      event.target.classList.contains("zoom-me") &&
      !this.touching
    ) {
      event.stopPropagation();
      this.zoomIn(event.target);
    }
    if (
      !this.blockEvents &&
      event.target.closest(".is-previous-view") &&
      event.target.classList.contains("zoom-me") &&
      !this.touching
    ) {
      event.stopPropagation();
      this.zoomIn(event.target, 'sameLevel');
    }
  }

  onKeyUp(event) {
    // Possible conflict with usar inputs
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.zoomOut();
      } else {
        this.notify(
          `is on level zero. Can't zoom out. Trigger: ${event.key}`,
          "warn"
        );
      }
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      this.notify(event.key + "has not actions defined");
    }
  }

  onWeel(event) {
    // inertia need to be fixed
    if (!this.blockEvents) {
      if (event.deltaY < 0) {
      }
      if (event.deltaY > 0) {
        if (this.storedViews.length > 1 && !this.blockEvents) {
          this.zoomOut();
        } else {
          // this.notify("is on level zero. Can't zoom out. Trigger: wheel/scroll", 'warn')
        }
      }
    }
  }

  onTouchStart(event) {
    this.touching = true;
    this.touchstartX = event.changedTouches[0].screenX;
    this.touchstartY = event.changedTouches[0].screenY;
  }

  onTouchEnd(event) {
    if (!this.blockEvents) {
      this.touchendX = event.changedTouches[0].screenX;
      this.touchendY = event.changedTouches[0].screenY;
      this.handleGesture(event);
    }
  }

  handleGesture(event) {
    event.stopPropagation();
    if (this.touchendX < this.touchstartX - 30) {
      if (this.storedViews.length > 1 && !this.blockEvents) {
        this.zoomOut();
      } else {
        this.notify(
          "is on level zero. Can't zoom out. Trigger: Swipe left",
          "warn"
        );
      }
    }
    if (this.touchendY < this.touchstartY - 10) {
      if (this.storedViews.length > 1 && !this.blockEvents) {
        // Disabled. In near future enable if Zumly is full screen
        // this.zoomOut()
      } else {
        this.notify(
          "is on level zero. Can't zoom out. Trigger: Swipe up",
          "warn"
        );
      }
    }
    if (
      this.touchendY === this.touchstartY &&
      !this.blockEvents &&
      event.target.classList.contains("zoom-me") &&
      this.touching
    ) {
      this.touching = false;
      event.preventDefault();
      this.zoomIn(event.target);
    }
    if (
      this.touchendY === this.touchstartY &&
      this.storedViews.length > 1 &&
      !this.blockEvents &&
      !event.target.classList.contains("zoom-me") &&
      event.target.closest(".is-current-view") === null &&
      this.touching
    ) {
      this.touching = false;
      this.zoomOut();
    }
  }

  onZoomOutHandlerStart(event) {
    this.blockEvents = true;
    event.target.removeEventListener(
      "animationstart",
      this._onZoomOutHandlerStart
    );
  }

  onZoomOutHandlerEnd(event) {
    const element = event.target;
    var currentZoomLevel = this.currentStage;
    element.removeEventListener("animationend", this._onZoomOutHandlerEnd);
    // current
    if (element.classList.contains(`zoom-current-view-reverse`)) {
      try {
        this.canvas.removeChild(element);
      } catch (e) {
        console.debug(
          "Error when trying to remove element after zoom out. Trying to remove its parent instead..."
        );
        try {
          this.canvas.removeChild(element.parentElement);
        } catch (e) {
          console.debug(
            "Error when trying to remove elemont after zoom out:",
            e
          );
          console.debug("Element to remove was:", element);
        }
      }

      this.blockEvents = false;
    }
    if (element.classList.contains(`zoom-previous-view-reverse`)) {
      var origin = currentZoomLevel.views[1].backwardState.origin;
      var transform = currentZoomLevel.views[1].backwardState.transform;
      element.classList.remove(`zoom-previous-view-reverse`);
      element.style.transformOrigin = `0 0`;
      element.style.transform = transform;
      //element.style.filter = 'none'
    }
    if (element.classList.contains(`zoom-last-view-reverse`)) {
      origin = currentZoomLevel.views[2].backwardState.origin;
      transform = currentZoomLevel.views[2].backwardState.transform;
      element.classList.remove(`zoom-last-view-reverse`);
      element.style.transformOrigin = origin;
      element.style.transform = transform;
    }
  }

  onZoomInHandlerStart(event) {
    this.blockEvents = true;
    event.target.removeEventListener(
      "animationstart",
      this._onZoomInHandlerStart
    );
  }

  onZoomInHandlerEnd(event) {
    const element = event.target;
    var currentZoomLevel = this.currentStage;
    if (event.target.classList.contains("is-new-current-view")) {
      this.blockEvents = false;
      var viewName = "current-view";
      var transform = currentZoomLevel.views[0].forwardState.transform;
      var origin = currentZoomLevel.views[0].forwardState.origin;
      element.classList.replace("is-new-current-view", "is-current-view");
    } else if (event.target.classList.contains("is-previous-view")) {
      viewName = "previous-view";
      transform = currentZoomLevel.views[1].forwardState.transform;
      origin = currentZoomLevel.views[1].forwardState.origin;
    } else {
      viewName = "last-view";
      transform = currentZoomLevel.views[2].forwardState.transform;
      origin = currentZoomLevel.views[2].forwardState.origin;
    }
    element.classList.remove(`zoom-${viewName}`, "has-no-events");
    element.style.transformOrigin = origin;
    element.style.transform = transform;
    // element.style.filter = window.getComputedStyle(document.documentElement).getPropertyValue(`--${viewName}-filter-end-${this.instance}`)
    element.removeEventListener("animationend", this._onZoomInHandlerEnd);
  }
}
