import type { Page } from '@playwright/test'

export async function openDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard')
  await page.waitForTimeout(3000)
}
