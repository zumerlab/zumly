// Pool bench JSON files into one markdown table per scene.
//   node experiments/snapdom-compositor/summarize.mjs results/*.json
import { readFile } from 'node:fs/promises'

const rows = new Map()
for (const file of process.argv.slice(2)) {
  for (const r of JSON.parse(await readFile(file, 'utf8'))) {
    const variant = r.mode === 'baseline' ? `fx=${r.fx || 'anim'}` : `${r.when || 'ahead'}${r.bake ? '+bake' : ''} fx=${r.fx || 'anim'}`
    const key = `${r.scene}|${r.mode}|${variant}`
    const row = rows.get(key) || { scene: r.scene, mode: r.mode, fx: variant, phases: { pre: [], start: [], mid: [], end: [], tail: [] }, latency: [], runs: 0, frames: 0, time: 0, over34: 0, over20: 0, transitions: 0, worst: [], first: [], heap: [], canvas: [], capture: [] }
    row.runs++
    for (const s of r.steps) {
      row.frames += s.frames
      row.time += s.mean * s.frames
      row.over34 += s.over34
      row.over20 += s.over20
      row.transitions++
      row.worst.push(s.max)
      row.first.push(s.firstFrame)
      row.canvas.push(s.canvasMB)
      if (s.phase) for (const k of Object.keys(row.phases)) row.phases[k].push(s.phase[k].worst)
      if (s.latency != null) row.latency.push(s.latency)
    }
    row.heap.push(r.heapMB)
    if (r.plugin?.captureMsMedian) row.capture.push(r.plugin.captureMsMedian)
    rows.set(key, row)
  }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
console.log('| scene | mode | fx | runs | transitions | mean frame ms | frames >34ms per transition | worst frame (median of transitions) | worst frame (max) | capture ms (median) | JS heap MB | canvas MB |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const r of rows.values()) {
  console.log(`| ${r.scene} | ${r.mode} | ${r.fx} | ${r.runs} | ${r.transitions} | ${(r.time / r.frames).toFixed(1)} | ${(r.over34 / r.transitions).toFixed(1)} | ${med(r.worst).toFixed(0)} | ${Math.max(...r.worst).toFixed(0)} | ${r.capture.length ? med(r.capture).toFixed(0) : '–'} | ${med(r.heap)} | ${Math.max(...r.canvas)} |`)
}

if (process.env.PHASES) {
  console.log('\n| scene | mode | variant | click→motion ms (median) | worst pre | worst start | worst mid | worst end | worst tail |')
  console.log('|---|---|---|---|---|---|---|---|---|')
  for (const r of rows.values()) {
    if (!r.latency.length) continue
    const m = k => med(r.phases[k])
    console.log(`| ${r.scene} | ${r.mode} | ${r.fx} | ${med(r.latency)} | ${m('pre')} | ${m('start')} | ${m('mid')} | ${m('end')} | ${m('tail')} |`)
  }
}
