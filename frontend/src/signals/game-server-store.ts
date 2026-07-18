import { batch, signal } from "@preact/signals";
import { showToast } from "../utils/toast";
import { notifyBus } from "./notify";

export type Server = {
    id: string;
    icon_url: string;
    name: string;
    description: string;
    game: string;
    game_version: string;
    game_server: any;
    image: string;
    storage_size: number;
    storage_unit: string;
    network_identity: any;
    ip: string;
    ports: any[];
    players: number;
    max_players: number;
    status: string;
    instance_type: string | null;
    instance_id: string | null;
    cpu_request?: string;
    cpu_limit?: string;
    memory_request?: string;
    memory_limit?: string;
    cpu_usage_millicores?: number;
    memory_usage_bytes?: number;
};

export type GameServerInstance = {
    game_server_id: string;
    id: string;
    nautikal_pod_type: string;
    pod_status?: string;
};

type GameServerEvent = {
    event_type: { PodLifeCycle: string } | { Metrics: { game_server_id?: string; cpu_usage_millicores: number; memory_usage_bytes: number }[] };
    game_server_instance?: GameServerInstance;
};

type GameServerTemplate = {
    template_name: string;
    icon_url?: string;
    description?: string;
    game_type?: string;
    game_version?: string;
    pod_template?: string | null;
    init_template?: string | null;
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
};

export const servers = signal<Server[]>([]);
export const templates = signal<GameServerTemplate[]>([]);
export const watchSocket = signal<WebSocket | null>(null);
export const watchReconnectDelay = signal(10_000);
export const watchReconnectTimer = signal(-1);

export async function init() {
    window.addEventListener("beforeunload", () => {
        disconnectWatchSocket();
    });
    await fetchServers();
    connectWatchSocket();
}

export async function fetchServers() {
    try {
        const response = await fetch('/api/v1/game-servers');
        const data = await response.json();
        servers.value = data.map((s: any) => ({
            id: s.game_server_id,
            icon_url: s.game_server.icon_url,
            name: s.game_server.name,
            description: s.game_server.description || '',
            game: s.game_server.game_type,
            game_version: s.game_server.game_version,
            game_server: s.game_server,
            image: s.game_server.pod_config?.image || '',
            storage_size: s.game_server.pvc_config?.size || 0,
            storage_unit: s.game_server.pvc_config?.size_unit || 'Gi',
            network_identity: s.network_identity,
            ip: s.network_identity?.ip_address || '',
            ports: s.network_identity?.ports || [],
            players: 0,
            max_players: s.game_server.max_players,
            status: s.instance ? s.instance.pod_status : 'Offline',
            instance_type: s.instance?.nautikal_pod_type || null,
            instance_id: s.instance?.id || null,
            cpu_request: s.game_server.pod_config?.resources?.requests?.cpu,
            cpu_limit: s.game_server.pod_config?.resources?.limits?.cpu,
            memory_request: s.game_server.pod_config?.resources?.requests?.memory,
            memory_limit: s.game_server.pod_config?.resources?.limits?.memory,
            cpu_usage_millicores: 0,
            memory_usage_bytes: 0,
        }));
    } catch (error) {
        console.error('Failed to fetch servers:', error);
        servers.value = [];
    }
}

