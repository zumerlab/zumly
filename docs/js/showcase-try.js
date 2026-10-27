// "Try this" card for the showcases: a few things to do that show what Zumly
// adds. showcaseTry(['…', '…']) after the page loads. Hidden in previews, on
// narrow screens and once closed.
;(function () {
  'use strict'

  var css = '.sc-try { position: fixed; z-index: 40; right: 16px; bottom: 16px; max-width: 290px; padding: 12px 14px 12px 16px;' +
    ' border-radius: 14px; background: rgba(12, 16, 26, 0.72); backdrop-filter: blur(12px); color: #e8eef7;' +
    ' font: 13px/1.45 system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3); }' +
    '.sc-try b { display: block; margin-bottom: 6px; font-size: 12px; color: #9fb6d4; font-weight: 600; }' +
    '.sc-try ul { margin: 0; padding-left: 16px; }' +
    '.sc-try li + li { margin-top: 4px; }' +
    '.sc-try button { position: absolute; top: 6px; right: 8px; border: 0; background: none; color: inherit; opacity: 0.6; cursor: pointer; font-size: 16px; }' +
    '.showcase-preview .sc-try { display: none; }' +
    '@media (max-width: 720px) { .sc-try { display: none; } }'

  window.showcaseTry = function (lines) {
    try { if (sessionStorage.getItem('sc-try-closed')) return } catch (e) {}
    var style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
    var card = document.createElement('aside')
    card.className = 'sc-try'
    card.setAttribute('aria-label', 'Things to try')
    card.innerHTML = '<b>Try this</b><ul>' + lines.map(function (line) { return '<li>' + line + '</li>' }).join('') +
      '</ul><button type="button" aria-label="Close">&times;</button>'
    card.querySelector('button').addEventListener('click', function () {
      card.remove()
      try { sessionStorage.setItem('sc-try-closed', '1') } catch (e) {}
    })
    document.body.appendChild(card)
  }
})()
