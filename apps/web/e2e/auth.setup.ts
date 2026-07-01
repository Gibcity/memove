import { test as setup, expect } from '@playwright/test'

// Relative to the config dir (client/), matching `storageState` in
// playwright.config.ts. Playwright runs from the client workspace root.
const stateFile = 'e2e/.tmp/state.json'

// Credentials match the running dev server's demo admin (server/.env +
// DEMO_ADMIN_EMAIL/DEMO_ADMIN_PASS defaults → admin@memove.app). This server
// was started without the e2e seed, so the e2e@memove.local account from
// server-launch.mjs does not exist; use the actual admin instead. The demo
// admin has must_change_password=0, so there is no forced change-password
// step.
const EMAIL = 'admin@memove.app'
const PW = 'admin12345'

setup('authenticate the admin', async ({ page }) => {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(EMAIL)
  await page.locator('input[type="password"]').fill(PW)
  await page.locator('button[type="submit"]').click()

  await page.waitForURL('**/dashboard', { timeout: 30_000 })

  // Dismiss the first-run "Welcome to memove" system-notice modal(s). It renders
  // asynchronously (after the notices fetch), so wait for it before clicking.
  // Dismissal is recorded server-side against this user, so clearing it here
  // keeps it cleared for every authenticated flow in the run (shared test DB).
  const ok = page.getByRole('button', { name: 'OK', exact: true })
  await ok.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
  for (let i = 0; i < 8 && (await ok.isVisible().catch(() => false)); i++) {
    await ok.click()
    await page.waitForTimeout(400)
  }

  await page.context().storageState({ path: stateFile })
})
