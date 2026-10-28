// Reads Chrome performance traces of the heavy views demo and compares them zoom by zoom: from
// the release of the press to the motion, the motion, how it ends on screen, and the main
// thread's long tasks afterwards. It needs none of the demo's marks, so it reads traces of the
// published guide as well as those of DevTools' Performance panel, trace.mjs or the
// chrome-devtools MCP.
//
//   node labs/heavy-views/read-trace.mjs <trace.json.gz> [<trace.json.gz> …] [--json out.json] [--no-shots]
//
// Screenshots, when the trace has them, are compared frame to frame in a headless page: the
// biggest change after the motion ends is the "pop" (a view that vanishes at once), and the
// longest gap between them is a pause.
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { chromium } from 'playwright'
import { framesOf, windowStats, median } from './trace-stats.mjs'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const arg = (name) => flag(name) ? args[args.indexOf(name) + 1] : null
const files = args.filter(a => (a.endsWith('.json.gz') || a.endsWith('.json')) && a !== arg('--json'))
const shots = !flag('--no-shots')
const LONG_US = 50000
// After a zoom: until the next one, or this long.
const AFTER_US = 2500000

async function load (file) {
  const buf = await readFile(file)
  const json = JSON.parse((buf[0] === 0x1f ? gunzipSync(buf) : buf).toString())
  return json.traceEvents || json
}

/** The page's renderer and its main thread. */
function pageThread (events) {
  const started = events.find(e => e.name === 'TracingStartedInBrowser')
  const frame = started?.args?.data?.frames?.find(f => f.isOutermostMainFrame) || started?.args?.data?.frames?.[0]
  const pid = frame?.processId ?? events.find(e => e.name === 'Animation')?.pid
  const main = events.find(e => e.ph === 'M' && e.name === 'thread_name' && e.pid === pid && e.args?.name === 'CrRendererMain')
  return { pid, tid: main?.tid, url: frame?.url }
}

/** Animations of the page, begin and end paired by id (ids are reused, so in order). */
function animations (events, pid) {
  const open = new Map()
  const list = []
  for (const e of events) {
    if (e.name !== 'Animation' || e.pid !== pid) continue
    const id = e.id2?.local ?? e.id?.local ?? e.id
    if (e.ph === 'b') {
      const a = { id, start: e.ts, end: null, name: e.args?.data?.displayName || '', node: e.args?.data?.nodeName || '', failed: 0 }
      open.set(id, a)
      list.push(a)
    } else if (e.ph === 'e') {
      const a = open.get(id)
      if (a) { a.end = e.ts; open.delete(id) }
    } else if (e.ph === 'n' && e.args?.data?.compositeFailed) {
      const a = open.get(id)
      if (a) a.failed = e.args.data.compositeFailed
    }
  }
  return list
}

