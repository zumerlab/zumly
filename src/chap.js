async calculateStackedViews(triggeredElement) {
    // Obtener las vistas del DOM
    const { canvas, currentToPreviousView, previousToLastView, lastToDetachedView } = this.getViewsFromDOM();

    // Renderizar la nueva vista
    const newCurrentView = await this.renderNewView(triggeredElement, canvas);

    // Obtener dimensiones
    const { canvasBounds, newCurrentViewBounds, currentToPreviousViewBounds, triggeredElementBounds } = await this.getBounds(canvas, newCurrentView, currentToPreviousView, triggeredElement);

    // Obtener y modificar escala
    const { newScale, newInvertedScale } = this.getAndModifyScale(newCurrentViewBounds, triggeredElementBounds);

    // Modificar los estilos
    this.modifyStyles(triggeredElement, newCurrentView, currentToPreviousView, previousToLastView, lastToDetachedView, canvas);

    // Calcular y aplicar transformaciones
    this.calculateAndApplyTransforms(triggeredElementBounds, canvasBounds, currentToPreviousViewBounds, newCurrentViewBounds, newScale, newInvertedScale, currentToPreviousView, newCurrentView, previousToLastView);

    // Guardar el estado de las vistas
    this.storeViewsState(triggeredElement, currentToPreviousView, previousToLastView, lastToDetachedView, newCurrentView);

    // Preparar la animación
    this.prepareAnimation(triggeredElement, newCurrentView, currentToPreviousView, previousToLastView);

    // Ejecutar la animación
    this.performAnimation(newCurrentView, currentToPreviousView, previousToLastView);
}

// Función para obtener las vistas del DOM
getViewsFromDOM() {
    const canvas = this.canvas;
    return {
        canvas,
        currentToPreviousView: canvas.querySelector('.is-current-view'),
        previousToLastView: canvas.querySelector('.is-previous-view'),
        lastToDetachedView: canvas.querySelector('.is-last-view')
    };
}

// Función para renderizar la nueva vista
async renderNewView(triggeredElement, canvas) {
    this.tracing('renderView()');
    return await renderView(triggeredElement, canvas, this.views, false, this.componentContext);
}

// Función para obtener dimensiones
async getBounds(canvas, newCurrentView, currentToPreviousView, triggeredElement) {
    return {
        canvasBounds: await this.getDOMRect(canvas),
        newCurrentViewBounds: await this.getDOMRect(newCurrentView),
        currentToPreviousViewBounds: await this.getDOMRect(currentToPreviousView),
        triggeredElementBounds: await this.getDOMRect(triggeredElement)
    };
}

// Función para obtener y modificar escala
getAndModifyScale(newCurrentViewBounds, triggeredElementBounds) {
    const previousStoredScale = this.getPreviousScale();
    const { normal: newScale, inverted: newInvertedScale } = this.getNewScale(this.cover, newCurrentViewBounds, triggeredElementBounds);
    this.setPreviousScale(newScale);
    return { newScale, newInvertedScale, previousStoredScale };
}

// Función para modificar los estilos
modifyStyles(triggeredElement, newCurrentView, currentToPreviousView, previousToLastView, lastToDetachedView, canvas) {
    triggeredElement.classList.add('zoomed');
    newCurrentView.style.contentVisibility = 'hidden';
    currentToPreviousView.style.contentVisibility = 'hidden';
    currentToPreviousView.classList.replace('is-current-view', 'is-previous-view');
    if (previousToLastView !== null) {
        previousToLastView.style.contentVisibility = 'hidden';
        previousToLastView.classList.replace('is-previous-view', 'is-last-view');
    }
    if (lastToDetachedView !== null) {
        canvas.removeChild(lastToDetachedView);
    }
}

