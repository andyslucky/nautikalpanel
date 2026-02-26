import Alpine from 'alpinejs';
import {serverResourceSliderFunctions} from "./resource-utils.ts";

const createServerModalContent = `
<div x-cloak x-show="showModal" x-transition.opacity.duration.200ms x-trap.inert.noscroll="showModal"
    x-on:keydown.esc.window="showModal = false" x-on:click.self="showModal = false"
    class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="defaultModalTitle">
    <div x-show="showModal"
        x-transition:enter="transition ease-out duration-200 delay-100 motion-reduce:transition-opacity"
        x-transition:enter-start="opacity-0 scale-50" x-transition:enter-end="opacity-100 scale-100"
        class="modal-dialog">
        <div class="modal-dialog-header">
            <h3 id="defaultModalTitle" class="font-semibold tracking-wide">Create Server</h3>
            <button x-on:click="resetForm(); showModal = false" aria-label="close modal">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" stroke="currentColor"
                    fill="none" stroke-width="1.4" class="icon-sm">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
        <div class="modal-dialog-body">
            <div x-on:keydown.right.prevent="$focus.wrap().next()" x-on:keydown.left.prevent="$focus.wrap().previous()"
                class="tab-list" role="tablist" aria-label="tab options">
                <button x-on:click="selectedTab = 'general'" x-bind:aria-selected="selectedTab === 'general'"
                    x-bind:tabindex="selectedTab === 'general' ? '0' : '-1'"
                    x-bind:class="selectedTab === 'general' ? 'tab-btn-active' : 'tab-btn-inactive'"
                    type="button" role="tab" aria-controls="tabpanelgeneral">General</button>
                <button x-on:click="selectedTab = 'podconfig'" x-bind:aria-selected="selectedTab === 'podconfig'"
                    x-bind:tabindex="selectedTab === 'podconfig' ? '0' : '-1'"
                    x-bind:class="selectedTab === 'podconfig' ? 'tab-btn-active' : 'tab-btn-inactive'"
                    type="button" role="tab" aria-controls="tabpanelpodconfig">Pod Config</button>
                <button x-on:click="selectedTab = 'storageconfig'" x-bind:aria-selected="selectedTab === 'storageconfig'"
                    x-bind:tabindex="selectedTab === 'storageconfig' ? '0' : '-1'"
                    x-bind:class="selectedTab === 'storageconfig' ? 'tab-btn-active' : 'tab-btn-inactive'"
                    type="button" role="tab" aria-controls="tabpanelstorageconfig">Storage Config</button>
                <button x-on:click="selectedTab = 'svcconfig'" x-bind:aria-selected="selectedTab === 'svcconfig'"
                    x-bind:tabindex="selectedTab === 'svcconfig' ? '0' : '-1'"
                    x-bind:class="selectedTab === 'svcconfig' ? 'tab-btn-active' : 'tab-btn-inactive'"
                    type="button" role="tab" aria-controls="tabpanelsvcconfig">Service Config</button>
                <button x-on:click="selectedTab = 'misc'" x-bind:aria-selected="selectedTab === 'misc'"
                    x-bind:tabindex="selectedTab === 'misc' ? '0' : '-1'"
                    x-bind:class="selectedTab === 'misc' ? 'tab-btn-active' : 'tab-btn-inactive'"
                    type="button" role="tab" aria-controls="tabpanelmisc">Misc</button>
            </div>
            <div class="px-4 py-3 overflow-y-scroll min-h-[0] flex-1">
                <div x-cloak x-show="selectedTab === 'general'" id="tabpanelgeneral" role="tabpanel" aria-label="general" class="form-group">
                    <div>
                        <label class="form-label-sm">Server Name</label>
                        <input type="text" x-model="form.name" :placeholder="'My ' + selectedTemplateName + ' Server'" required class="form-input">
                    </div>
                    <div>
                        <label class="form-label-sm">Template</label>
                        <div class="flex gap-1">
                          <img x-show="form.template.icon_url != null && form.template.icon_url != ''" :src="form.template.icon_url" width="32" height="32"/>
                          <select class="form-input" x-model="selectedTemplateName" @change="changedTemplate($event)">
                              <option value="" :selected="selectedTemplateName === ''">Select a template...</option>
                              <template x-for="temp in gameServerTemplates">
                              <option x-text="temp.template_name" :value="temp.template_name" :selected="selectedTemplateName === temp.template_name">
                              </option>
                              </template>
                          </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="form-label-sm">Game Version</label>
                            <input type="text" x-model="form.game_version" placeholder="1.20.4" class="form-input">
                        </div>
                        <div>
                            <label class="form-label-sm">Max Players</label>
                            <input type="number" x-model="form.max_players" placeholder="20" min="0" class="form-input">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="form-label-sm">Game Type</label>
                            <input type="text" x-model="form.template.game_type" placeholder="minecraft" class="form-input">
                        </div>
                        <div>
                            <label class="form-label-sm">Icon URL</label>
                            <input type="text" x-model="form.template.icon_url" placeholder="https://..." class="form-input">
                        </div>
                    </div>
                    <div>
                        <label class="form-label-sm">Description</label>
                        <textarea x-model="form.template.description" placeholder="Server description..." rows="2" class="form-input"></textarea>
                    </div>
                </div>
                <div x-cloak x-show="selectedTab === 'podconfig'" id="tabpanelpodconfig" role="tabpanel" aria-label="podconfig" class="form-group">
                    <div>
                        <label class="form-label-sm">Container Image</label>
                        <input type="text" x-model="form.template.pod_config.image" placeholder="itzg/minecraft-server" required class="form-input">
                    </div>
                    <div class="space-y-4">
                        <div  x-data="dualRangeSlider(
                                () => parseCpu(form.template.pod_config?.resources?.requests?.cpu),
                                () => parseCpu(form.template.pod_config?.resources?.limits?.cpu),
                                0, 8000
                            )" x-init="init()" data-resource="cpu">
                            <label class="form-label-sm mb-2 block">CPU (Cores)</label>
                            <div class="range-slider">
                                <div class="range-slider-track"></div>
                                <div class="range-slider-fill" :style="'left:' + minPercent + '%; right:' + (100 - maxPercent) + '%'"></div>
                                <input type="range" :min="min" :max="max" step="50" x-model.number="minValue" @change="syncCpu(form)">
                                <input type="range" :min="min" :max="max" step="50" x-model.number="maxValue" @change="syncCpu(form)">
                            </div>
                            <div class="range-slider-labels">
                                <span>Request: <strong x-text="formatCpuString(minValue)"></strong></span>
                                <span>Limit: <strong x-text="formatCpuString(maxValue)"></strong></span>
                            </div>
                        </div>
                        <div x-data="dualRangeSlider(
                                () => parseMemory(form.template.pod_config?.resources?.requests?.memory),
                                () => parseMemory(form.template.pod_config?.resources?.limits?.memory),
                                0, 16384
                            )" x-init="init()" data-resource="memory">
                            <label class="form-label-sm mb-2 block">Memory</label>
                            <div class="range-slider">
                                <div class="range-slider-track"></div>
                                <div class="range-slider-fill" :style="'left:' + minPercent + '%; right:' + (100 - maxPercent) + '%'"></div>
                                <input type="range" :min="min" :max="max" step="32" x-model.number="minValue" @change="syncMemory(form)">
                                <input type="range" :min="min" :max="max" step="32" x-model.number="maxValue" @change="syncMemory(form)">
                            </div>
                            <div class="range-slider-labels">
                                <span>Request: <strong x-text="formatMemoryString(minValue)"></strong></span>
                                <span>Limit: <strong x-text="formatMemoryString(maxValue)"></strong></span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label class="form-label-sm">Command (comma-separated)</label>
                        <input type="text" x-model="commandInput" @input="updateCommandArray()" placeholder="java, -Xms1G, -Xmx4G" class="form-input">
                    </div>
                    <div>
                        <label class="form-label-sm">Environment Variables</label>
                        <div class="flex flex-col gap-1.5">
                            <template x-for="(entry, index) in Object.entries(form.template.pod_config.env || {})" :key="index">
                                <div class="flex gap-1.5">
                                    <input type="text" :value="entry[0]" @input="updateEnvKey($event, entry[0], index)" placeholder="Key" class="form-input-sm">
                                    <input type="text" x-model="entry[1]" placeholder="Value" class="form-input-sm">
                                    <button type="button" @click="delete form.template.pod_config.env[entry[0]]" class="btn-remove">X</button>
                                </div>
                            </template>
                            <button type="button" @click="form.template.pod_config.env[''] = ''" class="btn-add">Add Env Var +</button>
                        </div>
                    </div>
                </div>
                <div x-cloak x-show="selectedTab === 'storageconfig'" id="tabpanelstorageconfig" role="tabpanel" aria-label="storageconfig" class="form-group">
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="form-label-sm">Storage Size</label>
                            <input type="number" x-model="form.template.pvc_config.size" placeholder="10" min="1" required class="form-input">
                        </div>
                        <div>
                            <label class="form-label-sm">Size Unit</label>
                            <select x-model="form.template.pvc_config.size_unit" class="form-input">
                                <option value="Mi">Mi</option>
                                <option value="Gi">Gi</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label class="form-label-sm">Container Path</label>
                        <input type="text" x-model="form.template.pvc_config.container_path" placeholder="/data" class="form-input">
                    </div>
                    <div>
                        <label class="form-label-sm">Storage Class (Optional)</label>
                        <input type="text" x-model="form.template.pvc_config.storage_class" placeholder="standard" class="form-input">
                    </div>
                    <div>
                        <label class="form-label-sm">User/Group ID</label>
                        <input type="number" x-model.number="form.template.user_id" placeholder="1000" min="1" class="form-input">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">UID/GID for file permissions. Used for PVC fsGroup and SFTP user.</p>
                    </div>
                </div>
                <div x-cloak x-show="selectedTab === 'svcconfig'" id="tabpanelsvcconfig" role="tabpanel" aria-label="svcconfig" class="form-group">
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="form-label-sm">Service Type</label>
                            <select x-model="form.template.service_config.service_type" class="form-input">
                                <option value="LoadBalancer">LoadBalancer</option>
                                <option value="ClusterIP">ClusterIP</option>
                                <option value="NodePort">NodePort</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label-sm">IP Address (Optional)</label>
                            <input type="text" x-model="form.template.service_config.ip_address" placeholder="192.168.1.100" class="form-input">
                        </div>
                    </div>
                    <div>
                        <label class="form-label-sm">Ports</label>
                        <div class="flex flex-col gap-1.5">
                            <template x-for="(p, index) in form.template.service_config.ports" :key="index">
                                <div class="flex gap-1.5">
                                    <input type="number" x-model="p.port" placeholder="25565" required min="1" max="65535" class="form-input-sm">
                                    <select x-model="p.protocol" required class="form-select-sm w-20">
                                        <option value="TCP">TCP</option>
                                        <option value="UDP">UDP</option>
                                        <option value="Both">Both</option>
                                    </select>
                                    <button type="button" @click="form.template.service_config.ports.splice(index, 1)" class="btn-remove">X</button>
                                </div>
                            </template>
                            <button type="button" @click="form.template.service_config.ports.push({port: '', protocol: 'TCP'})" class="btn-add">Add Port +</button>
                        </div>
                    </div>
                </div>
                <div x-cloak x-show="selectedTab === 'misc'" id="tabpanelmisc" role="tabpanel" aria-label="misc" class="form-group">
                    <div class="warning-box mb-4">
                        <div class="flex items-center gap-2">
                            <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd"/>
                            </svg>
                            <span class="warning-title">Warning</span>
                        </div>
                        <p class="warning-text">
                            Modifying these templates can pose <strong>security risks</strong> and <strong>data loss risks</strong> for your cluster. 
                            Only change these if you understand the implications, and completely trust the templates you will use.
                        </p>
                    </div>
                    <div>
                        <label class="form-label-sm">Init Template</label>
                        <input type="text" x-model="form.init_template" placeholder="default/init.yaml.jinja" class="form-input">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Path to the Jinja template used to initialize Kubernetes resources (Service, PVC).</p>
                    </div>
                    <div>
                        <label class="form-label-sm">Pod Template</label>
                        <input type="text" x-model="form.pod_template" placeholder="default/pod_template.yaml.jinja" class="form-input">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Path to the Jinja template used to create the Pod manifest.</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-dialog-footer">
            <button x-on:click="resetForm(); showModal = false" type="button" class="btn-secondary">Cancel</button>
            <button x-on:click="createServer(); resetForm()" type="button" class="btn-primary">Create</button>
        </div>
    </div>
</div>
`;

