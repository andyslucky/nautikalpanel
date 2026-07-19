import { useSignal, useSignalEffect } from '@preact/signals';
import { useEffect, useRef } from 'preact/compat';
import type { GameServerTemplateData } from '../types';
import { serverResourceSliderFunctions } from '../resource-utils';
import { showToast } from '../utils/toast';
import * as gameStore from '../signals/game-server-store';
import DualRangeSlider from './DualRangeSlider';

export default function CreateServerModal({ showModal }: { showModal: ReturnType<typeof useSignal<boolean>> }) {
    const selectedTab = useSignal<'general' | 'podconfig' | 'storageconfig' | 'svcconfig'>('general');
    const gameServerTemplates = useSignal<GameServerTemplateData[]>([]);
    const selectedTemplateName = useSignal('');
    const form = useSignal<GameServerForm>(formDefaultValue());
    const commandInput = useSignal('');
    const templateDropdownOpen = useSignal(false);
    const templateDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchGameServerTemplates();
    }, []);

    useSignalEffect(() => {
        if (!templateDropdownOpen.value) return;
        const handler = (e: MouseEvent) => {
            if (templateDropdownRef.current && !templateDropdownRef.current.contains(e.target as Node)) {
                templateDropdownOpen.value = false;
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    });

    function formDefaultValue(): GameServerForm {
        return {
            name: '',
            game_version: '',
            max_players: 0,
            template: {
                template_name: '',
                description: '',
                game_type: '',
                icon_url: '',
                user_id: 1000,
                pod_config: {
                    image: '',
                    resources: {
                        requests: { cpu: '250m', memory: '256Mi' },
                        limits: { cpu: '500m', memory: '512Mi' },
                    },
                    command: [],
                    env: {},
                    mounts: [],
                },
                service_config: {
                    ports: [],
                    ip_address: '',
                    service_type: 'LoadBalancer',
                },
                pvc_config: {
                    size: 0,
                    size_unit: 'Gi',
                    container_path: '',
                    storage_class: '',
                },
            },
        };
    }

    async function fetchGameServerTemplates() {
        try {
            const resp = await fetch('/api/v1/game-server-templates');
            gameServerTemplates.value = (await resp.json()) || [];
        } catch (e) {
            gameServerTemplates.value = [];
        }
    }

    function useTemplate(template: GameServerTemplateData) {
        const next = JSON.parse(JSON.stringify(template)) as GameServerTemplateData;
        form.value = {
            ...form.value,
            template: next,
            max_players: template.default_max_users || 0,
        };
        if (!form.value.template.user_id) form.value.template.user_id = 1000;
        if (!form.value.template.pod_config.resources) {
            form.value.template.pod_config.resources = {
                requests: { cpu: '0m', memory: '0Mi' },
                limits: { cpu: '0m', memory: '0Mi' },
            };
        }
        if (!form.value.template.pod_config.resources.requests) {
            form.value.template.pod_config.resources.requests = { cpu: '0m', memory: '0Mi' };
        }
        if (!form.value.template.pod_config.resources.limits) {
            form.value.template.pod_config.resources.limits = { cpu: '0m', memory: '0Mi' };
        }
        if (!form.value.template.pod_config.mounts) form.value.template.pod_config.mounts = [];
        if (!form.value.template.pod_config.command) form.value.template.pod_config.command = [];
        if (!form.value.template.service_config.ports || form.value.template.service_config.ports.length === 0) {
            form.value.template.service_config.ports = [{ port: '', protocol: 'TCP' }];
        }
        // trigger update
        form.value = { ...form.value };
    }

    function resetForm() {
        selectedTemplateName.value = '';
        form.value = formDefaultValue();
        commandInput.value = '';
    }

    function selectTemplate(template: GameServerTemplateData) {
        selectedTemplateName.value = template.template_name;
        useTemplate(template);
        templateDropdownOpen.value = false;
    }

    function updateCommandArray(value?: string) {
        if (!form.value.template.pod_config) return;
        const cmds = (value || '')
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        form.value = {
            ...form.value,
            template: {
                ...form.value.template,
                pod_config: { ...form.value.template.pod_config, command: cmds },
            },
        };
    }

    function updateEnvKey(event: Event, oldKey: string) {
        const newKey = (event.target as HTMLInputElement).value;
        const env = { ...form.value.template.pod_config.env };
        if (newKey !== oldKey) {
            const val = env[oldKey];
            delete env[oldKey];
            env[newKey] = val;
        }
        form.value = {
            ...form.value,
            template: {
                ...form.value.template,
                pod_config: { ...form.value.template.pod_config, env },
            },
        };
    }

    function initResources() {
        const pod = { ...form.value.template.pod_config };
        if (!pod.resources) pod.resources = {};
        if (!pod.resources.requests) pod.resources.requests = {};
        if (!pod.resources.limits) pod.resources.limits = {};
        form.value = {
            ...form.value,
            template: { ...form.value.template, pod_config: pod },
        };
    }

    function minCpuValueChanged(value: number) {
        initResources();
        const pod = { ...form.value.template.pod_config };
        pod.resources = { ...pod.resources, requests: { ...pod.resources?.requests, cpu: `${value}m` } };
        form.value = { ...form.value, template: { ...form.value.template, pod_config: pod } };
    }

    function maxCpuValueChanged(value: number) {
        initResources();
        const pod = { ...form.value.template.pod_config };
        pod.resources = { ...pod.resources, limits: { ...pod.resources?.limits, cpu: `${value}m` } };
        form.value = { ...form.value, template: { ...form.value.template, pod_config: pod } };
    }

    function minMemoryValueChanged(value: number) {
        initResources();
        const pod = { ...form.value.template.pod_config };
        pod.resources = { ...pod.resources, requests: { ...pod.resources?.requests, memory: `${value}Mi` } };
        form.value = { ...form.value, template: { ...form.value.template, pod_config: pod } };
    }

    function maxMemoryValueChanged(value: number) {
        initResources();
        const pod = { ...form.value.template.pod_config };
        pod.resources = { ...pod.resources, limits: { ...pod.resources?.limits, memory: `${value}Mi` } };
        form.value = { ...form.value, template: { ...form.value.template, pod_config: pod } };
    }

    async function createServer() {
        const template = form.value.template;
        const newServerRequest = {
            name: form.value.name,
            game_version: form.value.game_version || null,
            max_players: form.value.max_players ? parseInt(String(form.value.max_players)) : null,
            template: {
                ...template,
                service_config: {
                    ...template.service_config,
                    ports: template.service_config.ports.map((p: any) => ({
                        port: parseInt(p.port),
                        protocol: p.protocol,
                    })),
                },
                pvc_config: {
                    ...template.pvc_config,
                    size: typeof template.pvc_config.size === 'number' ? template.pvc_config.size : parseInt(template.pvc_config.size as any) || 0,
                },
                pod_config: {
                    ...template.pod_config,
                    resources: template.pod_config.resources && (template.pod_config.resources.requests || template.pod_config.resources.limits)
                        ? {
                            requests: template.pod_config.resources.requests || null,
                            limits: template.pod_config.resources.limits || null,
                        }
                        : null,
                    command: template.pod_config.command && template.pod_config.command.length > 0 ? template.pod_config.command : null,
                    mounts: template.pod_config.mounts && template.pod_config.mounts.length > 0 ? template.pod_config.mounts : null,
                },
            },
        };

        fetch('/api/v1/game-servers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newServerRequest),
        })
            .then((resp) => {
                if (!resp.ok) {
                    resp.text().then((err) => showToast(err || 'Failed to create server', 'error'));
                } else {
                    showModal.value = false;
                    resetForm();
                    showToast('Successfully created server ' + newServerRequest.name, 'success');
                }
            })
            .then(() => gameStore.fetchServers());
    }

    if (!showModal.value) return null;

    return (
        <div
            class="modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="defaultModalTitle"
            onClick={(e) => { if (e.target === e.currentTarget) { resetForm(); showModal.value = false; } }}
            onKeyDown={(e) => { if (e.key === 'Escape') { resetForm(); showModal.value = false; } }}
        >
            <div class="modal-dialog">
                <div class="modal-dialog-header">
                    <h3 id="defaultModalTitle" class="font-semibold tracking-wide">Create Server</h3>
                    <button onClick={() => { resetForm(); showModal.value = false; }} aria-label="close modal">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" stroke="currentColor" fill="none" stroke-width="1.4" class="icon-sm">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div class="modal-dialog-body">
                    <div class="tab-list" role="tablist" aria-label="tab options">
                        {(['general', 'podconfig', 'storageconfig', 'svcconfig'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => (selectedTab.value = tab)}
                                aria-selected={selectedTab.value === tab}
                                tabIndex={selectedTab.value === tab ? 0 : -1}
                                class={selectedTab.value === tab ? 'tab-btn-active' : 'tab-btn-inactive'}
                                type="button"
                                role="tab"
                                aria-controls={`tabpanel${tab}`}
                            >
                                {tab === 'general' ? 'General' : tab === 'podconfig' ? 'Pod Config' : tab === 'storageconfig' ? 'Storage Config' : 'Service Config'}
                            </button>
                        ))}
                    </div>
                    <div class="px-4 py-3 overflow-y-scroll min-h-0 flex-1">
                        {selectedTab.value === 'general' && (
                            <div id="tabpanelgeneral" role="tabpanel" aria-label="general" class="form-group">
                                <div>
                                    <label class="form-label-sm">Server Name</label>
                                    <input type="text" value={form.value.name} onInput={(e) => (form.value = { ...form.value, name: (e.target as HTMLInputElement).value })} placeholder={'My ' + selectedTemplateName.value + ' Server'} required class="form-input" />
                                </div>
                                <div>
                                    <label class="form-label-sm">Template</label>
                                    <div class="relative" ref={templateDropdownRef}>
                                        <button
                                            type="button"
                                            class="form-input w-full text-left flex items-center gap-2"
                                            onClick={() => (templateDropdownOpen.value = !templateDropdownOpen.value)}
                                            aria-haspopup="listbox"
                                            aria-expanded={templateDropdownOpen.value}
                                        >
                                            {form.value.template.icon_url ? (
                                                <img src={form.value.template.icon_url} width="24" height="24" class="rounded shrink-0" />
                                            ) : (
                                                <div class="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
                                            )}
                                            <span class="flex-1 truncate">{selectedTemplateName.value || 'Select a template...'}</span>
                                            <svg class="w-4 h-4 shrink-0 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                        {templateDropdownOpen.value && (
                                            <div class="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded shadow-lg">
                                                {gameServerTemplates.value.map((temp) => (
                                                    <button
                                                        key={temp.template_name}
                                                        type="button"
                                                        onClick={() => selectTemplate(temp)}
                                                        class={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${selectedTemplateName.value === temp.template_name ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
                                                    >
                                                        {temp.icon_url ? (
                                                            <img src={temp.icon_url} width="24" height="24" class="rounded shrink-0" />
                                                        ) : (
                                                            <div class="w-6 h-6 rounded bg-gray-200 dark:bg-gray-700 shrink-0" />
                                                        )}
                                                        <span class="flex-1 truncate">{temp.template_name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="form-label-sm">Game Version</label>
                                        <input type="text" value={form.value.game_version} onInput={(e) => (form.value = { ...form.value, game_version: (e.target as HTMLInputElement).value })} placeholder="1.20.4" class="form-input" />
                                    </div>
                                    <div>
                                        <label class="form-label-sm">Max Players</label>
                                        <input type="number" value={form.value.max_players} onInput={(e) => (form.value = { ...form.value, max_players: parseInt((e.target as HTMLInputElement).value) || 0 })} placeholder="20" min="0" class="form-input" />
                                    </div>
                                </div>
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="form-label-sm">Game Type</label>
                                        <input type="text" value={form.value.template.game_type || ''} onInput={(e) => (form.value = { ...form.value, template: { ...form.value.template, game_type: (e.target as HTMLInputElement).value } })} placeholder="minecraft" class="form-input" />
                                    </div>
                                    <div>
                                        <label class="form-label-sm">Icon URL</label>
                                        <input type="text" value={form.value.template.icon_url || ''} onInput={(e) => (form.value = { ...form.value, template: { ...form.value.template, icon_url: (e.target as HTMLInputElement).value } })} placeholder="https://..." class="form-input" />
                                    </div>
                                </div>
                                <div>
                                    <label class="form-label-sm">Description</label>
                                    <textarea value={form.value.template.description || ''} onInput={(e) => (form.value = { ...form.value, template: { ...form.value.template, description: (e.target as HTMLTextAreaElement).value } })} placeholder="Server description..." rows={2} class="form-input" />
                                </div>
                            </div>
                        )}
                        {selectedTab.value === 'podconfig' && (
                            <div id="tabpanelpodconfig" role="tabpanel" aria-label="podconfig" class="form-group">
                                <div>
                                    <label class="form-label-sm">Container Image</label>
                                    <input type="text" value={form.value.template.pod_config.image || ''} onInput={(e) => (form.value = { ...form.value, template: { ...form.value.template, pod_config: { ...form.value.template.pod_config, image: (e.target as HTMLInputElement).value } } })} placeholder="itzg/minecraft-server" required class="form-input" />
                                </div>
                                <div class="space-y-4">
                                    <DualRangeSlider
                                        label="CPU (Cores)"
                                        min={0}
                                        max={8000}
                                        step={50}
                                        minValue={serverResourceSliderFunctions.parseCpu(form.value.template.pod_config?.resources?.requests?.cpu)}
                                        maxValue={serverResourceSliderFunctions.parseCpu(form.value.template.pod_config?.resources?.limits?.cpu)}
                                        onMinChange={minCpuValueChanged}
                                        onMaxChange={maxCpuValueChanged}
                                        formatValue={serverResourceSliderFunctions.formatCpuString}
                                    />
                                    <DualRangeSlider
                                        label="Memory"
                                        min={0}
                                        max={16384}
                                        step={32}
                                        minValue={serverResourceSliderFunctions.parseMemory(form.value.template.pod_config?.resources?.requests?.memory)}
                                        maxValue={serverResourceSliderFunctions.parseMemory(form.value.template.pod_config?.resources?.limits?.memory)}
                                        onMinChange={minMemoryValueChanged}
                                        onMaxChange={maxMemoryValueChanged}
                                        formatValue={serverResourceSliderFunctions.formatMemoryString}
                                    />
                                </div>
                                <div>
                                    <label class="form-label-sm">Command (comma-separated)</label>
                                    <input type="text" value={Array.isArray(form.value.template.pod_config.command) ? form.value.template.pod_config.command.join(', ') : ''} onInput={(e) => updateCommandArray((e.target as HTMLInputElement).value)} placeholder="java, -Xms1G, -Xmx4G" class="form-input" />
                                </div>
                                <div>
                                    <label class="form-label-sm">Environment Variables</label>
                                    <div class="flex flex-col gap-1.5">
                                        {Object.entries(form.value.template.pod_config.env || {}).map(([key, val], index) => (
                                            <div key={index} class="flex gap-1.5">
                                                <input type="text" value={key} onInput={(e) => updateEnvKey(e, key)} placeholder="Key" class="form-input-sm" />
                                                <input type="text" value={val} onInput={(e) => {
                                                    const env = { ...form.value.template.pod_config.env, [key]: (e.target as HTMLInputElement).value };
                                                    form.value = { ...form.value, template: { ...form.value.template, pod_config: { ...form.value.template.pod_config, env } } };
                                                }} placeholder="Value" class="form-input-sm" />
                                                <button type="button" onClick={() => {
                                                    const env = { ...form.value.template.pod_config.env };
                                                    delete env[key];
                                                    form.value = { ...form.value, template: { ...form.value.template, pod_config: { ...form.value.template.pod_config, env } } };
                                                }} class="btn-remove">X</button>
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => {
                                            const env = { ...form.value.template.pod_config.env, '': '' };
                                            form.value = { ...form.value, template: { ...form.value.template, pod_config: { ...form.value.template.pod_config, env } } };
                                        }} class="btn-add">Add Env Var +</button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {selectedTab.value === 'storageconfig' && (
                            <div id="tabpanelstorageconfig" role="tabpanel" aria-label="storageconfig" class="form-group">
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="form-label-sm">Storage Size</label>
                                        <input type="number" value={form.value.template.pvc_config.size || ''} onInput={(e) => (form.value = { ...form.value, template: { ...form.value.template, pvc_config: { ...form.value.template.pvc_config, size: (e.target as HTMLInputElement).value } } })} placeholder="10" min="1" required class="form-input" />
                                    </div>
                                    <div>
                                        <label class="form-label-sm">Size Unit</label>
                                        <select value={form.value.template.pvc_config.size_unit || ''} onChange={(e) => (form.value = { ...form.value, template: { ...form.value.template, pvc_config: { ...form.value.template.pvc_config, size_unit: (e.target as HTMLSelectElement).value } } })} class="form-input">
                                            <option value="Mi">Mi</option>
                                            <option value="Gi">Gi</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label class="form-label-sm">Container Path</label>
                                    <input type="text" value={form.value.template.pvc_config.container_path || ''} onInput={(e) => (form.value = { ...form.value, template: { ...form.value.template, pvc_config: { ...form.value.template.pvc_config, container_path: (e.target as HTMLInputElement).value } } })} placeholder="/data" class="form-input" />
                                </div>
                                <div>
                                    <label class="form-label-sm">Storage Class (Optional)</label>
                                    <input type="text" value={form.value.template.pvc_config.storage_class || ''} onInput={(e) => (form.value = { ...form.value, template: { ...form.value.template, pvc_config: { ...form.value.template.pvc_config, storage_class: (e.target as HTMLInputElement).value } } })} placeholder="standard" class="form-input" />
                                </div>
                                <div>
                                    <label class="form-label-sm">User/Group ID</label>
                                    <input type="number" value={form.value.template.user_id || ''} onInput={(e) => (form.value = { ...form.value, template: { ...form.value.template, user_id: parseInt((e.target as HTMLInputElement).value) || 1000 } })} placeholder="1000" min="1" class="form-input" />
                                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">UID/GID for file permissions. Used for PVC fsGroup and SFTP user.</p>
                                </div>
                            </div>
                        )}
                        {selectedTab.value === 'svcconfig' && (
                            <div id="tabpanelsvcconfig" role="tabpanel" aria-label="svcconfig" class="form-group">
                                <div class="grid grid-cols-2 gap-2">
                                    <div>
                                        <label class="form-label-sm">Service Type</label>
                                        <select value={form.value.template.service_config.service_type || ''} onChange={(e) => (form.value = { ...form.value, template: { ...form.value.template, service_config: { ...form.value.template.service_config, service_type: (e.target as HTMLSelectElement).value } } })} class="form-input">
                                            <option value="LoadBalancer">LoadBalancer</option>
                                            <option value="ClusterIP">ClusterIP</option>
                                            <option value="NodePort">NodePort</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="form-label-sm">IP Address (Optional)</label>
                                        <input type="text" value={form.value.template.service_config.ip_address || ''} onInput={(e) => (form.value = { ...form.value, template: { ...form.value.template, service_config: { ...form.value.template.service_config, ip_address: (e.target as HTMLInputElement).value } } })} placeholder="192.168.1.100" class="form-input" />
                                    </div>
                                </div>
                                <div>
                                    <label class="form-label-sm">Ports</label>
                                    <div class="flex flex-col gap-1.5">
                                        {form.value.template.service_config.ports.map((p, index) => (
                                            <div key={index} class="flex gap-1.5">
                                                <input type="number" value={p.port} onInput={(e) => {
                                                    const ports = [...form.value.template.service_config.ports];
                                                    ports[index] = { ...ports[index], port: (e.target as HTMLInputElement).value };
                                                    form.value = { ...form.value, template: { ...form.value.template, service_config: { ...form.value.template.service_config, ports } } };
                                                }} placeholder="25565" required min="1" max="65535" class="form-input-sm" />
                                                <select value={p.protocol} onChange={(e) => {
                                                    const ports = [...form.value.template.service_config.ports];
                                                    ports[index] = { ...ports[index], protocol: (e.target as HTMLSelectElement).value };
                                                    form.value = { ...form.value, template: { ...form.value.template, service_config: { ...form.value.template.service_config, ports } } };
                                                }} required class="form-select-sm w-20">
                                                    <option value="TCP">TCP</option>
                                                    <option value="UDP">UDP</option>
                                                    <option value="Both">Both</option>
                                                </select>
                                                <button type="button" onClick={() => {
                                                    const ports = form.value.template.service_config.ports.filter((_, i) => i !== index);
                                                    form.value = { ...form.value, template: { ...form.value.template, service_config: { ...form.value.template.service_config, ports } } };
                                                }} class="btn-remove">X</button>
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => {
                                            const ports = [...form.value.template.service_config.ports, { port: '', protocol: 'TCP' }];
                                            form.value = { ...form.value, template: { ...form.value.template, service_config: { ...form.value.template.service_config, ports } } };
                                        }} class="btn-add">Add Port +</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div class="modal-dialog-footer">
                    <button onClick={() => { resetForm(); showModal.value = false; }} type="button" class="btn-secondary">Cancel</button>
                    <button onClick={() => { createServer(); resetForm(); }} type="button" class="btn-primary">Create</button>
                </div>
            </div>
        </div>
    );
}

type GameServerForm = {
    name: string;
    game_version: string;
    max_players: number;
    template: GameServerTemplateData;
};
