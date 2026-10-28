// Records a Chrome performance trace as DevTools' Performance panel does (the same categories,
// screenshots included) while zooming in and out with real mouse clicks, and saves it gzipped.
// Open it in DevTools › Performance › Load profile.
//
//   node labs/heavy-views/trace.mjs [--url <page>] [--out <file.json.gz>] [--rounds 3]
//
// Defaults to the lab demo, which runs the local engine. To compare with what is published:
//   --url https://zumerlab.com/zumly/guides/examples/heavy.html
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'
import { createLabsServer } from '../serve.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const args = process.argv.slice(2)
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const rounds = +arg('--rounds', 3)
const out = arg('--out', join(here, 'results/traces/lab.json.gz'))

// What DevTools records, plus the compositor and GPU, where a zoom spends its time.
const CATEGORIES = [
  'devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-devtools.timeline.stack', 'disabled-by-default-devtools.screenshot',
  'v8.execute', 'disabled-by-default-v8.cpu_profiler', 'blink.user_timing', 'blink.animations',
  'latencyInfo', 'loading', 'toplevel', 'benchmark', 'cc', 'gpu',
]

const server = createLabsServer().listen(0)
await new Promise(r => server.once('listening', r))
const url = arg('--url', `http://localhost:${server.address().port}/labs/heavy-views/demo.html`)
const browser = await chromium.launch({
  headless: false,
  args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
page.on('pageerror', e => console.error('pageerror', e.message))
await page.goto(url)
await page.waitForSelector('.zumly-canvas > .z-view.is-current-view .zoom-me')
await page.bringToFront()
// Look around first, as someone would: the photo of the board is ready by then.
await page.waitForTimeout(2500)

await browser.startTracing(page, { screenshots: true, categories: CATEGORIES })
for (let i = 0; i < rounds; i++) {
  await page.locator('.zumly-canvas > .z-view.is-current-view .zoom-me').nth(i).click()
  await page.waitForTimeout(2500)
  // Back with the ring button, as a person would; the canvas corner otherwise.
  const back = page.locator('.z-nav-back')
  if (await back.count()) await back.first().click()
  else await page.mouse.click(8, 8)
  await page.waitForTimeout(2500)
}
const trace = await browser.stopTracing()
await mkdir(dirname(out), { recursive: true })
await writeFile(out, gzipSync(trace))
console.log(`${out} (${(trace.length / 1048576).toFixed(1)} MB of JSON)`)
await browser.close()
server.close()
