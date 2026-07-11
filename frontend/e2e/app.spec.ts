import { test, expect } from './fixtures';

test.describe('App Initialization', () => {
  test('app initializes with Alpine.js', async ({ page }) => {
    // Check that Alpine.js has initialized by looking for x-cloak removal
    const body = page.locator('body');
    await expect(body).not.toHaveAttribute('x-cloak', '');
  });

  test('page loads without errors', async ({ page }) => {
    // Check console for errors
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForTimeout(1000);

    // We expect some WebSocket errors since we're mocking, and SVG attribute warnings
    const jsErrors = consoleErrors.filter(
      (e) => !e.includes('WebSocket') && !e.includes('watch') && !e.includes('SVG') && !e.includes('viewBox')
    );
    expect(jsErrors).toEqual([]);
  });

  test('title is set correctly', async ({ page }) => {
    await expect(page).toHaveTitle('Nautikal Panel');
  });

  test('main layout structure is correct', async ({ page }) => {
    // Sidebar should exist
    await expect(page.locator('aside.sidebar')).toBeVisible();

    // Main content should exist
    await expect(page.locator('main.main-content')).toBeVisible();

    // Mobile header exists (may be hidden on desktop but in DOM)
    await expect(page.locator('header.mobile-header')).toHaveCount(1);
  });
});

test.describe('Responsive Layout', () => {
  test('sidebar is visible on desktop', async ({ page }) => {
    const sidebar = page.locator('aside.sidebar');
    await expect(sidebar).toBeVisible();
  });

  test('mobile header is hidden on desktop viewport', async ({ page }) => {
    const mobileHeader = page.locator('header.mobile-header');
    await expect(mobileHeader).not.toBeVisible();
  });
});

test.describe('Notifications', () => {
  test('notification container exists', async ({ page }) => {
    // The notification component is in the DOM
    const notificationContainer = page.locator('.notification-container');
    await expect(notificationContainer).toHaveCount(1);
  });
});
