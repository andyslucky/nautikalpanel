import { test, expect } from './fixtures';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.locator('aside nav a:has-text("Settings")').click();
    // Wait for Preact hash-based navigation to complete
    await page.waitForFunction(() => window.location.hash === '#settings', null, { timeout: 5000 });
    await page.waitForTimeout(300);
  });

  test('displays settings heading', async ({ page }) => {
    await expect(page.locator('main h2.heading-secondary')).toContainText('Settings');
  });

  test('dark mode toggle exists', async ({ page }) => {
    const darkModeLabel = page.locator('label:has-text("Dark Mode")');
    await expect(darkModeLabel).toBeVisible();

    const darkModeCheckbox = darkModeLabel.locator('input[type="checkbox"]');
    await expect(darkModeCheckbox).toBeVisible();
  });

  test('dark mode can be toggled', async ({ page }) => {
    // Find the dark mode checkbox by its label text
    const checkbox = page.locator('label:has-text("Dark Mode") input[type="checkbox"]');

    // Initially dark mode should be off
    await expect(checkbox).not.toBeChecked();

    // Toggle dark mode on
    await checkbox.check();
    await page.waitForTimeout(200);

    // Check that dark class is added to html element
    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);

    // Toggle back off
    await checkbox.uncheck();
    await page.waitForTimeout(200);

    await expect(html).not.toHaveClass(/dark/);
  });

  test('template repositories section is visible', async ({ page }) => {
    await expect(page.locator('main h3.heading-tertiary').first()).toContainText('Template Repositories');

    // Add repository form should be visible (use label-based selectors since inputs have no id)
    await expect(page.locator('label:has-text("Name") + input, label:has-text("Name") ~ input').first()).toBeVisible();
    await expect(page.locator('label:has-text("URL / Path") + input, label:has-text("URL / Path") ~ input').first()).toBeVisible();
    await expect(page.locator('main button:has-text("Add Repository")')).toBeVisible();
  });

  test('displays existing repositories', async ({ page }) => {
    // Wait for repositories to load
    await page.waitForTimeout(500);

    // Should show repository items
    const repoItems = page.locator('.settings-panel .flex.items-center.justify-between');
    await expect(repoItems.first()).toBeVisible();

    // Check first repo content
    await expect(page.locator('text=Default Templates')).toBeVisible();
    await expect(page.getByText('/app/templates/default')).toBeVisible();

    // Check second repo
    await expect(page.locator('text=Community')).toBeVisible();
    await expect(page.getByText('https://github.com/example/nautikal-templates')).toBeVisible();
  });

  test('delete repository button exists for each repo', async ({ page }) => {
    await page.waitForTimeout(500);

    const deleteButtons = page.locator('button:has-text("Delete")');
    const count = await deleteButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('shows empty state when no repositories', async ({ page }) => {
    // Override mock to return empty repositories
    await page.route('/api/v1/template-repositories', async (route, request) => {
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

    await page.reload();
    await page.waitForTimeout(500);

    await page.locator('aside nav a:has-text("Settings")').click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=No template repositories configured.')).toBeVisible();
  });
});
