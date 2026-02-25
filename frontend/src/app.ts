import Alpine from "alpinejs";

export type Server = {
    id: string;
    icon_url: string;
    name: string;
    game: string;
    game_version: string;
    game_server: any;
    image: string;
    storage_size: number;
    network_identity: any;
    ip: string;
    ports: any[];
    players: number;
    max_players: number;
    status: string;
    instance_type: string | null;
    instance_id: string | null;
};

export type GameServerInstance = {
    game_server_id : string,
    id: string,
    nautikal_pod_type: string,
    pod_status?: string,
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

type AppData = {
    page: "home" | "settings";
    showModal: false;
    sidebarOpen: false;
    servers: Server[];
    gameServerTemplates: GameServerTemplate[];
    watchSocket: WebSocket | null;
    watchReconnectDelay: number;
    watchReconnectTimer: number;
    showLogViewer: false;
    logViewerServer: {};
    logLines: string[];
    logConnected: false;
    logSocket: null;
    showSftpCredentials: false;
    sftpCredentials: {};
    sftpCredentialsServer: null;
    settings: { darkMode: boolean };
    init(): void;
    loadSettings(): void;
    showToast(message: string, variant?: ("info" | "success" | "warning" | "danger")): void;
    connectWatchSocket(): void;
    disconnectWatchSocket(): void;
    handleWatchEvent(event: {event_type: string, game_server_instance: GameServerInstance}): void;
    fetchServers(): Promise<void>;
    serverAddressLine(server: Server): string;
    createServer(): Promise<void>;
    deleteServer(id: string): Promise<void>;
    toggleStatus(server: Server): Promise<void>;
    startServerInstance(server: Server): Promise<void>;
    startSftpOnly(server: Server): Promise<void>;
    fetchSftpCredentials(server: Server): Promise<void>;
    closeSftpCredentials(): void;
    stopServerInstance(server: Server): Promise<void>;
    toggleDarkMode(): void;
    openLogs(server: Server): void;
    closeLogs(): void;
    clearLogs(): void;
    connectLogWebSocket(gameServerId: string): void;
    disconnectLogWebSocket(): void
}

Alpine.data("app", (): AppData => ({
    page: 'home' as 'home' | 'settings',
    showModal: false,
    sidebarOpen: false,
    servers: [] as Server[],
    gameServerTemplates: [] as GameServerTemplate[],
    watchSocket: null,
    watchReconnectDelay: 1000,
    watchReconnectTimer: -1,
    showLogViewer: false,
    logViewerServer: {},
    logLines: [] as string[],
    logConnected: false,
    logSocket: null,
    showSftpCredentials: false,
    sftpCredentials: {},
    sftpCredentialsServer: null,
    settings: {
        darkMode: false,
    },

    async init() {
        this.loadSettings();
        await this.fetchServers();
        this.connectWatchSocket();
    },

    loadSettings() {
        this.settings.darkMode = localStorage.getItem('darkMode') === 'true';
        if (this.settings.darkMode) document.documentElement.classList.add('dark');
    },

    showToast(message: string, variant: 'info' | 'success' | 'warning' | 'danger' = 'info') {
        this.$dispatch('notify', {
            variant,
            message
        });
    },

    connectWatchSocket() {
        this.disconnectWatchSocket();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/v1/game-servers/watch`;
        this.watchSocket = new WebSocket(wsUrl);

        this.watchSocket.onopen = () => {
            console.log('Watch WebSocket connected');
            // Reset reconnect delay on successful connection
            this.watchReconnectDelay = 1000;
        };

        this.watchSocket.onmessage = (event: MessageEvent) => {
            try {
                const data: GameServerInstance = JSON.parse(event.data);
                this.handleWatchEvent(data);
            } catch (e) {
                console.error('Failed to parse watch event:', e);
            }
        };

        this.watchSocket.onclose = () => {
            console.log('Watch WebSocket closed. Reconnecting in', this.watchReconnectDelay, 'ms');
            this.watchReconnectTimer = setTimeout(() => {
                // Exponential backoff capped at 30s
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
            this.watchSocket.onclose = null; // Prevent reconnect on intentional close
            this.watchSocket.close();
            this.watchSocket = null;
        }
    },

    handleWatchEvent(event: {event_type: string, game_server_instance?: GameServerInstance}) {
        console.log("Received game server update", event)
        if (event.game_server_instance == null) return;
        const server : Server | undefined = this.servers.find( ( s : Server) : boolean => s.id === event.game_server_instance.game_server_id);
        if (!server) return;
        let status = '';
        if (event.event_type == 'Deleted') {
            status = 'Offline'
        } else if (event.game_server_instance != null) {
            status = event.game_server_instance.pod_status;
        } else {
            status = event.event_type;
        }
        server.status = status
        if (event.game_server_instance) {
            server.instance_type = event.game_server_instance.nautikal_pod_type
        }
    },

    async fetchServers() {
        try {
            const response = await fetch('/api/v1/game-servers');
            const data = await response.json();
            this.servers = data.map((s: any) => ({
                id: s.game_server_id,
                icon_url: s.game_server.icon_url,
                name: s.game_server.name,
                game: s.game_server.game_type,
                game_version: s.game_server.game_version,
                game_server: s.game_server,
                image: s.game_server.pod_config?.image || '',
                storage_size: s.game_server.pvc_config?.size_mib || 0,
                network_identity: s.network_identity,
                ip: s.network_identity?.ip_address || '',
                ports: s.network_identity?.ports || [],
                players: 0,
                max_players: s.game_server.max_players,
                status: s.instance ? s.instance.pod_status : 'Offline',
                instance_type: s.instance?.nautikal_pod_type || null,
                instance_id: s.instance?.id || null
            }));
        } catch (error) {
            console.error('Failed to fetch servers:', error);
            this.servers = [];
        }
    },

    serverAddressLine(server: Server) {
        const ports = server.ports.map(p => `${p.port}/${p.protocol}`).join(",");
        return server.ip + ":" + ports;
    },

    async createServer() {
        const template = this.form.template;
        const newServerRequest = {
            name: this.form.name,
            game_version: this.form.game_version || null,
            max_players: this.form.max_players ? parseInt(this.form.max_players) : null,
            template: {
                ...template,
                service_config: {
                    ...template.service_config,
                    ports: template.service_config.ports.map(p => ({
                        port: parseInt(p.port),
                        protocol: p.protocol
                    }))
                },
                pvc_config: {
                    ...template.pvc_config,
                    size: typeof template.pvc_config.size === 'number' ? template.pvc_config.size : parseInt(template.pvc_config.size) || 0
                },
                pod_config: {
                    ...template.pod_config,
                    resources: template.pod_config.resources && (template.pod_config.resources.requests || template.pod_config.resources.limits)
                        ? {
                            requests: template.pod_config.resources.requests || null,
                            limits: template.pod_config.resources.limits || null
                        }
                        : null,
                    command: template.pod_config.command && template.pod_config.command.length > 0 ? template.pod_config.command : null,
                    mounts: template.pod_config.mounts && template.pod_config.mounts.length > 0 ? template.pod_config.mounts : null
                }
            }
        };
        try {
            const resp = await fetch("/api/v1/game-servers", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(newServerRequest)
            });
            if (!resp.ok) {
                let err = await resp.text();
                this.showToast(err || 'Failed to create server', 'error');
            } else {
                this.showToast("Successfully created server " + this.form.name, 'success');
                await this.fetchServers();
                this.showModal = false;
            }
        } catch (e) {
            console.error(e);
        }
    },

    async deleteServer(id: string) {
        const result = await fetch(`/api/v1/game-servers?game_server_id=${encodeURIComponent(id)}`, {
            method: "DELETE"
        });
        if (!result.ok) {
            this.showToast((await result.text()) || "Failed to delete server", "error");
        } else {
            this.showToast(`Successfully deleted server`, "success");
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
                this.showToast("Server is the process of starting/stopping...", "info");
        }
    },

    async startServerInstance(server: Server) {
        const resp = await fetch("/api/v1/game-servers/start", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({game_server_id: server.id})
        });
        if (!resp.ok) {
            this.showToast((await resp.text()) || "Failed to start server", "error");
        } else {
            this.showToast(`Starting server ${server.name}`, 'info');
        }
    },

    async startSftpOnly(server: Server) {
        const resp = await fetch("/api/v1/game-servers/start-sftp", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({game_server_id: server.id})
        });
        if (!resp.ok) {
            this.showToast((await resp.text()) || "Failed to start SFTP server", "error");
        } else {
            this.showToast(`Starting SFTP for ${server.name}`, 'info');
        }
    },

    async fetchSftpCredentials(server: Server) {
        try {
            const resp = await fetch(`/api/v1/game-servers/${server.id}/sftp-credentials`);
            if (resp.ok) {
                this.sftpCredentials = await resp.json();
                this.sftpCredentialsServer = server;
                this.showSftpCredentials = true;
            } else {
                this.showToast("No SFTP credentials found. Start SFTP first.", "error");
            }
        } catch (e) {
            console.error(e);
            this.showToast("Failed to fetch SFTP credentials", "error");
        }
    },

    closeSftpCredentials() {
        this.showSftpCredentials = false;
        this.sftpCredentials = null;
        this.sftpCredentialsServer = null;
    },

    async stopServerInstance(server: Server) {
        const resp = await fetch("/api/v1/game-servers/stop", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({game_server_id: server.id})
        });
        if (!resp.ok) {
            this.showToast((await resp.text()) || "Failed to stop server", "error");
        } else {
            this.showToast(`Stopping server ${server.name}`, "info");
        }
    },

    toggleDarkMode() {
        localStorage.setItem('darkMode', this.settings.darkMode.toString());
        document.documentElement.classList.toggle('dark', this.settings.darkMode);
    },

    openLogs(server: Server) {
        this.logViewerServer = server;
        this.logLines = [];
        this.showLogViewer = true;
        this.connectLogWebSocket(server.id);
    },

    closeLogs() {
        this.showLogViewer = false;
        this.logLines = [];
        this.disconnectLogWebSocket();
    },

    clearLogs() {
        this.logLines = [];
    },

    connectLogWebSocket(gameServerId: string) {
        this.disconnectLogWebSocket();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/v1/game-servers/${gameServerId}/logs`;
        this.logSocket = new WebSocket(wsUrl);
        this.logConnected = false;
        this.logSocket.onopen = () => {
            this.logConnected = true;
        };
        this.logSocket.onmessage = (event) => {
            this.logLines.push(event.data);
            if (this.logLines.length > 1000) {
                this.logLines = this.logLines.slice(-1000);
            }
            this.$nextTick(() => {
                const container = this.$refs.logContainer as HTMLElement;
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
            });
        };
        this.logSocket.onclose = () => {
            this.logConnected = false;
        };
        this.logSocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.logConnected = false;
        };
    },

    disconnectLogWebSocket() {
        if (this.logSocket) {
            this.logSocket.close();
            this.logSocket = null;
        }
        this.logConnected = false;
    }
}));