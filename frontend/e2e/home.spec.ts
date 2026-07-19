import { test, expect, navigateToServers } from './fixtures';

// The former "Home" page (server cards + "Servers" heading) is now the
// "Servers" route at `/servers`. The default landing route is the dashboard
// at `/`, so every test in this file must navigate to the Servers route
// explicitly before asserting on server cards.
test.describe('Servers Page', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToServers(page);
  });

  test('displays page title and heading', async ({ page }) => {
    // Use sidebar h1 to avoid conflict with mobile header h1
    await expect(page.locator('aside.sidebar h1')).toContainText('Nautikal Panel');
    // Use main content h2 to avoid conflict with settings page h2
    await expect(page.locator('main h2.heading-secondary').first()).toContainText('Servers');
  });

  test('displays "Add Server" button', async ({ page }) => {
    const addButton = page.locator('button:has-text("Add Server")');
    await expect(addButton).toBeVisible();
  });

  test('displays server cards with correct information', async ({ page }) => {
    // Wait for server cards to appear
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const cards = page.locator('.server-card');
    await expect(cards).toHaveCount(3);

    // Check first server (Minecraft - Running)
    const firstCard = cards.first();
    await expect(firstCard.locator('h3')).toContainText('My Minecraft Server');
    await expect(firstCard.locator('p.text-muted').first()).toContainText('minecraft');
    await expect(firstCard.locator('.server-address')).toContainText('192.168.1.100:25565/TCP');

    // Check second server (Terraria - Offline)
    const secondCard = cards.nth(1);
    await expect(secondCard.locator('h3')).toContainText('Terraria World');
    await expect(secondCard.locator('p.text-muted').first()).toContainText('terraria');
    await expect(secondCard.locator('button:has-text("Start")')).toBeVisible();

    // Check third server (Valheim - SFTP Only)
    const thirdCard = cards.nth(2);
    await expect(thirdCard.locator('h3')).toContainText('Valheim Server');
    await expect(thirdCard.locator('i:has-text("(SFTP Only)")')).toBeVisible();
  });

  test('each server card has action buttons', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const firstCard = page.locator('.server-card').first();
    await expect(firstCard.locator('button:has-text("Stop")')).toBeVisible();
    await expect(firstCard.locator('button:has-text("Details")')).toBeVisible();
    await expect(firstCard.locator('button:has-text("Delete")')).toBeVisible();
    await expect(firstCard.locator('button:has-text("Edit")')).toBeVisible();
  });

  test('edit button is disabled when server is running', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const firstCard = page.locator('.server-card').first();
    const editButton = firstCard.locator('button:has-text("Edit")');
    await expect(editButton).toBeDisabled();
  });

  test('edit button is enabled when server is offline', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const secondCard = page.locator('.server-card').nth(1);
    const editButton = secondCard.locator('button:has-text("Edit")');
    await expect(editButton).toBeEnabled();
  });

  test('shows correct status indicators', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const cards = page.locator('.server-card');

    // Running server should have green indicator
    const runningCard = cards.first();
    const runningDot = runningCard.locator('.status-dot');
    await expect(runningDot).toHaveClass(/bg-success/);

    // Offline server should have gray indicator
    const offlineCard = cards.nth(1);
    const offlineDot = offlineCard.locator('.status-dot');
    await expect(offlineDot).toHaveClass(/bg-gray-400/);
  });
});

test.describe('Servers Page - Empty State', () => {
  test('shows empty state when no servers exist', async ({ page }) => {
    // Override the mock to return empty array
    await page.route('/api/v1/game-servers', async (route, request) => {
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else {
        await route.continue();
      }
    });

    // Land directly on the Servers page. `page.goto('/servers')` is a full
    // navigation — the SPA re-initializes and `init()` fetches the now-
    // overridden (empty) server list.
    await page.goto('/servers');
    await page.waitForSelector('main.main-content', { state: 'visible' });
    await page.waitForTimeout(500);

    // Check empty state message
    const emptyState = page.locator('text=No servers yet. Click "Add Server" to get started!');
    await expect(emptyState).toBeVisible();

    // Verify no server cards exist
    await expect(page.locator('.server-card')).toHaveCount(0);

    // Add Server button should still be visible
    await expect(page.locator('button:has-text("Add Server")')).toBeVisible();
  });
});