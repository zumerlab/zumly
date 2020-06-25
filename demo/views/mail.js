const mail = {
  async render () {
    return `<div class="z-view" style='position: absolute; height:100%; width:100%; border: 1px solid white; background-color: black'>
     <vue-component></vue-component>
  <div class='zoom-me' data-to='home' style='height: 150px; width: 350px; border: 1px solid purple; transform: translate(120px, 180px)'>
    @home
  </div>
</div>`
  }
}

export default mail