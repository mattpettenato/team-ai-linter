import { test, expect } from '@playwright/test'
import { openDashboard } from './helper'

test('dashboard loads', async ({ page }) => {
  await openDashboard(page)
  await page.waitForTimeout(5000)
  await expect(page.locator('.row').nth(3)).toBeVisible()
})
