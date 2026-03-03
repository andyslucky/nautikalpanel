import Alpine from 'alpinejs';

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
    event_type : { PodLifeCycle: string} | { Metrics: {game_server_id? : string, cpu_usage_millicores: number, memory_usage_bytes: number}[]},
    game_server_instance? : GameServerInstance
}

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

import {showToast} from "../utils/toast.ts";

export type GameServerStore = {
    servers: Server[];
    gameServerTemplates: GameServerTemplate[];
    watchSocket: WebSocket | null;
    watchReconnectDelay: number;
    watchReconnectTimer: number;
    init(): Promise<void>;
    fetchServers(): Promise<void>;
    connectWatchSocket(): void;
    disconnectWatchSocket(): void;
    handleWatchEvent(event: GameServerEvent): void;
    serverAddressLine(server: Server): string;
    formatStorage(size: number, unit: string): string;
    formatCpuUsage(server: Server | null): string;
    formatMemoryUsage(server: Server | null): string;
    parseCpuToMillicores(value: string | undefined): number;
    parseMemoryToBytes(value: string | undefined): number;
    calculateCpuUsagePercentage(server: Server | null): number;
    calculateMemoryUsagePercentage(server: Server | null): number;
    getCpuUsageColor(percentage: number): string;
    getMemoryUsageColor(percentage: number): string;
    deleteServer(id: string): Promise<void>;
    toggleStatus(server: Server): Promise<void>;
    startServerInstance(server: Server): Promise<void>;
    startSftpOnly(server: Server): Promise<void>;
    fetchSftpCredentials(server: Server): Promise<void>;
    stopServerInstance(server: Server): Promise<void>;
};

