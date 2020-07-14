/* eslint-env jest */
/*
Here's how a typical test flow looks like:
-import the function to test
-give an input to the function
-define what to expect as the output
-check if the function produces the expected output
*/
import Zumly from '../src/zumly.js'
beforeEach(() => {
  // prepare template for testing
  document.body.innerHTML = `
    <!-- DIV canvas -->
    <div class="first zumly-canvas"></div>
    <div class="second zumly-canvas"></div>
  `;

});


describe('Zumly class', () => {
  const home = `
  <div class="z-view">
   <div class='card zoom-me' data-to='newView'></div>
  </div>`
  it('Zumly({options})', async () => {

    const app = new Zumly({
              mount: '.first',
              initialView: 'home',
              views: {home},
              transitions: {
                effects: ['blur','sepia','saturate']
              }
            })
    await app.init()

    const app1 = new Zumly({
              mount: '.second',
              initialView: 'home',
              views: {home}
            })
    await app1.init()
    // instances
    expect(app.instance).toBe(1)
    expect(app1.instance).toBe(2)
    expect(document.body).toMatchSnapshot()
    // properties required
    expect(app.mount).toBe('.first')
    expect(app.initialView).toBe('home')
    expect(app.views).toMatchObject({home})
    // properties default
    expect(app.cover).toBe('width')
    expect(app.duration).toBe('1s')
    expect(app.ease).toBe('ease-in-out')
    await expect(app1.effects).toEqual(expect.arrayContaining(['none','none']))
    await expect(app.effects).toEqual(expect.arrayContaining(['blur(0px) sepia(0) saturate(0) ', 'blur(0.8px) sepia(5) saturate(8) ']))
    expect(app.debug).toBe(false)


  })
})
