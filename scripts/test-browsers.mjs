import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Set BROWSER without shell-specific environment variable syntax.
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
  'run', '--browser.headless', '--reporter=verbose', ...process.argv.slice(2),
], {
  stdio: 'inherit',
  env: { ...process.env, BROWSER: 'all' },
})

if (result.error) throw result.error
process.exitCode = result.status ?? 1
