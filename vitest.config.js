import { configDefaults, defineConfig } from 'vitest/config'

const availableBrowsers = ['chromium', 'firefox', 'webkit']
const selectedBrowsers = process.env.BROWSER === 'all'
  ? availableBrowsers
  : (process.env.BROWSER || 'chromium').split(',').map(browser => browser.trim())

for (const browser of selectedBrowsers) {
  if (!availableBrowsers.includes(browser)) {
    throw new Error(`Unknown BROWSER "${browser}". Use chromium, firefox, webkit, or all.`)
  }
}

export default defineConfig({
  test: {
    // Only the suite in __tests__: worktrees under .claude/ carry their own
    // copies, and experiments/ is not part of the library.
    include: ['__tests__/**/*.test.js'],
    exclude: [...configDefaults.exclude, '.claude/**', 'experiments/**'],
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [...new Set(selectedBrowsers)].map(browser => ({ browser })),
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
    },
  },
})
