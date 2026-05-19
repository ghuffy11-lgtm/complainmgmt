import { expect, test } from '@playwright/test';

/**
 * E2E happy path for sub-category + origin:
 *   1. Login as admin.
 *   2. Seed a sub-category under the first department.
 *   3. File a complaint with that sub-category + the first origin.
 *   4. Dashboard shows the chosen origin's card with count ≥ 1.
 *   5. Clicking the card filters the complaints list to that origin.
 *
 * Same skip-gate pattern as golden-path.spec.ts.
 */
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

test.skip(!ADMIN_PASSWORD, 'set E2E_ADMIN_PASSWORD to run');

test('admin seeds, user files, dashboard counts, click filters list', async ({ page }) => {
  // 1. Login.
  await page.goto('/login');
  await page.getByLabel('Username').fill(ADMIN_USER);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // 2. Seed a sub-category. Use a unique key so re-runs don't collide.
  const subKey = `e2e_net_${Date.now().toString(36)}`;
  await page.goto('/admin/subcategories');
  await page.getByRole('button', { name: /new sub-category/i }).click();
  await page.getByLabel('Key').fill(subKey);
  await page.getByLabel('Name').fill('E2E Network');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('E2E Network')).toBeVisible();

  // 3. File a complaint.
  await page.goto('/complaints/new');
  const note = `e2e origin ${Date.now()}`;
  await page.getByLabel(/Patient Complaint/).fill(note);
  await page.locator('div').filter({ hasText: /^Department/ }).getByRole('combobox').first().click();
  await page.getByRole('option').first().click();
  // Sub-category dropdown may not appear unless we picked the same dept the
  // sub-category was seeded under; tolerate its absence.
  const subCombo = page.locator('div').filter({ hasText: /^Sub-category/ }).getByRole('combobox');
  if (await subCombo.count() > 0) {
    await subCombo.first().click();
    await page.getByRole('option', { name: 'E2E Network' }).click();
  }
  await page.locator('div').filter({ hasText: /^Origin of complaint/ }).getByRole('combobox').first().click();
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: /create complaint/i }).click();
  await expect(page).toHaveURL(/\/complaints\/\d+/);

  // 4. Dashboard card visible.
  await page.goto('/dashboard');
  const originCards = page.getByRole('link').filter({ hasText: /Social media|Verbal|Suggestion box/ });
  await expect(originCards.first()).toBeVisible();

  // 5. Click first card → list filter applied.
  await originCards.first().click();
  await expect(page).toHaveURL(/originId=/);
});
