// What each mode looks like, frame by frame: one transition per mode, recorded with the trace's
// screenshots (one per presented frame), laid out as a contact sheet with a row per mode and
// the same instants in every column. Also reports the biggest jump between consecutive frames
// once the motion has ended (a "pop" when the bitmap gives way to the real view).
//
//   node experiments/snapdom-compositor/filmstrip.mjs --scene cards --kind out --level 2
//     [--modes baseline,noanim,flat,flat-noanim,flat-once] [--cond live|static] [--out dir]
//
// Screenshots cost frames: use fluidity.mjs for numbers, this for looking.
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const here = new URL('.', import.meta.url).pathname
const zumerlab = resolve(here, '../../..')
const roots = {
  '/snapdom/': (process.env.SNAPDOM_DIR || join(zumerlab, 'snapdom')) + '/',
  '/orbit/': (process.env.ORBIT_DIR || join(zumerlab, 'orbit')) + '/',
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
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const scene = arg('--scene', 'cards')
const kind = arg('--kind', 'out')
const level = +arg('--level', 2)
const modeNames = arg('--modes', 'baseline,noanim,flat,flat-noanim,flat-once').split(',')
const cond = arg('--cond', 'live')
const outDir = arg('--out', join(here, 'results/fluidity/film'))
const throttle = +arg('--cpu', 1)

const MODES = {
  baseline: 'mode=baseline',
  noanim: 'mode=baseline&ae=0',
  flat: 'mode=flat',
  'flat-noanim': 'mode=flat&ae=0',
  'flat-once': 'mode=flat&when=after',
  core: 'mode=core',
}
const CONDS = { static: '', live: '&live=1&animated=1&data=1' }
// Columns: ms after the motion starts. The zoom lasts 700 ms.
const COLUMNS = [0, 50, 100, 150, 200, 300, 400, 500, 600, 700, 750, 850, 1000]

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'],
})

const rows = []
for (const modeName of modeNames) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  page.on('pageerror', e => console.error(`[${modeName}] pageerror`, e.message))
  page.on('crash', () => console.error(`[${modeName}] renderer crashed`))
  page.on('close', () => console.error(`[${modeName}] page closed`))
  if (throttle > 1) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  }
  await page.goto(`http://localhost:${port}/experiments/snapdom-compositor/bench.html?scene=${scene}&${MODES[modeName]}${CONDS[cond]}`)
  await page.waitForFunction(() => window.ready, null, { timeout: 30000 })
  // Reach the level, then rest so captures are ready, as a user who looked around a bit.
  await page.evaluate((n) => window.zoomTo(n, 1200), kind === 'out' ? level : level - 1)
  await page.waitForTimeout(2500)
  await browser.startTracing(page, { screenshots: true, categories: ['blink.user_timing', 'disabled-by-default-devtools.screenshot'] })
  await page.evaluate((k) => k === 'out' ? window.zoomOutBy(1, 1200) : window.zoomTo(1, 0), kind)
  await page.waitForTimeout(1200)
  const trace = JSON.parse((await browser.stopTracing()).toString())
  const events = trace.traceEvents || trace
  const mark = (suffix) => events.find(e => typeof e.name === 'string' && e.name.startsWith('z:') && e.name.endsWith(suffix))?.ts
  const start = mark(':motion-start')
  const end = mark(':motion-end')
  const shots = events.filter(e => e.name === 'Screenshot' && e.args?.snapshot)
    .map(e => ({ t: (e.ts - start) / 1000, src: 'data:image/jpeg;base64,' + e.args.snapshot }))
    .sort((a, b) => a.t - b.t)
  rows.push({ mode: modeName, endT: (end - start) / 1000, shots })
  console.log(`${modeName}: ${shots.length} screenshots, motion ${((end - start) / 1000).toFixed(0)} ms`)
  await page.close()
}

