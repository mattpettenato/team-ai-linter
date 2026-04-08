import { test } from '@checksum-ai/runtime';

test('waits too long', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForTimeout(1000);
});
