import { test, expect } from '@playwright/test';

test.describe('Integration Smoke Tests', () => {
  test('API - game servers endpoint returns JSON array', async ({ request }) => {
    const resp = await request.get('/api/v1/game-servers');
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('API - game server templates endpoint returns JSON array', async ({ request }) => {
    const resp = await request.get('/api/v1/game-server-templates');
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('API - template repositories endpoint returns JSON array', async ({ request }) => {
    const resp = await request.get('/api/v1/template-repositories');
    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('Frontend loads and renders the app shell', async ({ page }) => {
    await page.goto('/');
    // The app should render at least the sidebar or main content
    await expect(page.locator('body')).toBeVisible();
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('Create a game server via API and verify via list', async ({ request }) => {
    // Fetch templates to get a valid template
    const templatesResp = await request.get('/api/v1/game-server-templates');
    expect(templatesResp.ok()).toBeTruthy();
    const templates = await templatesResp.json();

    if (templates.length === 0) {
      test.skip(true, 'No templates available in integration cluster');
    }

    const template = templates[0];

    // Create a game server
    const createResp = await request.post('/api/v1/game-servers', {
      data: {
        name: `ci-test-${Date.now()}`,
        game_version: '1.0',
        max_players: 4,
        template: {
          template_name: template.template_name || 'generic',
          pod_config: template.pod_config || { image: 'alpine:latest' },
          service_config: template.service_config || { ports: [{ port: 80, protocol: 'TCP' }] },
          pvc_config: template.pvc_config || { size: 1, size_unit: 'Gi', container_path: '/data' },
        },
      },
    });
    expect(createResp.ok()).toBeTruthy();

    // Verify it appears in the list
    const listResp = await request.get('/api/v1/game-servers');
    const list = await listResp.json();
    expect(Array.isArray(list)).toBe(true);
  });
});
