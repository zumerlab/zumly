// Fluidity as seen on screen: runs bench.html in headed Chromium with a trace and counts, per
// vsync, whether a frame was presented or dropped (PipelineReporter, the data behind DevTools'
// "dropped frames"). rAF only sees the main thread; CSS transforms run on the compositor, so
// this is closer to what the eye gets.
//
//   caffeinate -d node experiments/snapdom-compositor/fluidity.mjs [--scenes cards,blur,orbit]
//     [--modes baseline,noanim,dim,flat,flat-noanim,flat-once,flat-idle] [--conds static,live]
//     [--runs 2] [--cpu 4] [--rest 2000] [--out file.json]
//
// The numbers only mean something on a quiet machine with the window in sight: a run during
// which the keyboard or mouse was used (macOS HIDIdleTime) is marked as disturbed and redone
// at the end, up to --retries times. caffeinate -d keeps the display on (no display, no vsync).
//
// Needs snapdom/ and orbit/ next to zumly/ (or SNAPDOM_DIR / ORBIT_DIR).
import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
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
const scenes = arg('--scenes', 'cards,blur,orbit').split(',')
const modeNames = arg('--modes', 'baseline,noanim,dim,flat,flat-once').split(',')
const conds = arg('--conds', 'static,live').split(',')
const runs = +arg('--runs', 1)
const throttle = +arg('--cpu', 1)
const restMs = +arg('--rest', 2000)
const out = arg('--out', null)
const retries = +arg('--retries', 2)
const levels = +arg('--levels', 6) // levels - 1 zoom-ins, then as many zoom-outs
const settle = +arg('--settle', 1200) // ms at each level before the next zoom
const dpr = +arg('--dpr', 1) // 2 for a Retina screen

const MODES = {
  baseline: 'mode=baseline',
  noanim: 'mode=baseline&ae=0',
  dim: 'mode=baseline&effects=dim', // brightness only, no blur
  flat: 'mode=flat',
  'flat-noanim': 'mode=flat&ae=0',
  'flat-once': 'mode=flat&when=after', // no stream: one capture at rest, after the transition
  'flat-idle': 'mode=flat&source=once', // no stream: one capture at idle while the view is current
  'flat-idle-yield': 'mode=flat&source=once&fast=0', // the same, with SnapDOM's fast: false
  'flat-yield': 'mode=flat&fast=0', // stream, with SnapDOM's fast: false
  core: 'mode=core', // the engine's flatten option, with stream
  'core-nostream': 'mode=core-nostream', // the engine's flatten option, one photo
}
const CONDS = {
  static: '',
  live: '&live=1&animated=1&data=1',
}

/** Seconds since the last keyboard or mouse input (macOS), or Infinity elsewhere. */
function userIdleSeconds () {
  try {
    const ns = execSync('ioreg -c IOHIDSystem', { encoding: 'utf8' }).match(/"HIDIdleTime" = (\d+)/)
    return ns ? Number(ns[1]) / 1e9 : Infinity
  } catch { return Infinity }
}

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-precise-memory-info', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'],
})

/** One vsync per frame_sequence: presented, dropped (affecting smoothness) or idle. */
function framesOf (events, pid) {
  const bySeq = new Map()
  for (const e of events) {
    if (e.name !== 'PipelineReporter' || e.ph !== 'b' || e.pid !== pid) continue
    const r = e.args?.frame_reporter
    if (!r) continue
    const key = `${r.frame_source}:${r.frame_sequence}`
    const f = bySeq.get(key) || { ts: e.ts, presented: false, dropped: false, missing: false }
    f.ts = Math.min(f.ts, e.ts)
    if (r.state === 'STATE_PRESENTED_ALL' || r.state === 'STATE_PRESENTED_PARTIAL') {
      f.presented = true
      if (r.has_missing_content || r.checkerboarded_needs_raster || r.checkerboarded_needs_record) f.missing = true
    }
    if (r.state === 'STATE_DROPPED' && r.affects_smoothness) f.dropped = true
    bySeq.set(key, f)
  }
  return [...bySeq.values()].sort((a, b) => a.ts - b.ts)
}

