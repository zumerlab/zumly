// Stream the current view for a few seconds and tally why frames were full.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
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
const [scene = 'orbit', extra = '&live=1&animated=1'] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
await page.goto(`http://localhost:${server.address().port}/experiments/snapdom-compositor/bench.html?scene=${scene}&mode=baseline${extra}`)
await page.waitForFunction(() => window.ready)
const r = await page.evaluate(async () => {
  const { stream } = await import('/snapdom/packages/plugins/stream/src/stream.js')
  const tally = {}
  const s = stream(document.querySelector('.is-current-view'), { outerTransforms: false, outerShadows: false, onFrame: f => { const k = f.full ? `full: ${f.reason}` : 'patch'; tally[k] = (tally[k] || 0) + 1 } })
  await s.ready
  await new Promise(r => setTimeout(r, 4000))
  s.stop()
  return tally
})
console.log(scene, extra, r)
await browser.close(); server.close()
