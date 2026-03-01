import Alpine, {type AlpineComponent} from 'alpinejs';
import type {Server} from '../stores/game-server-store';
import {serverResourceSliderFunctions} from "../resource-utils.ts";
import editServerModalContent from "./edit-server-modal.html?raw";

type PodConfig = {
    image?: string;
    resources?: {
        requests?: { cpu?: string; memory?: string };
        limits?: { cpu?: string; memory?: string };
    };
    command?: string[];
    env?: Record<string, string>;
    mounts?: any[];
};

type EditForm = {
    id: string;
    name: string;
    game_version: string;
    max_players: number;
    icon_url: string;
    description: string;
    pod_config: PodConfig;
    pod_template: string;
    user_id: number;
};

type EditServerModalData = {
    content: string,
    showEditModal: boolean,
    editTab: 'general' | 'podconfig' | 'misc',
    editForm: EditForm,
    init(): void,
    editCommandInput: string,
    openEditModal(server: Server): void,
    closeEditModal(): void,
    updateEditEnvKey(event: Event, oldKey: string): void,
    saveEditServer(): Promise<void>,
    initResources() : void
} & Record<string, any>;

Alpine.data('editServerModal', (): AlpineComponent<EditServerModalData> => ({
    content: editServerModalContent,
    showEditModal: false,
    editTab: 'general' as 'general' | 'podconfig' | 'misc',
    editForm: {
        pod_config: {}
    } as EditForm,
    init() {
    },
    get editCommandInput() {
        return Array.isArray(this.editForm.pod_config?.command)
            ? this.editForm.pod_config.command.join(', ')
            : '';
    },
    set editCommandInput(value: string) {
        if (!this.editForm.pod_config) return;
        this.editForm.pod_config.command = value
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
    },
    openEditModal(server: any) {
        this.editTab = 'general';
        this.showEditModal = true;
        this.editForm = {
            id: server.id,
            name: server.name,
            game_version: server.game_version || '',
            max_players: server.max_players || 0,
            icon_url: server.icon_url || '',
            description: server.game_server?.description || '',
            pod_config: JSON.parse(JSON.stringify(server.game_server?.pod_config || {
                image: '',
                resources: {
                    requests: {cpu: '250m', memory: '256Mi'},
                    limits: {cpu: '500m', memory: '512Mi'}
                },
                command: [],
                env: {},
                mounts: []
            })),
            pod_template: server.game_server?.pod_template || '',
            user_id: server.game_server?.user_id || 1000
        };
        if (!this.editForm.pod_config.resources) {
            this.editForm.pod_config.resources = {
                requests: {cpu: '250m', memory: '256Mi'},
                limits: {cpu: '500m', memory: '512Mi'}
            };
        }
        if (!this.editForm.pod_config.env) {
            this.editForm.pod_config.env = {};
        }
        if (!this.editForm.pod_config.command) {
            this.editForm.pod_config.command = [];
        }
    },
    closeEditModal() {
        this.showEditModal = false;
    },
    updateEditEnvKey(event: Event, oldKey: string) {
        const newKey = (event.target as HTMLInputElement).value;
        if (newKey !== oldKey) {
            const env = this.editForm.pod_config.env;
            if (env) {
                const value = env[oldKey];
                delete env[oldKey];
                env[newKey] = value;
            }
        }
    },
    initResources() {
        if (!this.editForm.pod_config.resources) this.editForm.pod_config.resources = {};
        if (!this.editForm.pod_config.resources.requests) this.editForm.pod_config.resources.requests = {};
        if (!this.editForm.pod_config.resources.limits) this.editForm.pod_config.resources.limits = {};
    },
    minMemoryValueChanged(value: number) {
        this.initResources();
        // @ts-ignore
        this.editForm.pod_config.resources.requests.memory = `${value}Mi`
    },
    maxMemoryValueChanged(value: number) {
        this.initResources();
        // @ts-ignore
        this.editForm.pod_config.resources.limits.memory = `${value}Mi`
    },
    minCpuValueChanged(value: number) {
        this.initResources();
        // @ts-ignore
        this.editForm.pod_config.resources.requests.cpu = `${value}m`
    },
    maxCpuValueChanged(value: number) {
        this.initResources();
        // @ts-ignore

        this.editForm.pod_config.resources.limits.cpu = `${value}m`
    },
    async saveEditServer() {
        const updateData = {
            name: this.editForm.name,
            game_version: this.editForm.game_version || null,
            max_players: this.editForm.max_players ? parseInt(String(this.editForm.max_players)) : null,
            icon_url: this.editForm.icon_url || null,
            description: this.editForm.description || null,
            pod_config: {
                ...this.editForm.pod_config,
                resources: this.editForm.pod_config.resources && (this.editForm.pod_config.resources.requests || this.editForm.pod_config.resources.limits)
                    ? {
                        requests: this.editForm.pod_config.resources.requests || null,
                        limits: this.editForm.pod_config.resources.limits || null
                    }
                    : null,
                command: this.editForm.pod_config.command && this.editForm.pod_config.command.length > 0 ? this.editForm.pod_config.command : null,
                mounts: this.editForm.pod_config.mounts && this.editForm.pod_config.mounts.length > 0 ? this.editForm.pod_config.mounts : null
            },
            pod_template: this.editForm.pod_template || null,
            user_id: this.editForm.user_id || 1000
        };

        const store = Alpine.store('gameServers') as any;
        try {
            const resp = await fetch(`/api/v1/game-servers/${this.editForm.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(updateData)
            });
            if (!resp.ok) {
                const err = await resp.text();
                this.$dispatch?.('notify', {variant: 'error', message: err || 'Failed to update server'});
            } else {
                this.$dispatch?.('notify', {variant: 'success', message: 'Successfully updated server'});
                this.closeEditModal();
                await store.fetchServers();
            }
        } catch (e) {
            console.error(e);
            this.$dispatch?.('notify', {variant: 'error', message: 'Failed to update server'});
        }
    },
    ...serverResourceSliderFunctions
}));