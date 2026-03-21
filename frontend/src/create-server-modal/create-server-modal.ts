import Alpine, {type AlpineComponent} from 'alpinejs';
import {serverResourceSliderFunctions} from "../resource-utils.ts";
import createServerModelContent from "./create-server-modal.html?raw";
import type {GameServerTemplateData, CustomFieldValues} from "../types.ts";
import type {GameServerStore} from "../stores/game-server-store.ts";
import {showToast} from "../utils/toast.ts";

type GameServerForm = {
    name: string,
    game_version: string,
    max_players: number,
    template: GameServerTemplateData
}


type CreateServerModalData = {
    content: string,
    selectedTab: 'general' | 'podconfig' | 'storageconfig' | 'svcconfig' | 'misc' | 'customfields',
    form: GameServerForm,
    custom_field_values: CustomFieldValues,
    file_inputs: Record<string, File | null>,
    gameServerTemplates: GameServerTemplateData[],
    selectedTemplateName: string,
    init(): Promise<void>,
    changedTemplate(event: Event): void,
    formDefaultValue(): GameServerForm,
    commandInput: string,
    updateCommandArray(value?: string): void,
    updateEnvKey(event: Event, oldKey: string): void,
    fetchGameServerTemplates(): Promise<void>,
    useTemplate(template: GameServerTemplateData): void,
    resetForm(): void,
    createServer(): void,
    initResources(): void,
    initCustomFields(): void,
    handleFileSelect(fieldName: string, event: Event): void,
    hasCustomFields(): boolean,
    showModal?: boolean,
} & Record<string, any>;

