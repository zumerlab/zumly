// Keeps the static docs pages in sync. Run after editing a learn example or the nav/footer:
//   node scripts/build-docs.mjs          rewrite the pages
//   node scripts/build-docs.mjs --check  exit 1 if a page is out of date
//
// 1. Every page with <nav class="site-nav"> / <aside class="docs-side"> / <footer class="site-footer">
//    gets the shared nav, sidebar and footer below, with links relative to the page.
// 2. <pre data-example="name"> in learn/ gets the source of learn/examples/name.html;
//    "name#script" or "name#style" takes the contents of the last such block, and
//    "name#tag" any other element whole (e.g. "navigate#nav").
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, posix } from 'node:path'

const DOCS = new URL('../docs/', import.meta.url).pathname
const SKIP = ['views', 'showcases', 'examples']
const check = process.argv.includes('--check')

const STEPS = [
  ['first-app', 'Your first app'],
  ['depth', 'Going deeper'],
  ['siblings', 'Siblings'],
  ['views', 'Where views come from'],
  ['navigate', 'Navigating from code'],
  ['motion', 'Motion and gestures']
]

function nav (to, section) {
  const cur = name => section === name ? ' aria-current="page"' : ''
  return `<nav class="site-nav">
    <div class="nav-inner">
      <a href="${to('')}" class="nav-brand" aria-label="Zumly home"><img src="${to('fish-160.png')}" alt="" width="30" height="30"><span>ZUMLY</span></a>
      <a class="nav-link" href="${to('learn/')}"${cur('learn')}>Learn</a>
      <a class="nav-link" href="${to('learn/#guides')}"${cur('guides')}>Guides</a>
      <a class="nav-link" href="${to('guides/playground.html')}"${cur('playground')}>Playground</a>
      <a class="nav-link" href="${to('api.html')}"${cur('api')}>API</a>
      <a class="nav-link" href="${to('')}#/home/showcases">Showcases</a>
      <a class="nav-link nav-gh" href="https://github.com/zumerlab/zumly">GitHub</a>
      <a class="nav-sponsor" href="https://github.com/sponsors/tinchox5"><span aria-hidden="true">&#9829;</span> Sponsor</a>
    </div>
  </nav>`
}

// The docs sidebar: every page, in groups; only the current page's group starts open.
// On api.html its sections hang under it.
const SIDEBAR = [
  ['Learn', [['learn/', 'Overview'], ...STEPS.map(([file, title]) => [`learn/${file}.html`, title])]],
  ['Guides', [['guides/playground.html', 'Playground'], ['guides/navigation.html', 'Navigation controls'], ['guides/architecture.html', 'Architecture'], ['guides/heavy-views.html', 'Heavy views']]],
  ['Frameworks', [
    ['integrations/react.html', 'React'], ['integrations/vue.html', 'Vue'], ['integrations/svelte.html', 'Svelte'],
    ['integrations/angular.html', 'Angular'], ['integrations/orbit-css.html', 'Orbit CSS']
  ]],
  ['Drivers', [['drivers/gsap.html', 'GSAP'], ['drivers/anime.html', 'Anime.js'], ['drivers/motion.html', 'Motion'], ['drivers/custom.html', 'Write your own']]],
  ['Reference', [['api.html', 'API reference']]]
]
const API_SECTIONS = [
  ['constructor', 'Options'], ['transitions', 'Transitions'], ['navigation', 'Navigation UI'], ['methods', 'Methods'],
  ['events', 'Events'], ['views', 'View sources'], ['triggers', 'Triggers']
]

function sidebar (to, rel) {
  const current = path => rel === path || rel === path + 'index.html'
  const link = ([path, title]) => {
    const a = `<a href="${to(path)}"${current(path) ? ' aria-current="page"' : ''}>${title}</a>`
    if (!(path === 'api.html' && current(path))) return a
    return a + `\n          <div class="docs-sub">${API_SECTIONS.map(([id, text]) => `<a href="#${id}">${text}</a>`).join('')}</div>`
  }
  return `<aside class="docs-side">
    <button type="button" class="docs-side-toggle" aria-expanded="false">Contents</button>
    <nav class="docs-nav" aria-label="Docs">
      ${SIDEBAR.map(([head, items]) => `<div class="docs-group">
        <button type="button" class="docs-head" aria-expanded="${items.some(([path]) => current(path))}">${head}</button>
        <div class="docs-items">
          ${items.map(link).join('\n          ')}
        </div>
      </div>`).join('\n      ')}
    </nav>
  </aside>`
}

