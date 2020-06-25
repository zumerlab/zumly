const itera = ['a','a','a','a','a','a','a','a','a','a']
const contact = {
  async render () {
    return `<div class="z-view" style='position: absolute; height:600px; width:600px; border: 1px solid green; background: url("https://d2x3xhvgiqkx42.cloudfront.net/12345678-1234-1234-1234-1234567890ab/07c98144-2ae5-43c5-9590-3d82f0444689/2019/05/20/45137f29-b1b5-45e7-b0dd-6576dc72a521/4ff96231-fef8-4c3b-8e6c-f0a19de9da1f.png")'>
${itera.map((el, index) => `<span class=""></span><div class='zoom-me' data-to='mail' style='position: absolute; height: 80px; width: 80px; border: 1px solid green; transform: translate(${1 + index * 100 + 80}px, 50px);'>@mail</div>`).join(' ')}

    <div class='zoom-me' data-to='mail' style='height: 180px; width: 180px; border: 1px solid green; transform: translate(90px, 80px)'>
      @mail
    </div>
    <div class='zoom-me' data-to='contact' style='height: 90px; width: 90px; border: 1px solid red; transform: translate(250px, 190px);'>
      @texd
    </div>
</div>`
  }
}

export default contact