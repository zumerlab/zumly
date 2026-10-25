// Dump the flattened layers at a given level, composited on a dark background.
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
const [outDir, scene = 'orbit', levels = '3', extra = ''] = process.argv.slice(2)
await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
page.on('pageerror', e => console.error('pageerror', e.message))
await page.goto(`http://localhost:${server.address().port}/experiments/snapdom-compositor/bench.html?scene=${scene}&mode=both${extra}`)
await page.waitForFunction(() => window.ready)
await page.evaluate((n) => window.zoomTo(n, 900), +levels)
await page.waitForTimeout(800)
const dumps = await page.evaluate(() => [...document.querySelectorAll('.z-flat-layer')].map(c => {
  const o = document.createElement('canvas'); o.width = c.width; o.height = c.height
  const x = o.getContext('2d'); x.fillStyle = '#123'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0)
  return { view: c.parentElement.dataset.viewName, cls: c.parentElement.className, style: c.getAttribute('style'), url: o.toDataURL() }
}))
for (const d of dumps) { await writeFile(`${outDir}/layer-${d.view}.png`, Buffer.from(d.url.split(',')[1], 'base64')); console.log(d.view, d.cls, d.style) }
await browser.close(); server.close()
