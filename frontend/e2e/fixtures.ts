import { test as base, expect, type Page } from '@playwright/test';

export type ServerStatus = 'Running' | 'Offline' | 'Pending' | 'ContainerCreating';

export interface MockServer {
  game_server_id: string;
  game_server: {
    name: string;
    description: string;
    game_type: string;
    game_version: string;
    icon_url: string;
    max_players: number;
    pod_config?: {
      image?: string;
      resources?: {
        requests?: { cpu?: string; memory?: string };
        limits?: { cpu?: string; memory?: string };
      };
    };
    pvc_config?: {
      size: number;
      size_unit: string;
    };
  };
  network_identity: {
    ip_address: string;
    ports: Array<{ port: number; protocol: string }>;
  };
  instance?: {
    id: string;
    nautikal_pod_type: string;
    pod_status: ServerStatus;
  } | null;
}

export interface MockTemplate {
  template_name: string;
  icon_url?: string;
  description?: string;
  game_type?: string;
  game_version?: string;
  default_max_users?: number;
  pod_config?: {
    image?: string;
    resources?: {
      requests?: { cpu?: string; memory?: string };
      limits?: { cpu?: string; memory?: string };
    };
    command?: string[];
    env?: Record<string, string>;
    mounts?: any[];
  };
  service_config?: {
    ports?: Array<{ port: string; protocol: string }>;
    ip_address?: string;
    service_type?: string;
  };
  pvc_config?: {
    size: number | string;
    size_unit: string;
    container_path?: string;
    storage_class?: string;
  };
}

export const mockServers: MockServer[] = [
  {
    game_server_id: 'srv-1',
    game_server: {
      name: 'My Minecraft Server',
      description: 'A fun Minecraft server',
      game_type: 'minecraft',
      game_version: '1.20.4',
      icon_url: 'https://example.com/mc.png',
      max_players: 20,
      pod_config: {
        image: 'itzg/minecraft-server',
        resources: {
          requests: { cpu: '250m', memory: '512Mi' },
          limits: { cpu: '1000m', memory: '2048Mi' },
        },
      },
      pvc_config: { size: 10, size_unit: 'Gi' },
    },
    network_identity: {
      ip_address: '192.168.1.100',
      ports: [{ port: 25565, protocol: 'TCP' }],
    },
    instance: {
      id: 'inst-1',
      nautikal_pod_type: 'gameserver',
      pod_status: 'Running',
    },
  },
  {
    game_server_id: 'srv-2',
    game_server: {
      name: 'Terraria World',
      description: '',
      game_type: 'terraria',
      game_version: '1.4.4.9',
      icon_url: 'https://example.com/terraria.png',
      max_players: 8,
      pod_config: {
        image: 'ryshe/terraria',
        resources: {
          requests: { cpu: '100m', memory: '256Mi' },
          limits: { cpu: '500m', memory: '1024Mi' },
        },
      },
      pvc_config: { size: 5, size_unit: 'Gi' },
    },
    network_identity: {
      ip_address: '192.168.1.101',
      ports: [{ port: 7777, protocol: 'TCP' }],
    },
    instance: null,
  },
  {
    game_server_id: 'srv-3',
    game_server: {
      name: 'Valheim Server',
      description: 'Viking survival',
      game_type: 'valheim',
      game_version: '0.217.14',
      icon_url: 'https://example.com/valheim.png',
      max_players: 10,
      pod_config: {
        image: 'ghcr.io/lloesche/valheim-server',
        resources: {
          requests: { cpu: '500m', memory: '1024Mi' },
          limits: { cpu: '2000m', memory: '4096Mi' },
        },
      },
      pvc_config: { size: 20, size_unit: 'Gi' },
    },
    network_identity: {
      ip_address: '192.168.1.102',
      ports: [
        { port: 2456, protocol: 'UDP' },
        { port: 2457, protocol: 'UDP' },
      ],
    },
    instance: {
      id: 'inst-3',
      nautikal_pod_type: 'sftp-only',
      pod_status: 'Running',
    },
  },
];

