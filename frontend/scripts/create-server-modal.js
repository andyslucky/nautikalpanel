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
            <button x-on:click="showModal = false" aria-label="close modal">
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
                        <input type="text" x-model="form.name" placeholder="My Minecraft Server" required class="form-input">
                    </div>
                    <div>
                        <label class="form-label-sm">Template</label>
                        <select class="form-input" x-model="form.template.template_name" @change="changedTemplate($event)">
                            <option value="">Select a template...</option>
                            <template x-for="temp in gameServerTemplates" :key="temp.template_name">
                                <option x-text="temp.template_name" :value="temp.template_name"></option>
                            </template>
                        </select>
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
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="form-label-sm">Min CPU</label>
                            <div class="flex gap-1.5">
                                <input type="number" x-model="form.template.pod_config.resources.min_cpu" placeholder="100" min="0" class="form-input-sm">
                                <select x-model="form.template.pod_config.resources.min_cpu_unit" class="form-select-sm">
                                    <option value="m">mC</option>
                                    <option value="">Cores</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label class="form-label-sm">Max CPU</label>
                            <div class="flex gap-1.5">
                                <input type="number" x-model="form.template.pod_config.resources.max_cpu" placeholder="2" min="0" class="form-input-sm">
                                <select x-model="form.template.pod_config.resources.max_cpu_unit" class="form-select-sm">
                                    <option value="m">mC</option>
                                    <option value="">Cores</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label class="form-label-sm">Min Memory</label>
                            <div class="flex gap-1.5">
                                <input type="number" x-model="form.template.pod_config.resources.min_mem" placeholder="512" min="0" class="form-input-sm">
                                <select x-model="form.template.pod_config.resources.min_mem_unit" class="form-select-sm">
                                    <option value="Mi">MiB</option>
                                    <option value="Gi">GiB</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label class="form-label-sm">Max Memory</label>
                            <div class="flex gap-1.5">
                                <input type="number" x-model="form.template.pod_config.resources.max_mem" placeholder="4" min="0" class="form-input-sm">
                                <select x-model="form.template.pod_config.resources.max_mem_unit" class="form-select-sm">
                                    <option value="Mi">MiB</option>
                                    <option value="Gi">GiB</option>
                                </select>
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
                                    <input type="text" x-model="form.template.pod_config.env[entry[0]]" placeholder="Value" class="form-input-sm">
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
                                <option value="Mi">MiB</option>
                                <option value="Gi">GiB</option>
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
            <button x-on:click="showModal = false" type="button" class="btn-secondary">Cancel</button>
            <button x-on:click="createServer()" type="button" class="btn-primary">Create</button>
        </div>
    </div>
</div>
`;


function createServerModal() {
    return {
        content: createServerModalContent,
        selectedTab: 'general',
        form: {},
        gameServerTemplates: [],
        selectedTemplateName: '',
        async init() {
            this.resetForm();
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
                    pod_template: null,
                    init_template: null,
                    pod_config: {
                        image: '',
                        resources: {
                            min_cpu: 0,
                            min_cpu_unit: 'm',
                            max_cpu: 0,
                            max_cpu_unit: 'm',
                            min_mem: 0,
                            min_mem_unit: 'Mi',
                            max_mem: 0,
                            max_mem_unit: 'Mi'
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
                        storage_class: ''
                    }
                },
            }
        },
        get commandInput() {
            return Array.isArray(this.form.template?.pod_config?.command)
                ? this.form.template.pod_config.command.join(', ')
                : '';
        },
        set commandInput(value) {
            this.updateCommandArray(value);
        },
        updateCommandArray(value) {
            if (!this.form.template.pod_config) return;
            this.form.template.pod_config.command = value
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
        },
        updateEnvKey(event, oldKey, index) {
            const newKey = event.target.value;
            if (newKey !== oldKey) {
                const env = this.form.template.pod_config.env;
                const value = env[oldKey];
                delete env[oldKey];
                env[newKey] = value;
            }
        },
        async fetchGameServerTemplates() {
            this.gameServerTemplates = (await (await fetch("/api/v1/game-server-templates")).json()) || [];
        },
        useTemplate(template) {
            this.form.template = _.cloneDeep(template);
            if (!this.form.template.pod_config.resources) {
                this.form.template.pod_config.resources = { min_cpu: 0, min_cpu_unit: 'm', max_cpu: 0, max_cpu_unit: 'm', min_mem: 0, min_mem_unit: 'Mi', max_mem: 0, max_mem_unit: 'Mi' };
            }
            if (!this.form.template.pod_config.resources.min_cpu_unit) {
                this.form.template.pod_config.resources.min_cpu_unit = 'm';
            }
            if (!this.form.template.pod_config.resources.max_cpu_unit) {
                this.form.template.pod_config.resources.max_cpu_unit = 'm';
            }
            if (!this.form.template.pod_config.resources.min_mem_unit) {
                this.form.template.pod_config.resources.min_mem_unit = 'Mi';
            }
            if (!this.form.template.pod_config.resources.max_mem_unit) {
                this.form.template.pod_config.resources.max_mem_unit = 'Mi';
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
        },
        resetForm() {
            this.form = this.formDefaultValue();
        }
    }

}
