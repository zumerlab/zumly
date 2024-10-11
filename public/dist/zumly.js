
/*
* zumly
* v.0.9.11
* Author Juan Martin Muda - Zumerlab
* License MIT
**/
(() => {
  // src/utils.js
  function checkArray(array) {
    if (array !== void 0 && array[0].toLowerCase() === "none") {
      return true;
    }
    if (array !== void 0 && array.length > 0) {
      const unique = (array2) => [...new Set(array2)];
      const lowerArray = array.map((e) => e.toLowerCase());
      return unique(lowerArray).every((value) => ["blur", "sepia", "saturate"].indexOf(value) !== -1);
    }
  }
  function setFx(values) {
    var start = "";
    var end = "";
    if (values !== void 0) {
      values.map((effect) => {
        start += `${effect.toLowerCase() === "blur" ? "blur(0px) " : effect.toLowerCase() === "sepia" ? "sepia(0) " : effect.toLowerCase() === "saturate" ? "saturate(0) " : "none"}`;
        end += `${effect.toLowerCase() === "blur" ? "blur(0.8px) " : effect.toLowerCase() === "sepia" ? "sepia(5) " : effect.toLowerCase() === "saturate" ? "saturate(8) " : "none"}`;
      });
      return [start, end];
    }
  }
  function assignProperty(instance, propertiesToAdd, value) {
    instance[propertiesToAdd] = value;
  }
  function validate(instance, name, value, type, options = { isRequired: false, defaultValue: 0, allowedValues: 0, hasValidation: 0, hasAssignFunction: 0 }) {
    var msg = `'${name}' property is required when instance is defined`;
    var msg1 = `'${name}' property has problems`;
    var checkValue = value !== void 0;
    var checkDefault = options.defaultValue !== void 0;
    var checkCustomValidation = options.hasValidation !== void 0;
    var checkCustomAssign = options.hasAssignFunction !== void 0;
    if (type === "string" || type === "object" || type === "boolean") {
      var checkTypeof = typeof value === type;
    } else if (type === "array") {
      checkTypeof = Array.isArray(value);
    }
    if (options.isRequired) {
      checkValue && checkTypeof ? assignProperty(instance, name, value) : notification(false, msg, "error");
    }
    if (checkDefault && !checkCustomValidation && !checkCustomAssign) {
      checkValue && checkTypeof ? assignProperty(instance, name, value) : value === void 0 ? assignProperty(instance, name, options.defaultValue) : notification(false, msg1, "error");
    }
    if (checkCustomValidation && checkDefault && !checkCustomAssign) {
      checkValue && checkTypeof && options.hasValidation ? assignProperty(instance, name, value) : value === void 0 ? assignProperty(instance, name, options.defaultValue) : notification(false, msg1, "error");
    }
    if (checkCustomValidation && checkDefault && checkCustomAssign) {
      checkValue && checkTypeof && options.hasValidation ? assignProperty(instance, name, options.hasAssignFunction) : value === void 0 ? assignProperty(instance, name, options.defaultValue) : notification(false, msg1, "error");
    }
  }
  function prepareCSS(instance) {
    var instanceStyle = document.createElement("style");
    const views = ["current-view", "previous-view", "last-view"];
    let result = "";
    views.map((view) => {
      result += `
  .zoom-${view}-${instance} {
    animation-name: zoom-${view}-${instance};
    animation-duration: var(--zoom-duration-${instance});
    animation-timing-function: var(--zoom-ease-${instance});
  }
  @keyframes zoom-${view}-${instance} {
    0% {
      transform: var(--${view}-transform-start-${instance});
    }
    100% {
      transform: var(--${view}-transform-end-${instance});
    }
  }
  `;
    });
    instanceStyle.innerHTML = result;
    document.head.appendChild(instanceStyle);
  }
  function setCSSVariables(transition, currentStage, instance) {
    const viewStage = currentStage;
    const current = viewStage.views[0];
    const previous = viewStage.views[1];
    const last = viewStage.views[2];
    const views = [{ name: "current-view", stage: current }, { name: "previous-view", stage: previous }, { name: "last-view", stage: last }];
    views.map((view) => {
      if (transition === "zoomOut" && view.stage !== void 0) {
        document.documentElement.style.setProperty(`--${view.name}-transform-start-${instance}`, view.stage.forwardState.transform);
        document.documentElement.style.setProperty(`--${view.name}-transform-end-${instance}`, view.stage.backwardState.transform);
        if (view.name === "current-view") {
          document.documentElement.style.setProperty(`--zoom-duration-${instance}`, view.stage.backwardState.duration);
          document.documentElement.style.setProperty(`--zoom-ease-${instance}`, view.stage.backwardState.ease);
        }
      }
      if (transition === "zoomIn" && view.stage !== void 0) {
        document.documentElement.style.setProperty(`--${view.name}-transform-start-${instance}`, view.stage.backwardState.transform);
        document.documentElement.style.setProperty(`--${view.name}-transform-end-${instance}`, view.stage.forwardState.transform);
        if (view.name === "current-view") {
          document.documentElement.style.setProperty(`--zoom-duration-${instance}`, view.stage.forwardState.duration);
          document.documentElement.style.setProperty(`--zoom-ease-${instance}`, view.stage.forwardState.ease);
        }
      }
    });
  }
  async function renderView(el, canvas, views, init, componentContext) {
    var viewName = null;
    init ? viewName = el : viewName = el.dataset.to;
    var newView = document.createElement("template");
    if (typeof views[viewName] === "object" && views[viewName].render !== void 0) {
      newView.innerHTML = await views[viewName].render();
    } else if (typeof views[viewName] === "function") {
      var newViewInner = document.createElement("div");
      new views[viewName]({
        target: newViewInner,
        context: componentContext,
        props: el.dataset
      });
      newViewInner.classList.add("z-view");
      newView.content.appendChild(newViewInner);
    } else {
      newView.innerHTML = views[viewName];
    }
    let vv = newView.content.querySelector(".z-view");
    if (!init) {
      vv.classList.add("is-new-current-view");
      vv.classList.add("has-no-events");
      vv.classList.add("hide");
      vv.classList.add("performance");
    } else {
      vv.classList.add("is-current-view");
    }
    vv.style.transformOrigin = "0 0";
    vv.dataset.viewName = viewName;
    canvas.append(newView.content);
    if (typeof views[viewName] === "object" && views[viewName].mounted !== void 0 && typeof views[viewName].mounted() === "function")
      await views[viewName].mounted();
    return init ? canvas.querySelector(".is-current-view") : canvas.querySelector(".is-new-current-view");
  }
  function notification(debug, msg, type) {
    if (msg && type === "welcome") {
      console.info(`%c Zumly %c ${msg}`, "background: #424085; color: white; border-radius: 3px;", "color: #424085");
    }
    if (msg && debug && (type === "info" || type === void 0)) {
      console.info(`%c Zumly %c ${msg}`, "background: #6679A3; color: #304157; border-radius: 3px;", "color: #6679A3");
    }
    if (msg && type === "warn") {
      console.warn(`%c Zumly %c ${msg}`, "background: #DCBF53; color: #424085; border-radius: 3px;", "color: #424085");
    }
    if (msg && type === "error") {
      console.error(`%c Zumly %c ${msg}`, "background: #BE4747; color: white; border-radius: 3px;", "color: #424085");
    }
  }
  function checkParameters(parameters, instance) {
    if (parameters && typeof parameters === "object") {
      assignProperty(instance, "options", true);
      validate(instance, "mount", parameters.mount, "string", { isRequired: true });
      validate(instance, "initialView", parameters.initialView, "string", { isRequired: true });
      validate(instance, "views", parameters.views, "object", { isRequired: true });
      validate(instance, "debug", parameters.debug, "boolean", { defaultValue: false });
      validate(instance, "componentContext", parameters.componentContext, "object", { isRequired: false, defaultValue: /* @__PURE__ */ new Map() });
      if (parameters.transitions && typeof parameters.transitions === "object") {
        validate(instance, "cover", parameters.transitions.cover, "string", { defaultValue: "width", hasValidation: () => {
          ["height", "width"].indexOf(parameters.transitions.cover.toLowerCase()) !== -1;
        } });
        validate(instance, "duration", parameters.transitions.duration, "string", { defaultValue: "1s" });
        validate(instance, "ease", parameters.transitions.ease, "string", { defaultValue: "ease-in-out" });
        validate(instance, "effects", parameters.transitions.effects, "array", { defaultValue: ["none", "none"], hasValidation: checkArray(parameters.transitions.effects), hasAssignFunction: setFx(parameters.transitions.effects) });
      } else {
        assignProperty(instance, "cover", "width");
        assignProperty(instance, "duration", "1s");
        assignProperty(instance, "ease", "ease-in-out");
        assignProperty(instance, "effects", ["none", "none"]);
      }
    } else {
      notification(false, "'options' object has to be provided when instance is defined", "error");
    }
  }

  // src/zumly.js
  var Zumly = class _Zumly {
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
    *  }
    *
    */
    constructor(options) {
      this.instance = _Zumly.counter;
      this.storedViews = [];
      this.currentStage = null;
      this.storedPreviousScale = [1];
      this.trace = [];
      this.blockEvents = false;
      this.touchstartX = 0;
      this.touchstartY = 0;
      this.touchendX = 0;
      this.touchendY = 0;
      this.touching = false;
      checkParameters(options, this);
      if (this.options) {
        this._onZoom = this.onZoom.bind(this);
        this._onZoomInHandlerStart = this.onZoomInHandlerStart.bind(this);
        this._onZoomInHandlerEnd = this.onZoomInHandlerEnd.bind(this);
        this._onZoomOutHandlerStart = this.onZoomOutHandlerStart.bind(this);
        this._onZoomOutHandlerEnd = this.onZoomOutHandlerEnd.bind(this);
        this._onTouchStart = this.onTouchStart.bind(this);
        this._onTouchEnd = this.onTouchEnd.bind(this);
        this._onKeyUp = this.onKeyUp.bind(this);
        this._onWeel = this.onWeel.bind(this);
        this.canvas = document.querySelector(this.mount);
        this.canvas.setAttribute("tabindex", 0);
        this.canvas.addEventListener("mouseup", this._onZoom, false);
        this.canvas.addEventListener("touchend", this._onZoom, false);
        this.canvas.addEventListener("touchstart", this._onTouchStart, { passive: true });
        this.canvas.addEventListener("touchend", this._onTouchEnd, false);
        this.canvas.addEventListener("keyup", this._onKeyUp, false);
        this.canvas.addEventListener("wheel", this._onWeel, { passive: true });
      } else {
        this.notify("is unable to start: no {options} have been passed to the Zumly's instance.", "error");
      }
    }
    /**
     * Helpers
     */
    storeViews(data) {
      this.tracing("storedViews()");
      this.storedViews.push(data);
    }
    setPreviousScale(scale) {
      this.tracing("setPreviousScale()");
      this.storedPreviousScale.push(scale);
    }
    tracing(data) {
      if (this.debug) {
        if (data === "ended") {
          const parse = this.trace.map((task, index) => `${index === 0 ? `Instance ${this.instance}: ${task}` : `${task}`}`).join(" > ");
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
    static get counter() {
      _Zumly._counter = (_Zumly._counter || 0) + 1;
      return _Zumly._counter;
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
        this.tracing("init()");
        prepareCSS(this.instance);
        await renderView(this.initialView, this.canvas, this.views, "init", this.componentContext);
        this.storeViews({
          zoomLevel: this.storedViews.length,
          views: [{
            viewName: this.initialView,
            backwardState: {
              origin: "0 0",
              transform: ""
            }
          }]
        });
        this.notify(`${this.instance > 1 ? `instance n\xBA ${this.instance} is active.` : `is running! Instance n\xBA ${this.instance} is active. ${this.debug ? "Debug is active, can be deactivate by setting 'debug: false' when you define the instance." : ""}
        More tips & docs at https://zumly.org`}`, "welcome");
      }
    }
    /**
     * Main methods
     */
    async zoomIn(el) {
      this.tracing("zoomIn()");
      var instance = this.instance;
      const canvas = this.canvas;
      const coordenadasCanvas = canvas.getBoundingClientRect();
      var offsetX = coordenadasCanvas.left;
      var offsetY = coordenadasCanvas.top;
      const preScale = this.storedPreviousScale[this.storedPreviousScale.length - 1];
      this.tracing("renderView()");
      var currentView = await renderView(el, canvas, this.views, false, this.componentContext);
      if (currentView) {
        el.classList.add("zoomed");
        const coordenadasEl = el.getBoundingClientRect();
        var previousView = canvas.querySelector(".is-current-view");
        var lastView = canvas.querySelector(".is-previous-view");
        var removeView = canvas.querySelector(".is-last-view");
        if (removeView !== null)
          canvas.removeChild(removeView);
        const cc = currentView.getBoundingClientRect();
        const scale = cc.width / coordenadasEl.width;
        const scaleInv = 1 / scale;
        const scaleh = cc.height / coordenadasEl.height;
        const scaleInvh = 1 / scaleh;
        var duration = el.dataset.withDuration || this.duration;
        var ease = el.dataset.withEease || this.ease;
        var filterIn = this.effects[0];
        var filterOut = this.effects[1];
        var cover = this.cover;
        if (cover === "width") {
          var laScala = scale;
          var laScalaInv = scaleInv;
        } else if (cover === "height") {
          laScala = scaleh;
          laScalaInv = scaleInvh;
        }
        this.setPreviousScale(laScala);
        var transformCurrentView0 = `translate(${coordenadasEl.x - offsetX + (coordenadasEl.width - cc.width * laScalaInv) / 2}px, ${coordenadasEl.y - offsetY + (coordenadasEl.height - cc.height * laScalaInv) / 2}px) scale(${laScalaInv})`;
        currentView.style.transform = transformCurrentView0;
        previousView.classList.add("is-previous-view");
        previousView.classList.remove("is-current-view");
        const coordenadasPreviousView = previousView.getBoundingClientRect();
        var transformPreviousView0 = previousView.style.transform;
        previousView.style.transformOrigin = `${coordenadasEl.x + coordenadasEl.width / 2 - coordenadasPreviousView.x}px ${coordenadasEl.y + coordenadasEl.height / 2 - coordenadasPreviousView.y}px`;
        const x = coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + coordenadasPreviousView.x;
        const y = coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + coordenadasPreviousView.y;
        const transformPreviousView1 = `translate(${x}px, ${y}px) scale(${laScala})`;
        previousView.style.transform = transformPreviousView1;
        var newcoordenadasEl = el.getBoundingClientRect();
        var transformCurrentView1 = `translate(${newcoordenadasEl.x - offsetX + (newcoordenadasEl.width - cc.width) / 2}px, ${newcoordenadasEl.y - offsetY + (newcoordenadasEl.height - cc.height) / 2}px)`;
        if (lastView !== null) {
          lastView.classList.remove("is-previous-view");
          lastView.classList.add("is-last-view");
          var transformLastView0 = lastView.style.transform;
          var newcoordenadasPV = previousView.getBoundingClientRect();
          lastView.style.transform = `translate(${x - offsetX}px, ${y - offsetY}px) scale(${laScala * preScale})`;
          const last = lastView.querySelector(".zoomed");
          var coorLast = last.getBoundingClientRect();
          lastView.style.transform = transformLastView0;
          previousView.style.transform = transformPreviousView0;
          var coorPrev = previousView.getBoundingClientRect();
          var transformLastView1 = `translate(${coordenadasCanvas.width / 2 - coordenadasEl.width / 2 - coordenadasEl.x + (coorPrev.x - coorLast.x) + newcoordenadasPV.x - offsetX + (newcoordenadasPV.width - coorLast.width) / 2}px, ${coordenadasCanvas.height / 2 - coordenadasEl.height / 2 - coordenadasEl.y + (coorPrev.y - coorLast.y) + newcoordenadasPV.y - offsetY + (newcoordenadasPV.height - coorLast.height) / 2}px) scale(${laScala * preScale})`;
        } else {
          previousView.style.transform = transformPreviousView0;
        }
        var snapShoot = {
          zoomLevel: this.storedViews.length,
          views: []
        };
        const currentv = currentView ? {
          viewName: currentView.dataset.viewName,
          backwardState: {
            origin: currentView.style.transformOrigin,
            duration,
            ease,
            transform: transformCurrentView0
          },
          forwardState: {
            origin: currentView.style.transformOrigin,
            duration,
            ease,
            transform: transformCurrentView1
          }
        } : null;
        const previousv = previousView ? {
          viewName: previousView.dataset.viewName,
          backwardState: {
            origin: previousView.style.transformOrigin,
            duration,
            ease,
            transform: transformPreviousView0
          },
          forwardState: {
            origin: previousView.style.transformOrigin,
            duration,
            ease,
            transform: transformPreviousView1
          }
        } : null;
        const lastv = lastView ? {
          viewName: lastView.dataset.viewName,
          backwardState: {
            origin: lastView.style.transformOrigin,
            duration,
            ease,
            transform: transformLastView0
          },
          forwardState: {
            origin: lastView.style.transformOrigin,
            duration,
            ease,
            transform: transformLastView1
          }
        } : null;
        const gonev = removeView ? {
          // ACA VA LA VISTA ENTERA FALTA REALIZAR UN ZOOM IGUAL ANTES DE SACARLA DE JUEGO
          viewName: removeView
        } : null;
        if (currentv !== null)
          snapShoot.views.push(currentv);
        if (previousv !== null)
          snapShoot.views.push(previousv);
        if (lastv !== null)
          snapShoot.views.push(lastv);
        if (gonev !== null)
          snapShoot.views.push(gonev);
        this.storeViews(snapShoot);
        this.currentStage = this.storedViews[this.storedViews.length - 1];
        this.tracing("setCSSVariables()");
        setCSSVariables("zoomIn", this.currentStage, this.instance);
        previousView.classList.add("performance");
        if (lastView !== null)
          lastView.classList.add("performance");
        currentView.classList.remove("hide");
        currentView.addEventListener("animationstart", this._onZoomInHandlerStart);
        currentView.addEventListener("animationend", this._onZoomInHandlerEnd);
        previousView.addEventListener("animationend", this._onZoomInHandlerEnd);
        if (lastView !== null)
          lastView.addEventListener("animationend", this._onZoomInHandlerEnd);
        currentView.classList.add(`zoom-current-view-${instance}`);
        previousView.classList.add(`zoom-previous-view-${instance}`);
        if (lastView !== null)
          lastView.classList.add(`zoom-last-view-${instance}`);
      }
    }
    zoomOut() {
      this.tracing("zoomOut()");
      this.blockEvents = true;
      this.storedPreviousScale.pop();
      var instance = this.instance;
      const canvas = this.canvas;
      this.currentStage = this.storedViews[this.storedViews.length - 1];
      const reAttachView = this.currentStage.views[3];
      var currentView = canvas.querySelector(".is-current-view");
      var previousView = canvas.querySelector(".is-previous-view");
      var lastView = canvas.querySelector(".is-last-view");
      this.tracing("setCSSVariables()");
      setCSSVariables("zoomOut", this.currentStage, this.instance);
      previousView.querySelector(".zoomed").classList.remove("zoomed");
      previousView.classList.remove("is-previous-view");
      previousView.classList.add("is-current-view");
      if (lastView !== null) {
        lastView.classList.add("performance");
        lastView.classList.add("is-previous-view");
        lastView.classList.remove("is-last-view");
        lastView.classList.remove("hide");
      }
      if (reAttachView !== void 0) {
        canvas.prepend(reAttachView.viewName);
        var newlastView = canvas.querySelector(".z-view:first-child");
        newlastView.classList.add("hide");
      }
      currentView.addEventListener("animationstart", this._onZoomOutHandlerStart);
      currentView.addEventListener("animationend", this._onZoomOutHandlerEnd);
      previousView.addEventListener("animationend", this._onZoomOutHandlerEnd);
      if (lastView !== null)
        lastView.addEventListener("animationend", this._onZoomOutHandlerEnd);
      currentView.classList.add(`zoom-current-view-${instance}`);
      previousView.classList.add(`zoom-previous-view-${instance}`);
      if (lastView !== null)
        lastView.classList.add(`zoom-last-view-${instance}`);
      this.storedViews.pop();
    }
    /**
     * Event hangling
     */
    onZoom(event) {
      if (this.storedViews.length > 1 && !this.blockEvents && !event.target.classList.contains("zoom-me") && event.target.closest(".is-current-view") === null && !this.touching) {
        this.tracing("onZoom()");
        event.stopPropagation();
        this.zoomOut();
      }
      if (!this.blockEvents && event.target.classList.contains("zoom-me") && !this.touching) {
        this.tracing("onZoom()");
        event.stopPropagation();
        this.zoomIn(event.target);
      }
    }
    onKeyUp(event) {
      this.tracing("onKeyUp()");
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        if (this.storedViews.length > 1 && !this.blockEvents) {
          this.zoomOut();
        } else {
          this.notify(`is on level zero. Can't zoom out. Trigger: ${event.key}`, "warn");
        }
      }
      if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        this.notify(event.key + "has not actions defined");
      }
    }
    onWeel(event) {
      if (!this.blockEvents) {
        this.tracing("onWeel()");
        if (event.deltaY < 0) {
        }
        if (event.deltaY > 0) {
          if (this.storedViews.length > 1 && !this.blockEvents) {
            this.zoomOut();
          } else {
          }
        }
      }
    }
    onTouchStart(event) {
      this.tracing("onTouchStart()");
      this.touching = true;
      this.touchstartX = event.changedTouches[0].screenX;
      this.touchstartY = event.changedTouches[0].screenY;
    }
    onTouchEnd(event) {
      if (!this.blockEvents) {
        this.tracing("onTouchEnd()");
        this.touchendX = event.changedTouches[0].screenX;
        this.touchendY = event.changedTouches[0].screenY;
        this.handleGesture(event);
      }
    }
    handleGesture(event) {
      event.stopPropagation();
      this.tracing("handleGesture()");
      if (this.touchendX < this.touchstartX - 30) {
        if (this.storedViews.length > 1 && !this.blockEvents) {
          this.tracing("swipe left");
          this.zoomOut();
        } else {
          this.notify("is on level zero. Can't zoom out. Trigger: Swipe left", "warn");
        }
      }
      if (this.touchendY < this.touchstartY - 10) {
        if (this.storedViews.length > 1 && !this.blockEvents) {
          this.tracing("swipe up");
        } else {
          this.notify("is on level zero. Can't zoom out. Trigger: Swipe up", "warn");
        }
      }
      if (this.touchendY === this.touchstartY && !this.blockEvents && event.target.classList.contains("zoom-me") && this.touching) {
        this.touching = false;
        this.tracing("tap");
        event.preventDefault();
        this.zoomIn(event.target);
      }
      if (this.touchendY === this.touchstartY && this.storedViews.length > 1 && !this.blockEvents && !event.target.classList.contains("zoom-me") && event.target.closest(".is-current-view") === null && this.touching) {
        this.touching = false;
        this.tracing("tap");
        this.zoomOut();
      }
    }
    onZoomOutHandlerStart(event) {
      this.tracing("onZoomOutHandlerStart()");
      this.blockEvents = true;
      event.target.removeEventListener("animationstart", this._onZoomOutHandlerStart);
    }
    onZoomOutHandlerEnd(event) {
      this.tracing("onZoomOutHandlerEnd()");
      const element = event.target;
      var currentZoomLevel = this.currentStage;
      element.removeEventListener("animationend", this._onZoomOutHandlerEnd);
      if (element.classList.contains(`zoom-current-view-${this.instance}`)) {
        try {
          this.canvas.removeChild(element);
        } catch (e) {
          console.debug("Error when trying to remove element after zoom out. Trying to remove its parent instead...");
          try {
            this.canvas.removeChild(element.parentElement);
          } catch (e2) {
            console.debug("Error when trying to remove elemont after zoom out:", e2);
            console.debug("Element to remove was:", element);
          }
        }
        this.blockEvents = false;
      }
      if (element.classList.contains(`zoom-previous-view-${this.instance}`)) {
        var origin = currentZoomLevel.views[1].backwardState.origin;
        var transform = currentZoomLevel.views[1].backwardState.transform;
        element.classList.remove("performance");
        element.classList.remove(`zoom-previous-view-${this.instance}`);
        element.style.transformOrigin = `0 0`;
        element.style.transform = transform;
        if (currentZoomLevel.views.length === 2)
          this.tracing("ended");
      }
      if (element.classList.contains(`zoom-last-view-${this.instance}`)) {
        origin = currentZoomLevel.views[2].backwardState.origin;
        transform = currentZoomLevel.views[2].backwardState.transform;
        element.classList.remove("performance");
        element.classList.remove(`zoom-last-view-${this.instance}`);
        element.style.transformOrigin = origin;
        element.style.transform = transform;
        if (currentZoomLevel.views.length > 2)
          this.tracing("ended");
      }
    }
    onZoomInHandlerStart(event) {
      this.tracing("onZoomInHandlerStart()");
      this.blockEvents = true;
      event.target.removeEventListener("animationstart", this._onZoomInHandlerStart);
    }
    onZoomInHandlerEnd(event) {
      this.tracing("onZoomInHandlerEnd()");
      const element = event.target;
      var currentZoomLevel = this.currentStage;
      if (event.target.classList.contains("is-new-current-view")) {
        this.blockEvents = false;
        var viewName = "current-view";
        var transform = currentZoomLevel.views[0].forwardState.transform;
        var origin = currentZoomLevel.views[0].forwardState.origin;
        element.classList.remove("is-new-current-view");
        element.classList.add("is-current-view");
      } else if (event.target.classList.contains("is-previous-view")) {
        viewName = "previous-view";
        transform = currentZoomLevel.views[1].forwardState.transform;
        origin = currentZoomLevel.views[1].forwardState.origin;
        if (currentZoomLevel.views.length === 2)
          this.tracing("ended");
      } else {
        viewName = "last-view";
        transform = currentZoomLevel.views[2].forwardState.transform;
        origin = currentZoomLevel.views[2].forwardState.origin;
        if (currentZoomLevel.views.length > 2)
          this.tracing("ended");
      }
      element.classList.remove("performance");
      element.classList.remove(`zoom-${viewName}-${this.instance}`);
      element.classList.remove("has-no-events");
      element.style.transformOrigin = origin;
      element.style.transform = transform;
      element.removeEventListener("animationend", this._onZoomInHandlerEnd);
    }
  };

  // src/entry.js
  window.Zumly = Zumly;
})();
