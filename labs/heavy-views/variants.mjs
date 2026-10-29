// The variants of demo.html that measure.mjs and film.mjs run, as URL queries.
export const VARIANTS = {
  nf: 'flatten=0', // the guide without flatten
  f: 'flatten=1', // the guide as published (1.1.0)
  'nf-instant': 'flatten=0&fx=instant', // effects at once (animateEffects: false), for reference
  'f-moving': 'flatten=1&moving=1', // option 2: no glass while views move
  'f-wclean': 'flatten=1&wc=lean', // option 12: will-change only for what each view animates
  'f-persp0': 'flatten=1&persp=0', // option 13: no perspective on the canvas
  'nf-hold': 'flatten=0&hold=1', // idea 2: views behind keep will-change
  'nf-pane': 'flatten=0&fx=pane', // idea 1: fixed glass instead of filters
  'f-pane': 'flatten=1&fx=pane',
  'f-none': 'flatten=1&fx=none', // no effects: what the blur costs
  // Experiment 1: photograph the view coming in before it moves, then move the photo.
  'f-launch': 'flatten=1&launch=1',
  'f-launch-ng': 'flatten=1&launch=1&glass=0', // the same photo without its glass
  'f-launch-ng-out': 'flatten=1&launch=1&glass=0&out=1', // and a photo of the view leaving a zoom-out
  'nf-launch': 'flatten=0&launch=1',
  // Experiment 7: zooms drawn with WebGL, the views behind as textures at rest (src/webgl.js).
  'f-gl': 'flatten=1&gl=1&glass=0',
  'f-gl-glass': 'flatten=1&gl=1', // the view coming in photographed with its glass
  'f-gl-lens': 'flatten=1&gl=1&glass=0&look=lens', // effects only the shader draws: three reads a pixel
  // Experiment 10: the view coming in built and photographed while the pointer is on its trigger.
  'f-gl-hover': 'flatten=1&gl=1&glass=0&hover=1',
  // Experiment 8: a driver on the View Transitions API, without and with flatten.
  'nf-vt': 'flatten=0&driver=vt',
  'f-vt': 'flatten=1&driver=vt',
  'nf-vt-one': 'flatten=0&driver=vt&vt=one', // only the new image, no crossfade
  'f-vt-one': 'flatten=1&driver=vt&vt=one',
  // A detail that takes 300 ms to fetch its readings, without and with hover.
  'f-gl-slow': 'flatten=1&gl=1&glass=0&slow=300',
  'f-gl-slow-hover': 'flatten=1&gl=1&glass=0&slow=300&hover=1',
}

// asis: the guide's demo as it is (a clock); live: values that change and a big counter.
export const CONDS = { asis: '', live: '&live=1' }