type GameServerTemplateData = {
    template_name: string;
    icon_url?: string;
    description?: string;
    game_type?: string;
    game_version?: string;
    pod_template?: string | null;
    init_template?: string | null;
    default_max_users?: number;
    user_id?: number;
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
        user_id?: number;
    };
};


type GameServerForm = {
    template: GameServerTemplateData
}


type CreateServerModalData = {
    content: string,
    selectedTab: 'general' | 'podconfig' | 'storageconfig' | 'svcconfig' | 'misc',
    form: GameServerForm | any,
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
    createServer(): Promise<void>,
    syncCpu(form: any): void,
    syncMemory(form: any),
    syncCpuEdit(form: any),
    syncMemoryEdit(form: any)
};


Alpine.data('createServerModal', (): CreateServerModalData => ({
    content: createServerModalContent,
    selectedTab: 'general',
    form: {},
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
                    ports: [{port: '', protocol: 'TCP'}],
                    ip_address: '',
                    service_type: 'LoadBalancer'
                },
                pvc_config: {
                    size: 0,
                    size_unit: 'Gi',
                    container_path: '',
                    storage_class: '',
                    user_id: 1000
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
        if (newKey !== oldKey) {
            const env = this.form.template.pod_config.env;
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
        if (!this.form.template.pvc_config.user_id) {
            this.form.template.pvc_config.user_id = 1000;
        }
    },
    resetForm() {
        this.selectedTemplateName = '';
        this.form = this.formDefaultValue();
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
        const store = Alpine.store('gameServers') as any;
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
                this.$dispatch('notify', { variant: 'error', message: err || 'Failed to create server' });
            } else {
                this.$dispatch('notify', { variant: 'success', message: 'Successfully created server ' + this.form.name });
                await store.fetchServers();
                this.showModal = false;
            }
        } catch (e) {
            console.error(e);
        }
    },

    syncCpu(form: any) {
        if (!form.template.pod_config.resources) form.template.pod_config.resources = {};
        if (!form.template.pod_config.resources.requests) form.template.pod_config.resources.requests = {};
        if (!form.template.pod_config.resources.limits) form.template.pod_config.resources.limits = {};
        form.template.pod_config.resources.requests.cpu = this.minValue + "m";
        form.template.pod_config.resources.limits.cpu = this.maxValue + "m";
    },
    syncMemory(form: any) {
        if (!form.template.pod_config.resources) form.template.pod_config.resources = {};
        if (!form.template.pod_config.resources.requests) form.template.pod_config.resources.requests = {};
        if (!form.template.pod_config.resources.limits) form.template.pod_config.resources.limits = {};
        form.template.pod_config.resources.requests.memory = this.minValue + "Mi";
        form.template.pod_config.resources.limits.memory = this.maxValue + "Mi";
    },
    syncCpuEdit() {
        const parentData = (this.$el.closest('[x-data]') as any)?.__x?.$data;
        if (parentData?.editForm?.pod_config) {
            if (!parentData.editForm.pod_config.resources) parentData.editForm.pod_config.resources = {};
            if (!parentData.editForm.pod_config.resources.requests) parentData.editForm.pod_config.resources.requests = {};
            if (!parentData.editForm.pod_config.resources.limits) parentData.editForm.pod_config.resources.limits = {};
            parentData.editForm.pod_config.resources.requests.cpu = this.minValue + "m";
            parentData.editForm.pod_config.resources.limits.cpu = this.maxValue + "m";
        }
    },
    syncMemoryEdit() {
        const parentData = (this.$el.closest('[x-data]') as any)?.__x?.$data;
        if (parentData?.editForm?.pod_config) {
            if (!parentData.editForm.pod_config.resources) parentData.editForm.pod_config.resources = {};
            if (!parentData.editForm.pod_config.resources.requests) parentData.editForm.pod_config.resources.requests = {};
            if (!parentData.editForm.pod_config.resources.limits) parentData.editForm.pod_config.resources.limits = {};
            parentData.editForm.pod_config.resources.requests.memory = this.minValue + "Mi";
            parentData.editForm.pod_config.resources.limits.memory = this.maxValue + "Mi";
        }
    },
    ...serverResourceSliderFunctions
}));


