// Runs the variants of labs/heavy-views/demo.html in headed Chromium with a trace, at dpr 2.
// Counts what reaches the screen (presented and dropped frames per vsync, as fluidity.mjs in
// experiments/snapdom-compositor) and how busy each thread was while views moved: the page's
// main thread, its compositor and raster workers, and the GPU process.
//
//   caffeinate -d node labs/heavy-views/measure.mjs [--variants f,nf,f-moving] [--conds asis,live]
//     [--runs 2] [--rounds 3] [--cpu 4] [--out labs/heavy-views/results/step0.json] [--threads]
//     [--no-warmup] [--channel chrome] [--hover 250]
//
//   --hover rests the pointer that many ms on a trigger before each zoom-in.
//   --stream-from ../snapdom serves the stream plugin from a SnapDOM working tree, to measure
//   a fix before it is published.
//   --channel chrome measures in the installed Google Chrome instead of Playwright's Chromium.
//
// --threads prints the top-level trace events of each thread group, to check the attribution.
import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'
import { createLabsServer } from '../serve.mjs'
import { VARIANTS, CONDS } from './variants.mjs'
import { framesOf, windowStats, median } from './trace-stats.mjs'

const args = process.argv.slice(2)
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const variantNames = arg('--variants', Object.keys(VARIANTS).join(',')).split(',')
const conds = arg('--conds', 'asis,live').split(',')
const runs = +arg('--runs', 2)
const rounds = +arg('--rounds', 3)
const throttle = +arg('--cpu', 1)
const settle = +arg('--settle', 1200)
const restMs = +arg('--rest', 2000)
const out = arg('--out', null)
const showThreads = args.includes('--threads')
const channel = arg('--channel', undefined)
const hover = +arg('--hover', 0)
const streamFrom = arg('--stream-from', null)
const viewport = { width: 1280, height: 800 }

for (const name of variantNames) if (!VARIANTS[name]) throw new Error(`unknown variant "${name}"`)

const server = createLabsServer().listen(0)
await new Promise(r => server.once('listening', r))
const port = server.address().port

const browser = await chromium.launch({
  headless: false,
  channel,
  args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-background-timer-throttling'],
})

// ── Threads: busy time of top-level tasks, per group ──────────────────

const TASKS = new Set(['ThreadControllerImpl::RunTask', 'ThreadPool_RunTask', 'TaskGraphRunner::RunTask'])

function threadNames (events) {
  const threads = new Map()
  const processes = new Map()
  for (const e of events) {
    if (e.ph !== 'M') continue
    if (e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args?.name || '')
    else if (e.name === 'process_name') processes.set(e.pid, e.args?.name || '')
  }
  return { threads, processes }
}

function groupOf (e, pagePid, names) {
  const thread = names.threads.get(`${e.pid}:${e.tid}`) || ''
  if (e.pid === pagePid) {
    if (thread === 'CrRendererMain') return 'main'
    if (thread === 'Compositor') return 'impl'
    if (thread.startsWith('CompositorTileWorker')) return 'raster'
    return null
  }
  if (names.processes.get(e.pid) === 'GPU Process') {
    if (thread === 'CrGpuMain') return 'gpu'
    if (thread === 'VizCompositorThread') return 'viz'
  }
  return null
}

/** Share of the window (0-100) each group spent in top-level tasks. */
function busyIn (tasks, from, to) {
  const us = {}
  for (const t of tasks) {
    const s = Math.max(t.ts, from)
    const e = Math.min(t.ts + t.dur, to)
    if (e > s) us[t.group] = (us[t.group] || 0) + (e - s)
  }
  return Object.fromEntries(Object.entries(us).map(([g, v]) => [g, Math.round(100 * v / (to - from))]))
}

