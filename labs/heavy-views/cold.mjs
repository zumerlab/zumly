// Experiment 5: the first transition in a fresh browser. measure.mjs warms up first on purpose;
// this runs it cold (--no-warmup, one page per browser), several times, and compares the first
// zoom-in and zoom-out of each page with the rest.
//
//   caffeinate -d node labs/heavy-views/cold.mjs [--variants f,f-gl] [--times 3] [--conds asis]
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdirSync } from 'node:fs'
import { median } from './trace-stats.mjs'

const args = process.argv.slice(2)
const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback
const variants = arg('--variants', 'f,f-gl').split(',')
const times = +arg('--times', 3)
const conds = arg('--conds', 'asis')
const extra = arg('--query-flags', '')
mkdirSync('labs/heavy-views/results/cold', { recursive: true })

const pct = (d, p) => d + p ? +(100 * d / (d + p)).toFixed(1) : 0
for (const variant of variants) {
  const first = { in: [], out: [] }
  const rest = { in: [], out: [] }
  const starts = { first: [], rest: [] }
  for (let t = 0; t < times; t++) {
    const out = `labs/heavy-views/results/cold/${variant}-${t}.json`
    execFileSync('node', ['labs/heavy-views/measure.mjs', '--variants', variant, '--conds', conds, '--runs', '1', '--rounds', '3', '--no-warmup', '--out', out, ...(extra ? extra.split(' ') : [])], { stdio: 'ignore' })
    for (const r of JSON.parse(readFileSync(out, 'utf8'))) {
      for (const kind of ['in', 'out']) {
        const steps = r.steps.filter(s => s.kind === kind)
        if (!steps.length) continue
        first[kind].push(pct(steps[0].dropped, steps[0].presented))
        for (const s of steps.slice(1)) rest[kind].push(pct(s.dropped, s.presented))
        if (kind === 'in') {
          starts.first.push(steps[0].startMs)
          for (const s of steps.slice(1)) starts.rest.push(s.startMs)
        }
      }
    }
  }
  console.log(`${variant.padEnd(8)} first zoom-in ${first.in.join('/')} % (rest median ${median(rest.in)}), first zoom-out ${first.out.join('/')} % (rest ${median(rest.out)}), start first ${starts.first.join('/')} ms (rest ${median(starts.rest)})`)
}
