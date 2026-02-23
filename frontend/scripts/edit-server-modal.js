const editServerModalContent = `
<div x-cloak x-show="showEditModal" x-transition.opacity.duration.200ms x-trap.inert.noscroll="showEditModal"
    x-on:keydown.esc.window="closeEditModal()" x-on:click.self="closeEditModal()"
    class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="editModalTitle">
    <div x-show="showEditModal"
        x-transition:enter="transition ease-out duration-200 delay-100 motion-reduce:transition-opacity"
        x-transition:enter-start="opacity-0 scale-50" x-transition:enter-end="opacity-100 scale-100"
        class="modal-dialog">
        <div class="modal-dialog-header">
            <h3 id="editModalTitle" class="font-semibold tracking-wide">Edit Server</h3>
            <button x-on:click="closeEditModal()" aria-label="close modal">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" stroke="currentColor"
                    fill="none" stroke-width="1.4" class="icon-sm">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>
        <div class="modal-dialog-body">
            <div x-on:keydown.right.prevent="$focus.wrap().next()" x-on:keydown.left.prevent="$focus.wrap().previous()"
                class="tab-list" role="tablist" aria-label="edit tab options">
                <button x-on:click="editTab = 'general'" x-bind:aria-selected="editTab === 'general'"
                    x-bind:tabindex="editTab === 'general' ? '0' : '-1'"
                    x-bind:class="editTab === 'general' ? 'tab-btn-active' : 'tab-btn-inactive'"
                    type="button" role="tab" aria-controls="edittabpanelgeneral">General</button>
                <button x-on:click="editTab = 'podconfig'" x-bind:aria-selected="editTab === 'podconfig'"
                    x-bind:tabindex="editTab === 'podconfig' ? '0' : '-1'"
                    x-bind:class="editTab === 'podconfig' ? 'tab-btn-active' : 'tab-btn-inactive'"
                    type="button" role="tab" aria-controls="edittabpanelpodconfig">Pod Config</button>
                <button x-on:click="editTab = 'misc'" x-bind:aria-selected="editTab === 'misc'"
                    x-bind:tabindex="editTab === 'misc' ? '0' : '-1'"
                    x-bind:class="editTab === 'misc' ? 'tab-btn-active' : 'tab-btn-inactive'"
                    type="button" role="tab" aria-controls="edittabpanelmisc">Misc</button>
            </div>
            <div class="px-4 py-3 overflow-y-scroll min-h-[0] flex-1">
                <div x-cloak x-show="editTab === 'general'" id="edittabpanelgeneral" role="tabpanel" aria-label="general" class="form-group">
                    <div>
                        <label class="form-label-sm">Server Name</label>
                        <input type="text" x-model="editForm.name" required class="form-input">
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="form-label-sm">Game Version</label>
                            <input type="text" x-model="editForm.game_version" placeholder="1.20.4" class="form-input">
                        </div>
                        <div>
                            <label class="form-label-sm">Max Players</label>
                            <input type="number" x-model="editForm.max_players" placeholder="20" min="0" class="form-input">
                        </div>
                    </div>
                    <div>
                        <label class="form-label-sm">Icon URL</label>
                        <input type="text" x-model="editForm.icon_url" placeholder="https://..." class="form-input">
                    </div>
                    <div>
                        <label class="form-label-sm">Description</label>
                        <textarea x-model="editForm.description" placeholder="Server description..." rows="2" class="form-input"></textarea>
                    </div>
                </div>
                <div x-cloak x-show="editTab === 'podconfig'" id="edittabpanelpodconfig" role="tabpanel" aria-label="podconfig" class="form-group">
                    <div>
                        <label class="form-label-sm">Container Image</label>
                        <input type="text" x-model="editForm.pod_config.image" placeholder="itzg/minecraft-server" required class="form-input">
                    </div>
                    <div class="space-y-4">
                        <div  x-data="dualRangeSlider(
                                () => parseCpu(editForm.pod_config?.resources?.requests?.cpu),
                                () => parseCpu(editForm.pod_config?.resources?.limits?.cpu),
                                0, 8000
                            )" x-init="init()" data-resource="cpu">
                            <label class="form-label-sm mb-2 block">CPU (Cores)</label>
                            <div class="range-slider">
                                <div class="range-slider-track"></div>
                                <div class="range-slider-fill" :style="'left:' + minPercent + '%; right:' + (100 - maxPercent) + '%'"></div>
                                <input type="range" :min="min" :max="max" step="50" x-model.number="minValue" @change="syncCpuEdit()">
                                <input type="range" :min="min" :max="max" step="50" x-model.number="maxValue" @change="syncCpuEdit()">
                            </div>
                            <div class="range-slider-labels">
                                <span>Request: <strong x-text="formatCpuString(minValue)"></strong></span>
                                <span>Limit: <strong x-text="formatCpuString(maxValue)"></strong></span>
                            </div>
                        </div>
                        <div x-data="dualRangeSlider(
                                () => parseMemory(editForm.pod_config?.resources?.requests?.memory),
                                () => parseMemory(editForm.pod_config?.resources?.limits?.memory),
                                0, 16384
                            )" x-init="init()" data-resource="memory">
                            <label class="form-label-sm mb-2 block">Memory</label>
                            <div class="range-slider">
                                <div class="range-slider-track"></div>
                                <div class="range-slider-fill" :style="'left:' + minPercent + '%; right:' + (100 - maxPercent) + '%'"></div>
                                <input type="range" :min="min" :max="max" step="32" x-model.number="minValue" @change="syncMemoryEdit()">
                                <input type="range" :min="min" :max="max" step="32" x-model.number="maxValue" @change="syncMemoryEdit()">
                            </div>
                            <div class="range-slider-labels">
                                <span>Request: <strong x-text="formatMemoryString(minValue)"></strong></span>
                                <span>Limit: <strong x-text="formatMemoryString(maxValue)"></strong></span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label class="form-label-sm">Command (comma-separated)</label>
                        <input type="text" x-model="editCommandInput" placeholder="java, -Xms1G, -Xmx4G" class="form-input">
                    </div>
                    <div>
                        <label class="form-label-sm">Environment Variables</label>
                        <div class="flex flex-col gap-1.5">
                            <template x-for="(entry, index) in Object.entries(editForm.pod_config?.env || {})" :key="index">
                                <div class="flex gap-1.5">
                                    <input type="text" :value="entry[0]" @input="updateEditEnvKey($event, entry[0], index)" placeholder="Key" class="form-input-sm">
                                    <input type="text" :value="entry[1]" @input="editForm.pod_config.env[entry[0]] = $event.target.value" placeholder="Value" class="form-input-sm">
                                    <button type="button" @click="delete editForm.pod_config.env[entry[0]]" class="btn-remove">X</button>
                                </div>
                            </template>
                            <button type="button" @click="editForm.pod_config.env[''] = ''" class="btn-add">Add Env Var +</button>
                        </div>
                    </div>
                </div>
                <div x-cloak x-show="editTab === 'misc'" id="edittabpanelmisc" role="tabpanel" aria-label="misc" class="form-group">
                    <div>
                        <label class="form-label-sm">Pod Template</label>
                        <input type="text" x-model="editForm.pod_template" placeholder="default/pod_template.yaml.jinja" class="form-input">
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Path to the Jinja template used to create the Pod manifest.</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-dialog-footer">
            <button x-on:click="closeEditModal()" type="button" class="btn-secondary">Cancel</button>
            <button x-on:click="saveEditServer()" type="button" class="btn-primary">Save</button>
        </div>
    </div>
</div>
`;

