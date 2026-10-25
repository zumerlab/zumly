// At a given level in mode=flat, screenshot the previous view live vs flattened (A/B the layer).
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
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
const [outDir, scene = 'orbit', levels = '2', extra = ''] = process.argv.slice(2)
await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
page.on('pageerror', e => console.error('pageerror', e.message))
await page.goto(`http://localhost:${server.address().port}/experiments/snapdom-compositor/bench.html?scene=${scene}&mode=flat${extra}`)
await page.waitForFunction(() => window.ready)
await page.evaluate((n) => window.zoomTo(n, 900), +levels)
await page.waitForTimeout(1500)
const sel = process.env.ROLE || '.is-previous-view'
await page.evaluate((sel) => { document.querySelectorAll('.z-view').forEach(v => { if (!v.matches(sel)) v.style.opacity = 0 }) }, sel)
await page.screenshot({ path: `${outDir}/${scene}-flat.png` })
await page.evaluate((sel) => document.querySelector(sel).classList.remove('z-flat'), sel)
await page.evaluate(() => document.querySelectorAll('.z-flat-layer').forEach(l => { l.style.display = 'none' }))
await page.screenshot({ path: `${outDir}/${scene}-live.png` })
await browser.close(); server.close()
