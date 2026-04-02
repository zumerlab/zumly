;(function () {
  'use strict'
  var Z = window.Zumly || globalThis.Zumly

  // ─── helpers ──────────────────────────────────────────────────

  function dv (title, bg, w, h, content) {
    var size = w === '100%' ? 'width:100%;height:100%;' : 'width:' + w + 'px;height:' + h + 'px;'
    return '<div class="z-view dv" style="' + size +
      'background:linear-gradient(135deg,' + bg + ')">' +
      (title ? '<h3>' + title + '</h3>' : '') + (content || '') + '</div>'
  }
  function trig (label, to) {
    return '<div class="zoom-me trig" data-to="' + to + '">' + label + '</div>'
  }

  // ─── demo views ───────────────────────────────────────────────

  // Use smaller views on mobile to prevent zoom-in from scaling too large
  var isMobile = window.innerWidth <= 640
  var W1 = isMobile ? 280 : 520
  var H1 = isMobile ? 180 : 300
  var W2 = isMobile ? 240 : 440
  var H2 = isMobile ? 150 : 250

  var pgViews = {
    home: dv('', '#0f1628, #162040', '100%', null,
      '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center;height:100%">' +
      trig('Dashboard', 'dashboard') + trig('Analytics', 'analytics') + trig('Settings', 'settings') + '</div>'),
    dashboard: dv('Dashboard', '#132952, #0a1a3a', W1, H1,
      '<p style="margin-bottom:10px">Real-time metrics overview.</p>' +
      '<div style="display:flex;gap:6px;margin-bottom:10px">' +
        '<div style="flex:1;background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;text-align:center">' +
          '<div style="font-size:1.3em;font-weight:700;color:var(--accent)">2.4k</div><div style="font-size:0.6em;opacity:0.5">Users</div></div>' +
        '<div style="flex:1;background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;text-align:center">' +
          '<div style="font-size:1.3em;font-weight:700;color:#7fdbca">98%</div><div style="font-size:0.6em;opacity:0.5">Uptime</div></div>' +
        '<div style="flex:1;background:rgba(255,255,255,0.05);border-radius:8px;padding:10px;text-align:center">' +
          '<div style="font-size:1.3em;font-weight:700;color:#c792ea">$12k</div><div style="font-size:0.6em;opacity:0.5">Revenue</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:6px">' + trig('Revenue', 'revenue') + trig('Users', 'users') + '</div>'),
    analytics: dv('Analytics', '#2a1845, #1a0d30', W1, H1,
      '<p style="margin-bottom:10px">Trend analysis.</p>' +
      '<div style="display:flex;gap:3px;align-items:flex-end;height:50px;margin-bottom:10px">' +
        '<div style="flex:1;background:linear-gradient(0deg,rgba(199,146,234,0.3),rgba(199,146,234,0.7));border-radius:3px 3px 0 0;height:40%"></div>' +
        '<div style="flex:1;background:linear-gradient(0deg,rgba(199,146,234,0.3),rgba(199,146,234,0.7));border-radius:3px 3px 0 0;height:65%"></div>' +
        '<div style="flex:1;background:linear-gradient(0deg,rgba(199,146,234,0.3),rgba(199,146,234,0.7));border-radius:3px 3px 0 0;height:45%"></div>' +
        '<div style="flex:1;background:linear-gradient(0deg,rgba(199,146,234,0.3),rgba(199,146,234,0.7));border-radius:3px 3px 0 0;height:80%"></div>' +
        '<div style="flex:1;background:linear-gradient(0deg,rgba(199,146,234,0.3),rgba(199,146,234,0.7));border-radius:3px 3px 0 0;height:55%"></div>' +
        '<div style="flex:1;background:linear-gradient(0deg,rgba(199,146,234,0.3),rgba(199,146,234,0.7));border-radius:3px 3px 0 0;height:90%"></div>' +
      '</div>' + trig('Deep Metrics', 'metrics')),
    settings: dv('Settings', '#3a2510, #2a1808', W1, H1,
      '<p>Configuration panel.</p>' +
      '<div style="margin-top:6px;display:flex;flex-direction:column;gap:5px">' +
        '<div style="display:flex;justify-content:space-between;padding:7px 10px;background:rgba(255,255,255,0.04);border-radius:6px;font-size:0.75em"><span>Dark Mode</span><span style="color:var(--accent)">ON</span></div>' +
        '<div style="display:flex;justify-content:space-between;padding:7px 10px;background:rgba(255,255,255,0.04);border-radius:6px;font-size:0.75em"><span>Notifications</span><span style="color:#7fdbca">Enabled</span></div>' +
      '</div>'),
    revenue: dv('Revenue', '#0a3025, #082018', W2, H2,
      '<p>Monthly breakdown.</p>' +
      '<div style="margin-top:6px;font-size:0.8em"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="opacity:0.6">Q1</span><span style="color:var(--accent)">$3.2k</span></div>' +
      '<div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden"><div style="width:65%;height:100%;background:var(--accent);border-radius:2px"></div></div></div>'),
    users: dv('User Stats', '#350a28, #25061a', W2, H2,
      '<p>Engagement metrics.</p>' +
      '<div style="display:flex;gap:6px;margin-top:6px">' +
        '<div style="flex:1;text-align:center;padding:8px;background:rgba(255,255,255,0.04);border-radius:8px"><div style="font-size:1.1em;font-weight:700;color:#f07178">847</div><div style="font-size:0.6em;opacity:0.5">Active</div></div>' +
        '<div style="flex:1;text-align:center;padding:8px;background:rgba(255,255,255,0.04);border-radius:8px"><div style="font-size:1.1em;font-weight:700;color:#7fdbca">92%</div><div style="font-size:0.6em;opacity:0.5">Retention</div></div></div>'),
    metrics: dv('Deep Metrics', '#0d2e2e, #082020', W2, H2,
      '<p>Performance analytics.</p>' +
      '<div style="margin-top:6px;font-size:0.7em;font-family:monospace;background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;color:#7fdbca">' +
      'avg_latency: 42ms<br>p99: 128ms<br>throughput: 1.2k rps</div>'),
  }

  // ─── playground app ───────────────────────────────────────────

  var pgApp = null

  function setupPlayground () {
    var mount = document.getElementById('pg-mount')
    if (!mount) return
    mount.innerHTML = ''
    if (pgApp) { pgApp.destroy(); pgApp = null }

    var driver = (document.querySelector('input[name="pg-drv"]:checked') || {}).value || 'css'
    var cover = (document.querySelector('input[name="pg-cov"]:checked') || {}).value || 'width'
    var dur = document.getElementById('pg-dur').value
    var stag = parseInt(document.getElementById('pg-stag').value, 10)
    var useFx = document.getElementById('pg-fx').checked
    var blur = document.getElementById('pg-blur').value
    var bright = document.getElementById('pg-bright').value
    var gray = document.getElementById('pg-gray').value
    var sepia = document.getElementById('pg-sepia').value
    var contrast = document.getElementById('pg-contrast').value
    var saturate = document.getElementById('pg-saturate').value
    var htVal = document.getElementById('pg-ht').value
    var deferred = document.getElementById('pg-deferred').checked
    var latArrows = document.getElementById('pg-lat-arrows').checked
    var latDots = document.getElementById('pg-lat-dots').checked
    var keepAliveVal = document.getElementById('pg-keepalive').value
    var depthBtn = document.getElementById('pg-depth-btn').checked
    var depthInd = document.getElementById('pg-depth-ind').checked
    var inpClick = document.getElementById('pg-inp-click').checked
    var inpKb = document.getElementById('pg-inp-kb').checked
    var inpWheel = document.getElementById('pg-inp-wheel').checked
    var inpTouch = document.getElementById('pg-inp-touch').checked
    var ease = document.getElementById('pg-ease').value

    var transitions = {
      driver: driver,
      duration: driver === 'none' ? '0s' : dur + 'ms',
      ease: ease, cover: cover,
    }
    if (useFx) {
      var fx = ''
      if (+blur > 0) fx += 'blur(' + blur + 'px) '
      if (+bright !== 100) fx += 'brightness(' + bright + '%) '
      if (+gray > 0) fx += 'grayscale(' + gray + '%) '
      if (+sepia > 0) fx += 'sepia(' + sepia + '%) '
      if (+contrast !== 100) fx += 'contrast(' + contrast + '%) '
      if (+saturate !== 100) fx += 'saturate(' + saturate + '%) '
      fx = fx.trim() || 'blur(5px) brightness(60%)'
      transitions.effects = [fx, fx]
    }
    if (stag > 0) transitions.stagger = stag
    if (htVal === 'fade') transitions.hideTrigger = 'fade'
    else if (htVal === 'true') transitions.hideTrigger = true

    pgApp = new Z({
      mount: '#pg-mount', initialView: 'home', views: pgViews,
      transitions: transitions, deferred: deferred,
      lateralNav: { arrows: latArrows, dots: latDots, keepAlive: keepAliveVal === 'false' ? false : (keepAliveVal === 'visible' ? 'visible' : true) },
      depthNav: { button: depthBtn, indicator: depthInd },
      inputs: { click: inpClick, keyboard: inpKb, wheel: inpWheel, touch: inpTouch },
    })
    pgApp.init()
  }

  function bindPlaygroundControls () {
    ;['pg-ease','pg-ht','pg-deferred','pg-fx',
      'pg-lat-arrows','pg-lat-dots','pg-keepalive','pg-depth-btn','pg-depth-ind',
      'pg-inp-click','pg-inp-kb','pg-inp-wheel','pg-inp-touch'
    ].forEach(function (id) {
      var el = document.getElementById(id)
      if (el) el.addEventListener('change', setupPlayground)
    })
    document.querySelectorAll('#pg-driver input, input[name="pg-cov"]').forEach(function (r) {
      r.addEventListener('change', setupPlayground)
    })
    ;[['pg-dur','pg-dur-val','ms'],['pg-stag','pg-stag-val','ms'],
      ['pg-blur','pg-blur-val','px'],['pg-bright','pg-bright-val','%'],
      ['pg-gray','pg-gray-val','%'],['pg-sepia','pg-sepia-val','%'],
      ['pg-contrast','pg-contrast-val','%'],['pg-saturate','pg-saturate-val','%']
    ].forEach(function (s) {
      var el = document.getElementById(s[0]), lbl = document.getElementById(s[1])
      if (el && lbl) el.addEventListener('input', function () {
        lbl.textContent = el.value + s[2]; setupPlayground()
      })
    })
    var fxEl = document.getElementById('pg-fx')
    if (fxEl) fxEl.addEventListener('change', function () {
      var c = document.getElementById('pg-fx-controls')
      if (c) c.style.display = this.checked ? '' : 'none'
    })
  }

  function destroyPlayground () {
    if (pgApp) { pgApp.destroy(); pgApp = null }
  }

  // ─── public API ───────────────────────────────────────────────

  window.Playground = {
    setup: setupPlayground,
    bind: bindPlaygroundControls,
    destroy: destroyPlayground,
  }
})()
