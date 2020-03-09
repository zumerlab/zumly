export default class Zumly {
  constructor (options) {
    this.app = options
  }
// methods
  init () {
    const rootDiv = document.querySelector(this.app.mount)
    // mete la primera view en el dom
    // agregar dompurify o algo asi mas adelante
    rootDiv.innerHTML = this.app.initialView
    document.querySelector('.view').classList.add('current')
    // agrega eventos a todos los .zoomable
    var views = this.app.views
    //console.log(typeof views)
    document.querySelectorAll('.zoomable')
      .forEach(el => el.addEventListener('click', () => this.zoomIn(el)))
  }

  zoomIn (el) {
    // clicked element with .zoomable
    let coordenadasEl = el.getBoundingClientRect()
    console.log(coordenadasEl)
    let centerXEl = coordenadasEl.width / 2
    let centerYEl = coordenadasEl.height / 2
    // create new view
    var newView = document.createElement('template')
    newView.innerHTML = this.app.views[el.dataset.goTo]
    // transforma current view en previous view
    const previousView = document.querySelector('.current')
    let coordenadasPreviousView = previousView.getBoundingClientRect()
    previousView.classList.remove('current')
    var lastView = null
    lastView = document.querySelector('.previous')
    if (lastView !== null) {
      lastView.classList.remove('previous')
      lastView.classList.add('last')
    }
    //
    previousView.classList.add('previous')
    // transforma new view es current view y la agrega al DOM al ppio del container
    newView.classList.add('current')
    var rootDiv = document.querySelector(this.app.mount)
    rootDiv.prepend(newView.content)
    document.querySelector('.view').classList.add('current')
    const currentView = document.querySelector('.current')
    let coordenadasCurrentView = currentView.getBoundingClientRect()
    // agrega eventos
    document.querySelectorAll('.zoomable')
      .forEach(el => el.addEventListener('click', () => this.zoomIn(el)))
    // seleccionar el view container relativo a current
    const viewContainer = document.querySelector('.current > .view-container')
    let coordenadasViewContainer = viewContainer.getBoundingClientRect()
    // let centerXViewContainer = coordenadasViewContainer.width / 2
    // let centerYViewContainer = coordenadasViewContainer.height / 2
    // canvas
    let canvas = document.querySelector('.canvas')
    let coordenadasCanvas = canvas.getBoundingClientRect()
    let centerXCanvas = coordenadasCanvas.width / 2
    let centerYCanvas = coordenadasCanvas.height / 2
    // DETERMINA ESCALAS
    let scale = coordenadasViewContainer.width / coordenadasEl.width
    let scaleInv = 1 / scale
    // MUEVE VISTAS EN FORMA IDENTICA
    if (lastView === null) {
      previousView.style.opacity = 0
      previousView.style.transform = `translate(${(centerXCanvas - centerXEl - coordenadasEl.x) * scale}px, ${(centerYCanvas - centerYEl - coordenadasEl.y) * scale}px) scale(${scale})`
      let newcoordenadasEl = el.getBoundingClientRect()
      console.log(newcoordenadasEl)
      previousView.style.opacity = 1
      previousView.style.transform = 'none'
      previousView.style.filter = 'blur(2px)'
      currentView.animate([
      { transformOrigin: 'top left',
        transform: `translate(${coordenadasEl.x}px, ${coordenadasEl.y}px) scale(${scaleInv})`
      },
      { transformOrigin: 'top left',
        transform: `translate(${newcoordenadasEl.x}px, ${newcoordenadasEl.y}px)`
      }
      ],
      {
        duration: 2000,
        fill: 'both'
      })
      previousView.animate([
        {
        transform: `translate(${coordenadasPreviousView.x}px, ${coordenadasPreviousView.y}px)`
      },
      {
        transform: `translate(${(centerXCanvas - centerXEl - coordenadasEl.x) * scale}px, ${(centerYCanvas - centerYEl - coordenadasEl.y) * scale}px) scale(${scale})`
      }
      ],
      {
        duration: 2000,
        fill: 'both'
      })
    } else {
      previousView.style.opacity = 0
      // previousView.style.transformOrigin = 'top left'
      previousView.style.transform = `translate(${(centerXCanvas - centerXEl - coordenadasEl.x) * scale}px, ${(centerYCanvas - centerYEl - coordenadasEl.y) * scale}px) scale(${scale})`
      let newcoordenadasEl = el.getBoundingClientRect()
      console.log(newcoordenadasEl)
      previousView.style.opacity = 1
      previousView.style.transform = 'none'
      previousView.style.filter = 'blur(2px)'
      // let newcoordenadasPv = previousView.getBoundingClientRect()
            let coordenadasLastView = lastView.getBoundingClientRect()

      currentView.animate([
      { transformOrigin: 'top left',
        transform: `translate(${coordenadasEl.x}px, ${coordenadasEl.y}px) scale(${scaleInv})`
      },
      { transformOrigin: 'top left',
        transform: `translate(${newcoordenadasEl.x}px, ${newcoordenadasEl.y}px)`
      }
      ],
      {
        duration: 2000,
        fill: 'both'
      })
      coordenadasPreviousView = previousView.getBoundingClientRect()
      previousView.animate([
        { transformOrigin: 'top left',
        transform: `translate(${coordenadasPreviousView.x}px, ${coordenadasPreviousView.y}px)`
      },
      { transformOrigin: 'top left',
        transform: `translate(${(centerXCanvas - centerXEl - coordenadasEl.x) * scale}px, ${(centerYCanvas - centerYEl - coordenadasEl.y) * scale}px) scale(${scale})`
      }
      ],
      {
        duration: 2000,
        fill: 'both'
      })
      lastView.animate([
        { transformOrigin: 'top left',
        transform: `translate(${coordenadasLastView.x}px, ${coordenadasLastView.y}px)`
      },
      { transformOrigin: 'top left',
        transform: `translate(${(centerXCanvas - centerXEl - coordenadasEl.x) * scale}px, ${(centerYCanvas - centerYEl - coordenadasEl.y) * scale}px) scale(${scale})`
      }
      ],
      {
        duration: 2000,
        fill: 'both'
      })
  }
}

}

