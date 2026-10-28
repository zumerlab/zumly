// Serves the zumly repo for labs/, with snapdom/ and orbit/ beside it.
//   node labs/serve.mjs [port]   →   http://localhost:9292/labs/
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const repo = resolve(here, '..')
const zumerlab = resolve(repo, '..')
const roots = {
  '/snapdom/': (process.env.SNAPDOM_DIR || join(zumerlab, 'snapdom')) + '/',
  '/orbit/': (process.env.ORBIT_DIR || join(zumerlab, 'orbit')) + '/',
  '/': repo + '/',
}
const types = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

export function createLabsServer () {
  return createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0])
    const prefix = Object.keys(roots).find(p => url.startsWith(p))
    const file = join(roots[prefix], url.slice(prefix.length))
    // A folder without its trailing slash would resolve relative links one level up.
    if (!url.endsWith('/') && await stat(file).then(s => s.isDirectory(), () => false)) {
      res.writeHead(301, { location: url + '/' })
      res.end()
      return
    }
    // Folders serve their index.html; SnapDOM's src/ imports without extensions.
    for (const candidate of [file, join(file, 'index.html'), file + '.js', join(file, 'index.js')]) {
      try {
        const body = await readFile(candidate)
        res.writeHead(200, { 'content-type': types[extname(candidate)] || 'application/octet-stream', 'cache-control': 'no-store' })
        res.end(body)
        return
      } catch {}
    }
    res.writeHead(404)
    res.end()
  })
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] || 9292)
  createLabsServer().listen(port, () => console.log(`http://localhost:${port}/labs/`))
}