function analyse (traceBuf) {
  const trace = JSON.parse(traceBuf.toString())
  const events = trace.traceEvents || trace
  const marks = events.filter(e => typeof e.name === 'string' && e.name.startsWith('z:') && (e.ph === 'R' || e.ph === 'I' || e.ph === 'n'))
  const pid = marks[0]?.pid
  const frames = framesOf(events, pid)
  const names = threadNames(events)
  const tasks = []
  const seen = {}
  for (const e of events) {
    if (e.ph !== 'X' || typeof e.dur !== 'number') continue
    const group = groupOf(e, pid, names)
    if (!group) continue
    if (showThreads) ((seen[group] ||= {})[e.name] = ((seen[group] ||= {})[e.name] || 0) + 1)
    if (TASKS.has(e.name)) tasks.push({ ts: e.ts, dur: e.dur, group })
  }
  if (showThreads) {
    for (const [group, counts] of Object.entries(seen)) {
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, c]) => `${n} ×${c}`).join(', ')
      console.log(`   [${group}] ${top}`)
    }
  }
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
    const first = frames.find(f => f.ts > start && f.presented)
    // --hover: the frames while the pointer rests on the trigger, before the click.
    const hovered = at.get(`z:${i}:hover`)
    const hoverStats = hovered ? windowStats(frames, hovered, click) : { dropped: 0, presented: 0 }
    // After the motion, flatten crossfades from the photo to the real view (160 ms) and the
    // engine updates the nav, focus and photos: the tail, until half a second later.
    const tail = windowStats(frames, end + 50000, end + 500000)
    steps.push({
      kind,
      hoverDropped: hoverStats.dropped,
      hoverPresented: hoverStats.presented,
      motionMs: Math.round((end - start) / 1000),
      tailDropped: tail.dropped,
      tailPresented: tail.presented,
      tailRun: tail.maxDroppedRun,
      tailBusy: busyIn(tasks, end, end + 500000),
      ...windowStats(frames, start, end + 50000),
      latencyMs: first ? Math.round((first.ts - click) / 1000) : null,
      // From the click to the motion: with launch=1, the photo of the view coming in is taken first.
      startMs: Math.round((start - click) / 1000),
      busy: busyIn(tasks, start, end),
      // From the click to the first moving frame: what makes the zoom start late.
      preBusy: busyIn(tasks, click, first ? first.ts : start),
    })
    const rs = at.get(`z:${i}:rest-start`)
    const re = at.get(`z:${i}:rest-end`)
    if (rs && re) rests.push({ on: kind === 'in' ? 'detail' : 'board', ...windowStats(frames, rs, re), busy: busyIn(tasks, rs, re) })
  }
  return { steps, rests }
}

// ── Summaries ─────────────────────────────────────────────────────────

const pct = (items, dropped = 'dropped', presented = 'presented') => {
  const d = items.reduce((a, x) => a + x[dropped], 0)
  const all = items.reduce((a, x) => a + x[dropped] + x[presented], 0)
  return all ? +(100 * d / all).toFixed(1) : null
}
const busyMedian = (items, key = 'busy') => {
  const groups = ['main', 'impl', 'raster', 'gpu', 'viz']
  return Object.fromEntries(groups.map(g => [g, median(items.map(x => x[key][g] ?? 0))]))
}

function summarise ({ steps, rests }) {
  const ins = steps.filter(s => s.kind === 'in')
  const outs = steps.filter(s => s.kind === 'out')
  return {
    inDropped: pct(ins),
    outDropped: pct(outs),
    inTail: pct(ins, 'tailDropped', 'tailPresented'),
    hoverDropped: pct(ins, 'hoverDropped', 'hoverPresented'),
    outTail: pct(outs, 'tailDropped', 'tailPresented'),
    hitches: steps.filter(s => s.maxDroppedRun >= 3 || s.tailRun >= 3).length, // 3+ dropped vsyncs in a row: a visible hitch
    zooms: steps.length,
    worstRun: Math.max(0, ...steps.map(s => s.maxDroppedRun)),
    latencyIn: median(ins.map(s => s.latencyMs)),
    latencyOut: median(outs.map(s => s.latencyMs)),
    startIn: median(ins.map(s => s.startMs)),
    // From the driver call to its completion. A zoom that ends on the safety timer lasts
    // duration + 150 ms, and the last frame holds still for those 150 ms.
    motionIn: median(ins.map(s => s.motionMs)),
    motionOut: median(outs.map(s => s.motionMs)),
    restDetail: pct(rests.filter(r => r.on === 'detail')),
    restBoard: pct(rests.filter(r => r.on === 'board')),
    busyIn: busyMedian(ins),
    busyOut: busyMedian(outs),
    preBusyIn: busyMedian(ins, 'preBusy'),
    busyRest: busyMedian(rests),
  }
}

const fmtBusy = (b) => `main ${b.main ?? '-'} impl ${b.impl ?? '-'} raster ${b.raster ?? '-'} gpu ${b.gpu ?? '-'} viz ${b.viz ?? '-'}`
const line = (cond, variant, s) => [
  cond.padEnd(5), variant.padEnd(10),
  `in ${String(s.inDropped).padStart(5)}%`, `out ${String(s.outDropped).padStart(5)}%`,
  `tail ${s.inTail}%/${s.outTail}%`,
  ...(hover ? [`hover ${s.hoverDropped}%`] : []),
  `hitches ${s.hitches}/${s.zooms} (run ${s.worstRun})`,
  `start ${s.startIn}${s.photoIn != null ? ` (photo ${s.photoIn}, overflow ${s.overflowIn}${s.early ? `, ${s.early} ready on hover` : ''})` : ''}`,
  `lat ${s.latencyIn}/${s.latencyOut}`,
  `motion ${s.motionIn}/${s.motionOut} ms`,
  `rest ${s.restDetail}%/${s.restBoard}%`,
  `| in: ${fmtBusy(s.busyIn)}`,
  `| out: ${fmtBusy(s.busyOut)}`,
].join('  ')

