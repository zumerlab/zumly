// The showcases: three small apps written as plain Zumly views. The demo
// (index.html) adds them to its own views; showcases/*.html run them alone.
//
// window.ZumlyShowcases[name] = { title, tag, blurb, page, root, views, preview() }
//   root      name of the first view
//   views     the views map to merge into a Zumly instance
//   preview() the root view's markup without triggers, for a card thumbnail
//
// Root views size everything in container units, so a thumbnail is the same
// view drawn small and zooming from the card into the view is seamless.
;(function () {
  'use strict'
  var showcases = window.ZumlyShowcases = {}
  // A function view can carry its title, so sibling dots name it before it is shown
  var titled = function (title, fn) { fn.title = title; return fn }
  var plain = function (html) { return html.replace(/\b(zoom-me|z-view)\b/g, '').replace(/\sdata-(to|title)="[^"]*"/g, '') }

  // ── Assembly line: tiles 4:3, panels 4:3, issues 16:10 ──────────────

  var stations = [
    { id: 'frame', name: 'Frame' }, { id: 'axles', name: 'Axles' },
    { id: 'engine', name: 'Engine', status: 'warn', rate: 71, bars: [92, 90, 88, 84, 80, 76, 73, 71],
      issues: [{ id: 'coolant', title: 'Coolant temperature high', text: 'Cylinder 3 runs 12% hotter than the others since 10:40.', steps: ['Check the coolant level', 'Inspect the thermostat', 'Run a pressure test'] }] },
    { id: 'gearbox', name: 'Gearbox' },
    { id: 'wiring', name: 'Wiring', status: 'fail', rate: 38, bars: [90, 91, 89, 70, 52, 44, 40, 38],
      issues: [
        { id: 'harness', title: 'Harness connector short', text: 'Connector J14 shorts under vibration. 6 units held for rework.', steps: ['Isolate J14', 'Replace the connector', 'Retest the held units'] },
        { id: 'sensor', title: 'MAP sensor offline', text: 'No signal from the manifold pressure sensor on bench 2.', steps: ['Reseat the sensor cable', 'Swap the sensor', 'Calibrate bench 2'] }
      ] },
    { id: 'cab', name: 'Cab' }, { id: 'paint', name: 'Paint' }, { id: 'glass', name: 'Glass' },
    { id: 'wheels', name: 'Wheels' },
    { id: 'brakes', name: 'Brakes', status: 'warn', rate: 84, bars: [95, 94, 93, 92, 90, 88, 86, 84],
      issues: [{ id: 'pads', title: 'Pad stock running low', text: 'Front pads last until 15:30 at the current rate.', steps: ['Order a pad pallet', 'Move stock from line 1'] }] },
    { id: 'test', name: 'Test' }, { id: 'ship', name: 'Ship' }
  ]
  var flagged = stations.filter(function (s) { return s.status })
  var checked = {}

  function assemblyRoot () {
    return '<div class="z-view sx sx-assembly sx-root" data-title="Assembly line">' +
      '<header class="sx-head"><div><h1>Assembly line</h1><p>Line 2 · Shift B</p></div>' +
      '<div class="sx-kpis"><span><b>142</b> units today</span><span><b>87%</b> efficiency</span><span class="is-alert"><b>' + flagged.length + '</b> stations need attention</span></div></header>' +
      '<div class="sx-stations">' + stations.map(function (s, i) {
        return '<div class="sx-station' + (s.status ? ' zoom-me is-' + s.status + '" data-to="assembly-' + s.id : '') + '">' +
          '<small>' + String(i + 1).padStart(2, '0') + '</small><b>' + s.name + '</b><i>' + (s.status === 'fail' ? 'Stopped' : s.status === 'warn' ? 'Slow' : 'Running') + '</i></div>'
      }).join('') + '</div>' +
      '<p class="sx-hint">Open a highlighted station. The arrows then move between the stations that need attention.</p></div>'
  }

  var assemblyViews = { assembly: assemblyRoot }
  flagged.forEach(function (s) {
    assemblyViews['assembly-' + s.id] = titled(s.name, function () {
      return '<div class="z-view sx sx-assembly sx-panel is-' + s.status + '" data-title="' + s.name + '">' +
        '<header class="sx-head"><div><h2>' + s.name + '</h2><p>' + (s.status === 'fail' ? 'Stopped' : 'Running slow') + '</p></div><span class="sx-pill">' + s.rate + '% of target</span></header>' +
        '<div class="sx-split"><div class="sx-chart"><p>Output, last 8 hours</p><div class="sx-bars">' +
        s.bars.map(function (v) { return '<i style="--v:' + v + '%"></i>' }).join('') + '</div></div>' +
        '<div class="sx-issues"><p>Issues</p>' + s.issues.map(function (issue) {
          return '<div class="sx-issue zoom-me" data-to="assembly-' + s.id + '-' + issue.id + '"><b>' + issue.title + '</b><span>' + issue.text + '</span></div>'
        }).join('') + '</div></div></div>'
    })
    s.issues.forEach(function (issue) {
      var key = s.id + '-' + issue.id
      // A function view: the checklist keeps its state while you move around
      assemblyViews['assembly-' + key] = titled(issue.title, function (ctx) {
        var target = ctx.target
        target.className = 'z-view sx sx-assembly sx-issue-view'
        target.dataset.title = issue.title
        target.innerHTML = '<p class="sx-kicker">' + s.name + '</p><h2>' + issue.title + '</h2><p>' + issue.text + '</p><ul class="sx-steps">' +
          issue.steps.map(function (step, i) {
            var id = key + '-' + i
            return '<li><label><input type="checkbox" data-step="' + id + '"' + (checked[id] ? ' checked' : '') + '> ' + step + '</label></li>'
          }).join('') + '</ul>'
        target.addEventListener('change', function (e) { checked[e.target.dataset.step] = e.target.checked })
      })
    })
  })

  showcases.assembly = {
    title: 'Assembly line', tag: 'Operations', page: 'showcases/assembly-line.html',
    blurb: 'Twelve stations, three in trouble. Open one, move to the next with the arrows, and work through an issue.',
    root: 'assembly', views: assemblyViews,
    preview: function () { return plain(assemblyRoot()) }
  }

  // ── Smart home: rooms are squares, a light opens a smaller square ───

  var rooms = [
    { id: 'living', name: 'Living room', temp: 22.5, lights: [['sofa', 'Sofa lamp', true, 70], ['ceiling', 'Ceiling', false, 100]] },
    { id: 'kitchen', name: 'Kitchen', temp: 23.1, lights: [['counter', 'Counter', true, 90]] },
    { id: 'bedroom', name: 'Bedroom', temp: 20.4, lights: [['bedside', 'Bedside', false, 40], ['ceiling', 'Ceiling', false, 100]] },
    { id: 'office', name: 'Office', temp: 21.8, lights: [['desk', 'Desk lamp', true, 100]] }
  ].map(function (room) {
    room.lights = room.lights.map(function (l) { return { id: l[0], name: l[1], on: l[2], level: l[3] } })
    return room
  })
  var lightsOn = function (room) { return room.lights.filter(function (l) { return l.on }).length }

  function houseRoot (ctx) {
    var html = function () {
      return '<header class="sx-head"><div><h1>Home</h1><p>Sunday · 19:40</p></div><div class="sx-kpis"><span><b>14°</b> outside</span><span><b>' +
        rooms.reduce(function (n, r) { return n + lightsOn(r) }, 0) + '</b> lights on</span></div></header>' +
        '<div class="sx-rooms">' + rooms.map(function (r) {
          return '<div class="sx-room zoom-me" data-to="house-' + r.id + '"><b>' + r.name + '</b><span>' + r.temp.toFixed(1) + '°</span><i>' + lightsOn(r) + ' of ' + r.lights.length + ' lights on</i></div>'
        }).join('') + '</div>' +
        '<p class="sx-hint">Open a room and switch a light: the house keeps it. Arrows or a swipe move between rooms.</p>'
    }
    if (!ctx || !ctx.target) return '<div class="z-view sx sx-home sx-root" data-title="Home">' + html() + '</div>'
    // A function view repaints when you come back, so the counts follow the switches
    ctx.target.className = 'z-view sx sx-home sx-root'
    ctx.target.dataset.title = 'Home'
    var paint = function () { ctx.target.innerHTML = html() }
    paint()
    ctx.onActivate(paint)
  }

  var houseViews = { house: houseRoot }
  rooms.forEach(function (room) {
    houseViews['house-' + room.id] = titled(room.name, function (ctx) {
      var target = ctx.target
      target.className = 'z-view sx sx-home sx-panel sx-square'
      target.dataset.title = room.name
      var paint = function () {
        target.innerHTML = '<header class="sx-head"><div><h2>' + room.name + '</h2><p>' + room.temp.toFixed(1) + '° · humidity 44%</p></div></header>' +
          '<div class="sx-lights">' + room.lights.map(function (l) {
            return '<div class="sx-light' + (l.on ? ' is-on' : '') + '"><button type="button" class="sx-switch" data-light="' + l.id + '" aria-pressed="' + l.on + '" aria-label="' + l.name + '"></button>' +
              '<div class="zoom-me sx-light-open" data-to="house-' + room.id + '-' + l.id + '"><b>' + l.name + '</b><span>' + (l.on ? l.level + '%' : 'Off') + '</span></div></div>'
          }).join('') + '</div>'
      }
      paint()
      ctx.onActivate(paint)
      target.addEventListener('click', function (e) {
        var button = e.target.closest('[data-light]')
        if (!button) return
        var light = room.lights.find(function (l) { return l.id === button.dataset.light })
        light.on = !light.on
        paint()
      })
    })
    room.lights.forEach(function (light) {
      houseViews['house-' + room.id + '-' + light.id] = titled(light.name, function (ctx) {
        var target = ctx.target
        target.className = 'z-view sx sx-home sx-panel sx-square sx-small'
        target.dataset.title = light.name
        target.innerHTML = '<h2>' + light.name + '</h2><p>' + room.name + '</p><output>' + light.level + '%</output>' +
          '<input type="range" min="0" max="100" value="' + light.level + '" aria-label="Brightness">'
        var range = target.querySelector('input')
        range.addEventListener('input', function () {
          light.level = Number(range.value)
          light.on = light.level > 0
          target.querySelector('output').textContent = light.level + '%'
        })
      })
    })
  })

  showcases.house = {
    title: 'Smart home', tag: 'State', page: 'showcases/smart-home.html',
    blurb: 'Rooms, lights and a dimmer. Function views keep the switches in sync when you zoom back out.',
    root: 'house', views: houseViews,
    preview: function () { return plain(houseRoot()) }
  }

  // ── Mission control: circles that open circles ───────────────────────

  var satellites = [
    { id: 'aqua', name: 'AQUA-7', orbit: 'Low Earth · 705 km', angle: -90, status: 'ok', systems: [['power', 'Power', 96], ['link', 'Link', 88], ['thermal', 'Thermal', 91]] },
    { id: 'helio', name: 'HELIO-3', orbit: 'L1 halo', angle: -30, status: 'fail', systems: [['power', 'Power', 31], ['link', 'Link', 64], ['thermal', 'Thermal', 42]] },
    { id: 'relay', name: 'RELAY-12', orbit: 'Geostationary', angle: 30, status: 'ok', systems: [['power', 'Power', 99], ['link', 'Link', 97], ['thermal', 'Thermal', 93]] },
    { id: 'polar', name: 'POLAR-9', orbit: 'Sun-synchronous', angle: 90, status: 'warn', systems: [['power', 'Power', 82], ['link', 'Link', 58], ['thermal', 'Thermal', 90]] },
    { id: 'deep', name: 'DEEP-4', orbit: 'Heliocentric', angle: 150, status: 'ok', systems: [['power', 'Power', 74], ['link', 'Link', 81], ['thermal', 'Thermal', 86]] },
    { id: 'cosmo', name: 'COSMO-2', orbit: 'L2 halo', angle: 210, status: 'warn', systems: [['power', 'Power', 90], ['link', 'Link', 77], ['thermal', 'Thermal', 61]] }
  ]
  var level = function (v) { return v < 50 ? 'fail' : v < 70 ? 'warn' : 'ok' }

  function missionRoot () {
    return '<div class="z-view sx sx-mission sx-root" data-title="Mission control">' +
      '<header class="sx-head"><div><h1>Mission control</h1><p>Constellation · 6 spacecraft</p></div>' +
      '<div class="sx-kpis"><span><b>4</b> nominal</span><span class="is-alert"><b>2</b> warnings</span><span class="is-alert"><b>1</b> anomaly</span></div></header>' +
      '<div class="sx-orbit"><div class="sx-planet">Earth</div>' + satellites.map(function (s) {
        return '<div class="sx-sat zoom-me is-' + s.status + '" data-to="mission-' + s.id + '" style="--a:' + s.angle + 'deg"><span>' + s.name + '</span></div>'
      }).join('') + '</div>' +
      '<p class="sx-hint">Open a spacecraft, then a subsystem: circles all the way down. Arrows move between spacecraft.</p></div>'
  }

  var missionViews = { mission: missionRoot }
  satellites.forEach(function (s) {
    missionViews['mission-' + s.id] = '<div class="z-view sx sx-mission sx-disc is-' + s.status + '" data-title="' + s.name + '">' +
      '<p class="sx-kicker">' + s.orbit + '</p><h2>' + s.name + '</h2><div class="sx-systems">' +
      s.systems.map(function (sys) {
        return '<div class="sx-sys zoom-me is-' + level(sys[2]) + '" data-to="mission-' + s.id + '-' + sys[0] + '" style="--v:' + sys[2] + '"><b>' + sys[2] + '</b><span>' + sys[1] + '</span></div>'
      }).join('') + '</div></div>'
    s.systems.forEach(function (sys) {
      var v = sys[2]
      missionViews['mission-' + s.id + '-' + sys[0]] = '<div class="z-view sx sx-mission sx-disc sx-gauge-view is-' + level(v) + '" data-title="' + sys[1] + ' · ' + s.name + '" style="--v:' + v + '">' +
        '<div class="sx-gauge"><b>' + v + '%</b><span>' + sys[1] + '</span></div><p>' + s.name + ' · ' +
        (v < 50 ? 'Below safe range. Switching to backup.' : v < 70 ? 'Degraded. Watching the trend.' : 'Nominal.') + '</p></div>'
    })
  })

  showcases.mission = {
    title: 'Mission control', tag: 'Depth', page: 'showcases/mission-control.html',
    blurb: 'Six spacecraft around the Earth. Three levels of circles, and a back button that jumps several at once.',
    root: 'mission', views: missionViews,
    preview: function () { return plain(missionRoot()) }
  }

  // Options each showcase wants when it runs alone
  showcases.options = {
    transitions: { duration: '750ms', ease: 'cubic-bezier(.4,0,.2,1)', effects: ['brightness(0.5) saturate(0.8)', 'brightness(0.3) saturate(0.6)'] },
    lateralNav: { swipe: true },
    gestures: { follow: true },
    inputs: { pinch: true }
  }
  showcases.depthNav = { assembly: { style: 'title' }, house: { style: 'title' }, mission: { style: 'rings' } }
})()
