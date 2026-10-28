// Frame counting shared by measure.mjs and read-trace.mjs: one vsync per frame_sequence of the
// page's PipelineReporter events, presented, dropped or idle.

export function framesOf (events, pid) {
  const bySeq = new Map()
  for (const e of events) {
    if (e.name !== 'PipelineReporter' || e.ph !== 'b' || e.pid !== pid) continue
    const r = e.args?.frame_reporter
    if (!r) continue
    const key = `${r.frame_source}:${r.frame_sequence}`
    const f = bySeq.get(key) || { ts: e.ts, presented: false, dropped: false }
    f.ts = Math.min(f.ts, e.ts)
    if (r.state === 'STATE_PRESENTED_ALL' || r.state === 'STATE_PRESENTED_PARTIAL') f.presented = true
    if (r.state === 'STATE_DROPPED' && r.affects_smoothness) f.dropped = true
    bySeq.set(key, f)
  }
  return [...bySeq.values()].sort((a, b) => a.ts - b.ts)
}

export function windowStats (frames, from, to) {
  const inWin = frames.filter(f => f.ts >= from && f.ts <= to)
  const presented = inWin.filter(f => f.presented && !f.dropped).length
  const dropped = inWin.filter(f => f.dropped).length
  // What the eye sees as a hitch is a run of dropped frames; a pause with nothing to draw
  // presents no frame either.
  let run = 0
  let maxDroppedRun = 0
  let runAt = null
  for (const f of inWin) {
    if (f.dropped) {
      if (++run > maxDroppedRun) { maxDroppedRun = run; runAt = Math.round((f.ts - from) / 1000) }
    } else if (f.presented) run = 0
  }
  // runAt: ms from the start of the window to the last frame of the worst run.
  return { presented, dropped, maxDroppedRun, runAt }
}

export const median = (xs) => {
  const v = xs.filter(x => x != null)
  if (!v.length) return null
  const s = [...v].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : +((s[mid - 1] + s[mid]) / 2).toFixed(1)
}