function analyse (events) {
  const { pid, tid, url } = pageThread(events)
  const frames = framesOf(events, pid)
  const anims = animations(events, pid)
  const releases = events.filter(e => e.name === 'EventDispatch' && e.pid === pid && e.args?.data?.type === 'pointerup').map(e => e.ts).sort((a, b) => a - b)
  const mainTasks = events.filter(e => e.name === 'RunTask' && e.ph === 'X' && e.pid === pid && e.tid === tid)
  const tasks = mainTasks.filter(e => e.dur >= LONG_US)
  const gpuPid = events.find(e => e.ph === 'M' && e.name === 'process_name' && e.args?.name === 'GPU Process')?.pid
  const gpuTid = events.find(e => e.ph === 'M' && e.name === 'thread_name' && e.pid === gpuPid && e.args?.name === 'CrGpuMain')?.tid
  const gpuTasks = events.filter(e => e.name === 'RunTask' && e.ph === 'X' && e.pid === gpuPid && e.tid === gpuTid)
  // Share of a window (0-100) a thread spent in tasks, and its longest task there (ms).
  const busy = (list, from, to) => {
    let us = 0
    let longest = 0
    for (const t of list) {
      const s = Math.max(t.ts, from)
      const e = Math.min(t.ts + t.dur, to)
      if (e > s) { us += e - s; longest = Math.max(longest, t.dur) }
    }
    return { pct: Math.round(100 * us / (to - from)), longest: Math.round(longest / 1000) }
  }
  const zooms = anims.filter(a => a.name === 'zoom-current-view').sort((a, b) => a.start - b.start)
  const steps = zooms.map((z, i) => {
    const kind = z.node.includes('zoom-current-view-reverse') ? 'out' : 'in'
    const release = [...releases].reverse().find(t => t <= z.start && z.start - t < 2000000)
    const end = z.end ?? z.start
    const next = zooms[i + 1]?.start ?? Infinity
    const firstFrame = frames.find(f => f.ts > z.start && f.presented && !f.dropped)
    const after = Math.min(end + AFTER_US, next)
    const long = tasks.filter(t => t.ts >= end && t.ts < after).map(t => Math.round(t.dur / 1000))
    // Effects and fades that ran with this zoom, and whether the compositor could run them.
    const alongside = anims.filter(a => a !== z && a.start >= z.start - 50000 && a.start <= end)
    return {
      kind,
      start: z.start,
      end,
      // From the release of the press to the motion: the engine's work before it starts.
      releaseToStart: release != null ? Math.round((z.start - release) / 1000) : null,
      startToFrame: firstFrame ? Math.round((firstFrame.ts - z.start) / 1000) : null,
      motionMs: Math.round((end - z.start) / 1000),
      ...windowStats(frames, z.start, end + 50000),
      // The half second after: flatten's swap back, the nav, focus and the next photo.
      tail: windowStats(frames, end + 50000, end + 500000),
      longAfter: long,
      // While views move: what the main thread and the GPU process did.
      main: busy(mainTasks, z.start, end),
      gpu: busy(gpuTasks, z.start, end),
      notComposited: [...new Set(alongside.filter(a => a.failed).map(a => `${a.name || 'anon'}:${a.failed}`))],
    }
  })
  const shotsList = events.filter(e => e.name === 'Screenshot' && e.args?.snapshot).map(e => ({ ts: e.ts, data: e.args.snapshot })).sort((a, b) => a.ts - b.ts)
  return { url, steps, shots: shotsList, frames: frames.length }
}

/** Frame-to-frame changes of the screenshots around each zoom, in a headless page. */
async function screenChanges (browser, result) {
  const page = await browser.newPage()
  for (const step of result.steps) {
    const near = result.shots.filter(s => s.ts >= step.start - 200000 && s.ts <= step.end + 600000)
    const diffs = await page.evaluate(async (list) => {
      const load = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src })
      const c = document.createElement('canvas')
      c.width = 256
      c.height = 160
      const g = c.getContext('2d', { willReadFrequently: true })
      let prev = null
      const out = []
      for (const s of list) {
        g.drawImage(await load('data:image/jpeg;base64,' + s.data), 0, 0, 256, 160)
        const px = g.getImageData(0, 0, 256, 160).data
        if (prev) {
          let d = 0
          for (let k = 0; k < px.length; k += 4) d += Math.abs(px[k] - prev[k]) + Math.abs(px[k + 1] - prev[k + 1]) + Math.abs(px[k + 2] - prev[k + 2])
          out.push({ ts: s.ts, d: d / (px.length / 4) / 3 })
        }
        prev = px
      }
      return out
    }, near)
    const after = diffs.filter(x => x.ts > step.end - 20000 && x.ts < step.end + 500000)
    const top = after.reduce((a, x) => (x.d > (a?.d ?? -1) ? x : a), null)
    step.pop = top ? +top.d.toFixed(1) : null
    step.popAt = top ? Math.round((top.ts - step.end) / 1000) : null
    // The longest time without a new screenshot while views move: a pause, even if no frame dropped.
    const ts = near.map(s => s.ts).filter(t => t >= step.start && t <= step.end)
    let max = 0
    for (let k = 1; k < ts.length; k++) max = Math.max(max, ts[k] - ts[k - 1])
    step.motionGap = Math.round(max / 1000)
  }
  await page.close()
}

const pct = (windows) => {
  const d = windows.reduce((a, w) => a + w.dropped, 0)
  const all = windows.reduce((a, w) => a + w.dropped + w.presented, 0)
  return all ? +(100 * d / all).toFixed(1) : null
}

