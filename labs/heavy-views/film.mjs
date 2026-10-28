// A zoom frame by frame, as the eye gets it: one transition per variant of demo.html, recorded
// with the trace's screenshots (one per presented frame) and laid out as two contact sheets.
// The first covers the motion; the second, every frame around its end, where flatten
// crossfades from the photo to the real view. Also reports the longest gap between frames in
// the motion and in the tail, and the biggest change between two frames after the motion ends
// (a "pop").
//
//   node labs/heavy-views/film.mjs [--kind out|in] [--variants nf,f,nf-pane] [--cond asis|live]
//     [--out labs/heavy-views/results/film] [--w 220] [--tail -100,0,50] [--tag big] [--frames]
//
// --w sets the thumbnail width, --tail the instants of the second sheet (ms from the end), --tag
// a suffix for the files, and --frames lists every frame near the end with how much it changed.
//
// Screenshots cost frames: measure.mjs is for numbers, this is for looking.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createLabsServer } from '../serve.mjs'
import { VARIANTS, CONDS } from './variants.mjs'

const here = fileURLToPath(new URL('.', import.meta.url))
const args = process.argv.slice(2)
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const kind = arg('--kind', 'out')
const variantNames = arg('--variants', 'nf,f,nf-instant,nf-pane,f-pane').split(',')
const cond = arg('--cond', 'asis')
const outDir = arg('--out', join(here, 'results/film'))
const viewport = { width: 1280, height: 800 }
// ms after the motion starts (the zoom lasts 1 s), and ms around its end.
const MOTION = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
const TAIL = arg('--tail', '-100,-50,0,17,33,50,83,117,150,183,250,350,500').split(',').map(Number)
const thumbWidth = +arg('--w', 220)
const tag = arg('--tag', '')
const listFrames = args.includes('--frames')

for (const name of variantNames) if (!VARIANTS[name]) throw new Error(`unknown variant "${name}"`)

const server = createLabsServer().listen(0)
await new Promise(r => server.once('listening', r))
const port = server.address().port
const browser = await chromium.launch({
  headless: false,
  args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'],
})

const rows = []
for (const variant of variantNames) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  page.on('pageerror', e => console.error(`[${variant}] pageerror`, e.message))
  try {
    await page.goto(`http://localhost:${port}/labs/heavy-views/demo.html?${VARIANTS[variant]}${CONDS[cond]}`)
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 })
    await page.bringToFront()
    // A round first, so caches are warm; then reach the level and look around, so photos are ready.
    await page.evaluate(() => window.bench({ rounds: 1, settle: 600, restMs: 0 }))
    if (kind === 'out') await page.evaluate(() => window.step('in'))
    await page.waitForTimeout(2500)
    await browser.startTracing(page, { screenshots: true, categories: ['blink.user_timing', 'disabled-by-default-devtools.screenshot'] })
    await page.evaluate((k) => window.step(k), kind)
    await page.waitForTimeout(1200)
    const trace = JSON.parse((await browser.stopTracing()).toString())
    const events = trace.traceEvents || trace
    const mark = (suffix) => events.find(e => typeof e.name === 'string' && e.name.startsWith('z:') && e.name.endsWith(suffix))?.ts
    const start = mark(':motion-start')
    const end = mark(':motion-end')
    const shots = events.filter(e => e.name === 'Screenshot' && e.args?.snapshot)
      .map(e => ({ t: (e.ts - start) / 1000, src: 'data:image/jpeg;base64,' + e.args.snapshot }))
      .sort((a, b) => a.t - b.t)
    rows.push({ variant, endT: (end - start) / 1000, shots })
    console.log(`${variant}: ${shots.length} screenshots, motion ${((end - start) / 1000).toFixed(0)} ms`)
  } catch (e) {
    console.error(`! ${variant}: ${e.message.split('\n')[0]}`)
  } finally {
    await page.close().catch(() => {})
  }
}

