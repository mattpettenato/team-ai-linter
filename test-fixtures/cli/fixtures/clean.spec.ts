import { test, expect, checksumAI } from '@checksum-ai/runtime'

test('login page renders', async ({ page }) => {
  await checksumAI('Navigate to login page', async () => {
    await page.goto('/login')
  })
  await expect(page.getByRole('button', { name: 'Sign in' }), 'sign-in button should render').toBeVisible()
})
