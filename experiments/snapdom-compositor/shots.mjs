// Screenshots at each zoom level, per mode, for visual comparison.
//   node experiments/snapdom-compositor/shots.mjs <outDir> [scene] [modes] [query]
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
const [outDir, scene = 'cards', modesArg = 'baseline,depth,both', extra = ''] = process.argv.slice(2)
await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()
for (const mode of modesArg.split(',')) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  page.on('pageerror', e => console.error(mode, 'pageerror', e.message))
  await page.goto(`http://localhost:${server.address().port}/experiments/snapdom-compositor/bench.html?scene=${scene}&mode=${mode}${extra}`)
  await page.waitForFunction(() => window.ready)
  for (let l = 1; l <= 5; l++) {
    await page.evaluate(() => window.zoomTo(1, 900))
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${outDir}/${scene}-${mode}-L${l}.png` })
  }
  // and back out two levels, to check the backdrop stack
  await page.evaluate(() => window.zoomOutBy(2, 900))
  await page.screenshot({ path: `${outDir}/${scene}-${mode}-back-L3.png` })
  await page.close()
}
await browser.close(); server.close()