// Contact sheet and frame-to-frame differences, drawn in a page.
const sheet = await browser.newPage({ viewport: { width: 1400, height: 400 } })
const report = await sheet.evaluate(async ({ rows, COLUMNS, title }) => {
  const load = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src })
  const W = 200, H = 140, LABEL = 110, TOP = 40
  const c = document.createElement('canvas')
  c.width = LABEL + COLUMNS.length * W
  c.height = TOP + rows.length * (H + 18)
  const g = c.getContext('2d')
  g.fillStyle = '#111'; g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#ddd'; g.font = '14px system-ui'
  g.fillText(title, 8, 18)
  COLUMNS.forEach((ms, i) => g.fillText(`${ms} ms`, LABEL + i * W + 6, TOP - 6))
  const diffCanvas = document.createElement('canvas')
  diffCanvas.width = 250; diffCanvas.height = 175
  const dg = diffCanvas.getContext('2d', { willReadFrequently: true })
  const pixels = async (src) => { dg.drawImage(await load(src), 0, 0, 250, 175); return dg.getImageData(0, 0, 250, 175).data }
  const out = []
  for (const [r, row] of rows.entries()) {
    const y = TOP + r * (H + 18)
    g.fillStyle = '#ddd'; g.fillText(row.mode, 6, y + H / 2)
    for (const [i, ms] of COLUMNS.entries()) {
      // The frame on screen at that instant: the last one presented before it.
      const shot = [...row.shots].reverse().find(s => s.t <= ms) || row.shots[0]
      if (!shot) continue
      g.drawImage(await load(shot.src), LABEL + i * W, y, W - 4, H)
      g.fillStyle = '#9ab'; g.font = '11px system-ui'
      g.fillText(`frame @${shot.t.toFixed(0)}`, LABEL + i * W + 4, y + H + 12)
      g.font = '14px system-ui'
    }
    // Mean absolute difference between consecutive frames, on a small copy.
    let prev = null
    const diffs = []
    for (const s of row.shots) {
      const px = await pixels(s.src)
      if (prev) {
        let d = 0
        for (let k = 0; k < px.length; k += 4) d += Math.abs(px[k] - prev[k]) + Math.abs(px[k + 1] - prev[k + 1]) + Math.abs(px[k + 2] - prev[k + 2])
        diffs.push({ t: s.t, d: d / (px.length / 4) / 3 })
      }
      prev = px
    }
    const after = diffs.filter(x => x.t > row.endT - 20 && x.t < row.endT + 400)
    const during = diffs.filter(x => x.t > 0 && x.t <= row.endT - 20)
    const gaps = row.shots.filter(s => s.t >= 0 && s.t <= row.endT).map(s => s.t)
    let maxGap = 0
    for (let k = 1; k < gaps.length; k++) maxGap = Math.max(maxGap, gaps[k] - gaps[k - 1])
    out.push({
      mode: row.mode,
      framesInMotion: gaps.length,
      maxGapMs: +maxGap.toFixed(0),
      popAfterEnd: +Math.max(0, ...after.map(x => x.d)).toFixed(1),
      popAt: after.length ? +after.reduce((a, x) => x.d > a.d ? x : a).t.toFixed(0) : null,
      stepDuringMedian: during.length ? +[...during.map(x => x.d)].sort((a, b) => a - b)[Math.floor(during.length / 2)].toFixed(1) : null,
    })
  }
  return { png: c.toDataURL('image/png'), out }
}, { rows, COLUMNS, title: `${scene} · ${cond} · zoom-${kind} to level ${kind === 'out' ? level - 1 : level} · ms after the motion starts` })

await mkdir(outDir, { recursive: true })
const file = join(outDir, `${scene}-${cond}-${kind}-L${level}${throttle > 1 ? `-cpu${throttle}` : ''}.png`)
await writeFile(file, Buffer.from(report.png.split(',')[1], 'base64'))
console.log(file)
for (const r of report.out) console.log(`${r.mode.padEnd(11)} frames in motion ${r.framesInMotion}  max gap ${r.maxGapMs} ms  median change/frame ${r.stepDuringMedian}  biggest change after end ${r.popAfterEnd} (at ${r.popAt} ms)`)
await browser.close()
server.close()
