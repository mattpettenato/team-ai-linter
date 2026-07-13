import { test } from '@playwright/test'

test('demo', async ({ page }) => {

  await page.waitForTimeout(3000)
  await page.locator('.row').nth(2).click()
  const heading = page.getByRole('heading')
  heading.isVisible()
})
