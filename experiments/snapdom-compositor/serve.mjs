// Serves zumly/ with snapdom/ and orbit/ beside it, for compare.html and bench.html by hand.
//   node experiments/snapdom-compositor/serve.mjs [port]
//   → http://localhost:9191/experiments/snapdom-compositor/compare.html
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const here = new URL('.', import.meta.url).pathname
const zumerlab = resolve(here, '../../..')
const roots = {
  '/snapdom/': (process.env.SNAPDOM_DIR || join(zumerlab, 'snapdom')) + '/',
  '/orbit/': (process.env.ORBIT_DIR || join(zumerlab, 'orbit')) + '/',
  '/': resolve(here, '../..') + '/',
}
const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' }
const port = +(process.argv[2] || 9191)
createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  const prefix = Object.keys(roots).find(p => url.startsWith(p))
  // SnapDOM's src/ imports without extensions (its bundler resolves them): try those too.
  const file = join(roots[prefix], url.slice(prefix.length))
  for (const candidate of [file, file + '.js', join(file, 'index.js')]) {
    try {
      const body = await readFile(candidate)
      res.writeHead(200, { 'content-type': types[extname(candidate)] || 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(body)
      return
    } catch {}
  }
  res.writeHead(404)
  res.end()
}).listen(port, () => console.log(`http://localhost:${port}/experiments/snapdom-compositor/compare.html`))