function windowStats (frames, from, to) {
  const inWin = frames.filter(f => f.ts >= from && f.ts <= to)
  const presented = inWin.filter(f => f.presented && !f.dropped)
  const dropped = inWin.filter(f => f.dropped).length
  const missing = presented.filter(f => f.missing).length
  let maxGap = 0
  let gapAt = 0
  let prev = from
  for (const f of presented) {
    if (f.ts - prev > maxGap) { maxGap = f.ts - prev; gapAt = prev - from }
    prev = f.ts
  }
  if (to - prev > maxGap) { maxGap = to - prev; gapAt = prev - from }
  // A pause with nothing to draw (motion over, nothing alive on screen) presents no frame
  // either; what the eye sees as a hitch is a run of dropped frames.
  let run = 0
  let maxDroppedRun = 0
  for (const f of inWin) {
    if (f.dropped) maxDroppedRun = Math.max(maxDroppedRun, ++run)
    else if (f.presented) run = 0
  }
  return { presented: presented.length, dropped, missing, maxGapMs: +(maxGap / 1000).toFixed(1), gapAtMs: Math.round(gapAt / 1000), maxDroppedRun }
}

function analyse (traceBuf) {
  const trace = JSON.parse(traceBuf.toString())
  const events = trace.traceEvents || trace
  const marks = events.filter(e => typeof e.name === 'string' && e.name.startsWith('z:') && (e.ph === 'R' || e.ph === 'I' || e.ph === 'n'))
  const pid = marks[0]?.pid
  const frames = framesOf(events, pid)
  const at = new Map(marks.map(m => [m.name, m.ts]))
  const steps = []
  const rests = []
  for (let i = 1; ; i++) {
    const clickName = [...at.keys()].find(k => k.startsWith(`z:${i}:`) && k.endsWith(':click'))
    if (!clickName) break
    const kind = clickName.split(':')[2]
    const click = at.get(clickName)
    const start = at.get(`z:${i}:motion-start`)
    const end = at.get(`z:${i}:motion-end`)
    if (!start || !end) continue
    const motion = windowStats(frames, start, end + 50000)
    const tail = windowStats(frames, end + 50000, end + 400000)
    const first = frames.find(f => f.ts > start && f.presented)
    steps.push({ kind, motionMs: Math.round((end - start) / 1000), ...motion, tailDropped: tail.dropped, tailMaxGapMs: tail.maxGapMs, latencyMs: first ? +((first.ts - click) / 1000).toFixed(0) : null })
    const rs = at.get(`z:${i}:rest-start`), re = at.get(`z:${i}:rest-end`)
    if (rs && re) rests.push(windowStats(frames, rs, re))
  }
  return { steps, rests }
}

const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0)

function summarise (steps, rests) {
  const frames = sum(steps, 'presented') + sum(steps, 'dropped')
  const r = {
    droppedPct: +(100 * sum(steps, 'dropped') / (frames || 1)).toFixed(1),
    stutters: steps.filter(s => s.maxDroppedRun >= 3).length, // 3+ dropped vsyncs in a row: a visible hitch
    worstDroppedRun: Math.max(0, ...steps.map(s => s.maxDroppedRun)),
    gapMedian: median(steps.map(s => s.maxGapMs)),
    gapWorst: Math.max(...steps.map(s => s.maxGapMs)),
    missingPerT: +(sum(steps, 'missing') / steps.length).toFixed(1),
    tailDropped: sum(steps, 'tailDropped'),
    latency: median(steps.map(s => s.latencyMs)),
  }
  if (rests.length) {
    const rf = sum(rests, 'presented') + sum(rests, 'dropped')
    r.restDroppedPct = +(100 * sum(rests, 'dropped') / (rf || 1)).toFixed(1)
    r.restGapWorst = Math.max(...rests.map(s => s.maxGapMs))
  }
  return r
}

