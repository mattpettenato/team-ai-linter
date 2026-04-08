import { test, checksumAI } from '@checksum-ai/runtime';

test('too many actions in one checksumAI block', async ({ page }) => {
  await checksumAI('fill the whole form at once', async () => {
    await page.getByLabel('Email').fill('a@b.com');
    await page.getByLabel('Password').fill('hunter2');
    await page.getByRole('button', { name: 'Sign in' }).click();
  });
});
