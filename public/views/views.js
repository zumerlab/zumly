
import anime from '../lib/anime.es.js'

export const features = `
<div class="z-view features"  style="overflow: hidden; position: absolute;">
     <div class='card zoom-me' id="f1" data-to='infiniteZoomingLevels'>
          Infinite zooming levels
      </div>
      <div class='card zoom-me' id="f2" data-to='uiAgnostic'>
          UI agnostic
          
      </div>
      <div class='card zoom-me' id="f3" data-to='multipleInstances'>
          Multiple instances
          
      </div>
      <div class='card zoom-me' id="f4" data-to='standaloneJSLibrary'">
          Standalone JS library
          
      </div>
</div>`

export const infiniteZoomingLevels = {
  async render () {
    return `<div class="z-view" id="f2-1" style='height:300px; width:300px; position:absolute'>
    <div class="description">
    Zooming forever...
      <svg id="lens" style="position: absolute; top: 195px; left: 155px" width="30" height="30" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M163.784 146.293H154.573L151.308 143.145C163.13 129.433 169.627 111.928 169.614 93.8241C169.614 78.8345 165.169 64.1816 156.841 51.7183C148.514 39.255 136.677 29.541 122.828 23.8047C108.98 18.0685 93.7414 16.5676 79.0399 19.4919C64.3384 22.4162 50.8342 29.6344 40.235 40.2336C29.6358 50.8328 22.4177 64.337 19.4934 79.0385C16.5691 93.74 18.0699 108.978 23.8062 122.827C29.5424 136.676 39.2564 148.512 51.7198 156.84C64.1831 165.168 78.836 169.612 93.8255 169.612C112.598 169.612 129.854 162.733 143.146 151.307L146.294 154.571V163.783L204.593 221.965L221.966 204.592L163.784 146.293V146.293ZM93.8255 146.293C64.7927 146.293 41.3566 122.857 41.3566 93.8241C41.3566 64.7913 64.7927 41.3552 93.8255 41.3552C122.858 41.3552 146.294 64.7913 146.294 93.8241C146.294 122.857 122.858 146.293 93.8255 146.293ZM99.6554 64.6747H87.9956V87.9942H64.6761V99.6539H87.9956V122.973H99.6554V99.6539H122.975V87.9942H99.6554V64.6747Z" fill="var(--accent-color)"/>
    </svg>
      <svg fill="none" height="180" viewbox="140 0 400 550" width="160" style="position: absolute; top: 120px; left: 90px;" xmlns="http://www.w3.org/2000/svg">
        <g>
            <path class='zoom-me' data-to="looping"  d="M333.889 9.54527C341.086 5.37583 349.973 5.41676 357.131 9.65228L563.79 131.934C570.819 136.093 575.115 143.667 575.077 151.834L573.958 395.051C573.92 403.218 569.554 410.752 562.488 414.846L354.711 535.22C347.515 539.389 338.627 539.348 331.469 535.113L124.81 412.831C117.781 408.673 113.485 401.098 113.523 392.931L114.643 149.714C114.68 141.547 119.046 134.013 126.113 129.919L333.889 9.54527Z" fill="transparent" id="hexagon" stroke="var(--purple)" stroke-width="7">
            </path>
        </g>
    </svg>
    </div>
    
  </div>`
  },
  async mounted () {
    const box = document.querySelector('#f2-1')
    var lens = box.querySelector('#lens')
    box.addEventListener('click', () => { lens.style.display = 'none' }, false)
    box.addEventListener('touchstart', () => { lens.style.display = 'none' }, { passive: true })
    anime({
      targets: '#hexagon',
      strokeDashoffset: [anime.setDashoffset, 0],
      easing: 'easeInOutSine',
      duration: 1500,
      delay: function (el, i) { return i * 250 }
    })
    anime({
      targets: '#lens',
      opacity: [0, 1],
      easing: 'easeInOutSine',
      duration: 400,
      delay: 1900
    })
  }
}

