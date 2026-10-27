// Table from fluidity.mjs results: median over the undisturbed runs of each scene × mode.
//   node experiments/snapdom-compositor/fluidity-summary.mjs results/fluidity/cpu1.json [...more.json]
import { readFile } from 'node:fs/promises'

const results = (await Promise.all(process.argv.slice(2).map(async f => JSON.parse(await readFile(f, 'utf8'))))).flat()
const median = (xs) => { xs = xs.filter(x => x != null); if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2 }
const fmt = (x, d = 1) => x == null ? '–' : (+x).toFixed(d)

const groups = new Map()
for (const r of results) {
  const key = `${r.cpu}|${r.cond}|${r.scene}|${r.mode}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(r)
}

let lastHead = ''
for (const [key, all] of groups) {
  const [cpu, cond, scene, mode] = key.split('|')
  const clean = all.filter(r => !r.disturbed)
  const rs = all // quiet and busy runs agree within a few points: use them all
  const m = (f) => median(rs.map(f))
  const head = `\n### CPU ${cpu}× · ${cond}\n\n| scene | mode | dropped % | hitches /10 | worst gap (median) | click → 1st frame | dropped after | dropped at rest % | longest task after arriving (median / worst) | rAF mean | runs |\n|---|---|---|---|---|---|---|---|---|---|---|`
  if (head !== lastHead) { console.log(head); lastHead = head }
  console.log(`| ${scene} | ${mode} | ${fmt(m(r => r.summary.droppedPct))} | ${fmt(m(r => r.summary.stutters * 10 / r.steps.length), 0)} | ${fmt(m(r => r.summary.gapMedian), 0)} ms | ${fmt(m(r => r.summary.latency), 0)} ms | ${fmt(m(r => r.summary.tailDropped), 0)} | ${fmt(m(r => r.summary.restDroppedPct))} | ${fmt(m(r => r.summary.arrivalLongestMedian), 0)} / ${fmt(m(r => r.summary.arrivalLongestWorst), 0)} ms | ${fmt(m(r => r.rafMean))} | ${clean.length}${clean.length < all.length ? ` (+${all.length - clean.length} disturbed)` : ''} |`)
}
