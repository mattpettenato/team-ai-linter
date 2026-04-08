import { test } from '@checksum-ai/runtime';

test('uses nth', async ({ page }) => {
  const row = page.locator('table tr').nth(2);
  await row.click();
});
