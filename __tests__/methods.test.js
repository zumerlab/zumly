/* eslint-env jest */
import {Zumly} from '../src/zumly.js'
// import { renderView } from '../src/utils.js'
import {jest} from '@jest/globals';

let homeView
let appMocked

beforeEach( async () => {
// prepare template for testing
  document.body.innerHTML = `<!-- DIV canvas -->
    <div class="first zumly-canvas"></div>
   `;

  homeView = `<div class="z-view">
    <div class='card zoom-me' data-to='newView'></div>
  </div>`

  appMocked = new Zumly({
        mount: '.first',
        initialView: 'homeView',
        views: {homeView}
      })
  // not start zumly
  // await appMocked.init()

})

describe('Zumly methods', () => {
  it('storeViews() should store views and notify', () => {
    appMocked.tracing = jest.fn();
    appMocked.storeViews('test')
    expect(appMocked.tracing).toHaveBeenCalledWith('storedViews()');
    expect(appMocked.storedViews).toEqual(['test']);
  })

  it('setPreviousScale() should store scale and notify', () => {
    appMocked.tracing = jest.fn();
    expect(appMocked.storedPreviousScale.length).toEqual(1);
    appMocked.setPreviousScale(1)
    expect(appMocked.tracing).toHaveBeenCalledWith('setPreviousScale()');
    expect(appMocked.storedPreviousScale.length).toEqual(2);
  })

  it('tracing() should increment trace or reset it', () => {
    appMocked.tracing('ended')
    expect(appMocked.trace.length).toEqual(0);
    appMocked.tracing('test')
    expect(appMocked.trace.length).toEqual(1);
  })

  it('counter() should increment when it is called', () => {
    Zumly._counter = null
    expect(Zumly.counter).toEqual(1);
    expect(Zumly.counter).toEqual(2);
  })

  it('notify() should return storedViews.length', () => {
    // check this test
    expect(appMocked.notify('alert', 'error')).toBe(undefined);
  })

  it('zoomLevel() should return storedViews.length', () => {
    appMocked.storedViews = [1, 1, 1, 1, 1, 1]
    expect(appMocked.zoomLevel()).toBe(6);
  })

  it('init() should call methods', async () => {
    appMocked.tracing = jest.fn();
    // appMocked.notify = jest.fn();
    appMocked.init()
    // appMocked.options = true
    expect(appMocked.tracing).toHaveBeenCalledWith('init()');
    //expect(appMocked.notify).toHaveBeenCalled();
    
  })

  it('zoomIn(el) should call methods', async () => {
    appMocked.tracing = jest.fn();
    // appMocked.notify = jest.fn();
    appMocked.zoomIn()
    // appMocked.options = true
    expect(appMocked.tracing).toHaveBeenCalledWith('zoomIn()');
    expect(appMocked.tracing).toHaveBeenCalledWith('renderView()');
    //expect(appMocked.notify).toHaveBeenCalled();
    
  })

  it('zoomOut() should call methods', async () => {
    // appMocked.tracing = jest.fn();
   // appMocked.zoomOut()
    // appMocked.options = true
    //expect(appMocked.tracing).toHaveBeenCalledWith('zoomOut()');
    
  })
  
  
})

