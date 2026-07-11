import { test, expect } from './fixtures';

// Helper to scope locators to the edit modal only
const editModal = (page: any) => page.locator('[aria-labelledby="editModalTitle"]');

test.describe('Edit Server Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.waitForSelector('.server-card', { timeout: 10000 });
  });

  test('clicking Edit on offline server opens edit modal', async ({ page }) => {
    const secondCard = page.locator('.server-card').nth(1);
    const editButton = secondCard.locator('button:has-text("Edit")');

    await expect(editButton).toBeEnabled();
    await editButton.click();
    await page.waitForTimeout(500);

    const modal = editModal(page);
    await expect(modal).toBeVisible();
    const title = modal.locator('h3#editModalTitle');
    await expect(title).toContainText('Edit Server');
  });

  test('edit modal has tabs', async ({ page }) => {
    const secondCard = page.locator('.server-card').nth(1);
    await secondCard.locator('button:has-text("Edit")').click();
    await page.waitForTimeout(500);

    const modal = editModal(page);
    const tabs = modal.locator('[role="tab"]:has-text("General")');
    await expect(tabs.first()).toBeVisible();
  });

  test('edit modal pre-fills server data', async ({ page }) => {
    const secondCard = page.locator('.server-card').nth(1);
    await secondCard.locator('button:has-text("Edit")').click();
    await page.waitForTimeout(500);

    const modal = editModal(page);
    // Server name should be pre-filled
    const nameInput = modal.locator('input[x-model="editForm.name"]');
    await expect(nameInput).toHaveValue('Terraria World');
  });

  test('edit modal can be closed', async ({ page }) => {
    const secondCard = page.locator('.server-card').nth(1);
    await secondCard.locator('button:has-text("Edit")').click();
    await page.waitForTimeout(500);

    const modal = editModal(page);
    // Close the modal (the X button or cancel)
    const closeButton = modal.locator('button[aria-label="close modal"]');
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    } else {
      // Try clicking Cancel
      const cancelButton = modal.locator('button:has-text("Cancel")');
      await cancelButton.click();
    }
    await page.waitForTimeout(300);

    await expect(modal).not.toBeVisible();
  });
});