export function connectWatchSocket() {
    disconnectWatchSocket();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/v1/game-servers/watch`;
    watchSocket.value = new WebSocket(wsUrl);

    watchSocket.value.onopen = () => {
        console.log('Watch WebSocket connected');
    };

    watchSocket.value.onmessage = (event: MessageEvent) => {
        try {
            const data: GameServerEvent = JSON.parse(event.data);
            handleWatchEvent(data);
        } catch (e) {
            console.error('Failed to parse watch event:', e);
        }
    };

    watchSocket.value.onclose = () => {
        console.log('Watch WebSocket closed. Reconnecting in', watchReconnectDelay.value, 'ms');
        watchReconnectTimer.value = window.setTimeout(() => {
            watchReconnectDelay.value = Math.min(watchReconnectDelay.value * 2, 30000);
            connectWatchSocket();
        }, watchReconnectDelay.value);
    };

    watchSocket.value.onerror = (error: Event) => {
        console.error('Watch WebSocket error:', error);
    };
}

export function disconnectWatchSocket() {
    if (watchReconnectTimer.value !== -1) {
        clearTimeout(watchReconnectTimer.value);
        watchReconnectTimer.value = -1;
    }
    if (watchSocket.value != null) {
        try {
            watchSocket.value.close();
        } catch (e) {
            console.error('Failed closing the watch WebSocket', e);
        } finally {
            watchSocket.value = null;
        }
    }
}

export function handleWatchEvent(event: GameServerEvent) {
    console.log('Received game server update', event);

    if ('Metrics' in event.event_type) {
        const metrics = (event.event_type as Extract<typeof event.event_type, { Metrics: any }>).Metrics;
        batch(() => {
            const current = servers.value;
            let changed = false;
            const updated = current.map((s) => {
                const metric = metrics.find((m: any) => m.game_server_id === s.id);
                if (metric) {
                    changed = true;
                    return { ...s, cpu_usage_millicores: metric.cpu_usage_millicores, memory_usage_bytes: metric.memory_usage_bytes };
                }
                return s;
            });
            if (changed) servers.value = updated;
        });
        return;
    }

    if ('PodLifeCycle' in event.event_type && event.game_server_instance == null) return;
    const instance = event.game_server_instance;
    const index = servers.value.findIndex((s) => s.id === instance!.game_server_id);
    if (index === -1) return;
    let status = '';
    if (event.event_type.PodLifeCycle == 'Deleted') {
        status = 'Offline';
    } else if (instance != null) {
        status = instance.pod_status!;
    } else {
        status = event.event_type.PodLifeCycle;
    }
    const updatedServer: Server = {
        ...servers.value[index],
        status,
        instance_type: instance ? instance.nautikal_pod_type : servers.value[index].instance_type,
        instance_id: instance ? instance.id : servers.value[index].instance_id,
    };
    if (event.event_type.PodLifeCycle == 'Deleted') {
        updatedServer.cpu_usage_millicores = undefined;
        updatedServer.memory_usage_bytes = undefined;
    }
    batch(() => {
        const updated = [...servers.value];
        updated[index] = updatedServer;
        servers.value = updated;
    });
    notifyBus.emit('game-server-status-changed', updatedServer);
}

export function serverAddressLine(server: Server): string {
    const ports = server.ports.map((p: any) => `${p.port}/${p.protocol}`).join(',');
    return server.ip + ':' + ports;
}

export function formatStorage(size: number, unit: string): string {
    return `${size}${unit}`;
}

export function parseCpuToMillicores(value: string | undefined): number {
    if (!value) return 0;
    const str = String(value).trim();
    if (str.endsWith('m')) {
        return parseInt(str.slice(0, -1)) || 0;
    }
    return Math.round((parseFloat(str) || 0) * 1000);
}

export function parseMemoryToBytes(value: string | undefined): number {
    if (!value) return 0;
    const str = String(value).trim();
    const num = parseFloat(str) || 0;
    if (str.endsWith('Gi')) {
        return Math.round(num * 1024 * 1024 * 1024);
    }
    if (str.endsWith('Mi')) {
        return Math.round(num * 1024 * 1024);
    }
    if (str.endsWith('Ki')) {
        return Math.round(num * 1024);
    }
    return Math.round(num);
}

export function calculateCpuUsagePercentage(server: Server | null): number {
    if (!server || !server.cpu_usage_millicores || server.cpu_usage_millicores === 0) {
        return 0;
    }
    const limit = parseCpuToMillicores(server.cpu_limit);
    if (limit === 0) return 0;
    return Math.round((server.cpu_usage_millicores / limit) * 100);
}

export function calculateMemoryUsagePercentage(server: Server | null): number {
    if (!server || !server.memory_usage_bytes || server.memory_usage_bytes === 0) {
        return 0;
    }
    const limit = parseMemoryToBytes(server.memory_limit || server.memory_request);
    if (limit === 0) return 0;
    return Math.round((server.memory_usage_bytes / limit) * 100);
}

export function getCpuUsageColor(percentage: number): string {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
}

export function getMemoryUsageColor(percentage: number): string {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-green-500';
}

export function formatCpuUsage(server: Server | null): string {
    if (!server) return '0m / 0';
    const usage = Math.round(server.cpu_usage_millicores || 0);
    const usageStr = usage > 0 ? `${usage}m` : '0m';
    const limitStr = server.cpu_limit || '0';
    return `${usageStr} / ${limitStr}`;
}

export function formatMemoryUsage(server: Server | null): string {
    if (!server) return '0 MiB / 0';
    const usageBytes = server.memory_usage_bytes || 0;
    const usageMiB = (usageBytes / 1048576).toFixed(0);
    const limitStr = server.memory_limit || server.memory_request || '0';
    const limitMiB = parseMemoryToBytes(limitStr) / 1048576;
    const limitFormatted = limitMiB >= 1024 ? `${(limitMiB / 1024).toFixed(1)} GiB` : `${limitMiB.toFixed(0)} MiB`;
    return `${usageMiB} MiB / ${limitFormatted}`;
}

export async function deleteServer(id: string) {
    const result = await fetch(`/api/v1/game-servers?game_server_id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
    });
    if (!result.ok) {
        showToast((await result.text()) || 'Failed to delete server', 'error');
    } else {
        showToast('Successfully deleted server', 'success');
        await fetchServers();
    }
}

export async function toggleStatus(server: Server) {
    switch (server.status) {
        case 'Offline':
            await startServerInstance(server);
            break;
        case 'Running':
            await stopServerInstance(server);
            break;
        default:
            showToast('Server is the process of starting/stopping...', 'info');
    }
}

export async function startServerInstance(server: Server) {
    const resp = await fetch('/api/v1/game-servers/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_server_id: server.id }),
    });
    if (!resp.ok) {
        showToast((await resp.text()) || 'Failed to start server', 'error');
    } else {
        showToast(`Starting server ${server.name}`, 'info');
    }
}

export async function startSftpOnly(server: Server) {
    const resp = await fetch('/api/v1/game-servers/start-sftp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_server_id: server.id }),
    });
    if (!resp.ok) {
        showToast((await resp.text()) || 'Failed to start SFTP server', 'error');
    } else {
        showToast(`Starting SFTP for ${server.name}`, 'info');
    }
}

export async function fetchSftpCredentials(server: Server) {
    try {
        const resp = await fetch(`/api/v1/game-servers/${server.id}/sftp-credentials`);
        if (resp.ok) {
            return await resp.json();
        } else {
            showToast('No SFTP credentials found. Start SFTP first.', 'error');
            return null;
        }
    } catch (e) {
        console.error(e);
        showToast('Failed to fetch SFTP credentials', 'error');
        return null;
    }
}

export async function stopServerInstance(server: Server) {
    const resp = await fetch('/api/v1/game-servers/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_server_id: server.id }),
    });
    if (!resp.ok) {
        showToast((await resp.text()) || 'Failed to stop server', 'error');
    } else {
        showToast(`Stopping server ${server.name}`, 'info');
    }
}
