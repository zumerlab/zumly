;(function () {
  'use strict'

  var preview = new URLSearchParams(window.location.search).get('preview') === '1'
  var embedded = window.parent !== window
  // An ordinary embed stays live without requiring a host integration. The docs
  // host sends an explicit pause as soon as this document announces readiness.
  var hostActive = true
  var listeners = new Set()
  var active = false

  // Only decorative loops are paused. A Zumly transition already in progress
  // must still finish, even when its iframe becomes a background layer.
  var loops = '.conveyor-bar::after, .badge-r::before, .b-r::before, .cam-rec-dot, .alarm-zone .az-dot.triggered, .rotate-orbit, .sat-node.anomaly'
  var style = document.createElement('style')
  style.textContent = loops.split(', ').map(function (selector) {
    return 'html.showcase-paused ' + selector + ', .z-view:not(.is-current-view) ' + selector
  }).join(', ') + ' { animation-play-state: paused !important; }'
  document.head.appendChild(style)
  document.documentElement.classList.toggle('showcase-preview', preview)

  function sync () {
    var next = !preview && hostActive && !document.hidden
    document.documentElement.classList.toggle('showcase-paused', !next)
    if (next === active) return
    active = next
    listeners.forEach(function (listener) { listener(active) })
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent || event.origin !== window.location.origin) return
    if (event.data?.type !== 'zumly:showcase-activity' || typeof event.data.active !== 'boolean') return
    hostActive = event.data.active
    sync()
  })
  document.addEventListener('visibilitychange', sync)
  sync()

  window.ShowcaseActivity = {
    get active () { return active },
    subscribe: function (listener) {
      listeners.add(listener)
      listener(active)
      return function () { listeners.delete(listener) }
    },
    renderPreview: function (html) {
      if (!preview) return false
      var canvas = document.querySelector('.canvas')
      canvas.innerHTML = html
      canvas.firstElementChild.classList.add('is-current-view')
      canvas.firstElementChild.style.position = 'absolute'
      canvas.firstElementChild.style.transformOrigin = '0 0'
      canvas.inert = true
      return true
    },
  }

  if (embedded) {
    window.parent.postMessage({ type: 'zumly:showcase-ready' }, window.location.origin)
  }
})()
