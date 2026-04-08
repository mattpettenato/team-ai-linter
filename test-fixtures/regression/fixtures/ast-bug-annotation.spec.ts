import { test, expect } from '@checksum-ai/runtime';

// Tagged @bug but missing the annotation object — should fire incomplete_bug_annotation.
test('broken checkout flow', { tag: ['@bug'] }, async ({ page }) => {
  await page.goto('/checkout');
  await expect(page.getByText('Total'), 'total should show').toBeVisible();
});
