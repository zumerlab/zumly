import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'zumly-package-'))

function run (command, args, cwd = temporaryDirectory) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function runNpm (args, cwd) {
  return process.env.npm_execpath
    ? run(process.execPath, [process.env.npm_execpath, ...args], cwd)
    : run('npm', args, cwd)
}

try {
  // test:pack compiles first. Avoid a second compilation via prepack here.
  const [packed] = JSON.parse(runNpm([
    'pack', '--ignore-scripts', '--json', '--pack-destination', temporaryDirectory,
  ], projectRoot))
  const tarball = join(temporaryDirectory, packed.filename)

  writeFileSync(join(temporaryDirectory, 'package.json'), JSON.stringify({
    name: 'zumly-package-consumer', version: '1.0.0', private: true, type: 'module',
  }))
  // Install the tarball as a consumer, outside the source tree. No network or
  // lifecycle scripts are needed: Zumly has no runtime dependencies.
  runNpm([
    'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--package-lock=false', tarball,
  ])

  const installedRoot = join(temporaryDirectory, 'node_modules', 'zumly')
  const installedPackage = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8'))
  function verifyExportTargets (value) {
    if (typeof value === 'string') {
      assert.ok(statSync(join(installedRoot, value)).isFile(), `Missing exported file: ${value}`)
    } else {
      for (const target of Object.values(value)) verifyExportTargets(target)
    }
  }
  verifyExportTargets(installedPackage.exports)
  for (const module of ['view-visibility.js', 'view-lifecycle.js']) {
    assert.ok(statSync(join(installedRoot, 'src', module)).isFile(), `Missing shared module: ${module}`)
  }

  writeFileSync(join(temporaryDirectory, 'consumer.mjs'), `
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import Zumly, { Zumly as NamedZumly, ZumlyRouter } from 'zumly'
import * as drivers from 'zumly/drivers'
import * as helpers from 'zumly/driver-helpers'

assert.equal(typeof Zumly, 'function')
assert.equal(Zumly, NamedZumly)
assert.equal(typeof ZumlyRouter.install, 'function')
assert.equal(Zumly.Router, ZumlyRouter)
for (const name of ['css', 'none', 'waapi', 'anime', 'gsap', 'motion']) {
  assert.equal(typeof drivers[name + 'Transition'], 'function', name)
  assert.equal(typeof drivers.getDriver(name).runTransition, 'function', name)
}
assert.equal(helpers.parseDurationMs('125ms'), 125)
assert.equal(helpers.parseDurationSec('250ms'), 0.25)
assert.equal(drivers.showViews, helpers.showViews)
const require = createRequire(import.meta.url)
const stylesheet = require.resolve('zumly/style.css')
assert.equal(stylesheet, require.resolve('zumly/css'))
assert.ok(readFileSync(stylesheet, 'utf8').includes('.zumly'))
console.log('Packaged ESM, drivers, helpers, and CSS exports passed.')
`)
  writeFileSync(join(temporaryDirectory, 'consumer.cjs'), `
const assert = require('node:assert/strict')
const { default: Zumly, Zumly: NamedZumly, ZumlyRouter } = require('zumly')
assert.equal(typeof Zumly, 'function')
assert.equal(Zumly, NamedZumly)
assert.equal(typeof ZumlyRouter.install, 'function')
assert.equal(Zumly.Router, ZumlyRouter)
console.log('Packaged CommonJS export passed.')
`)

  process.stdout.write(run(process.execPath, ['consumer.mjs']))
  process.stdout.write(run(process.execPath, ['consumer.cjs']))
  console.log(`Verified ${packed.filename}: all export targets exist in the installed tarball.`)
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout)
  if (error.stderr) process.stderr.write(error.stderr)
  throw error
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