// ── Runs ──────────────────────────────────────────────────────────────

async function measure (run, cond, variant) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  try {
    page.on('pageerror', e => console.error(`[${variant}] pageerror`, e.message))
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) console.error(`[${variant}] ${r.status()} ${r.url()}`) })
    if (streamFrom) {
      await page.route('**/node_modules/@zumer/snapdom-plugins/stream/src/*.js', route => route.fulfill({
        body: readFileSync(join(streamFrom, 'packages/plugins/stream/src', new URL(route.request().url()).pathname.split('/').pop())),
        contentType: 'text/javascript'
      }))
    }
    if (throttle > 1) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
    }
    await page.goto(`http://localhost:${port}/labs/heavy-views/demo.html?${VARIANTS[variant]}${CONDS[cond]}`)
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 })
    await page.bringToFront()
    await browser.startTracing(page, { categories: ['benchmark', 'blink.user_timing', 'toplevel'] })
    await page.evaluate(([r, s, rest, h]) => window.bench({ rounds: r, settle: s, restMs: rest, hover: h }), [rounds, settle, restMs, hover])
    const result = analyse(await browser.stopTracing())
    // What the zoom-ins waited for, with gl=1: the photo of the view coming in, the overflow bands.
    const launches = await page.evaluate(() => window.launchLog.filter(e => e.type === 'zoomIn'))
    const summary = { ...summarise(result), photoIn: median(launches.map(e => e.photoMs ?? 0)), overflowIn: median(launches.map(e => e.overflowMs ?? 0)), early: launches.filter(e => e.early).length }
    console.log(line(cond, variant, summary))
    return { run, cond, variant, query: VARIANTS[variant] + CONDS[cond], cpu: throttle, hover, summary, launches, ...result }
  } catch (e) {
    // Chromium windows sometimes close on their own in long runs: note it and go on.
    console.error(`! ${cond} ${variant}: ${e.message.split('\n')[0]}`)
    return null
  } finally {
    await page.close().catch(() => {})
  }
}

const jobs = []
for (let run = 0; run < runs; run++) {
  for (const cond of conds) {
    // The order rotates between runs, so no variant always goes first.
    const order = variantNames.map((_, i) => variantNames[(i + run) % variantNames.length])
    for (const variant of order) jobs.push({ run, cond, variant })
  }
}
// A fresh browser pays for cold caches and shader compilation on its first page (14.5% dropped
// on the first zoom-in of 28/10): one untraced round first, so no variant is measured cold.
if (!args.includes('--no-warmup')) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  try {
    await page.goto(`http://localhost:${port}/labs/heavy-views/demo.html?${VARIANTS.f}`)
    await page.waitForFunction(() => window.ready, null, { timeout: 30000 })
    await page.evaluate(() => window.bench({ rounds: 1, settle: 600, restMs: 0 }))
  } catch (e) {
    console.error(`! warm-up: ${e.message.split('\n')[0]}`)
  } finally {
    await page.close().catch(() => {})
  }
}
console.log(`${jobs.length} runs at dpr 2, ${viewport.width}×${viewport.height}, CPU ${throttle}×${channel ? `, ${channel}` : ''}${streamFrom ? `, stream from ${streamFrom}` : ''}`)
const results = []
for (const job of jobs) {
  const r = await measure(job.run, job.cond, job.variant)
  if (r) results.push(r)
  if (out) {
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, JSON.stringify(results, null, 2))
  }
}

// One line per variant and condition: the median of its runs.
if (runs > 1) {
  console.log('\nMedians across runs')
  for (const cond of conds) {
    for (const variant of variantNames) {
      const mine = results.filter(r => r.cond === cond && r.variant === variant).map(r => r.summary)
      if (!mine.length) continue
      const m = (key) => median(mine.map(s => s[key]))
      const mb = (key) => Object.fromEntries(['main', 'impl', 'raster', 'gpu', 'viz'].map(g => [g, median(mine.map(s => s[key][g]))]))
      console.log(line(cond, variant, {
        inDropped: m('inDropped'), outDropped: m('outDropped'), inTail: m('inTail'), outTail: m('outTail'), hoverDropped: m('hoverDropped'), hitches: m('hitches'), zooms: mine[0].zooms, worstRun: m('worstRun'),
        startIn: m('startIn'), photoIn: m('photoIn'), overflowIn: m('overflowIn'), early: m('early'), latencyIn: m('latencyIn'), latencyOut: m('latencyOut'), motionIn: m('motionIn'), motionOut: m('motionOut'), restDetail: m('restDetail'), restBoard: m('restBoard'),
        busyIn: mb('busyIn'), busyOut: mb('busyOut'),
      }))
    }
  }
}
await browser.close()
server.close()
