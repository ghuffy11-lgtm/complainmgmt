import { expect, test } from '@playwright/test';

/**
 * Golden path: login → create complaint → assign → override a locked field.
 *
 * Prerequisites:
 *   - Stack is running (docker compose up).
 *   - INITIAL_ADMIN_USERNAME / INITIAL_ADMIN_PASSWORD seeded an admin user
 *     (or seed it manually before running e2e).
 *
 * Configure via env:
 *   E2E_BASE_URL          (default https://localhost)
 *   E2E_ADMIN_USER        (default admin)
 *   E2E_ADMIN_PASSWORD    (must be set)
 *
 * Skipped if E2E_ADMIN_PASSWORD isn't configured — e2e against a live stack
 * is operator-driven, not for every dev's local jest run.
 */
const ADMIN_USER = process.env.E2E_ADMIN_USER ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

test.skip(!ADMIN_PASSWORD, 'set E2E_ADMIN_PASSWORD to run');

test('admin can log in, create a complaint, and view it', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('Username').fill(ADMIN_USER);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Land on the dashboard
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // Open Complaints, start a new one
  await page.getByRole('link', { name: 'Complaints' }).click();
  await expect(page).toHaveURL(/\/complaints$/);
  await page.getByRole('button', { name: /new complaint/i }).click();
  await expect(page).toHaveURL(/\/complaints\/new$/);

  // Fill the seeded system field and submit
  const note = `e2e patient complaint ${Date.now()}`;
  await page.getByLabel(/Patient Complaint/).fill(note);
  await page.getByRole('button', { name: /create complaint/i }).click();

  // Detail page shows the new complaint
  await expect(page).toHaveURL(/\/complaints\/\d+$/);
  await expect(page.getByText(note)).toBeVisible();
  await expect(page.getByText(/CMP-\d{4}-\d{6}/)).toBeVisible();
});