function editServerModal() {
    return {
        content: editServerModalContent,
        showEditModal: false,
        editTab: 'general',
        editForm: {
            pod_config: {}
        },
        init() {},
        get editCommandInput() {
            return Array.isArray(this.editForm.pod_config?.command)
                ? this.editForm.pod_config.command.join(', ')
                : '';
        },
        set editCommandInput(value) {
            if (!this.editForm.pod_config) return;
            this.editForm.pod_config.command = value
                .split(',')
                .map(s => s.trim())
                .filter(s => s.length > 0);
        },
        openEditModal(server) {
            this.editTab = 'general';
            this.editForm = {
                id: server.id,
                name: server.name,
                game_version: server.game_version || '',
                max_players: server.max_players || 0,
                icon_url: server.icon_url || '',
                description: server.game_server?.description || '',
                pod_config: _.cloneDeep(server.game_server?.pod_config || {
                    image: '',
                    resources: {
                        requests: { cpu: '250m', memory: '256Mi' },
                        limits: { cpu: '500m', memory: '512Mi' }
                    },
                    command: [],
                    env: {},
                    mounts: []
                }),
                pod_template: server.game_server?.pod_template || ''
            };
            if (!this.editForm.pod_config.resources) {
                this.editForm.pod_config.resources = {
                    requests: { cpu: '250m', memory: '256Mi' },
                    limits: { cpu: '500m', memory: '512Mi' }
                };
            }
            if (!this.editForm.pod_config.env) {
                this.editForm.pod_config.env = {};
            }
            if (!this.editForm.pod_config.command) {
                this.editForm.pod_config.command = [];
            }
            this.showEditModal = true;
        },
        closeEditModal() {
            this.showEditModal = false;
        },
        updateEditEnvKey(event, oldKey, index) {
            const newKey = event.target.value;
            if (newKey !== oldKey) {
                const env = this.editForm.pod_config.env;
                const value = env[oldKey];
                delete env[oldKey];
                env[newKey] = value;
            }
        },
        async saveEditServer() {
            const updateData = {
                name: this.editForm.name,
                game_version: this.editForm.game_version || null,
                max_players: this.editForm.max_players ? Number.parseInt(this.editForm.max_players) : null,
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
                pod_template: this.editForm.pod_template || null
            };
            
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
                    this.showToast(err || 'Failed to update server', 'error');
                } else {
                    this.showToast("Successfully updated server", 'success');
                    this.closeEditModal();
                    await this.fetchServers();
                }
            } catch (e) {
                console.error(e);
                this.showToast("Failed to update server", "error");
            }
        }
    };
}

function syncCpuEdit() {
    const parentData = this.$el.closest('[x-data]').__x?.$data;
    if (parentData?.editForm?.pod_config) {
        if (!parentData.editForm.pod_config.resources) parentData.editForm.pod_config.resources = {};
        if (!parentData.editForm.pod_config.resources.requests) parentData.editForm.pod_config.resources.requests = {};
        if (!parentData.editForm.pod_config.resources.limits) parentData.editForm.pod_config.resources.limits = {};
        parentData.editForm.pod_config.resources.requests.cpu = this.minValue + "m";
        parentData.editForm.pod_config.resources.limits.cpu = this.maxValue + "m";
    }
}

function syncMemoryEdit() {
    const parentData = this.$el.closest('[x-data]').__x?.$data;
    if (parentData?.editForm?.pod_config) {
        if (!parentData.editForm.pod_config.resources) parentData.editForm.pod_config.resources = {};
        if (!parentData.editForm.pod_config.resources.requests) parentData.editForm.pod_config.resources.requests = {};
        if (!parentData.editForm.pod_config.resources.limits) parentData.editForm.pod_config.resources.limits = {};
        parentData.editForm.pod_config.resources.requests.memory = this.minValue + "Mi";
        parentData.editForm.pod_config.resources.limits.memory = this.maxValue + "Mi";
    }
}
