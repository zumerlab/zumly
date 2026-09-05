import { defineConfig } from 'vitest/config'

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