Alpine.store('gameServers', {
    servers: [] as Server[],
    gameServerTemplates: [] as GameServerTemplate[],
    watchSocket: null as WebSocket | null,
    watchReconnectDelay: 1000,
    watchReconnectTimer: -1 as number,

    async init() {
        await this.fetchServers();
        this.connectWatchSocket();
    },

    async fetchServers() {
        try {
            const response = await fetch('/api/v1/game-servers');
            const data = await response.json();
            this.servers = data.map((s: any) => ({
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
                memory_usage_bytes: 0
            }));
        } catch (error) {
            console.error('Failed to fetch servers:', error);
            this.servers = [];
        }
    },

    connectWatchSocket() {
        this.disconnectWatchSocket();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/v1/game-servers/watch`;
        this.watchSocket = new WebSocket(wsUrl);

        this.watchSocket.onopen = () => {
            console.log('Watch WebSocket connected');
            this.watchReconnectDelay = 1000;
        };

        this.watchSocket.onmessage = (event: MessageEvent) => {
            try {
                const data: GameServerEvent = JSON.parse(event.data);
                this.handleWatchEvent(data);
            } catch (e) {
                console.error('Failed to parse watch event:', e);
            }
        };

        this.watchSocket.onclose = () => {
            console.log('Watch WebSocket closed. Reconnecting in', this.watchReconnectDelay, 'ms');
            this.watchReconnectTimer = setTimeout(() => {
                this.watchReconnectDelay = Math.min(this.watchReconnectDelay * 2, 30000);
                this.connectWatchSocket();
            }, this.watchReconnectDelay) as unknown as number;
        };

        this.watchSocket.onerror = (error: Event) => {
            console.error('Watch WebSocket error:', error);
        };
    },

    disconnectWatchSocket() {
        if (this.watchReconnectTimer !== -1) {
            clearTimeout(this.watchReconnectTimer);
            this.watchReconnectTimer = -1;
        }
        if (this.watchSocket) {
            this.watchSocket.onclose = null;
            this.watchSocket.close();
            this.watchSocket = null;
        }
    },

    handleWatchEvent(event: GameServerEvent) {
        console.log('Received game server update', event);
        
        if ("Metrics" in event.event_type) {
            event.event_type.Metrics.forEach((metric: any) => {
                const server: Server | undefined = this.servers.find(
                    (s: Server): boolean => s.id === metric.game_server_id
                );
                if (server) {
                    server.cpu_usage_millicores = metric.cpu_usage_millicores;
                    server.memory_usage_bytes = metric.memory_usage_bytes;
                }
            });
            return;
        }
        
        if ("PodLifeCycle" in event.event_type && event.game_server_instance == null) return;
        const server: Server | undefined = this.servers.find(
            (s: Server): boolean => s.id === event.game_server_instance!.game_server_id
        );
        if (!server) return;
        let status = '';
        if (event.event_type.PodLifeCycle == 'Deleted') {
            status = 'Offline';
        } else if (event.game_server_instance != null) {
            status = event.game_server_instance.pod_status!;
        } else {
            status = event.event_type.PodLifeCycle;
        }
        server.status = status;
        if (event.game_server_instance) {
            server.instance_type = event.game_server_instance.nautikal_pod_type;
        }
    },

    serverAddressLine(server: Server): string {
        const ports = server.ports.map((p: any) => `${p.port}/${p.protocol}`).join(',');
        return server.ip + ':' + ports;
    },

    formatStorage(size: number, unit: string): string {
        return `${size}${unit}`;
    },

    parseCpuToMillicores(value: string | undefined): number {
        if (!value) return 0;
        const str = String(value).trim();
        if (str.endsWith('m')) {
            return parseInt(str.slice(0, -1)) || 0;
        }
        return Math.round((parseFloat(str) || 0) * 1000);
    },

    parseMemoryToBytes(value: string | undefined): number {
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
    },

    calculateCpuUsagePercentage(server: Server | null): number {
        if (!server || !server.cpu_usage_millicores || server.cpu_usage_millicores === 0) {
            return 0;
        }
        const limit = this.parseCpuToMillicores(server.cpu_limit);
        if (limit === 0) return 0;
        return Math.round((server.cpu_usage_millicores / limit) * 100);
    },

    calculateMemoryUsagePercentage(server: Server | null): number {
        if (!server || !server.memory_usage_bytes || server.memory_usage_bytes === 0) {
            return 0;
        }
        const limit = this.parseMemoryToBytes(server.memory_limit || server.memory_request);
        if (limit === 0) return 0;
        return Math.round((server.memory_usage_bytes / limit) * 100);
    },

    getCpuUsageColor(percentage: number): string {
        if (percentage >= 90) return 'bg-red-500';
        if (percentage >= 70) return 'bg-yellow-500';
        return 'bg-green-500';
    },

    getMemoryUsageColor(percentage: number): string {
        if (percentage >= 90) return 'bg-red-500';
        if (percentage >= 70) return 'bg-yellow-500';
        return 'bg-green-500';
    },

    formatCpuUsage(server: Server | null): string {
        if (!server) return '0m / 0';
        const usage = Math.round(server.cpu_usage_millicores || 0);
        const usageStr = usage > 0 ? `${usage}m` : '0m';
        const limitStr = server.cpu_limit || '0';
        return `${usageStr} / ${limitStr}`;
    },

    formatMemoryUsage(server: Server | null): string {
        if (!server) return '0 MiB / 0';
        const usageBytes = server.memory_usage_bytes || 0;
        const usageMiB = (usageBytes / 1048576).toFixed(0);
        const limitStr = server.memory_limit || server.memory_request || '0';
        const limitMiB = this.parseMemoryToBytes(limitStr) / 1048576;
        const limitFormatted = limitMiB >= 1024 ? `${(limitMiB / 1024).toFixed(1)} GiB` : `${limitMiB.toFixed(0)} MiB`;
        return `${usageMiB} MiB / ${limitFormatted}`;
    },

    async deleteServer(id: string) {
        const result = await fetch(`/api/v1/game-servers?game_server_id=${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });
        if (!result.ok) {
            showToast((await result.text()) || 'Failed to delete server', 'error');
        } else {
            showToast('Successfully deleted server', 'success');
            await this.fetchServers();
        }
    },

    async toggleStatus(server: Server) {
        switch (server.status) {
            case 'Offline':
                await this.startServerInstance(server);
                break;
            case 'Running':
                await this.stopServerInstance(server);
                break;
            default:
                showToast('Server is the process of starting/stopping...', 'info');
        }
    },

    async startServerInstance(server: Server) {
        const resp = await fetch('/api/v1/game-servers/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_server_id: server.id })
        });
        if (!resp.ok) {
            showToast((await resp.text()) || 'Failed to start server', 'error');
        } else {
            showToast(`Starting server ${server.name}`, 'info');
        }
    },

    async startSftpOnly(server: Server) {
        const resp = await fetch('/api/v1/game-servers/start-sftp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_server_id: server.id })
        });
        if (!resp.ok) {
            showToast((await resp.text()) || 'Failed to start SFTP server', 'error');
        } else {
            showToast(`Starting SFTP for ${server.name}`, 'info');
        }
    },

    async fetchSftpCredentials(server: Server) {
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
    },

    async stopServerInstance(server: Server) {
        const resp = await fetch('/api/v1/game-servers/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ game_server_id: server.id })
        });
        if (!resp.ok) {
            showToast((await resp.text()) || 'Failed to stop server', 'error');
        } else {
            showToast(`Stopping server ${server.name}`, 'info');
        }
    }
} as GameServerStore);