Alpine.data('createServerModal', (): AlpineComponent<CreateServerModalData> => ({
    content: createServerModelContent,
    selectedTab: 'general',
    custom_field_values: {} as CustomFieldValues,
    file_inputs: {} as Record<string, File | null>,
    form: {
        template: {
            template_name: "",
            icon_url: undefined,
            description: undefined,
            game_type: undefined,
            game_version: undefined,
            pod_template: undefined,
            init_template: undefined,
            default_max_users: undefined,
            user_id: undefined,
            pod_config: {
                image: ""
            },
            service_config: {
                ports: []
            },
            pvc_config: {
                size: "",
                size_unit: ""
            }
        },
        name: "",
        game_version: "",
        max_players: 0
    },
    gameServerTemplates: [] as GameServerTemplateData[],
    selectedTemplateName: '',
    async init() {
        this.resetForm();
        await this.fetchGameServerTemplates();
    },

    changedTemplate(event: Event) {
        const tempName = (event.target as HTMLSelectElement).value;
        this.selectedTemplateName = tempName;
        const template = this.gameServerTemplates.find(t => t.template_name === tempName);
        if (template == null)
            console.error("Could not find template with name " + tempName);
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
                pod_template: null,
                init_template: null,
                user_id: 1000,
                pod_config: {
                    image: '',
                    resources: {
                        requests: {cpu: '250m', memory: '256Mi'},
                        limits: {cpu: '500m', memory: '512Mi'}
                    },
                    command: [],
                    env: {},
                    mounts: []
                },
                service_config: {
                    ports: [],
                    ip_address: '',
                    service_type: 'LoadBalancer'
                },
                pvc_config: {
                    size: 0,
                    size_unit: 'Gi',
                    container_path: '',
                    storage_class: '',
                }
            },
        }
    },
    get commandInput() {
        return Array.isArray(this.form.template?.pod_config?.command)
            ? this.form.template.pod_config.command.join(', ')
            : '';
    },
    set commandInput(value: string) {
        this.updateCommandArray(value);
    },
    updateCommandArray(value?: string) {
        if (!this.form.template.pod_config) return;
        this.form.template.pod_config.command = (value || '')
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);
    },
    updateEnvKey(event: Event, oldKey: string) {
        const newKey = (event.target as HTMLInputElement).value;
        const env = this.form.template.pod_config?.env;
        if (newKey !== oldKey && env != null) {
            const val = env[oldKey];
            delete env[oldKey];
            env[newKey] = val;
        }
    },
    async fetchGameServerTemplates() {
        this.gameServerTemplates = (await (await fetch("/api/v1/game-server-templates")).json()) || [];
    },
    useTemplate(template: GameServerTemplateData) {
        this.form.template = JSON.parse(JSON.stringify(template));
        this.form.max_players = template.default_max_users || 0;
        if (!this.form.template.user_id) {
            this.form.template.user_id = 1000;
        }
        if (!this.form.template.pod_config.resources) {
            this.form.template.pod_config.resources = {
                requests: {cpu: '0m', memory: '0Mi'},
                limits: {cpu: '0m', memory: '0Mi'}
            };
        }
        if (!this.form.template.pod_config.resources.requests) {
            this.form.template.pod_config.resources.requests = {cpu: '0m', memory: '0Mi'};
        }
        if (!this.form.template.pod_config.resources.limits) {
            this.form.template.pod_config.resources.limits = {cpu: '0m', memory: '0Mi'};
        }
        if (!this.form.template.pod_config.mounts) {
            this.form.template.pod_config.mounts = [];
        }
        if (!this.form.template.pod_config.command) {
            this.form.template.pod_config.command = [];
        }
        if (!this.form.template.service_config.ports || this.form.template.service_config.ports.length === 0) {
            this.form.template.service_config.ports = [{port: '', protocol: 'TCP'}];
        }
        this.initCustomFields();
    },
    initCustomFields() {
        this.custom_field_values = {};
        this.file_inputs = {};
        const fields = this.form.template.custom_fields || [];
        for (const field of fields) {
            if (field.default !== undefined && field.default !== null) {
                if (field.type === 'number') {
                    this.custom_field_values[field.name] = parseFloat(field.default) || 0;
                } else if (field.type === 'boolean') {
                    this.custom_field_values[field.name] = field.default === 'true' || field.default === '1';
                } else {
                    this.custom_field_values[field.name] = field.default;
                }
            } else {
                if (field.type === 'number') {
                    this.custom_field_values[field.name] = 0;
                } else if (field.type === 'boolean') {
                    this.custom_field_values[field.name] = false;
                } else {
                    this.custom_field_values[field.name] = '';
                }
            }
            if (field.type === 'file') {
                this.file_inputs[field.name] = null;
            }
        }
    },
    handleFileSelect(fieldName: string, event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            this.file_inputs[fieldName] = input.files[0];
            this.custom_field_values[fieldName] = input.files[0].name;
        }
    },
    hasCustomFields(): boolean {
        return !!(this.form.template.custom_fields && this.form.template.custom_fields.length > 0);
    },
    resetForm() {
        this.selectedTemplateName = '';
        this.custom_field_values = {};
        this.file_inputs = {};
        this.form = this.formDefaultValue();
    },

    createServer() {
        const template = this.form.template;
        const customValuesCopy = { ...this.custom_field_values };
        const filesToUpload = Object.entries(this.file_inputs).filter(([_, f]) => f !== null) as [string, File][];
        
        const newServerRequest = {
            name: this.form.name,
            game_version: this.form.game_version || null,
            max_players: this.form.max_players ? parseInt(this.form.max_players as any) : null,
            custom_values: Object.keys(customValuesCopy).length > 0 ? customValuesCopy : null,
            template: {
                ...template,
                service_config: {
                    ...template.service_config,
                    ports: template.service_config.ports.map((p: any) => ({
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
        
        fetch("/api/v1/game-servers", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(newServerRequest)
        }).then(async (resp) => {
            if (!resp.ok) {
                const err = await resp.text();
                showToast(err || 'Failed to create server', "error");
                return null;
            }
            const data = await resp.json();
            return data.game_server_id as string;
        }).then(async (gameServerId) => {
            if (!gameServerId) return;
            
            if (filesToUpload.length > 0) {
                showToast("Uploading files...", "info");
                for (const [fieldName, file] of filesToUpload) {
                    const formData = new FormData();
                    formData.append(fieldName, file!);
                    try {
                        const uploadResp = await fetch(`/api/v1/game-servers/${gameServerId}/uploads`, {
                            method: "POST",
                            body: formData
                        });
                        if (!uploadResp.ok) {
                            const err = await uploadResp.text();
                            showToast(`Failed to upload file for ${fieldName}: ${err}`, "error");
                        }
                    } catch (e) {
                        showToast(`Failed to upload file for ${fieldName}`, "error");
                    }
                }
            }
            
            this.showModal = false;
            showToast("Successfully created server " + newServerRequest.name, "success");
            
            (<GameServerStore>this.$store.gameServers).fetchServers().then(() => {
                console.log("Fetched game servers");
            });
        }).catch((e) => {
            showToast('Failed to create server: ' + e.message, "error");
        });
    },
    initResources() : void {
        if (!this.form.template.pod_config.resources) this.form.template.pod_config.resources = {};
        if (!this.form.template.pod_config.resources.requests) this.form.template.pod_config.resources.requests = {};
        if (!this.form.template.pod_config.resources.limits) this.form.template.pod_config.resources.limits = {};
    },
    minCpuValueChanged(value : number) {
        this.initResources();
        // @ts-ignore
        this.form.template.pod_config.resources.requests.cpu = `${value}m`;
    },
    maxCpuValueChanged(value : number) {
        this.initResources();
        // @ts-ignore
        this.form.template.pod_config.resources.limits.cpu = `${value}m`;
    },
    minMemoryValueChanged(value : number) {
        this.initResources();
        // @ts-ignore
        this.form.template.pod_config.resources.requests.memory = `${value}Mi`;

    },
    maxMemoryValueChanged(value : number) {
        this.initResources();
        // @ts-ignore
        this.form.template.pod_config.resources.limits.memory = `${value}Mi`;
    },
    ...serverResourceSliderFunctions
}));
