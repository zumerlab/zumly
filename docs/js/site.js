// Static pages: the docs sidebar, copy buttons and a tiny highlighter for code blocks.
;(function () {
  'use strict'

  var TOKENS = /(<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|(<\/?[a-zA-Z][\w-]*|\/?>)|\b(const|let|var|new|await|async|function|return|import|from|export|default|if|else|true|false|null|this)\b/g
  function esc (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  function highlight (code) {
    var src = code.textContent
    var out = ''
    var last = 0
    src.replace(TOKENS, function (m, com, str, tag, kw, i) {
      out += esc(src.slice(last, i))
      var cls = com ? 'c' : str ? 's' : tag ? 't' : 'k'
      out += '<span class="tok-' + cls + '">' + esc(m) + '</span>'
      last = i + m.length
      return m
    })
    code.innerHTML = out + esc(src.slice(last))
  }

  // Highlight and add copy buttons to the code blocks in root (the demo calls it for fetched views)
  function enhance (root) {
    root.querySelectorAll('pre').forEach(function (pre) {
      if (pre.querySelector('.copy-btn')) return
      var code = pre.querySelector('code')
      if (!code) {
        code = document.createElement('code')
        while (pre.firstChild) code.appendChild(pre.firstChild)
        pre.appendChild(code)
      }
      if (!pre.hasAttribute('data-plain')) highlight(code)
      var btn = document.createElement('button')
      btn.className = 'copy-btn'
      btn.type = 'button'
      btn.textContent = 'Copy'
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(code.textContent).then(function () {
          btn.textContent = 'Copied'
          setTimeout(function () { btn.textContent = 'Copy' }, 1400)
        })
      })
      pre.appendChild(btn)
    })
    // Wide tables stack on phones; each cell shows its column name (CSS)
    root.querySelectorAll('.table-wrap table').forEach(function (table) {
      var heads = [].map.call(table.querySelectorAll('thead th'), function (th) { return th.textContent.trim() })
      if (heads.length < 3) return
      table.classList.add('stack')
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        [].forEach.call(tr.children, function (td, i) {
          if (i > 0 && heads[i] && heads[i] !== 'Description') td.setAttribute('data-label', heads[i])
        })
      })
    })
  }
  window.enhanceCode = enhance

  // The docs sidebar: groups that open and close, a menu button on phones, and the section
  // you are reading marked in it.
  // scroller is the element that scrolls the page (the demo's view; the window otherwise).
  function sidebar (root, scroller) {
    var side = root.querySelector('.docs-side')
    if (!side) return
    var toggle = side.querySelector('.docs-side-toggle')
    toggle.addEventListener('click', function () {
      toggle.setAttribute('aria-expanded', toggle.getAttribute('aria-expanded') !== 'true')
    })
    side.addEventListener('click', function (e) {
      var head = e.target.closest('.docs-head')
      if (head) head.setAttribute('aria-expanded', head.getAttribute('aria-expanded') !== 'true')
      else if (e.target.closest('a')) toggle.setAttribute('aria-expanded', 'false')
    })
    var links = [].slice.call(side.querySelectorAll('a[href^="#"]'))
    if (!links.length || !window.IntersectionObserver) return
    var seen = {}
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting })
      var here = null
      for (var i = 0; i < links.length && !here; i++) if (seen[links[i].hash.slice(1)]) here = links[i]
      if (here) links.forEach(function (a) { a.classList.toggle('is-here', a === here) })
    }, { root: scroller || null, rootMargin: '-80px 0px -55% 0px' })
    links.forEach(function (a) {
      var section = root.querySelector(a.hash)
      if (section) io.observe(section)
    })
  }
  window.enhanceSidebar = sidebar

  function ready () {
    enhance(document)
    sidebar(document)
    document.querySelectorAll('[data-reload]').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = document.getElementById(b.getAttribute('data-reload'))
        if (f) f.src = f.src
      })
    })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready)
  else ready()
})()
