// Static pages: theme toggle, copy buttons and a tiny highlighter for code blocks.
// The theme class itself is set by an inline script in <head> to avoid a flash.
;(function () {
  'use strict'
  var root = document.documentElement

  function syncThemeButton () {
    var b = document.getElementById('theme-btn')
    if (b) b.innerHTML = root.classList.contains('light') ? '&#9728;' : '&#9790;'
  }
  window.toggleTheme = function () {
    root.classList.toggle('light')
    try { localStorage.setItem('zumly-theme', root.classList.contains('light') ? 'light' : 'dark') } catch (e) {}
    syncThemeButton()
  }

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
  }
  window.enhanceCode = enhance

  function ready () {
    syncThemeButton()
    enhance(document)
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
