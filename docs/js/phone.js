// The Phone showcase: an iOS-style home screen where every app opens with a zoom from its
// icon. Like the other showcases, the demo (index.html) adds these views to its own;
// showcases/phone.html runs them alone, inside a phone, with SnapDOM and WebGL to pick from.
//
// window.ZumlyShowcases.phone = { title, tag, blurb, page, root, views, preview(), screenViews }
//   views     the demo's one view: the whole phone. Its screen runs a Zumly of its own on
//             screenViews, so an app opens inside the screen and the phone stays where it is.
//   screenViews  the screens, from 'phone-home'; showcases/phone.html runs them on its canvas,
//             which is the phone's screen too.
//
// Every phone screen is a size container (.ph-view) and sizes what is in it in its own units
// (docs/css/phone.css).
;(function () {
  'use strict'
  const showcases = window.ZumlyShowcases = window.ZumlyShowcases || {}

  const pad = n => String(n).padStart(2, '0')
  const started = performance.now()
  const stopwatch = () => {
    const t = (performance.now() - started) / 1000
    return `${pad(Math.floor(t / 60) % 60)}:${pad(Math.floor(t) % 60)}.${pad(Math.floor(t * 100) % 100)}`
  }
  // Live values, in a whole page or in a screen just built: a screen can be photographed for
  // its zoom as soon as it exists, so it comes already filled in.
  function paint (root) {
    const now = new Date()
    const s = now.getSeconds(); const m = now.getMinutes() + s / 60; const h = (now.getHours() % 12) + m / 60
    for (const face of root.querySelectorAll('.ph .face')) {
      face.querySelector('.h').style.transform = `rotate(${h * 30}deg)`
      face.querySelector('.m').style.transform = `rotate(${m * 6}deg)`
      face.querySelector('.s').style.transform = `rotate(${s * 6}deg)`
    }
    for (const z of root.querySelectorAll('.js-zone')) z.textContent = now.toLocaleTimeString('en-US', { timeZone: z.dataset.zone, hour: 'numeric', minute: '2-digit', second: z.classList.contains('digital') ? '2-digit' : undefined })
    for (const w of root.querySelectorAll('.js-stopwatch')) w.textContent = stopwatch()
    for (const t of root.querySelectorAll('.js-temp')) t.textContent = `${72 + Math.round(Math.sin(now / 9000) * 2)}°`
    for (const c of root.querySelectorAll('.js-now')) c.textContent = `${now.getHours() % 12 || 12}:${pad(now.getMinutes())}`
  }
  paint(document)
  setInterval(() => paint(document), 1000)
  setInterval(() => { for (const w of document.querySelectorAll('.js-stopwatch')) w.textContent = stopwatch() }, 30)

  // ── Icons ──────────────────────────────────────────────────────────
  const apps = {
    weather: { name: 'Weather', bg: 'linear-gradient(#55aaf8, #1f62d6)', glyph: '☀︎', to: 'weather' },
    clock: { name: 'Clock', bg: '#111', icon: 'ic-clock', inner: '<b class="h"></b><b class="m"></b>', to: 'clock' },
    photos: { name: 'Photos', bg: '#fff', icon: 'ic-photos', to: 'photos' },
    calendar: { name: 'Calendar', bg: '#fff', icon: 'ic-calendar', light: true },
    notes: { name: 'Notes', bg: '#fff', icon: 'ic-notes', to: 'notes' },
    settings: { name: 'Settings', bg: 'linear-gradient(#a8a8b2, #6b6b74)', glyph: '⚙︎', to: 'settings' },
    music: { name: 'Music', bg: 'linear-gradient(#fd5f78, #fa233b)', glyph: '♫' },
    maps: { name: 'Maps', bg: 'linear-gradient(135deg, #8fd16a, #3fb0f5)', glyph: '➤' },
    camera: { name: 'Camera', bg: 'linear-gradient(#d7d7dc, #8e8e96)', glyph: '◉' },
    reminders: { name: 'Reminders', bg: '#fff', glyph: '☰', color: '#0a84ff', light: true },
    stocks: { name: 'Stocks', bg: '#111', glyph: '▲', color: '#30d158' },
    utilities: { name: 'Utilities', folder: ['#555', '#ff9f0a', '#0a84ff', '#e5484d', '#30d158', '#888'], to: 'folder' },
    phone: { name: 'Phone', bg: 'linear-gradient(#5fe07a, #2fbf4f)', glyph: '✆' },
    safari: { name: 'Safari', bg: 'linear-gradient(#fff, #e9eef7)', glyph: '◎', color: '#0a84ff', light: true },
    messages: { name: 'Messages', bg: 'linear-gradient(#5fe07a, #2fbf4f)', glyph: '❝' },
    mail: { name: 'Mail', bg: 'linear-gradient(#4fb3ff, #1773f0)', glyph: '✉︎' },
    calculator: { name: 'Calculator', bg: '#333', glyph: '±', color: '#ff9f0a', to: 'calculator' },
    compass: { name: 'Compass', bg: '#111', glyph: '✦' },
    memos: { name: 'Voice Memos', bg: '#111', glyph: '◖', color: '#ff453a' },
    measure: { name: 'Measure', bg: '#111', glyph: '⟷', color: '#ffd60a' },
    translate: { name: 'Translate', bg: 'linear-gradient(#4fb3ff, #1773f0)', glyph: '文' },
    magnifier: { name: 'Magnifier', bg: '#111', glyph: '⌕' }
  }
  const today = new Date()
  const DAY = today.toLocaleDateString('en-US', { weekday: 'short' })

  function icon (id) {
    const a = apps[id]
    const data = `data-to="phone-${a.to || 'app'}" data-app="${id}" data-title="${a.name}"`
    let face = a.glyph ? `<span style="color:${a.color || '#fff'}">${a.glyph}</span>` : a.inner || ''
    if (a.icon === 'ic-calendar') face = `<em>${DAY}</em><strong>${today.getDate()}</strong>`
    if (a.folder) return `<div class="app"><i class="zoom-me ic-folder" ${data}>${a.folder.map(c => `<s style="background:${c}"></s>`).join('')}</i><span>${a.name}</span></div>`
    return `<div class="app"><i class="zoom-me ${a.icon || ''}" ${data} style="background:${a.bg}">${face}</i><span>${a.name}</span></div>`
  }

  // ── The home screen ────────────────────────────────────────────────
  const homeInner = () => `<div class="widgets">
      <div><div class="widget weather zoom-me" data-to="phone-weather" data-title="Weather"><b>New York</b><span class="temp js-temp">72°</span><small>Mostly sunny<br>H:76° L:63°</small></div><div class="widget-label">Weather</div></div>
      <div><div class="widget calendar zoom-me" data-to="phone-app" data-app="calendar" data-title="Calendar"><span class="day">${today.toLocaleDateString('en-US', { weekday: 'long' })}</span><span class="date">${today.getDate()}</span><small>Ship Zumly 2.0<br>4:00 – 5:00 PM</small></div><div class="widget-label">Calendar</div></div>
    </div>
    <div class="icons">${['clock', 'photos', 'notes', 'settings', 'music', 'maps', 'camera', 'reminders', 'stocks', 'calculator', 'utilities', 'calendar'].map(icon).join('')}</div>
    <div class="dots"><i></i><i></i></div>
    <div class="dock">${['phone', 'safari', 'messages', 'mail'].map(icon).join('')}</div>`

  // The first screen, on the phone's canvas.
  const phoneHome = () => `<div class="z-view ph ph-view ph-home" data-title="Home">${homeInner()}</div>`

  // ── Apps ───────────────────────────────────────────────────────────
  const view = (target, className, title, light) => {
    target.className = `z-view ph ph-view ${className}`
    if (title) target.dataset.title = title
    if (light) target.dataset.light = ''
  }

  // An app this demo does not build: its icon, big, and its name.
  function generic ({ target, props }) {
    const a = apps[props.app] || apps.music
    view(target, 'ph-generic' + (a.light ? ' ph-light' : ''), a.name, a.light)
    if (!a.light) target.style.background = '#1c1c1e'
    target.style.color = a.light ? '#000' : '#fff'
    const face = a.icon === 'ic-calendar'
      ? `<span style="color:#e0261c;font-size:7cqw">${DAY}</span>`
      : `<span style="color:${a.color || '#fff'}">${a.glyph || ''}</span>`
    target.innerHTML = `<div class="glyph" style="background:${a.bg}">${face}</div><h2>${a.name}</h2><p>This app is only an icon in this demo. Zoom out to go home.</p>`
  }

  function weather ({ target }) {
    view(target, 'ph-app ph-weather', 'Weather')
    const hours = ['Now', '1PM', '2PM', '3PM', '4PM', '5PM'].map((h, i) => `<div>${h}<b>${['☀︎', '☀︎', '⛅︎', '⛅︎', '☁︎', '☁︎'][i]}</b>${72 + [0, 2, 3, 3, 1, -1][i]}°</div>`).join('')
    const days = ['Today', 'Fri', 'Sat', 'Sun', 'Mon'].map((d, i) => `<div><span>${d}</span><span>${['☀︎', '⛅︎', '☂︎', '☀︎', '⛅︎'][i]}</span><span>${63 - i}° — ${76 - i * 2}°</span></div>`).join('')
    target.innerHTML = `<div class="city">New York</div><div class="big js-temp">72°</div><div class="sky">Mostly sunny · H:76° L:63°</div>
      <div class="card"><h3>Hourly forecast</h3><div class="hours">${hours}</div></div>
      <div class="card"><h3>5-day forecast</h3><div class="days">${days}</div></div>`
    paint(target)
  }

  const CITIES = [['London', 'Europe/London'], ['Tokyo', 'Asia/Tokyo'], ['Buenos Aires', 'America/Argentina/Buenos_Aires']]
  // A stopwatch that never stops, so the screen changes all the time and SnapDOM's captures run
  // at the rate the page sets. The cities make it a screen you can zoom out of, so it is followed.
  function clock ({ target }) {
    view(target, 'ph-app ph-clock', 'Clock')
    const rows = CITIES.map(([name, zone]) => `<div class="row more zoom-me" data-to="phone-city" data-zone="${zone}" data-title="${name}"><span>${name}</span><em class="js-zone" data-zone="${zone}">--:--</em></div>`).join('')
    target.innerHTML = `<h1>Clock</h1><div class="face"><b class="h"></b><b class="m"></b><b class="s"></b></div>
      <div class="digital js-stopwatch">00:00.00</div><div class="group">${rows}</div>`
    paint(target)
  }
  function city ({ target, props }) {
    const [name] = CITIES.find(([, zone]) => zone === props.zone) || CITIES[0]
    view(target, 'ph-app ph-clock', name)
    target.innerHTML = `<h1>${name}</h1><div class="digital js-zone" data-zone="${props.zone}" style="margin-top:30cqw;font-size:20cqw">--:--</div><p style="opacity:.6;font-size:4cqw">${props.zone.replace(/_/g, ' ')}</p>`
    paint(target)
  }

  const shot = n => {
    const h = (n * 47) % 360
    return `linear-gradient(hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 60% 38%))`
  }
  function photos ({ target }) {
    view(target, 'ph-app ph-photos', 'Photos', true)
    let shots = ''
    for (let n = 1; n <= 30; n++) shots += `<i class="zoom-me" data-to="phone-photo" data-n="${n}" data-title="Photo ${n}" style="background:${shot(n)}"></i>`
    target.innerHTML = `<h1>Library</h1><div class="shots">${shots}</div>`
  }
  function photo ({ target, props }) {
    const n = +props.n || 1
    const h = (n * 47) % 360
    view(target, 'ph-photo', `Photo ${n}`)
    target.style.background = `radial-gradient(calc(var(--ph-w, 100cqw) * .18) calc(var(--ph-w, 100cqw) * .18) at ${20 + (n * 13) % 60}% ${22 + (n * 7) % 20}%, hsl(${(h + 60) % 360} 90% 80%), transparent 70%),
      linear-gradient(transparent 55%, hsl(${(h + 200) % 360} 30% 18%) 55%), ${shot(n)}`
    target.innerHTML = `<h2>Photo ${n}</h2><p>${['Morning walk', 'Rooftop', 'Lake trip', 'City lights', 'Weekend'][n % 5]} · Oct ${1 + (n % 28)}</p>`
  }

  const row = (glyph, bg, label, extra = '', more = '') => `<div class="row${more ? ' more zoom-me' : ''}" ${more}><i style="background:${bg}">${glyph}</i><span>${label}</span>${extra}</div>`
  function settings ({ target }) {
    view(target, 'ph-app ph-light', 'Settings', true)
    target.innerHTML = `<h1>Settings</h1>
      <div class="group">${row('✈︎', '#ff9f0a', 'Airplane Mode', '<b class="toggle off"></b>')}${row('⌔', '#0a84ff', 'Wi-Fi', '<em>Zumerlab</em>')}${row('ᛒ', '#0a84ff', 'Bluetooth', '<em>On</em>')}${row('◉', '#30d158', 'Cellular')}</div>
      <div class="group">${row('⚙︎', '#8e8e93', 'General', '', 'data-to="phone-general" data-title="General"')}${row('☀︎', '#0a84ff', 'Display & Brightness')}${row('❀', '#30b0c7', 'Wallpaper')}${row('◐', '#5856d6', 'Focus')}</div>
      <div class="group">${row('✋︎', '#0a84ff', 'Privacy & Security')}${row('⌘', '#ff3b30', 'Battery')}</div>`
  }
  function general ({ target }) {
    view(target, 'ph-app ph-light', 'General', true)
    target.innerHTML = `<h1>General</h1>
      <div class="group">${row('ⓘ', '#8e8e93', 'About', '', 'data-to="phone-about" data-title="About"')}${row('↻', '#8e8e93', 'Software Update', '<em>Zumly 2.0</em>')}</div>
      <div class="group">${row('⇄', '#0a84ff', 'AirDrop')}${row('▣', '#0a84ff', 'Picture in Picture')}${row('⌨', '#8e8e93', 'Keyboard')}${row('◷', '#8e8e93', 'Date & Time')}</div>`
  }
  function about ({ target }) {
    view(target, 'ph-app ph-light', 'About', true)
    const line = (k, v) => `<div class="row"><span>${k}</span><em>${v}</em></div>`
    target.innerHTML = `<h1>About</h1><div class="group">${line('Name', 'Zumly Phone')}${line('Software Version', '2.0')}${line('Model', 'Z over XY')}${line('Levels deep', '4')}</div>`
  }

  const NOTE_TEXTS = [
    ['Zoom into anything', 'Every screen here is a Zumly view. An icon is its trigger, so the app grows out of it and shrinks back into it.'],
    ['Three ways to draw it', 'The DOM as it is, SnapDOM pictures of the screens behind, or WebGL. Try them on the full screen page.'],
    ['Capture rate', 'With SnapDOM, turn it down to one per second and zoom out of the Clock: the picture it shrinks into can be a second old.'],
    ['Groceries', 'Coffee, oranges, bread, the good olive oil.']
  ]
  function notes ({ target }) {
    view(target, 'ph-app ph-notes', 'Notes', true)
    target.innerHTML = `<h1>Notes</h1><div class="group">${NOTE_TEXTS.map(([title, text], i) => `<div class="note-row zoom-me" data-to="phone-note" data-n="${i}" data-title="${title}"><b>${title}</b><small>Today · ${text.slice(0, 38)}…</small></div>`).join('')}</div>`
  }
  function note ({ target, props }) {
    const [title, text] = NOTE_TEXTS[+props.n] || NOTE_TEXTS[0]
    view(target, 'ph-note', title, true)
    target.innerHTML = `<h2>${title}</h2><p>${text}</p>`
  }

  function folder ({ target }) {
    target.className = 'z-view ph ph-folder'
    target.dataset.title = 'Utilities'
    target.innerHTML = `<h2>Utilities</h2><div class="panel">${['calculator', 'compass', 'memos', 'measure', 'translate', 'magnifier'].map(icon).join('')}</div>`
  }

  function calculator ({ target }) {
    view(target, 'ph-calc', 'Calculator')
    const keys = [['AC', 'fn'], ['±', 'fn'], ['%', 'fn'], ['÷', 'op'], ['7'], ['8'], ['9'], ['×', 'op'], ['4'], ['5'], ['6'], ['−', 'op'], ['1'], ['2'], ['3'], ['+', 'op'], ['0', 'wide'], ['.'], ['=', 'op']]
    target.innerHTML = `<output>0</output><div class="keys">${keys.map(([k, c]) => `<button type="button" class="${c || ''}">${k}</button>`).join('')}</div>`
    let shown = '0'; let stored = null; let pending = null; let fresh = true
    const out = target.querySelector('output')
    const ops = { '+': (a, b) => a + b, '−': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => a / b }
    const show = v => { shown = String(+(+v).toPrecision(9)); out.textContent = shown }
    target.querySelector('.keys').addEventListener('click', (event) => {
      const k = event.target.closest('button')?.textContent
      if (!k) return
      if (/^[0-9.]$/.test(k)) {
        if (k === '.' && shown.includes('.') && !fresh) return
        shown = fresh ? (k === '.' ? '0.' : k) : shown + k
        fresh = false
        out.textContent = shown
      } else if (k === 'AC') { stored = pending = null; show(0); fresh = true } else if (k === '±') show(-shown)
      else if (k === '%') show(shown / 100)
      else {
        if (pending && !fresh) show(ops[pending](stored, +shown))
        stored = +shown
        pending = k === '=' ? null : k
        fresh = true
      }
    })
  }

  const screenViews = {
    'phone-home': phoneHome,
      'phone-app': generic,
      'phone-weather': weather,
      'phone-clock': clock,
      'phone-city': city,
      'phone-photos': photos,
      'phone-photo': photo,
      'phone-settings': settings,
      'phone-general': general,
      'phone-about': about,
      'phone-notes': notes,
      'phone-note': note,
      'phone-folder': folder,
    'phone-calculator': calculator
  }

  // ── The demo's phone ───────────────────────────────────────────────
  // The whole phone is the demo's view; its screen is a canvas of its own. The demo zooms into
  // the phone, and the phone's Zumly opens its apps inside the screen.
  const screenParts = `<div class="ph-status"><span class="js-now">9:41</span></div><i class="ph-island"></i>`
  const phoneMarkup = (screen) => `<div class="ph-device"><div class="ph-screen">${screen}${screenParts}</div></div>`
  // What happens inside the phone stays there: the demo does not take its taps, keys or gestures.
  const OWN_EVENTS = ['mouseup', 'mousedown', 'mouseover', 'click', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel', 'keydown', 'keyup', 'focusin', 'pointerdown']

  const phone = {
    title: 'Phone',
    render ({ target, onCleanup }) {
      target.className = 'z-view sx-root ph-stage'
      target.dataset.title = 'Phone'
      target.innerHTML = phoneMarkup('<div class="ph-canvas zumly-canvas"></div><button class="ph-home-bar" type="button" aria-label="Home"></button>')
      onCleanup(() => target.phone?.destroy())
      return target
    },
    mounted (node) {
      const screen = node.querySelector('.ph-screen')
      for (const type of OWN_EVENTS) screen.addEventListener(type, event => event.stopPropagation())
      const app = node.phone = new window.Zumly({
        mount: node.querySelector('.ph-canvas'),
        initialView: 'phone-home',
        views: screenViews,
        transitions: { duration: '550ms', ease: 'cubic-bezier(.2, .8, .2, 1)', effects: ['blur(3px) brightness(.75)', 'blur(8px) brightness(.55)'] },
        depthNav: false,
        lateralNav: false,
        gestures: { follow: true },
        inputs: { pinch: true }
      })
      // Light screens get a dark status bar and home bar.
      app.on('viewChanged', ({ node: view }) => screen.classList.toggle('light', view?.dataset.light !== undefined))
      node.querySelector('.ph-home-bar').addEventListener('click', () => { if (app.zoomLevel() > 1) app.zoomOut() })
      return app.init()
    }
  }

  showcases.phone = {
    title: 'Phone', tag: 'Drawing', page: 'showcases/phone.html',
    blurb: 'An iOS-style home screen: every app opens inside the phone with a zoom from its icon. Full screen, draw it with the DOM, SnapDOM or WebGL.',
    root: 'phone',
    views: { phone },
    screenViews,
    // The demo's card: the phone with its home screen, without triggers, drawn small.
    preview: () => `<div class="sx-root ph-stage">${phoneMarkup(`<div class="ph ph-home ph-fill">${homeInner()}</div>`)}</div>`
      .replace(/\bzoom-me\b/g, '').replace(/\sdata-(to|title)="[^"]*"/g, '')
  }
})()
