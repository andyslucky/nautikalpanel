import { test, expect } from './fixtures';

test.describe('Navigation', () => {
  test('sidebar navigation links work', async ({ page }) => {
    // Home should be active by default
    const homeLink = page.locator('aside nav a:has-text("Home")');
    await expect(homeLink).toHaveClass(/nav-link-active/);

    const settingsLink = page.locator('aside nav a:has-text("Settings")');
    await expect(settingsLink).toHaveClass(/nav-link-inactive/);

    // Click settings
    await settingsLink.click();
    // Wait for hash-based navigation to complete
    await page.waitForFunction(() => window.location.hash === '#settings', null, { timeout: 5000 });
    await page.waitForTimeout(300);

    await expect(settingsLink).toHaveClass(/nav-link-active/);
    await expect(homeLink).toHaveClass(/nav-link-inactive/);
    // Settings page renders inside SettingsPage component
    await expect(page.locator('main h2.heading-secondary')).toContainText('Settings');

    // Click back to home
    await homeLink.click();
    await page.waitForFunction(() => window.location.hash === '#home', null, { timeout: 5000 });
    await page.waitForTimeout(300);

    await expect(homeLink).toHaveClass(/nav-link-active/);
    await expect(settingsLink).toHaveClass(/nav-link-inactive/);
    await expect(page.locator('main h2.heading-secondary')).toContainText('Game Servers');
  });

  test('URL hash changes on navigation', async ({ page }) => {
    await expect(page).toHaveURL(/.*#home/);

    await page.locator('aside nav a:has-text("Settings")').click();
    await page.waitForTimeout(300);

    await expect(page).toHaveURL(/.*#settings/);

    await page.locator('aside nav a:has-text("Home")').click();
    await page.waitForTimeout(300);

    await expect(page).toHaveURL(/.*#home/);
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
