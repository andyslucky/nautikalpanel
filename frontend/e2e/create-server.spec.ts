import { test, expect } from './fixtures';

// Helper to scope locators to the create modal only
const createModal = (page: any) => page.locator('[aria-labelledby="defaultModalTitle"]');

test.describe('Create Server Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('main button:has-text("Add Server")').click();
    await page.waitForTimeout(300);
  });

  test('modal opens when clicking Add Server', async ({ page }) => {
    const modal = createModal(page);
    await expect(modal).toBeVisible();

    const title = modal.locator('h3#defaultModalTitle');
    await expect(title).toContainText('Create Server');
  });

  test('modal has tab navigation', async ({ page }) => {
    const tabs = createModal(page).locator('[role="tab"]');

    await expect(tabs).toHaveCount(5);
    await expect(tabs.nth(0)).toContainText('General');
    await expect(tabs.nth(1)).toContainText('Pod Config');
    await expect(tabs.nth(2)).toContainText('Storage Config');
    await expect(tabs.nth(3)).toContainText('Service Config');
    await expect(tabs.nth(4)).toContainText('Misc');

    // General tab should be active by default
    await expect(tabs.nth(0)).toHaveClass(/tab-btn-active/);
  });

  test('can switch between tabs', async ({ page }) => {
    const tabs = createModal(page).locator('[role="tab"]');

    // Click Pod Config tab
    await tabs.nth(1).click();
    await page.waitForTimeout(200);
    await expect(tabs.nth(1)).toHaveClass(/tab-btn-active/);
    await expect(tabs.nth(0)).toHaveClass(/tab-btn-inactive/);

    // Click Storage Config tab
    await tabs.nth(2).click();
    await page.waitForTimeout(200);
    await expect(tabs.nth(2)).toHaveClass(/tab-btn-active/);

    // Click Service Config tab
    await tabs.nth(3).click();
    await page.waitForTimeout(200);
    await expect(tabs.nth(3)).toHaveClass(/tab-btn-active/);

    // Click Misc tab
    await tabs.nth(4).click();
    await page.waitForTimeout(200);
    await expect(tabs.nth(4)).toHaveClass(/tab-btn-active/);
  });

  test('general tab has form fields', async ({ page }) => {
    const modal = createModal(page);
    await expect(modal.locator('label:has-text("Server Name")')).toBeVisible();
    await expect(modal.getByText('Template', { exact: true })).toBeVisible();
    await expect(modal.locator('label:has-text("Game Version")')).toBeVisible();
    await expect(modal.locator('label:has-text("Max Players")')).toBeVisible();
    await expect(modal.locator('label:has-text("Game Type")')).toBeVisible();
    await expect(modal.locator('label:has-text("Icon URL")')).toBeVisible();
    await expect(modal.locator('label:has-text("Description")')).toBeVisible();
  });

  test('can select a template from dropdown', async ({ page }) => {
    const modal = createModal(page);
    // Click the template dropdown button to open it
    const templateDropdownBtn = modal.locator('button[aria-haspopup="listbox"]');
    await templateDropdownBtn.click();
    await page.waitForTimeout(200);

    // Click the minecraft option in the dropdown
    const minecraftOption = modal.locator('button:has-text("minecraft")');
    await minecraftOption.first().click();
    await page.waitForTimeout(300);

    // After selecting template, game type should be populated
    const gameTypeInput = modal.locator('label:has-text("Game Type") + input, label:has-text("Game Type") ~ input');
    await expect(gameTypeInput).toHaveValue('minecraft');
  });

  test('can fill server name', async ({ page }) => {
    const modal = createModal(page);
    const nameInput = modal.locator('label:has-text("Server Name") + input, label:has-text("Server Name") ~ input');
    await nameInput.fill('Test Server');
    await expect(nameInput).toHaveValue('Test Server');
  });

  test('pod config tab has resource sliders', async ({ page }) => {
    const modal = createModal(page);
    const tabs = modal.locator('[role="tab"]');
    await tabs.nth(1).click();
    await page.waitForTimeout(200);

    await expect(modal.locator('label:has-text("Container Image")')).toBeVisible();
    await expect(modal.locator('text=CPU (Cores)')).toBeVisible();
    await expect(modal.locator('text=Memory')).toBeVisible();
    await expect(modal.locator('label:has-text("Command (comma-separated)")')).toBeVisible();
    await expect(modal.locator('label:has-text("Environment Variables")')).toBeVisible();
  });

  test('storage config tab has form fields', async ({ page }) => {
    const modal = createModal(page);
    const tabs = modal.locator('[role="tab"]');
    await tabs.nth(2).click();
    await page.waitForTimeout(200);

    await expect(modal.locator('label:has-text("Storage Size")')).toBeVisible();
    await expect(modal.locator('label:has-text("Size Unit")')).toBeVisible();
    await expect(modal.locator('label:has-text("Container Path")')).toBeVisible();
    await expect(modal.locator('label:has-text("Storage Class (Optional)")')).toBeVisible();
    await expect(modal.locator('label:has-text("User/Group ID")')).toBeVisible();
  });

  test('service config tab has port configuration', async ({ page }) => {
    const modal = createModal(page);
    const tabs = modal.locator('[role="tab"]');
    await tabs.nth(3).click();
    await page.waitForTimeout(200);

    await expect(modal.locator('label:has-text("Service Type")')).toBeVisible();
    await expect(modal.locator('label:has-text("IP Address (Optional)")')).toBeVisible();
    await expect(modal.locator('label:has-text("Ports")')).toBeVisible();
  });

  test('misc tab has user/group id field', async ({ page }) => {
    const modal = createModal(page);
    const tabs = modal.locator('[role="tab"]');
    await tabs.nth(4).click();
    await page.waitForTimeout(200);

    await expect(modal.locator('label:has-text("User/Group ID")')).toBeVisible();
  });

  test('modal closes on cancel button', async ({ page }) => {
    const modal = createModal(page);
    const cancelButton = modal.locator('button:has-text("Cancel")');
    await cancelButton.click();
    await page.waitForTimeout(300);

    await expect(modal).not.toBeVisible();
  });

  test('modal closes on X button', async ({ page }) => {
    const modal = createModal(page);
    const closeButton = modal.locator('button[aria-label="close modal"]');
    await closeButton.click();
    await page.waitForTimeout(300);

    await expect(modal).not.toBeVisible();
  });

  test('modal closes on backdrop click', async ({ page }) => {
    const modal = createModal(page);
    // Click on the backdrop (outside the modal dialog)
    await page.mouse.click(50, 50);
    await page.waitForTimeout(300);

    await expect(modal).not.toBeVisible();
  });

  test('create button exists in footer', async ({ page }) => {
    const modal = createModal(page);
    const createButton = modal.locator('button:has-text("Create")');
    await expect(createButton).toBeVisible();
  });
});
