import { build } from 'esbuild'
import { readFileSync, rmSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  sourcemap: false,
  logLevel: 'info',
}

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))
const version = pkg.version || '0.0.0'

const banner = {
  js: `/*
* zumly
* v.${version}
* Author Juan Martin Muda - Zumerlab
* License MIT
*/`,
}

/**
 * 1) LEGACY build for <script> tag:
 *    dist/zumly.js
 *
 * Note: We intentionally do NOT force `format: 'iife'`.
 * We mirror SnapDOM's config style (platform neutral + globalName).
 */
async function buildLegacy () {
  await build({
    ...common,
    entryPoints: ['src/entry.js'],
    outfile: 'dist/zumly.js',
    globalName: 'Zumly',
    platform: 'neutral',
    minify: true,
    target: ['es2020'],
    banner,
  })
}

/**
 * 2) ESM build:
 *    dist/zumly.mjs
 */
async function buildESM () {
  await build({
    ...common,
    entryPoints: ['src/entry.js'],
    outfile: 'dist/zumly.mjs',
    format: 'esm',
    minify: true,
    splitting: false,
    banner,
  })
}

/**
 * 3) CSS build:
 *    dist/zumly.css (+ dist/zumly.min.css)
 */
async function buildCSS () {
  await build({
    bundle: true,
    sourcemap: false,
    logLevel: 'info',
    entryPoints: ['src/style.css'],
    outfile: 'dist/zumly.css',
    minify: false,
  })

  await build({
    bundle: true,
    sourcemap: false,
    logLevel: 'info',
    entryPoints: ['src/style.css'],
    outfile: 'dist/zumly.min.css',
    minify: true,
  })
}

async function copyToPublicDist () {
  const publicDist = 'public/dist'
  try { rmSync(publicDist, { recursive: true, force: true }) } catch { /* ok */ }
  mkdirSync(publicDist, { recursive: true })

  const files = ['zumly.js', 'zumly.mjs', 'zumly.css', 'zumly.min.css']
  for (const f of files) {
    const src = `dist/${f}`
    if (existsSync(src)) copyFileSync(src, `${publicDist}/${f}`)
  }
}

async function main () {
  try { rmSync('dist', { recursive: true, force: true }) } catch { /* ok */ }
  await Promise.all([buildLegacy(), buildESM(), buildCSS()])
  await copyToPublicDist()
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})