// Función para calcular y aplicar las transformaciones
calculateAndApplyTransforms(triggeredElementBounds, canvasBounds, currentToPreviousViewBounds, newCurrentViewBounds, newScale, newInvertedScale, currentToPreviousView, newCurrentView, previousToLastView) {
    // Lógica de transformaciones y coordenadas
    const newCurrentViewStartCoords = this.calculateCoords('newCurrentView', { triggeredElementBounds, canvasBounds, newCurrentViewBounds, newInvertedScale });
    newCurrentView.style.transform = `translate(${newCurrentViewStartCoords.x}px, ${newCurrentViewStartCoords.y}px) scale(${newInvertedScale})`;

    const currentToPreviousViewEndCoords = this.calculateCoords('currentToPreviousView', { triggeredElementBounds, canvasBounds, currentToPreviousViewBounds });
    currentToPreviousView.style.transform = `translate(${currentToPreviousViewEndCoords.x}px, ${currentToPreviousViewEndCoords.y}px) scale(${newScale})`;

    if (previousToLastView !== null) {
        const previousToLastViewCoords = this.calculateCoords('previousToLastView', { triggeredElementBounds, canvasBounds });
        previousToLastView.style.transform = `translate(${previousToLastViewCoords.x}px, ${previousToLastViewCoords.y}px) scale(${newScale * this.getPreviousScale()})`;
    }
}

// Función para guardar el estado de las vistas
storeViewsState(triggeredElement, currentToPreviousView, previousToLastView, lastToDetachedView, newCurrentView) {
    const snapShoot = this.createSnapshot(newCurrentView, currentToPreviousView, previousToLastView, lastToDetachedView);
    this.storeViews(snapShoot);
    this.currentStage = this.storedViews[this.storedViews.length - 1];
}

// Crear snapshot de las vistas
createSnapshot(newCurrentView, currentToPreviousView, previousToLastView, lastToDetachedView) {
    let snapShoot = {
        zoomLevel: this.storedViews.length,
        views: []
    };

    if (newCurrentView) snapShoot.views.push(this.createViewSnapShoot(newCurrentView));
    if (currentToPreviousView) snapShoot.views.push(this.createViewSnapShoot(currentToPreviousView));
    if (previousToLastView) snapShoot.views.push(this.createViewSnapShoot(previousToLastView));
    if (lastToDetachedView) snapShoot.views.push({ viewName: lastToDetachedView });

    return snapShoot;
}

// Crear un snapshot de una vista específica
createViewSnapShoot(view) {
    return {
        viewName: view.dataset.viewName,
        backwardState: {
            origin: view.style.transformOrigin,
            duration: this.duration,
            ease: this.ease,
            transform: view.style.transform
        },
        forwardState: {
            origin: view.style.transformOrigin,
            duration: this.duration,
            ease: this.ease,
            transform: view.style.transform
        }
    };
}

// Función para preparar la animación
prepareAnimation(triggeredElement, newCurrentView, currentToPreviousView, previousToLastView) {
    newCurrentView.classList.remove('hide')
      newCurrentView.addEventListener('animationstart', this._onZoomInHandlerStart)
      newCurrentView.addEventListener('animationend', this._onZoomInHandlerEnd)
      currentToPreviousView.addEventListener('animationend', this._onZoomInHandlerEnd)
      if (previousToLastView !== null) previousToLastView.addEventListener('animationend', this._onZoomInHandlerEnd)
      //
      newCurrentView.style.setProperty('--zoom-duration', this.duration)
      newCurrentView.style.setProperty('--zoom-ease', this.ease)
      newCurrentView.style.setProperty('--current-view-transform-start', newCurrentViewTransformStart)
      newCurrentView.style.setProperty('--current-view-transform-end', newCurrentViewTransformEnd)

      currentToPreviousView.style.setProperty('--zoom-duration', this.duration)
      currentToPreviousView.style.setProperty('--zoom-ease', this.ease)
      currentToPreviousView.style.setProperty('--previous-view-transform-start', currentToPreviousViewTransformStart)
      currentToPreviousView.style.setProperty('--previous-view-transform-end', currentToPreviousViewTransformEnd)
      if (previousToLastView !== null)  {
        previousToLastView.style.setProperty('--zoom-duration', this.duration)
        previousToLastView.style.setProperty('--zoom-ease', this.ease)
        previousToLastView.style.setProperty('--last-view-transform-start', previousToLastViewTransformStart)
        previousToLastView.style.setProperty('--last-view-transform-end', previousToLastViewTransformEnd)
      }
      
      newCurrentView.style.contentVisibility = 'auto';
      currentToPreviousView.style.contentVisibility = 'auto';
      if (previousToLastView !== null) previousToLastView.style.contentVisibility = 'auto';
}

// Función para ejecutar la animación
performAnimation(newCurrentView, currentToPreviousView, previousToLastView) {
    newCurrentView.classList.add('zoom-current-view');
    currentToPreviousView.classList.add('zoom-previous-view');
    if (previousToLastView !== null) previousToLastView.classList.add('zoom-last-view');
}