function footer (to) {
  const li = (href, text) => `<li><a href="${href}">${text}</a></li>`
  return `<footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-grid">
        <div>
          <h2>Learn</h2>
          <ul>
            ${STEPS.map(([file, title]) => li(to(`learn/${file}.html`), title)).join('\n            ')}
            ${li(to('guides/playground.html'), 'Playground')}
            ${li(to('guides/navigation.html'), 'Navigation controls')}
            ${li(to('guides/architecture.html'), 'Architecture')}
          </ul>
        </div>
        <div>
          <h2>Frameworks</h2>
          <ul>
            ${li(to('integrations/react.html'), 'React')}
            ${li(to('integrations/vue.html'), 'Vue')}
            ${li(to('integrations/svelte.html'), 'Svelte')}
            ${li(to('integrations/angular.html'), 'Angular')}
            ${li(to('integrations/orbit-css.html'), 'Orbit CSS')}
          </ul>
        </div>
        <div>
          <h2>Drivers</h2>
          <ul>
            ${li(to('drivers/gsap.html'), 'GSAP')}
            ${li(to('drivers/anime.html'), 'Anime.js')}
            ${li(to('drivers/motion.html'), 'Motion')}
            ${li(to('drivers/custom.html'), 'Write your own')}
          </ul>
        </div>
        <div>
          <h2>Zumly</h2>
          <ul>
            ${li(to('') + '#/home/showcases', 'Showcases')}
            ${li(to('api.html'), 'API reference')}
            ${li('https://github.com/zumerlab/zumly', 'GitHub')}
            ${li('https://www.npmjs.com/package/zumly', 'npm')}
            ${li(to('llms.txt'), 'llms.txt')}
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <img src="${to('fish-160.png')}" alt="" width="26" height="26">
        <span><strong>Zumly</strong> by <a href="https://zumerlab.com">Zumerlab</a> · MIT License · <a href="/privacy.html">Privacy</a><span data-cookie-settings hidden> · <a href="#">Cookies</a></span></span>
        <a class="footer-sponsor" href="https://github.com/sponsors/tinchox5">&#9829; Sponsor Zumly</a>
      </div>
    </div>
  </footer>`
}

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function dedent (text) {
  const lines = text.replace(/^\n+|\s+$/g, '').split('\n')
  const indent = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length))
  return lines.map(l => l.slice(indent)).join('\n')
}

function exampleSource (spec) {
  const [name, part] = spec.split('#')
  const src = readFileSync(join(DOCS, 'learn/examples', name + '.html'), 'utf8')
  if (!part) return src.trimEnd()
  const blocks = [...src.matchAll(new RegExp(`( *)(<${part}(?:\\s[^>]*)?>)([\\s\\S]*?)(</${part}>)`, 'g'))]
  if (!blocks.length) throw new Error(`No <${part}> in ${name}.html`)
  const [whole, indent, , inner] = blocks[blocks.length - 1]
  return dedent(part === 'script' || part === 'style' ? inner : whole.slice(indent.length).replace(new RegExp('^' + indent, 'gm'), ''))
}

function walk (dir) {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return SKIP.includes(entry) ? [] : walk(path)
    return entry.endsWith('.html') ? [path] : []
  })
}

let stale = 0
for (const file of walk(DOCS)) {
  const rel = relative(DOCS, file)
  const up = posix.relative(dirname(rel).replace(/\\/g, '/'), '.') || '.'
  const to = target => {
    const path = (up === '.' ? '' : up + '/') + target
    return path || './'
  }
  const section = rel === 'guides/playground.html' ? 'playground'
    : rel.startsWith('learn/') ? 'learn'
    : rel.startsWith('integrations/') || rel.startsWith('drivers/') || rel.startsWith('guides/') ? 'guides'
      : rel === 'api.html' ? 'api' : ''
  const before = readFileSync(file, 'utf8')
  const after = before
    .replace(/<nav class="site-nav">[\s\S]*?<\/nav>/, () => nav(to, section))
    .replace(/<aside class="docs-side">[\s\S]*?<\/aside>/, () => sidebar(to, rel))
    .replace(/<footer class="site-footer">[\s\S]*?<\/footer>/, () => footer(to))
    .replace(/(<pre data-example="([^"]+)"><code>)[\s\S]*?(<\/code><\/pre>)/g,
      (m, open, spec, close) => open + escapeHtml(exampleSource(spec)) + close)
  if (after === before) continue
  stale++
  if (check) console.log('out of date:', rel)
  else { writeFileSync(file, after); console.log('updated:', rel) }
}
// The home (docs/views/home.html, fetched by the demo) lists the same pages as the sidebar,
// one row per group, between the docs-links markers.
function homeDocs () {
  return SIDEBAR.map(([group, pages]) => `  <div class="home-footer">
    <strong>${group}</strong>
    ${pages.map(([path, title]) => `<a href="${path}">${title}</a>`).join('')}
  </div>`).join('\n')
}
{
  const file = DOCS + 'views/home.html'
  const before = readFileSync(file, 'utf8')
  const after = before.replace(/(<!-- docs-links -->\n)[\s\S]*?(  <!-- \/docs-links -->)/, (m, open, close) => open + homeDocs() + '\n' + close)
  if (after !== before) {
    stale++
    if (check) console.log('out of date: views/home.html')
    else { writeFileSync(file, after); console.log('updated: views/home.html') }
  }
}
if (check && stale) process.exit(1)
