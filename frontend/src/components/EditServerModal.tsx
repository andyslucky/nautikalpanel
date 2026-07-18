import { useSignal, useSignalEffect } from '@preact/signals';
import type { Server } from '../signals/game-server-store';
import * as gameStore from '../signals/game-server-store';
import { serverResourceSliderFunctions } from '../resource-utils';
import { showToast } from '../utils/toast';
import { notifyBus } from '../signals/notify';
import DualRangeSlider from './DualRangeSlider';

export default function EditServerModal() {
    const showEditModal = useSignal(false);
    const editTab = useSignal<'general' | 'podconfig' | 'misc'>('general');
    const editForm = useSignal<EditForm>({ pod_config: {} } as EditForm);

    useSignalEffect(() => {
        const unsub = notifyBus.on('edit', (payload: { server: Server }) => {
            openEditModal(payload.server);
        });
        return () => unsub();
    });

    function openEditModal(server: Server) {
        editTab.value = 'general';
        showEditModal.value = true;
        editForm.value = {
            id: server.id,
            name: server.name,
            game_version: server.game_version || '',
            max_players: server.max_players || 0,
            icon_url: server.icon_url || '',
            description: server.game_server?.description || '',
            pod_config: JSON.parse(JSON.stringify(server.game_server?.pod_config || {
                image: '',
                resources: { requests: { cpu: '250m', memory: '256Mi' }, limits: { cpu: '500m', memory: '512Mi' } },
                command: [],
                env: {},
                mounts: []
            })),
            pod_template: server.game_server?.pod_template || '',
            user_id: server.game_server?.user_id || 1000,
        };
        if (!editForm.value.pod_config.resources) {
            editForm.value.pod_config.resources = { requests: { cpu: '250m', memory: '256Mi' }, limits: { cpu: '500m', memory: '512Mi' } };
        }
        if (!editForm.value.pod_config.env) editForm.value.pod_config.env = {};
        if (!editForm.value.pod_config.command) editForm.value.pod_config.command = [];
    }

    function closeEditModal() {
        showEditModal.value = false;
    }

    function updateEditEnvKey(event: Event, oldKey: string) {
        const newKey = (event.target as HTMLInputElement).value;
        if (newKey !== oldKey) {
            const env = { ...editForm.value.pod_config.env };
            const value = env[oldKey];
            delete env[oldKey];
            env[newKey] = value;
            editForm.value = { ...editForm.value, pod_config: { ...editForm.value.pod_config, env } };
        }
    }

    function initResources() {
        const pod = { ...editForm.value.pod_config };
        if (!pod.resources) pod.resources = {};
        if (!pod.resources.requests) pod.resources.requests = {};
        if (!pod.resources.limits) pod.resources.limits = {};
        editForm.value = { ...editForm.value, pod_config: pod };
    }

    function minCpuValueChanged(value: number) {
        initResources();
        const pod = { ...editForm.value.pod_config };
        pod.resources = { ...pod.resources, requests: { ...pod.resources?.requests, cpu: `${value}m` } };
        editForm.value = { ...editForm.value, pod_config: pod };
    }

    function maxCpuValueChanged(value: number) {
        initResources();
        const pod = { ...editForm.value.pod_config };
        pod.resources = { ...pod.resources, limits: { ...pod.resources?.limits, cpu: `${value}m` } };
        editForm.value = { ...editForm.value, pod_config: pod };
    }

    function minMemoryValueChanged(value: number) {
        initResources();
        const pod = { ...editForm.value.pod_config };
        pod.resources = { ...pod.resources, requests: { ...pod.resources?.requests, memory: `${value}Mi` } };
        editForm.value = { ...editForm.value, pod_config: pod };
    }

    function maxMemoryValueChanged(value: number) {
        initResources();
        const pod = { ...editForm.value.pod_config };
        pod.resources = { ...pod.resources, limits: { ...pod.resources?.limits, memory: `${value}Mi` } };
        editForm.value = { ...editForm.value, pod_config: pod };
    }

    async function saveEditServer() {
        const updateData = {
            name: editForm.value.name,
            game_version: editForm.value.game_version || null,
            max_players: editForm.value.max_players ? parseInt(String(editForm.value.max_players)) : null,
            icon_url: editForm.value.icon_url || null,
            description: editForm.value.description || null,
            pod_config: {
                ...editForm.value.pod_config,
                resources: editForm.value.pod_config.resources && (editForm.value.pod_config.resources.requests || editForm.value.pod_config.resources.limits)
                    ? {
                        requests: editForm.value.pod_config.resources.requests || null,
                        limits: editForm.value.pod_config.resources.limits || null,
                    }
                    : null,
                command: editForm.value.pod_config.command && editForm.value.pod_config.command.length > 0 ? editForm.value.pod_config.command : null,
                mounts: editForm.value.pod_config.mounts && editForm.value.pod_config.mounts.length > 0 ? editForm.value.pod_config.mounts : null,
            },
            pod_template: editForm.value.pod_template || null,
            user_id: editForm.value.user_id || 1000,
        };

        try {
            const resp = await fetch(`/api/v1/game-servers/${editForm.value.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData),
            });
            if (!resp.ok) {
                const err = await resp.text();
                showToast(err || 'Failed to update server', 'error');
            } else {
                showToast('Successfully updated server', 'success');
                closeEditModal();
                await gameStore.fetchServers();
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to update server', 'error');
        }
    }

    if (!showEditModal.value) return null;

    return (
        <div
            class="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editModalTitle"
            onClick={(e) => { if (e.target === e.currentTarget) closeEditModal(); }}
            onKeyDown={(e) => { if (e.key === 'Escape') closeEditModal(); }}
        >
            <div class="modal-dialog">
                <div class="modal-dialog-header">
                    <h3 id="editModalTitle" class="font-semibold tracking-wide">Edit Server</h3>
                    <button onClick={closeEditModal} aria-label="close modal">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" stroke="currentColor" fill="none" stroke-width="1.4" class="icon-sm">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div class="modal-dialog-body">
                    <div class="tab-list" role="tablist" aria-label="edit tab options">
                        {(['general', 'podconfig', 'misc'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => (editTab.value = tab)}
                                aria-selected={editTab.value === tab}
                                tabIndex={editTab.value === tab ? 0 : -1}
                                class={editTab.value === tab ? 'tab-btn-active' : 'tab-btn-inactive'}
                                type="button"
                                role="tab"
                                aria-controls={`edittabpanel${tab}`}
                            >
                                {tab === 'general' ? 'General' : tab === 'podconfig' ? 'Pod Config' : 'Misc'}
                            </button>
                        ))}
                    </div>
                    <div class="px-4 py-3 overflow-y-scroll min-h-[0] flex-1">
                        {editTab.value === 'general' && (
                            <div id="edittabpanelgeneral" role="tabpanel" aria-label="general" class="form-group">
                                <div>
                                    <label class="form-label-sm">Server Name</label>
                                    <input type="text" value={editForm.value.name} onInput={(e) => (editForm.value = { ...editForm.value, name: (e.target as HTMLInputElement).value })} required class="form-input" />
                                </div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="form-label-sm">Game Version</label>
                                        <input type="text" value={editForm.value.game_version} onInput={(e) => (editForm.value = { ...editForm.value, game_version: (e.target as HTMLInputElement).value })} placeholder="1.20.4" class="form-input" />
                                    </div>
                                    <div>
                                        <label class="form-label-sm">Max Players</label>
                                        <input type="number" value={editForm.value.max_players} onInput={(e) => (editForm.value = { ...editForm.value, max_players: parseInt((e.target as HTMLInputElement).value) || 0 })} placeholder="20" min="0" class="form-input" />
                                    </div>
                                </div>
                                <div>
                                    <label class="form-label-sm">Icon URL</label>
                                    <input type="text" value={editForm.value.icon_url} onInput={(e) => (editForm.value = { ...editForm.value, icon_url: (e.target as HTMLInputElement).value })} placeholder="https://..." class="form-input" />
                                </div>
                                <div>
                                    <label class="form-label-sm">Description</label>
                                    <textarea value={editForm.value.description} onInput={(e) => (editForm.value = { ...editForm.value, description: (e.target as HTMLTextAreaElement).value })} placeholder="Server description..." rows={2} class="form-input" />
                                </div>
                            </div>
                        )}
                        {editTab.value === 'podconfig' && (
                            <div id="edittabpanelpodconfig" role="tabpanel" aria-label="podconfig" class="form-group">
                                <div>
                                    <label class="form-label-sm">Container Image</label>
                                    <input type="text" value={editForm.value.pod_config.image || ''} onInput={(e) => (editForm.value = { ...editForm.value, pod_config: { ...editForm.value.pod_config, image: (e.target as HTMLInputElement).value } })} placeholder="itzg/minecraft-server" required class="form-input" />
                                </div>
                                <div class="space-y-4">
                                    <DualRangeSlider
                                        label="CPU (Cores)"
                                        min={0}
                                        max={8000}
                                        step={50}
                                        minValue={serverResourceSliderFunctions.parseCpu(editForm.value.pod_config?.resources?.requests?.cpu)}
                                        maxValue={serverResourceSliderFunctions.parseCpu(editForm.value.pod_config?.resources?.limits?.cpu)}
                                        onMinChange={minCpuValueChanged}
                                        onMaxChange={maxCpuValueChanged}
                                        formatValue={serverResourceSliderFunctions.formatCpuString}
                                    />
                                    <DualRangeSlider
                                        label="Memory"
                                        min={0}
                                        max={16384}
                                        step={32}
                                        minValue={serverResourceSliderFunctions.parseMemory(editForm.value.pod_config?.resources?.requests?.memory)}
                                        maxValue={serverResourceSliderFunctions.parseMemory(editForm.value.pod_config?.resources?.limits?.memory)}
                                        onMinChange={minMemoryValueChanged}
                                        onMaxChange={maxMemoryValueChanged}
                                        formatValue={serverResourceSliderFunctions.formatMemoryString}
                                    />
                                </div>
                                <div>
                                    <label class="form-label-sm">Command (comma-separated)</label>
                                    <input type="text" value={Array.isArray(editForm.value.pod_config.command) ? editForm.value.pod_config.command.join(', ') : ''} onInput={(e) => {
                                        const cmds = (e.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(s => s.length > 0);
                                        editForm.value = { ...editForm.value, pod_config: { ...editForm.value.pod_config, command: cmds } };
                                    }} placeholder="java, -Xms1G, -Xmx4G" class="form-input" />
                                </div>
                                <div>
                                    <label class="form-label-sm">Environment Variables</label>
                                    <div class="flex flex-col gap-1.5">
                                        {Object.entries(editForm.value.pod_config?.env || {}).map(([key, val], index) => (
                                            <div key={index} class="flex gap-1.5">
                                                <input type="text" value={key} onInput={(e) => updateEditEnvKey(e, key)} placeholder="Key" class="form-input-sm" />
                                                <input type="text" value={val} onInput={(e) => {
                                                    const env = { ...editForm.value.pod_config.env, [key]: (e.target as HTMLInputElement).value };
                                                    editForm.value = { ...editForm.value, pod_config: { ...editForm.value.pod_config, env } };
                                                }} placeholder="Value" class="form-input-sm" />
                                                <button type="button" onClick={() => {
                                                    const env = { ...editForm.value.pod_config.env };
                                                    delete env[key];
                                                    editForm.value = { ...editForm.value, pod_config: { ...editForm.value.pod_config, env } };
                                                }} class="btn-remove">X</button>
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => {
                                            const env = { ...editForm.value.pod_config.env, '': '' };
                                            editForm.value = { ...editForm.value, pod_config: { ...editForm.value.pod_config, env } };
                                        }} class="btn-add">Add Env Var +</button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {editTab.value === 'misc' && (
                            <div id="edittabpanelmisc" role="tabpanel" aria-label="misc" class="form-group">
                                <div>
                                    <label class="form-label-sm">Pod Template</label>
                                    <input type="text" value={editForm.value.pod_template} onInput={(e) => (editForm.value = { ...editForm.value, pod_template: (e.target as HTMLInputElement).value })} placeholder="default/pod_template.yaml.jinja" class="form-input" />
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Path to the Jinja template used to create the Pod manifest.</p>
                                </div>
                                <div>
                                    <label class="form-label-sm">User/Group ID</label>
                                    <input type="number" value={editForm.value.user_id} onInput={(e) => (editForm.value = { ...editForm.value, user_id: parseInt((e.target as HTMLInputElement).value) || 1000 })} placeholder="1000" min="1" class="form-input" />
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">UID/GID for file permissions. Used for PVC fsGroup and SFTP user.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div class="modal-dialog-footer">
                    <button onClick={closeEditModal} type="button" class="btn-secondary">Cancel</button>
                    <button onClick={saveEditServer} type="button" class="btn-primary">Save</button>
                </div>
            </div>
        </div>
    );
}

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
