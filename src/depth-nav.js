/**
 * Built-in depth navigation: the back button, in three styles.
 * - 'button': a chevron in a circle.
 * - 'title': a dot in its ring plus the name of the view above.
 * - 'rings': a dot inside one ring per level above. Hover, a long press or
 *   an arrow key opens a band per level to jump to.
 * Rings and bands carry a class per level (z-depth-ring--up-1 is the view
 * right above, z-depth-ring--depth-0 the root) and data-view, so host CSS
 * can color a level without Zumly knowing why.
 */

const SVG = 'http://www.w3.org/2000/svg'
/** Rings drawn at most; deeper stacks show the nearest levels. */
const MAX_RINGS = 6
const DOT_R = 3
const OUTER_R = 14.5
const LONG_PRESS_MS = 450
const CLOSE_DELAY_MS = 250

function svg (tag, attributes) {
  const element = document.createElementNS(SVG, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  return element
}

function levelClasses (base, level) {
  return `${base} ${base}--up-${level.up} ${base}--depth-${level.depth}`
}

export class DepthNav {
  /**
   * @param {{ onBack: () => void, onJump: (levels: number) => void }} actions
   */
  constructor ({ onBack, onJump }) {
    this.onBack = onBack
    this.onJump = onJump
    this.element = document.createElement('div')
    this.style = null
    this.levels = []
    this._signature = ''
    this._open = false
    this._closeTimer = null
    this._pressTimer = null
    this._suppressClick = false
    this._onOutside = event => { if (!this.element.contains(event.target)) this.close() }
  }

  /**
   * @param {{ position: string, style: string, label: string|null, levels: Array<{ name: string, title: string, depth: number, up: number }> }} state
   *   levels: the views above the current one, nearest first.
   */
  update ({ position, style, label, levels }) {
    if (style !== this.style) this._build(style)
    const className = `z-depth-nav z-depth-nav--${position} z-depth-nav--${style}`
    if (this.element.className !== className) this.element.className = className
    if (label === null) this.button.removeAttribute('aria-label')
    else if (this.button.getAttribute('aria-label') !== label) this.button.setAttribute('aria-label', label)
    this.levels = levels
    const signature = levels.map(level => `${level.name}\u0000${level.title}`).join('\u0001')
    if (signature === this._signature) return
    this._signature = signature
    this.close()
    if (style === 'title') this.titleText.textContent = levels[0]?.title ?? ''
    if (style === 'rings') this._renderRings()
  }

  /**
   * Reflect a gesture's zoom-out progress: --z-progress (0–1) and --z-grow,
   * which reaches 1 at the threshold, when the dot has grown into its ring.
   * @param {number|null} progress - null resets
   * @param {number} [threshold=0.5]
   */
  setProgress (progress, threshold = 0.5) {
    const style = this.element.style
    if (progress === null) {
      style.removeProperty('--z-progress')
      style.removeProperty('--z-grow')
      this.element.classList.remove('is-past-threshold')
      return
    }
    style.setProperty('--z-progress', progress)
    style.setProperty('--z-grow', Math.min(1, progress / threshold))
    this.element.classList.toggle('is-past-threshold', progress >= threshold)
  }

  open () {
    if (this.style !== 'rings' || this._open || this.levels.length < 2) return
    clearTimeout(this._closeTimer)
    this._open = true
    this.fan.hidden = false
    this.button.setAttribute('aria-expanded', 'true')
    this.element.classList.add('is-open')
    document.addEventListener('pointerdown', this._onOutside, true)
  }

  close () {
    clearTimeout(this._closeTimer)
    if (!this._open) return
    this._open = false
    this.fan.hidden = true
    this.button.setAttribute('aria-expanded', 'false')
    this.element.classList.remove('is-open')
    document.removeEventListener('pointerdown', this._onOutside, true)
  }

  destroy () {
    this.close()
    clearTimeout(this._pressTimer)
    this.element.remove()
  }

  _build (style) {
    this.close()
    this.style = style
    this._signature = ''
    this.element.replaceChildren()
    const button = document.createElement('button')
    button.type = 'button'
    button.className = style === 'button' ? 'z-nav-back' : `z-nav-back z-nav-back--${style}`
    button.addEventListener('click', event => {
      event.stopPropagation()
      if (this._suppressClick) { this._suppressClick = false; return }
      this.close()
      this.onBack()
    })
    this.button = button
    this.element.appendChild(button)
    if (style === 'button') {
      button.innerHTML = '&#8249;'
      return
    }
    if (style === 'title') {
      const icon = svg('svg', { class: 'z-nav-icon', viewBox: '0 0 20 20', 'aria-hidden': 'true' })
      icon.append(
        svg('circle', { class: 'z-depth-ring', cx: 10, cy: 10, r: 8 }),
        svg('circle', { class: 'z-depth-dot', cx: 10, cy: 10, r: DOT_R })
      )
      this.titleText = document.createElement('span')
      this.titleText.className = 'z-nav-title'
      button.append(icon, this.titleText)
      return
    }
    // rings
    this.rings = svg('svg', { class: 'z-depth-rings', viewBox: '0 0 32 32', 'aria-hidden': 'true' })
    button.appendChild(this.rings)
    button.setAttribute('aria-haspopup', 'menu')
    button.setAttribute('aria-expanded', 'false')
    this.fan = document.createElement('div')
    this.fan.className = 'z-depth-fan'
    this.fan.setAttribute('role', 'menu')
    this.fan.hidden = true
    this.fan.addEventListener('click', event => {
      const band = event.target.closest?.('.z-depth-band')
      if (!band) return
      event.stopPropagation()
      this.close()
      this.onJump(Number(band.dataset.up))
    })
    this.element.appendChild(this.fan)

    // Hover opens the fan; a long press does on touch.
    this.element.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') this.open()
    })
    this.element.addEventListener('pointerleave', event => {
      if (event.pointerType !== 'mouse') return
      clearTimeout(this._closeTimer)
      this._closeTimer = setTimeout(() => this.close(), CLOSE_DELAY_MS)
    })
    button.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse') return
      clearTimeout(this._pressTimer)
      this._pressTimer = setTimeout(() => {
        this._suppressClick = true
        this.open()
      }, LONG_PRESS_MS)
    })
    const cancelPress = () => clearTimeout(this._pressTimer)
    button.addEventListener('pointerup', cancelPress)
    button.addEventListener('pointercancel', cancelPress)
    button.addEventListener('contextmenu', event => event.preventDefault())
    this.element.addEventListener('keydown', event => this._onKey(event))
    // The canvas zooms out on ArrowDown/ArrowLeft keyup: keep those to the menu.
    this.element.addEventListener('keyup', event => {
      if (event.key.startsWith('Arrow') || event.key === 'Escape') event.stopPropagation()
    })
    this.element.addEventListener('focusout', event => {
      if (!this.element.contains(event.relatedTarget)) this.close()
    })
  }

  _onKey (event) {
    const bands = [...this.fan.querySelectorAll('.z-depth-band')]
    const index = bands.indexOf(document.activeElement)
    // Bands stack away from the edge the button sits on.
    const away = this.element.className.includes('--top-') ? 'ArrowDown' : 'ArrowUp'
    const toward = away === 'ArrowUp' ? 'ArrowDown' : 'ArrowUp'
    if (event.key === 'Escape' && this._open) {
      this.close()
      this.button.focus()
    } else if (event.key === away) {
      this.open()
      bands[Math.min(index + 1, bands.length - 1)]?.focus()
    } else if (event.key === toward && this._open) {
      if (index <= 0) this.button.focus()
      else bands[index - 1].focus()
    } else {
      return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  _renderRings () {
    const shown = this.levels.slice(0, MAX_RINGS)
    const gap = Math.min(3.5, (OUTER_R - DOT_R - 2) / Math.max(1, shown.length))
    const rings = shown.map((level, i) => {
      const ring = svg('circle', { class: levelClasses('z-depth-ring', level), cx: 16, cy: 16, r: OUTER_R - (shown.length - 1 - i) * gap })
      ring.dataset.view = level.name
      return ring
    })
    this.rings.replaceChildren(...rings, svg('circle', { class: 'z-depth-dot', cx: 16, cy: 16, r: DOT_R }))
    // How much the dot grows to fill the nearest ring (see setProgress).
    const nearest = shown.length ? OUTER_R - (shown.length - 1) * gap : DOT_R
    this.element.style.setProperty('--z-dot-grow', nearest / DOT_R - 1)

    this.fan.replaceChildren(...this.levels.map(level => {
      const band = document.createElement('button')
      band.type = 'button'
      band.className = levelClasses('z-depth-band', level)
      band.setAttribute('role', 'menuitem')
      band.dataset.view = level.name
      band.dataset.up = level.up
      const mark = document.createElement('span')
      mark.className = 'z-depth-band-mark'
      const title = document.createElement('span')
      title.className = 'z-nav-title'
      title.textContent = level.title
      band.append(mark, title)
      return band
    }))
  }
}