export const looping = {

  async render () {
    return `<div class="z-view" style='height:300px; width:300px; position:absolute'>
    <div class="description">
    ...and ever
      <svg fill="none" height="180" viewbox="140 0 400 550" width="160" style="position: absolute; top: 70px; left: 90px;" xmlns="http://www.w3.org/2000/svg">
        <g>
            <path class='zoom-me' data-to="looping"  d="M333.889 9.54527C341.086 5.37583 349.973 5.41676 357.131 9.65228L563.79 131.934C570.819 136.093 575.115 143.667 575.077 151.834L573.958 395.051C573.92 403.218 569.554 410.752 562.488 414.846L354.711 535.22C347.515 539.389 338.627 539.348 331.469 535.113L124.81 412.831C117.781 408.673 113.485 401.098 113.523 392.931L114.643 149.714C114.68 141.547 119.046 134.013 126.113 129.919L333.889 9.54527Z" fill="transparent" id="hexagon" stroke="" stroke-width="7">
            </path>
        </g>
    </svg>
    </div>
    
  </div>`
  },
  async mounted () {
    const previousHexagon = document.querySelector('.is-current-view > div > svg > g > #hexagon')
    const actualHexagon = document.querySelector('.is-new-current-view > div > svg > g > #hexagon')
    var color = window.getComputedStyle(previousHexagon).getPropertyValue('stroke')
    setTimeout(() => {
      color === 'rgb(209, 20, 93)' ? actualHexagon.style.stroke = 'var(--orange)'
        : color === 'rgb(240, 149, 13)' ? actualHexagon.style.stroke = 'var(--yellow)'
          : color === 'rgb(241, 246, 10)' ? actualHexagon.style.stroke = 'var(--green)'
            : color === 'rgb(137, 197, 63)' ? actualHexagon.style.stroke = 'var(--blue)' : actualHexagon.style.stroke = 'var(--purple)'
    }, 0)
  }
}

export const multipleInstances = {
  async render () {
    return `<div class="z-view" style="position: absolute; height:300px; width:300px;">
     <div class="description">
     <svg class="instance" style="position: absolute; top: 60px; left: 20px" fill="none" height="130" viewbox="0 0 693 716" width="130" xmlns="http://www.w3.org/2000/svg">
        <g>
            <path d="M333.889 9.54527C341.086 5.37583 349.973 5.41676 357.131 9.65228L563.79 131.934C570.819 136.093 575.115 143.667 575.077 151.834L573.958 395.051C573.92 403.218 569.554 410.752 562.488 414.846L354.711 535.22C347.515 539.389 338.627 539.348 331.469 535.113L124.81 412.831C117.781 408.673 113.485 401.098 113.523 392.931L114.643 149.714C114.68 141.547 119.046 134.013 126.113 129.919L333.889 9.54527Z" fill="none" id="hexagon" stroke="var(--orange)" stroke-width="7">
            </path>
            <path d="M277.456 222.914L210.377 359.916C208.08 364.626 209.809 370.311 214.34 372.945L336.881 444.171C341.865 447.068 348.26 445.162 350.844 440.01L478.86 184.82M406.354 335.203L462.572 366.777C465.928 368.662 465.985 373.474 462.673 375.438L347.824 443.527M341.861 100.702L220.708 170.385C213.4 174.588 213.343 185.113 220.606 189.396L341.841 260.876C345.271 262.898 349.525 262.909 352.965 260.905L473.773 190.523C481.047 186.285 481.059 175.78 473.794 171.526L352.904 100.745C349.497 98.7502 345.283 98.7339 341.861 100.702Z" id="logo" stroke="var(--orange)" stroke-width="7">
            </path>
        </g>
    </svg>
    
     <svg class="instance" style="position: absolute; top: 180px; left: 20px" fill="none" height="130" viewbox="0 0 693 716" width="130" xmlns="http://www.w3.org/2000/svg">
        <g>
            <path d="M333.889 9.54527C341.086 5.37583 349.973 5.41676 357.131 9.65228L563.79 131.934C570.819 136.093 575.115 143.667 575.077 151.834L573.958 395.051C573.92 403.218 569.554 410.752 562.488 414.846L354.711 535.22C347.515 539.389 338.627 539.348 331.469 535.113L124.81 412.831C117.781 408.673 113.485 401.098 113.523 392.931L114.643 149.714C114.68 141.547 119.046 134.013 126.113 129.919L333.889 9.54527Z" fill="none" id="hexagon" stroke="var(--blue)" stroke-width="7">
            </path>
            <path d="M277.456 222.914L210.377 359.916C208.08 364.626 209.809 370.311 214.34 372.945L336.881 444.171C341.865 447.068 348.26 445.162 350.844 440.01L478.86 184.82M406.354 335.203L462.572 366.777C465.928 368.662 465.985 373.474 462.673 375.438L347.824 443.527M341.861 100.702L220.708 170.385C213.4 174.588 213.343 185.113 220.606 189.396L341.841 260.876C345.271 262.898 349.525 262.909 352.965 260.905L473.773 190.523C481.047 186.285 481.059 175.78 473.794 171.526L352.904 100.745C349.497 98.7502 345.283 98.7339 341.861 100.702Z" id="logo" stroke="var(--blue)" stroke-width="7">
            </path>
        </g>
    </svg>
     
     <svg class="instance" style="position: absolute; top: 60px; left: 140px" fill="none" height="130" viewbox="0 0 693 716" width="130" xmlns="http://www.w3.org/2000/svg">
        <g>
            <path d="M333.889 9.54527C341.086 5.37583 349.973 5.41676 357.131 9.65228L563.79 131.934C570.819 136.093 575.115 143.667 575.077 151.834L573.958 395.051C573.92 403.218 569.554 410.752 562.488 414.846L354.711 535.22C347.515 539.389 338.627 539.348 331.469 535.113L124.81 412.831C117.781 408.673 113.485 401.098 113.523 392.931L114.643 149.714C114.68 141.547 119.046 134.013 126.113 129.919L333.889 9.54527Z" fill="none" id="hexagon" stroke="var(--yellow)" stroke-width="7">
            </path>
            <path d="M277.456 222.914L210.377 359.916C208.08 364.626 209.809 370.311 214.34 372.945L336.881 444.171C341.865 447.068 348.26 445.162 350.844 440.01L478.86 184.82M406.354 335.203L462.572 366.777C465.928 368.662 465.985 373.474 462.673 375.438L347.824 443.527M341.861 100.702L220.708 170.385C213.4 174.588 213.343 185.113 220.606 189.396L341.841 260.876C345.271 262.898 349.525 262.909 352.965 260.905L473.773 190.523C481.047 186.285 481.059 175.78 473.794 171.526L352.904 100.745C349.497 98.7502 345.283 98.7339 341.861 100.702Z" id="logo" stroke="var(--yellow)" stroke-width="7">
            </path>
        </g>
    </svg>
     
     <svg class="instance" style="position: absolute; top: 180px; left: 140px" fill="none" height="130" viewbox="0 0 693 716" width="130" xmlns="http://www.w3.org/2000/svg">
        <g>
            <path d="M333.889 9.54527C341.086 5.37583 349.973 5.41676 357.131 9.65228L563.79 131.934C570.819 136.093 575.115 143.667 575.077 151.834L573.958 395.051C573.92 403.218 569.554 410.752 562.488 414.846L354.711 535.22C347.515 539.389 338.627 539.348 331.469 535.113L124.81 412.831C117.781 408.673 113.485 401.098 113.523 392.931L114.643 149.714C114.68 141.547 119.046 134.013 126.113 129.919L333.889 9.54527Z" fill="none" id="hexagon" stroke="var(--green)" stroke-width="7">
            </path>
            <path d="M277.456 222.914L210.377 359.916C208.08 364.626 209.809 370.311 214.34 372.945L336.881 444.171C341.865 447.068 348.26 445.162 350.844 440.01L478.86 184.82M406.354 335.203L462.572 366.777C465.928 368.662 465.985 373.474 462.673 375.438L347.824 443.527M341.861 100.702L220.708 170.385C213.4 174.588 213.343 185.113 220.606 189.396L341.841 260.876C345.271 262.898 349.525 262.909 352.965 260.905L473.773 190.523C481.047 186.285 481.059 175.78 473.794 171.526L352.904 100.745C349.497 98.7502 345.283 98.7339 341.861 100.702Z" id="logo" stroke="var(--green)" stroke-width="7">
            </path>
        </g>
    </svg>
    

     </div>
</div>`
  },
  async mounted () {
    anime({
      targets: '.instance',
      opacity: [0, 1],
      scale: 1.1,
      delay: anime.stagger(400)
    })
  }
}

