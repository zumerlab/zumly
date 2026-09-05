const NATIVE_CONTROL = 'button, input, select, textarea, a[href], summary'

export function isNativeControl (element) {
  return element?.matches?.(NATIVE_CONTROL) || false
}

export function isEditable (element) {
  return !!element?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"]')
}

export function prepareViewTriggers (node) {
  node.querySelectorAll('.zoom-me[data-to]').forEach(el => {
    if (!isNativeControl(el)) {
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button')
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0')
    }
    if (!el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby') && !el.textContent.trim()) {
      el.setAttribute('aria-label', `Zoom to ${el.dataset.to}`)
    }
  })
}

/** Keep background views out of keyboard and screen-reader navigation. */
export class ViewAccessibility {
  constructor () {
    this.backgrounds = new Map()
  }

  sync (canvas) {
    for (const view of canvas.children) {
      if (!view.classList.contains('z-view')) continue
      if (view.classList.contains('is-current-view')) {
        this.restore(view)
      } else {
        if (!this.backgrounds.has(view)) {
          this.backgrounds.set(view, { inert: view.inert, hidden: view.getAttribute('aria-hidden') })
        }
        view.inert = true
        view.setAttribute('aria-hidden', 'true')
      }
    }
    for (const view of this.backgrounds.keys()) {
      if (!canvas.contains(view)) this.restore(view)
    }
  }

  restore (view) {
    const previous = this.backgrounds.get(view)
    if (!previous) return
    view.inert = previous.inert
    if (previous.hidden === null) view.removeAttribute('aria-hidden')
    else view.setAttribute('aria-hidden', previous.hidden)
    this.backgrounds.delete(view)
  }

  destroy () {
    for (const view of this.backgrounds.keys()) this.restore(view)
  }
}
