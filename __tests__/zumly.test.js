/* eslint-env jest */
/*
https://github.com/mawrkus/js-unit-testing-guide
Here's how a typical test flow looks like:
-import the function to test
-give an input to the function
-define what to expect as the output
-check if the function produces the expected output

testear metodos de zumly

testear simulacion de interaccion (ver tobecalled)

testear util functions


Test simple user actions
Example of simple user actions:

Clicking on a link that toggles the visibility of a DOM element
Submitting a form that triggers the form validation
(...)

Note how simple the test is because the UI (DOM) layer does not mix with the business logic layer:

a "click" event occurs
a public method is called
The next step could be to test the business logic implemented in "showPreview()" or "hidePreview()".

*/
import {Zumly} from '../src/zumly.js'
import {jest} from '@jest/globals';
// some variables for testing purposes
var zumly0
var zumly1
var homeView


beforeAll(() => {
  // prepare template for testing
  document.body.innerHTML = `<!-- DIV canvas -->
    <div class="first zumly-canvas"></div>
    <div class="second zumly-canvas"></div>`;

  homeView = `<div class="z-view">
    <div class='card zoom-me' data-to='newView'></div>
  </div>`
      
  // prepare zumly instances for testing
  zumly0 = new Zumly({
        mount: '.first',
        initialView: 'homeView',
        views: {homeView}
      })
  zumly0.init()
  
  zumly1 = new Zumly({
        mount: '.second',
        initialView: 'homeView',
        views: {homeView},
        transitions: {
          effects: ['blur','sepia','saturate']
        }
      })
  zumly1.init()
});

describe('Zumly parameters', () => {

  describe('that are required', () => {

    it('mount should be a string', () => {

      expect(zumly0.mount).toBe('.first')

    })

    it('initialView should be a string', () => {

      expect(zumly0.initialView).toBe('homeView')
      
    })

    it('views should be an object', () => {

      expect(zumly0.views).toMatchObject({homeView})
      
    })

  })

  describe('that are optional', () => {

    it('cover should be a string', () => {

      expect(zumly0.cover).toBe('width')
      
    })

    it('duration should be a string', () => {

      expect(zumly0.duration).toBe('1s')
      
    })

    it('ease should be a string', () => {

      expect(zumly0.ease).toBe('ease-in-out')
      
    })

    it('effects should be an array. default', () => {

      expect(zumly0.effects).toEqual(expect.arrayContaining(['none','none']))
      
    })

    it('effects should be an array. custom', () => {

      expect(zumly1.effects).toEqual(expect.arrayContaining(['blur(0px) sepia(0) saturate(0) ', 'blur(0.8px) sepia(5) saturate(8) ']))
      
    })

    it('debug should be a boolean', () => {

      expect(zumly0.debug).toBe(false)
      
    })

  })

})

describe('Zumly instances', () => {

  it('first instance should be 1', () => {

    expect(zumly0.instance).toBe(1)

  })

  it('second instance should be 2', () => {

    expect(zumly1.instance).toBe(2)
    
  })

  it('should be reflected on DOM', () => {

     expect(document.body).toMatchSnapshot()
    
  })

})
  
 
