import { test, expect } from './fixtures';

const BASE = 'http://localhost:3000';

test.describe('Navigation', () => {
  test('sidebar navigation links work', async ({ page }) => {
    // Dashboard should be active by default (it is the new landing route at `/`).
    const dashboardLink = page.locator('aside nav a:has-text("Dashboard")');
    await expect(dashboardLink).toHaveClass(/nav-link-active/);

    const settingsLink = page.locator('aside nav a:has-text("Settings")');
    await expect(settingsLink).toHaveClass(/nav-link-inactive/);

    // Click settings — preact-iso updates the URL via pushState.
    await settingsLink.click();
    await page.waitForFunction(() => window.location.pathname === '/settings', null, { timeout: 5000 });
    await page.waitForTimeout(300);

    await expect(settingsLink).toHaveClass(/nav-link-active/);
    await expect(dashboardLink).toHaveClass(/nav-link-inactive/);
    // Settings page renders inside SettingsPage component
    await expect(page.locator('main h2.heading-secondary')).toContainText('Settings');

    // Click back to dashboard
    await dashboardLink.click();
    await page.waitForFunction(() => window.location.pathname === '/', null, { timeout: 5000 });
    await page.waitForTimeout(300);

    await expect(dashboardLink).toHaveClass(/nav-link-active/);
    await expect(settingsLink).toHaveClass(/nav-link-inactive/);
    await expect(page.locator('main h2.heading-secondary')).toContainText('Dashboard');
  });

  test('URL changes on navigation', async ({ page }) => {
    await expect(page).toHaveURL(`${BASE}/`);

    await page.locator('aside nav a:has-text("Settings")').click();
    await page.waitForTimeout(300);

    await expect(page).toHaveURL(`${BASE}/settings`);

    await page.locator('aside nav a:has-text("Dashboard")').click();
    await page.waitForTimeout(300);

    await expect(page).toHaveURL(`${BASE}/`);
  });

  test('version text is visible in sidebar', async ({ page }) => {
    await expect(page.locator('aside .version-text')).toContainText('v1.0.0');
  });

  test('mobile header is hidden on desktop', async ({ page, viewport }) => {
    // On desktop viewport, mobile header should not be visible
    const mobileHeader = page.locator('.mobile-header');
    // It may exist in DOM but should be hidden by lg:hidden class
    await expect(mobileHeader).not.toBeVisible();
  });
});