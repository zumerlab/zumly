// Capture one view with snapdom (as the compositor does) and save PNGs, for fidelity checks.
//   node experiments/snapdom-compositor/probe.mjs <outDir> [scene] [query]
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'
const here = new URL('.', import.meta.url).pathname
const roots = { '/snapdom/': resolve(here, '../../../../../../snapdom') + '/', '/orbit/': resolve(here, '../../../../../../orbit') + '/', '/': resolve(here, '../..') + '/' }
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  const prefix = Object.keys(roots).find(p => url.startsWith(p))
  try { const body = await readFile(join(roots[prefix], url.slice(prefix.length))); res.writeHead(200, { 'content-type': types[extname(url)] || 'application/octet-stream' }); res.end(body) } catch { res.writeHead(404); res.end() }
}).listen(0)
const [outDir, scene = 'orbit', extra = ''] = process.argv.slice(2)
await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
page.on('pageerror', e => console.error('pageerror', e.message))
page.on('console', m => console.log('console', m.text()))
await page.goto(`http://localhost:${server.address().port}/experiments/snapdom-compositor/bench.html?scene=${scene}&mode=baseline${extra}`)
await page.waitForFunction(() => window.ready)
await page.waitForTimeout(800)
const r = await page.evaluate(async () => {
  const { snapdom } = await import('@zumer/snapdom')
  const v = document.querySelector('.is-current-view')
  const t0 = performance.now()
  const res = await snapdom(v, { outerTransforms: false, fast: 'auto' })
  const c = await res.toCanvas()
  const ms = performance.now() - t0
  const t1 = performance.now()
  const res2 = await snapdom(v, { outerTransforms: false, fast: 'auto' })
  await res2.toCanvas()
  const ms2 = performance.now() - t1
  return { ms, ms2, w: c.width, h: c.height, url: c.toDataURL('image/png') }
})
await writeFile(`${outDir}/probe-${scene}.png`, Buffer.from(r.url.split(',')[1], 'base64'))
await page.locator('.is-current-view').screenshot({ path: `${outDir}/probe-${scene}-live.png` })
console.log({ ms: r.ms.toFixed(1), ms2: r.ms2.toFixed(1), w: r.w, h: r.h })
await browser.close(); server.close()
