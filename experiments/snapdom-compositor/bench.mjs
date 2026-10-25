// Runs bench.html in Chromium through Playwright and prints JSON results.
//   node experiments/snapdom-compositor/bench.mjs [--headed] [--only scene:mode] [--out file]
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const here = new URL('.', import.meta.url).pathname
const roots = {
  '/snapdom/': resolve(here, '../../../../../../snapdom') + '/',
  '/orbit/': resolve(here, '../../../../../../orbit') + '/',
  '/': resolve(here, '../..') + '/',
}
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  const prefix = Object.keys(roots).find(p => url.startsWith(p))
  try {
    const body = await readFile(join(roots[prefix], url.slice(prefix.length)))
    res.writeHead(200, { 'content-type': types[extname(url)] || 'application/octet-stream' })
    res.end(body)
  } catch { res.writeHead(404); res.end() }
}).listen(0)
const port = server.address().port

const args = process.argv.slice(2)
const headed = args.includes('--headed')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null
const extra = args.includes('--q') ? args[args.indexOf('--q') + 1] : ''
const rest = args.includes('--rest') ? +args[args.indexOf('--rest') + 1] : 0
const throttle = args.includes('--cpu') ? +args[args.indexOf('--cpu') + 1] : 1

const scenes = ['cards', 'blur', 'orbit']
const modes = ['baseline', 'flat', 'depth', 'both']
const browser = await chromium.launch({ headless: !headed, args: ['--enable-precise-memory-info', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'] })
const results = []
let gpuLogged = false
for (const scene of scenes) {
  for (const mode of modes) {
    if (only && !only.includes(`${scene}:${mode}`) && !only.includes(scene) && !only.includes(mode)) continue
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
    page.on('pageerror', e => console.error(`[${scene}:${mode}] pageerror`, e.message))
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error(`[${scene}:${mode}]`, m.text()) })
    if (throttle > 1) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
    }
    await page.goto(`http://localhost:${port}/experiments/snapdom-compositor/bench.html?scene=${scene}&mode=${mode}${extra}`)
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 })
    const r = await page.evaluate((rest) => window.bench({ rest }), rest)
    r.gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl')
      if (!gl) return 'no webgl'
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    })
    results.push(r)
    if (!gpuLogged) { console.log('gpu:', r.gpu, 'headed:', headed, 'cpu x', throttle); gpuLogged = true }
    const ins = r.steps.filter(s => s.kind === 'in'), outs = r.steps.filter(s => s.kind === 'out')
    const agg = (xs, k) => Math.max(...xs.map(x => x[k]))
    const avg = (xs, k) => +(xs.reduce((a, x) => a + x[k], 0) / xs.length).toFixed(1)
    console.log(`${scene.padEnd(6)} ${mode.padEnd(9)} in: mean ${avg(ins, 'mean')} p95max ${agg(ins, 'p95')} max ${agg(ins, 'max')} >34ms ${ins.reduce((a, x) => a + x.over34, 0)} first ${avg(ins, 'firstFrame')} | out: mean ${avg(outs, 'mean')} max ${agg(outs, 'max')} >34ms ${outs.reduce((a, x) => a + x.over34, 0)} | heap ${r.heapMB}MB canvas ${agg(r.steps, 'canvasMB')}MB nodes ${agg(r.steps, 'domNodes')} | ${r.plugin ? JSON.stringify(r.plugin) : ''}`)
    if (r.rests.length) {
      const lt = r.rests.reduce((a, x) => a + x.longTaskMs, 0), sm = r.rests.reduce((a, x) => a + x.streamMs, 0)
      const fr = r.rests.reduce((a, x) => a + x.streamFrames, 0), fu = r.rests.reduce((a, x) => a + x.streamFull, 0)
      const cap = r.rests.reduce((a, x) => a + x.captures, 0), mx = Math.max(...r.rests.map(x => x.max))
      console.log(`       rest (${r.rests.length}×${rest}ms): longTaskMs ${lt} streamMs ${sm} streamFrames ${fr} (full ${fu}) captures ${cap} worstFrame ${mx}`)
    }
    await page.close()
  }
}
await browser.close()
server.close()
if (out) await writeFile(out, JSON.stringify(results, null, 2))
