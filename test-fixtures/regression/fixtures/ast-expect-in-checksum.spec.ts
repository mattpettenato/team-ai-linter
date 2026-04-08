import { test, expect, checksumAI } from '@checksum-ai/runtime';

test('assertion inside checksumAI block', async ({ page }) => {
  await checksumAI('click and verify', async () => {
    await page.getByRole('button').click();
    expect(page.getByText('done')).toBeVisible();
  });
});
