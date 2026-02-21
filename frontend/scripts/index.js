function app() {
    return {
        page: 'home',
        showModal: false,
        editingServer: null,
        sidebarOpen: false,
        servers: [],
        gameServerTemplates: [],
        toast: {
            show: false,
            message: '',
            type: 'error'
        },
        settings: {
            darkMode: false,
            refreshInterval: 30
        },
        refreshTimerId: -1,
        modalConfig: {
            podConfigVisible: false,
            storageVisible: false,
            networkVisible: false,
        },
        showLogViewer: false,
        logViewerServer: null,
        logLines: [],
        logConnected: false,
        logSocket: null,
        init() {
            this.loadSettings();
            this.fetchServers();
            this.setupRefreshTimer();
        },

        loadSettings() {
            this.settings.darkMode = localStorage.getItem('darkMode') === 'true';
            this.settings.refreshInterval = Number.parseInt(localStorage.getItem("refreshInterval") || "30")
            if (this.settings.darkMode) document.documentElement.classList.add('dark');
        },

        showToast(message, variant = 'info') {
            this.$dispatch('notify', {
                variant,
                message
            })
        },
        updateRefreshInterval() {
            localStorage.setItem("refreshInterval", this.settings.refreshInterval);
            this.setupRefreshTimer();
        },
        setupRefreshTimer() {
            if (this.refreshTimerId !== -1) {
                clearInterval(this.refreshTimerId)
            }
            this.refreshTimerId = setInterval(async () => {
                await this.fetchServers();
            }, this.settings.refreshInterval * 1_000)
        },

        async fetchServers() {
            try {
                const response = await fetch('/api/v1/game-servers');
                const data = await response.json();
                this.servers = data.map(s => ({
                    id: s.game_server_id,
                    icon_url: s.game_server.icon_url,
                    name: s.game_server.name,
                    game: s.game_server.game_type,
                    game_version: s.game_server.game_version,
                    image: s.game_server.pod_config?.image || '',
                    storage_size: s.game_server.pvc_config?.size_mib || 0,
                    network_identity: s.network_identity,
                    ip: s.network_identity?.ip_address || '',
                    ports: s.network_identity?.ports || [],
                    players: 0,
                    max_players: s.game_server.max_players,
                    status: s.instance ? s.instance.pod_status : 'Offline',
                    instance_id: s.instance?.id || null
                }));
            } catch (error) {
                console.error('Failed to fetch servers:', error);
                this.servers = [];
            }
        },

        serverAddressLine(server) {
            const ports = server.ports.map(p => `${p.port}/${p.protocol}`).join(",")
            return server.ip + ":" + ports
        },
        async createServer() {
            const template = this.form.template
            const newServerRequest = {
                name: this.form.name,
                game_version: this.form.game_version || null,
                max_players: this.form.max_players ? Number.parseInt(this.form.max_players) : null,
                template: {
                    ...template,
                    service_config: {
                        ...template.service_config,
                        ports: template.service_config.ports.map(p => ({
                            port: Number.parseInt(p.port),
                            protocol: p.protocol
                        }))
                    },
                    pvc_config: {
                        ...template.pvc_config,
                        size: (typeof template.pvc_config.size === 'number') ? template.pvc_config.size : Number.parseInt(template.pvc_config.size) || 0
                    },
                    pod_config: {
                        ...template.pod_config,
                        resources: template.pod_config.resources && (template.pod_config.resources.min_cpu || template.pod_config.resources.max_cpu || template.pod_config.resources.min_mem || template.pod_config.resources.max_mem)
                            ? {
                                min_cpu: Number.parseInt(template.pod_config.resources.min_cpu) || 0,
                                min_cpu_unit: template.pod_config.resources.min_cpu_unit || 'm',
                                max_cpu: Number.parseInt(template.pod_config.resources.max_cpu) || 0,
                                max_cpu_unit: template.pod_config.resources.max_cpu_unit || 'm',
                                min_mem: Number.parseInt(template.pod_config.resources.min_mem) || 0,
                                min_mem_unit: template.pod_config.resources.min_mem_unit || 'Mi',
                                max_mem: Number.parseInt(template.pod_config.resources.max_mem) || 0,
                                max_mem_unit: template.pod_config.resources.max_mem_unit || 'Mi'
                            }
                            : null,
                        command: template.pod_config.command && template.pod_config.command.length > 0 ? template.pod_config.command : null,
                        mounts: template.pod_config.mounts && template.pod_config.mounts.length > 0 ? template.pod_config.mounts : null
                    }
                }
            }
            try {
                const resp = await fetch("/api/v1/game-servers", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(newServerRequest)
                });
                if (!resp.ok) {
                    let err = await resp.text()
                    this.showToast(err || 'Failed to create server', 'error');
                } else {
                    this.showToast("Successfully created server " + this.form.name, 'success')
                    await this.fetchServers();
                    this.showModal = false;
                }
            } catch (e) {
                console.error(e);
            }
        },

        editServer(server) {
            // let storageSize = server.storage_size || 1024;
            // let storageUnit = 'mib';
            // if (storageSize >= 1024) {
            //     storageSize = Math.round(storageSize / 1024);
            //     storageUnit = 'gib';
            // }
            // this.editingServer = server;
            // this.form = {
            //     name: server.name,
            //     id: server.id,
            //     image: server.image,
            //     storage_size: storageSize,
            //     storage_unit: storageUnit,
            //     ip: server.ip,
            //     ports: server.ports,
            //     max_players: server.max_players
            // };
            // this.showModal = true;
        },

        async deleteServer(id) {
            const result = await fetch(`/api/v1/game-servers?game_server_id=${encodeURIComponent(id)}`, {
                method: "DELETE"
            });
            if (!result.ok) {
                this.showToast((await result.text()) || "Failed to delete server", "error")
            } else {
                this.showToast(`Successfully deleted server`, "success")
                await this.fetchServers();
            }
        },

        async toggleStatus(server) {
            switch (server.status) {
                case 'Offline':
                    await this.startServerInstance(server);
                    break;
                case 'Running':
                    await this.stopServerInstance(server);
                    break;
                default:
                    this.showToast("Server is the process of starting/stopping...", "info")
            }

        },
        async startServerInstance(server) {
            const resp = await fetch("/api/v1/game-servers/start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({game_server_id: server.id})
            });
            if (!resp.ok) {
                this.showToast((await resp.text()) || "Failed to start server", "error")
            } else {
                this.showToast(`Starting server ${server.name}`, 'info')
                await this.fetchServers();
            }
        },
        async stopServerInstance(server) {
            const resp = await fetch("/api/v1/game-servers/stop", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({game_server_id: server.id})
            });
            if (!resp.ok) {
                this.showToast((await resp.text()) || "Failed to stop server", "error")
            } else {
                this.showToast(`Stopping server ${server.name}`, "info")
                await this.fetchServers();
            }
        },
        toggleDarkMode() {
            localStorage.setItem('darkMode', this.settings.darkMode);
            document.documentElement.classList.toggle('dark', this.settings.darkMode);
        },
        openLogs(server) {
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
        connectLogWebSocket(gameServerId) {
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
                    const container = this.$refs.logContainer;
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
    }
}