export const mockTemplates: MockTemplate[] = [
  {
    template_name: 'minecraft',
    icon_url: 'https://example.com/mc.png',
    description: 'Minecraft Java Edition server',
    game_type: 'minecraft',
    game_version: '1.20.4',
    default_max_users: 20,
    pod_config: {
      image: 'itzg/minecraft-server',
      resources: {
        requests: { cpu: '250m', memory: '512Mi' },
        limits: { cpu: '1000m', memory: '2048Mi' },
      },
      command: [],
      env: { EULA: 'TRUE' },
      mounts: [],
    },
    service_config: {
      ports: [{ port: '25565', protocol: 'TCP' }],
      service_type: 'LoadBalancer',
    },
    pvc_config: {
      size: 10,
      size_unit: 'Gi',
      container_path: '/data',
    },
  },
  {
    template_name: 'terraria',
    icon_url: 'https://example.com/terraria.png',
    description: 'Terraria dedicated server',
    game_type: 'terraria',
    game_version: '1.4.4.9',
    default_max_users: 8,
    pod_config: {
      image: 'ryshe/terraria',
      resources: {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '500m', memory: '1024Mi' },
      },
      command: [],
      env: {},
      mounts: [],
    },
    service_config: {
      ports: [{ port: '7777', protocol: 'TCP' }],
      service_type: 'LoadBalancer',
    },
    pvc_config: {
      size: 5,
      size_unit: 'Gi',
      container_path: '/world',
    },
  },
];

export const mockRepositories = [
  { id: 'repo::default', name: 'Default Templates', url: '/app/templates/default' },
  { id: 'repo::community', name: 'Community', url: 'https://github.com/example/nautikal-templates' },
];

export async function setupApiMocks(page: Page): Promise<void> {
  // Mock game servers list
  await page.route('/api/v1/game-servers', async (route, request) => {
    const method = request.method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockServers),
      });
    } else if (method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else if (method === 'DELETE') {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });

  // Mock game server templates
  await page.route('/api/v1/game-server-templates', async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTemplates),
      });
    } else {
      await route.continue();
    }
  });

  // Mock template repositories
  await page.route('/api/v1/template-repositories', async (route, request) => {
    const method = request.method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockRepositories),
      });
    } else if (method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'repo::new', name: 'New Repo', url: 'https://new.example.com' }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock template repository delete
  await page.route(/\/api\/v1\/template-repositories\/.+/, async (route, request) => {
    if (request.method() === 'DELETE') {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });

  // Mock game server start
  await page.route('/api/v1/game-servers/start', async (route, request) => {
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock game server stop
  await page.route('/api/v1/game-servers/stop', async (route, request) => {
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock game server start-sftp
  await page.route('/api/v1/game-servers/start-sftp', async (route, request) => {
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock SFTP credentials
  await page.route(/\/api\/v1\/game-servers\/.+\/sftp-credentials/, async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ username: 'sftp-user', password: 'secret123' }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock game server update (PUT)
  await page.route(/\/api\/v1\/game-servers\/.+/, async (route, request) => {
    if (request.method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.continue();
    }
  });

  // Mock WebSocket connections (watch and logs)
  await page.route(/\/api\/v1\/game-servers\/watch/, async (route) => {
    await route.fulfill({ status: 426, body: 'WebSocket mocked' });
  });

  await page.route(/\/api\/v1\/game-servers\/.+\/logs/, async (route) => {
    await route.fulfill({ status: 426, body: 'WebSocket mocked' });
  });
}

export async function navigateToHome(page: Page): Promise<void> {
  await page.goto('/');
  // Wait for Preact to render main content (preact-iso's LocationProvider
  // matches `/` to the Dashboard route).
  await page.waitForSelector('main.main-content', { state: 'visible' });
  // Wait for stores to load
  await page.waitForTimeout(500);
}

/**
 * The former "Home" page (server cards + "Game Servers" heading) is now the
 * "Servers" route at `/servers`. The default landing route is the dashboard
 * at `/`. Tests that exercise server cards must navigate here explicitly.
 */
export async function navigateToServers(page: Page): Promise<void> {
  await page.goto('/servers');
  await page.waitForSelector('main.main-content', { state: 'visible' });
  await page.waitForSelector('.server-card', { timeout: 10000 });
}

export const test = base.extend<{
  mockApi: void;
  navigateHome: void;
}>({
  mockApi: [async ({ page }, use) => {
    await setupApiMocks(page);
    await use();
  }, { auto: true }],

  navigateHome: [async ({ page }, use) => {
    await navigateToHome(page);
    await use();
  }, { auto: true }],
});

export { expect };
