import { test, expect, checksumAI } from '@checksum-ai/runtime';

test('happy path login', async ({ page }) => {
  await checksumAI('navigate to login', async () => {
    await page.goto('/login');
  });

  await checksumAI('click submit button', async () => {
    await page.getByRole('button', { name: 'Submit' }).click();
  });

  await expect(page.getByRole('heading', { name: 'Welcome' }), 'welcome heading should be visible after login').toBeVisible();
});
