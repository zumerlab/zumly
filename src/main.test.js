/* eslint-env jest */

import Zumly from './main.js'

describe('Zumly class', () => {
  it('Zumly(string)', () => {
    expect(new Zumly('cool')).toMatchSnapshot()
  })
})
