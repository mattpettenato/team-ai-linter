import { test, expect } from '@playwright/test'

test('login page renders', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Sign in' }), 'sign-in button should render').toBeVisible()
})