function summarise (steps) {
  const part = (kind) => {
    const mine = steps.filter(s => s.kind === kind)
    return {
      n: mine.length,
      releaseToStart: median(mine.map(s => s.releaseToStart)),
      startToFrame: median(mine.map(s => s.startToFrame)),
      motionMs: median(mine.map(s => s.motionMs)),
      dropped: pct(mine),
      worstRun: Math.max(0, ...mine.map(s => s.maxDroppedRun)),
      pop: median(mine.map(s => s.pop)),
      popAt: median(mine.map(s => s.popAt)),
      tailDropped: pct(mine.map(s => s.tail)),
      tailRun: Math.max(0, ...mine.map(s => s.tail.maxDroppedRun)),
      motionGap: median(mine.map(s => s.motionGap)),
      mainMoving: median(mine.map(s => s.main.pct)),
      mainLongest: Math.max(0, ...mine.map(s => s.main.longest)),
      gpuMoving: median(mine.map(s => s.gpu.pct)),
      gpuLongest: Math.max(0, ...mine.map(s => s.gpu.longest)),
      longAfter: median(mine.map(s => s.longAfter.reduce((a, x) => a + x, 0))),
      longMax: Math.max(0, ...mine.flatMap(s => s.longAfter)),
    }
  }
  return { in: part('in'), out: part('out') }
}

const browser = shots ? await chromium.launch() : null
const all = []
for (const file of files) {
  const result = analyse(await load(file))
  if (browser && result.shots.length) await screenChanges(browser, result)
  const name = basename(file).replace(/\.json(\.gz)?$/, '')
  console.log(`\n${name}  ${result.url}  (${result.shots.length} screenshots)`)
  for (const s of result.steps) {
    console.log([
      `  ${s.kind.padEnd(3)}`,
      `release→start ${String(s.releaseToStart ?? '-').padStart(4)} ms`,
      `start→frame ${String(s.startToFrame ?? '-').padStart(3)} ms`,
      `motion ${s.motionMs} ms`,
      `dropped ${s.dropped}/${s.dropped + s.presented} (run ${s.maxDroppedRun})`,
      `after ${s.tail.dropped}/${s.tail.dropped + s.tail.presented} (run ${s.tail.maxDroppedRun})`,
      s.pop != null ? `pop ${s.pop} @${s.popAt >= 0 ? '+' : ''}${s.popAt} ms, longest gap moving ${s.motionGap} ms` : '',
      `moving: main ${s.main.pct}% (longest ${s.main.longest}), gpu ${s.gpu.pct}% (longest ${s.gpu.longest})`,
      `long tasks after: ${s.longAfter.join(', ') || 'none'}`,
      s.notComposited.length ? `not composited: ${s.notComposited.join(' ')}` : '',
    ].filter(Boolean).join('  '))
  }
  all.push({ name, url: result.url, summary: summarise(result.steps), steps: result.steps })
}
await browser?.close()

// Side by side: the median of each trace's zooms.
const cols = [
  ['release→start', 'releaseToStart', ' ms'], ['start→frame', 'startToFrame', ' ms'], ['motion', 'motionMs', ' ms'],
  ['dropped', 'dropped', ' %'], ['worst run', 'worstRun', ''], ['pop after end', 'pop', ''], ['pop at', 'popAt', ' ms'],
  ['dropped after end', 'tailDropped', ' %'], ['worst run after', 'tailRun', ''], ['longest gap moving', 'motionGap', ' ms'],
  ['main busy moving', 'mainMoving', ' %'], ['main longest moving', 'mainLongest', ' ms'], ['gpu busy moving', 'gpuMoving', ' %'], ['gpu longest moving', 'gpuLongest', ' ms'],
  ['long tasks after (sum)', 'longAfter', ' ms'], ['longest task after', 'longMax', ' ms'],
]
for (const kind of ['in', 'out']) {
  console.log(`\nzoom-${kind} (medians)`)
  console.log(''.padEnd(24) + all.map(r => r.name.padStart(18)).join(''))
  for (const [label, key, unit] of cols) console.log(label.padEnd(24) + all.map(r => `${r.summary[kind][key] ?? '-'}${unit}`.padStart(18)).join(''))
}
if (arg('--json')) await writeFile(arg('--json'), JSON.stringify(all, null, 2))
