function modal() {
    return {
        content: '',
        form: {},
        gameServerTemplates: [],
        selectedTemplateName: '',
        async init() {
            this.resetForm();
            this.content = ((await fetch('fragments/add-modal.html')).text())
            await this.fetchGameServerTemplates();
        },

        changedTemplate(event) {
            const tempName = event.target.value;
            const template = this.gameServerTemplates.find(t => t.template_name === tempName)
            if (template == null)
                console.error("Could not find template with name " + tempName)
            else
                this.useTemplate(template);
        },
        formDefaultValue() {
            return {
                name: '',
                game_version: '',
                max_players: 0,
                template: {
                    template_name: '',
                    description: '',
                    game_type: '',
                    icon_url: '',
                    init_template: '',
                    pod_config: {
                        image: '',
                        env: {}
                    },
                    service_config: {
                        ports: [
                            {port: '', protocol: ''}
                        ]
                    },
                    pvc_config: {
                        size_mib: '',
                        size_unit: ''
                    }
                },
            }
        },
        async fetchGameServerTemplates() {
            this.gameServerTemplates = (await (await fetch("/api/v1/game-server-templates")).json()) || [];
        },
        useTemplate(template) {
            this.form = {...this.form, template: _.cloneDeep(template)}
        },
        resetForm() {
            this.form = this.formDefaultValue();
        },
    }

}

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
        // form: {},
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

        showToast(message, type = 'error') {
            this.toast = {show: true, message, type};
            setTimeout(() => {
                this.toast.show = false;
            }, 5000);
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
                ...this.form,
                max_players: Number.parseInt(this.form.max_players),
                template: {
                    ...template,
                    service_config: {
                        ...template.service_config,
                        ports: template.service_config.ports.map(p => ({
                            ...p,
                            port: Number.parseInt(p.port)
                        }))
                    },
                    pvc_config: {
                        ...template.pvc_config,
                        size: (typeof template.pvc_config.size === 'number') ? template.pvc_config.size : Number.parseInt(template.pvc_config.size)
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
                this.showToast((await result.text()) || "Failed to delete server")
            } else {
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
                this.showToast((await resp.text()) || "Failed to start server")
            } else {
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
                this.showToast((await resp.text()) || "Failed to stop server")
            } else {
                await this.fetchServers();
            }
        },
        toggleDarkMode() {
            localStorage.setItem('darkMode', this.settings.darkMode);
            document.documentElement.classList.toggle('dark', this.settings.darkMode);
        }
    }
}
