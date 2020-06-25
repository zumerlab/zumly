const home = {
  async render () {
    return `<div class="z-view" style='position: absolute; height:400px; width:400px; border: 1px solid red; background-color: gray'>
    <div class='zoom-me' data-to='mail' style='height: 100px; width: 70px;border: 1px solid red; transform: translate(50px, 30px)'>
      @contact
    </div>
    <div class='zoom-me' data-to='contact' data-with-ease='cubic-bezier(0.68, -0.6, 0.32, 1.6)' style='height: 90px; width: 190px; border: 1px solid red; transform: translate(150px, 90px);'>
      @texd
    </div>
    <div style="width: 50px">
      <svg  viewBox="0 0 60 100"> 
        <path class='zoom-me'  data-to='contact'  data-with-duration='4s' data-with-ease='steps(10)' fill="#ABABAB" d="M59.717,50.177c0-13.252-3.631-25.945-10.495-36.82l2.998-1.873L39.891,0.667l4.318,15.823l3.1-1.937 c6.64,10.515,10.152,22.797,10.152,35.624c0,12.927-3.56,25.284-10.294,35.848l-2.959-1.849L39.891,100L52.22,89.183l-3.14-1.962 C56.037,76.298,59.717,63.529,59.717,50.177z"/> 
      </svg>    
    </div>
    <span class='zoom-me' data-to='contact'>
      Reacciona
    </span>
</div>`
  }
}

export default home