async function measure (run, cond, scene, modeName) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: dpr })
  try {
    page.on('pageerror', e => console.error(`[${scene}:${modeName}] pageerror`, e.message))
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) console.error(`[${scene}:${modeName}] ${r.status()} ${r.url()}`) })
    if (throttle > 1) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
    }
    await page.goto(`http://localhost:${port}/experiments/snapdom-compositor/bench.html?scene=${scene}&levels=${levels}&${MODES[modeName]}${CONDS[cond]}`)
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 })
    await page.bringToFront()
    const t0 = Date.now()
    await browser.startTracing(page, { categories: ['benchmark', 'blink.user_timing'] })
    const page_ = await page.evaluate(([rest, settle]) => window.bench({ rest, settle }), [cond === 'live' ? restMs : 0, settle])
    const { steps, rests } = analyse(await browser.stopTracing())
    const disturbed = userIdleSeconds() < (Date.now() - t0) / 1000
    const raf = +(page_.steps.reduce((a, s) => a + s.mean, 0) / page_.steps.length).toFixed(1)
    const summary = summarise(steps, rests)
    const arrivals = page_.steps.map(s => s.arrivalLongest ?? 0)
    summary.arrivalLongestMedian = median(arrivals)
    summary.arrivalLongestWorst = Math.max(...arrivals)
    const ins = summarise(steps.filter(s => s.kind === 'in'), [])
    const outs = summarise(steps.filter(s => s.kind === 'out'), [])
    console.log([
      disturbed ? '~' : ' ', cond.padEnd(6), scene.padEnd(5), modeName.padEnd(11),
      `drop ${String(summary.droppedPct).padStart(5)}%`,
      `hitches ${summary.stutters}/${steps.length} (worst run ${summary.worstDroppedRun})`,
      `gap med ${summary.gapMedian} worst ${summary.gapWorst}`,
      `missing/t ${summary.missingPerT}`,
      `tailDrop ${summary.tailDropped}`,
      `lat ${summary.latency}`,
      summary.restDroppedPct != null ? `| rest drop ${summary.restDroppedPct}% worst gap ${summary.restGapWorst}` : '',
      `| arrival task med ${summary.arrivalLongestMedian} worst ${summary.arrivalLongestWorst}`,
      `| in ${ins.droppedPct}% out ${outs.droppedPct}% | raf ${raf}`,
      // GAPS=1: where each transition's longest pause falls (ms after the motion starts / motion length).
      process.env.GAPS ? '\n     ' + steps.map(s => `${s.kind} gap ${s.maxGapMs}@${s.gapAtMs}/${s.motionMs} run ${s.maxDroppedRun}`).join('  ') : '',
    ].join('  '))
    return { run, cond, scene, mode: modeName, cpu: throttle, disturbed, summary, ins, outs, rafMean: raf, heapMB: page_.heapMB, plugin: page_.plugin, steps, rests, pageSteps: page_.steps, pageRests: page_.rests }
  } catch (e) {
    console.error(`! ${cond} ${scene} ${modeName}: ${e.message.split('\n')[0]}`)
    return null
  } finally {
    await page.close().catch(() => {})
  }
}

// Modes of one scene run back to back, in an order that rotates between runs.
const results = []
let queue = []
for (let run = 0; run < runs; run++) {
  for (const cond of conds) {
    for (const scene of scenes) {
      const order = modeNames.map((_, i) => modeNames[(i + run) % modeNames.length])
      for (const modeName of order) queue.push({ run, cond, scene, modeName })
    }
  }
}
for (let attempt = 0; attempt <= retries && queue.length; attempt++) {
  if (attempt) console.log(`-- redoing ${queue.length} disturbed or failed runs`)
  const redo = []
  for (const job of queue) {
    const r = await measure(job.run, job.cond, job.scene, job.modeName)
    if (r) results.push({ ...r, attempt })
    if (!r || r.disturbed) redo.push(job)
  }
  queue = redo
  if (out) await writeFile(out, JSON.stringify(results, null, 2))
}
await browser.close()
server.close()