export const standaloneJSLibrary = {
  async render () {
    return `<div class="z-view" style='position: absolute; height:300px; width:300px;'>
     <div class="description check">
     <svg id="js"  style="position: absolute; top: 100px; left: 80px" width="130" height="130" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
     <path d="M351.359 483.023C347.75 483.023 344.909 482.504 342.836 481.468V473.117C345.562 473.885 348.403 474.269 351.359 474.269C355.16 474.269 358.04 473.117 359.998 470.813C361.994 468.51 362.993 465.189 362.993 460.85V376.653H372.783V460.044C372.783 467.339 370.94 472.983 367.254 476.976C363.569 481.007 358.27 483.023 351.359 483.023Z" fill="black"/>
     <path d="M442.698 438.448C442.698 445.858 440.01 451.636 434.635 455.782C429.26 459.929 421.965 462.002 412.751 462.002C402.768 462.002 395.09 460.716 389.715 458.144V448.699C393.17 450.158 396.933 451.31 401.002 452.154C405.072 452.999 409.103 453.421 413.096 453.421C419.623 453.421 424.538 452.193 427.84 449.735C431.141 447.24 432.792 443.784 432.792 439.369C432.792 436.451 432.197 434.071 431.007 432.228C429.855 430.347 427.897 428.619 425.133 427.045C422.407 425.471 418.241 423.685 412.636 421.689C404.803 418.886 399.198 415.565 395.819 411.726C392.479 407.886 390.809 402.876 390.809 396.695C390.809 390.206 393.247 385.042 398.123 381.203C402.999 377.363 409.449 375.444 417.473 375.444C425.843 375.444 433.541 376.979 440.567 380.051L437.515 388.574C430.565 385.656 423.808 384.197 417.243 384.197C412.06 384.197 408.009 385.311 405.091 387.538C402.173 389.764 400.714 392.855 400.714 396.81C400.714 399.728 401.252 402.127 402.327 404.008C403.402 405.851 405.206 407.56 407.74 409.134C410.313 410.67 414.229 412.378 419.489 414.26C428.319 417.408 434.386 420.787 437.688 424.396C441.028 428.005 442.698 432.689 442.698 438.448Z" fill="black"/>
     <path d="M214.107 165.367L174.855 245.535C173.511 248.291 174.522 251.617 177.174 253.158L248.879 294.837C251.796 296.532 255.538 295.417 257.05 292.402L331.959 143.076M289.532 231.073L322.428 249.549C324.392 250.653 324.425 253.468 322.487 254.617L255.283 294.46M251.794 93.8541L180.9 134.629C176.624 137.089 176.59 143.248 180.84 145.754L251.782 187.581C253.789 188.764 256.278 188.77 258.291 187.597L328.982 146.413C333.239 143.934 333.246 137.786 328.994 135.297L258.255 93.8791C256.262 92.712 253.796 92.7025 251.794 93.8541Z" stroke="#F1F60A" stroke-width="6"/>
     <path d="M121.065 277.624C121.065 288.502 124.158 296.394 130.344 301.3C136.636 306.206 145.808 308.765 157.859 308.979V331.375C137.596 331.162 121.918 326.523 110.827 317.457C99.7352 308.392 94.1895 295.648 94.1895 279.224V230.752C94.1895 219.66 90.83 211.768 84.1111 207.076C77.3922 202.276 67.6338 199.877 54.8359 199.877V177.32C68.7003 177.107 78.7253 174.548 84.911 169.642C91.0966 164.736 94.1895 157.164 94.1895 146.925V97.9735C94.1895 81.4429 99.9485 68.5917 111.467 59.4198C122.985 50.248 138.449 45.6621 157.859 45.6621V67.8984C133.33 68.5383 121.065 79.1499 121.065 99.7332V146.925C121.065 169.855 109.174 183.399 85.3909 187.559V189.478C109.174 193.638 121.065 207.182 121.065 230.112V277.624Z" fill="black"/>
     <path d="M422.935 187.559C399.153 183.399 387.261 169.855 387.261 146.925V99.7332C387.261 79.1499 375.157 68.5383 350.947 67.8984V45.6621C370.571 45.6621 385.981 50.3013 397.18 59.5798C408.484 68.8583 414.137 81.6562 414.137 97.9735V146.925C414.137 157.27 417.283 164.896 423.575 169.802C429.868 174.601 439.946 177.107 453.81 177.32V199.877C440.799 199.877 430.934 202.276 424.215 207.076C417.496 211.768 414.137 219.66 414.137 230.752V279.224C414.137 295.541 408.644 308.232 397.659 317.297C386.781 326.469 371.211 331.162 350.947 331.375V308.979C362.785 308.765 371.797 306.206 377.983 301.3C384.168 296.394 387.261 288.502 387.261 277.624V230.112C387.261 217.954 390.194 208.675 396.06 202.276C401.925 195.877 410.884 191.611 422.935 189.478V187.559Z" fill="black"/>
     </svg>
     <span id="label" style="position: absolute; top: 250px; left: 10px; font-size: smaller; font-weight: 300">* <strong>Svelte</strong> and <strong>Vue</strong> web-components work with Zumly!</span>
     </div>
</div>`
  },
  async mounted () {
    anime({
      targets: '#js',
      scale: 1.2,
      opacity: [0, 1],
      delay: 600
    })
    anime({
      targets: '#label',
      opacity: [0, 1],
      delay: 1000,
      duration: 3000
    })
  }
}

export const uiAgnostic = {
  async render () {
    return `<div class="z-view" style='position: absolute; height:300px; width:300px;'>
    <div class="description ui" style="background-image: url(./images/pattern.png); background-size: cover; font-weight: bold">
    <span class="framework" style="position: absolute; color: var(--purple); top: 90px; left: 20px;">Bootstrap</span>
    <span class="framework" style="position: absolute; color: var(--green); top: 115px; left: 180px">Materialize</span>
    <span  class="framework" style="position: absolute; color: var(--blue); top: 150px; left: 80px">UiKit</span>
    <span class="framework" style="position: absolute; color: var(--orange); top: 190px; left: 110px">Foundation</span>
    <span  class="framework"style="position: absolute; color: var(--yellow); top: 230px; left: 50px">Bulma</span>
    <span  class="framework" style="position: absolute; color: white; top: 250px; left: 200px">etc..</span>
    </div
</div>`
  },
  async mounted () {
    anime({
      targets: '.framework',
      opacity: [0, 1],
      scale: 1.2,
      delay: anime.stagger(300)
    })
  }
}