// Contact sheets and frame-to-frame changes, drawn in a page.
const sheet = await browser.newPage({ viewport: { width: 1400, height: 400 } })
const report = await sheet.evaluate(async ({ rows, MOTION, TAIL, title, thumbWidth, ratio }) => {
  const load = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src })
  const W = thumbWidth, H = Math.round(thumbWidth * ratio), LABEL = 110, TOP = 40
  async function draw (columns, relativeToEnd, heading) {
    const c = document.createElement('canvas')
    c.width = LABEL + columns.length * W
    c.height = TOP + rows.length * (H + 18)
    const g = c.getContext('2d')
    g.fillStyle = '#111'
    g.fillRect(0, 0, c.width, c.height)
    g.fillStyle = '#ddd'
    g.font = '14px system-ui'
    g.fillText(heading, 8, 18)
    columns.forEach((ms, i) => g.fillText(relativeToEnd ? `end ${ms >= 0 ? '+' : ''}${ms}` : `${ms} ms`, LABEL + i * W + 6, TOP - 6))
    for (const [r, row] of rows.entries()) {
      const y = TOP + r * (H + 18)
      g.fillStyle = '#ddd'
      g.font = '14px system-ui'
      g.fillText(row.variant, 6, y + H / 2)
      for (const [i, ms] of columns.entries()) {
        const at = relativeToEnd ? row.endT + ms : ms
        // The frame on screen at that instant: the last one presented before it.
        const shot = [...row.shots].reverse().find(s => s.t <= at) || row.shots[0]
        if (!shot) continue
        g.drawImage(await load(shot.src), LABEL + i * W, y, W - 4, H)
        g.fillStyle = '#9ab'
        g.font = '11px system-ui'
        g.fillText(`frame @${shot.t.toFixed(0)}`, LABEL + i * W + 4, y + H + 12)
      }
    }
    return c.toDataURL('image/png')
  }
  const diffCanvas = document.createElement('canvas')
  diffCanvas.width = 256
  diffCanvas.height = 160
  const dg = diffCanvas.getContext('2d', { willReadFrequently: true })
  const pixels = async (src) => { dg.drawImage(await load(src), 0, 0, 256, 160); return dg.getImageData(0, 0, 256, 160).data }
  const out = []
  for (const row of rows) {
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
    const gap = (from, to) => {
      const ts = row.shots.filter(s => s.t >= from && s.t <= to).map(s => s.t)
      let max = 0
      for (let k = 1; k < ts.length; k++) max = Math.max(max, ts[k] - ts[k - 1])
      return { frames: ts.length, max: +max.toFixed(0) }
    }
    const after = diffs.filter(x => x.t > row.endT - 20 && x.t < row.endT + 500)
    const top = after.reduce((a, x) => (x.d > (a?.d ?? -1) ? x : a), null)
    out.push({
      variant: row.variant,
      motion: gap(0, row.endT),
      tail: gap(row.endT, row.endT + 500),
      popAfterEnd: top ? +top.d.toFixed(1) : 0,
      popAt: top ? +(top.t - row.endT).toFixed(0) : null,
      // Every frame from 250 ms before the end to 400 ms after: when it came and how much it changed.
      near: diffs.filter(x => x.t > row.endT - 250 && x.t < row.endT + 400).map(x => `${(x.t - row.endT).toFixed(0)}:${x.d.toFixed(1)}`),
    })
  }
  return { motion: await draw(MOTION, false, `${title} · ms after the motion starts`), tail: await draw(TAIL, true, `${title} · ms around its end`), out }
}, { rows, MOTION, TAIL, title: `${cond} · zoom-${kind}`, thumbWidth, ratio: viewport.height / viewport.width })

await mkdir(outDir, { recursive: true })
for (const part of ['motion', 'tail']) {
  const file = join(outDir, `${cond}-${kind}-${part}${tag ? '-' + tag : ''}.png`)
  await writeFile(file, Buffer.from(report[part].split(',')[1], 'base64'))
  console.log(file)
}
for (const r of report.out) {
  console.log(`${r.variant.padEnd(11)} motion: ${r.motion.frames} frames, longest gap ${r.motion.max} ms  |  tail: ${r.tail.frames} frames, longest gap ${r.tail.max} ms  |  biggest change after the end ${r.popAfterEnd} (end +${r.popAt} ms)`)
  if (listFrames) console.log(`   frames near the end (ms from the end : change) ${r.near.join('  ')}`)
}
await browser.close()
server.close()
