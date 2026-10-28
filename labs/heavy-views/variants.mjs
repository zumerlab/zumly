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
}

// asis: the guide's demo as it is (a clock); live: values that change and a big counter.
export const CONDS = { asis: '', live: '&live=1' }
