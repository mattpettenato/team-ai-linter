// FROZEN FIXTURE — do not extend. The ai-failure suite asserts the exact set
// of deterministic issues this file produces (one waitForTimeout, one .nth()).
import { test } from '@playwright/test'

test('demo', async ({ page }) => {

  await page.waitForTimeout(3000)
  await page.locator('.row').nth(2).click()
  const heading = page.getByRole('heading')
  heading.isVisible()
})
