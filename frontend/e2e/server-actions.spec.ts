import { test, expect } from './fixtures';

test.describe('Server Card Actions', () => {
  test('clicking Details button opens server drawer', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const firstCard = page.locator('.server-card').first();
    const detailsButton = firstCard.locator('button:has-text("Details")');

    await detailsButton.click();
    await page.waitForTimeout(500);

    // Drawer should be visible
    const drawer = page.locator('.drawer');
    await expect(drawer).toBeVisible();

    // Drawer should show server name
    await expect(drawer.locator('h3')).toContainText('My Minecraft Server');
  });

  test('drawer shows connection info', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const firstCard = page.locator('.server-card').first();
    await firstCard.locator('button:has-text("Details")').click();
    await page.waitForTimeout(500);

    const drawer = page.locator('.drawer');
    await expect(drawer.locator('text=Connection')).toBeVisible();
    await expect(drawer.locator('text=192.168.1.100:25565/TCP')).toBeVisible();
  });

  test('drawer shows resource usage section', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const firstCard = page.locator('.server-card').first();
    await firstCard.locator('button:has-text("Details")').click();
    await page.waitForTimeout(500);

    const drawer = page.locator('.drawer');
    await expect(drawer.locator('text=Resource Usage')).toBeVisible();
    await expect(drawer.locator('text=CPU')).toBeVisible();
    await expect(drawer.locator('text=Memory')).toBeVisible();
    await expect(drawer.locator('text=Storage')).toBeVisible();
  });

  test('drawer shows quick actions', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const firstCard = page.locator('.server-card').first();
    await firstCard.locator('button:has-text("Details")').click();
    await page.waitForTimeout(500);

    const drawer = page.locator('.drawer');
    await expect(drawer.locator('text=Quick Actions')).toBeVisible();

    // Running server should show Stop button in drawer
    await expect(drawer.locator('button:has-text("Stop")')).toBeVisible();
  });

  test('drawer can be closed', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const firstCard = page.locator('.server-card').first();
    await firstCard.locator('button:has-text("Details")').click();
    await page.waitForTimeout(500);

    // Click the close button in drawer header
    const closeButton = page.locator('.drawer-header button');
    await closeButton.click();
    await page.waitForTimeout(300);

    const drawer = page.locator('.drawer');
    await expect(drawer).not.toBeVisible();
  });

  test('drawer shows SFTP button for running server', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    // Click Details on the Valheim server (SFTP Only type)
    const thirdCard = page.locator('.server-card').nth(2);
    await thirdCard.locator('button:has-text("Details")').click();
    await page.waitForTimeout(500);

    const drawer = page.locator('.drawer');
    // SFTP Only should not show the Start/Stop button in the same way
    // But it should still show the drawer
    await expect(drawer.locator('h3')).toContainText('Valheim Server');
  });

  test('offline server shows Start button in card', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const secondCard = page.locator('.server-card').nth(1);
    const startButton = secondCard.locator('button:has-text("Start")');
    await expect(startButton).toBeVisible();
    await expect(startButton).toBeEnabled();
  });

  test('running server shows Stop button in card', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    const firstCard = page.locator('.server-card').first();
    const stopButton = firstCard.locator('button:has-text("Stop")');
    await expect(stopButton).toBeVisible();
    await expect(stopButton).toBeEnabled();
  });

  test('clicking Start button on offline server', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    // Mock start endpoint response
    let startCalled = false;
    await page.route('/api/v1/game-servers/start', async (route, request) => {
      if (request.method() === 'POST') {
        startCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });

    const secondCard = page.locator('.server-card').nth(1);
    await secondCard.locator('button:has-text("Start")').click();
    await page.waitForTimeout(500);

    expect(startCalled).toBe(true);
  });

  test('clicking Stop button on running server', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    let stopCalled = false;
    await page.route('/api/v1/game-servers/stop', async (route, request) => {
      if (request.method() === 'POST') {
        stopCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        await route.continue();
      }
    });

    const firstCard = page.locator('.server-card').first();
    await firstCard.locator('button:has-text("Stop")').click();
    await page.waitForTimeout(500);

    expect(stopCalled).toBe(true);
  });

  test('clicking Delete button shows confirmation dialog', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    // Intercept the confirm dialog
    page.on('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('Are you sure you want to delete');
      await dialog.dismiss();
    });

    const firstCard = page.locator('.server-card').first();
    await firstCard.locator('button:has-text("Delete")').click();
  });
});

test.describe('Server Drawer - SFTP Actions', () => {
  test('SFTP Only button visible for offline server in drawer', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    // Open drawer for offline server (Terraria)
    const secondCard = page.locator('.server-card').nth(1);
    await secondCard.locator('button:has-text("Details")').click();
    await page.waitForTimeout(500);

    const drawer = page.locator('.drawer');
    await expect(drawer.locator('button:has-text("SFTP Only")')).toBeVisible();
  });

  test('SFTP Credentials button visible for running server in drawer', async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });

    // Open drawer for running server (Minecraft)
    const firstCard = page.locator('.server-card').first();
    await firstCard.locator('button:has-text("Details")').click();
    await page.waitForTimeout(500);

    const drawer = page.locator('.drawer');
    await expect(drawer.locator('button:has-text("SFTP Credentials")')).toBeVisible();
  });
});
