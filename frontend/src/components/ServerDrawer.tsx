import { useSignal, useSignalEffect } from '@preact/signals';
import { notifyBus } from '../signals/notify';
import { downloadLogs } from '../utils/logs';
import * as logStore from '../signals/log-viewer-store';
import * as gameStore from '../signals/game-server-store';
import type { Server } from '../signals/game-server-store';

export default function ServerDrawer() {
    const open = useSignal(false);
    const server = useSignal<Server | null>(null);

    useSignalEffect(() => {
        const unsubOpen = notifyBus.on('open-drawer', (payload: { server: Server }) => {
            server.value = payload.server;
            open.value = true;
            if (payload.server.status === 'Running' && payload.server.instance_type === 'gameserver') {
                logStore.connect(payload.server.id);
            }
        });
        const unsubStatus = notifyBus.on('game-server-status-changed', (s: Server) => {
            if (server.value && server.value.id === s.id && s.status === 'Running' && open.value) {
                logStore.connect(s.id);
            }
        });
        return () => {
            unsubOpen();
            unsubStatus();
        };
    });

    function closeDrawer() {
        open.value = false;
        logStore.disconnect();
    }

    function popOutLogs() {
        if (server.value) {
            const s = server.value;
            closeDrawer();
            notifyBus.emit('open-logs-modal', { server: s });
        }
    }

    function fetchSftpCredentials() {
        if (server.value) {
            const s = server.value;
            closeDrawer();
            notifyBus.emit('open-sftp-modal', { server: s });
        }
    }

    if (!open.value) return null;

    const s = server.value;
    if (!s) return null;

    return (
        <div
            class="drawer-backdrop"
            onClick={(e) => {
                if (e.target === e.currentTarget) closeDrawer();
            }}
        >
            <div class="drawer" onClick={(e) => e.stopPropagation()}>
                <div class="drawer-header">
                    <div class="flex items-center gap-3">
                        <img src={s.icon_url} width="48" height="48" class="rounded-lg" />
                        <div>
                            <h3 class="heading-tertiary">{s.name}</h3>
                            <p class="text-sm text-muted">{s.game}</p>
                        </div>
                    </div>
                    <button onClick={closeDrawer} class="close-btn">
                        <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div class="drawer-body">
                    {s.description && (
                        <div class="drawer-section">
                            <p class="text-sm text-gray-600 dark:text-gray-400">{s.description}</p>
                        </div>
                    )}

                    <div class="drawer-section">
                        <h4 class="drawer-section-title">Connection</h4>
                        <div class="resource-info">
                            <div class="flex justify-between items-center py-1">
                                <span class="resource-label">Address</span>
                                <code class="text-sm resource-value">{gameStore.serverAddressLine(s)}</code>
                            </div>
                        </div>
                    </div>

                    <div class="drawer-section">
                        <h4 class="drawer-section-title">Quick Actions</h4>
                        <div class="flex gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={() => gameStore.toggleStatus(s)}
                                class="btn-action"
                                disabled={!['Offline', 'Running'].includes(s.status)}
                                className={
                                    s.status === 'Offline'
                                        ? 'btn-action bg-success'
                                        : s.status === 'Running'
                                            ? 'btn-action bg-danger'
                                            : 'btn-action bg-warn'
                                }
                            >
                                {s.status === 'Offline' ? 'Start' : s.status === 'Running' ? 'Stop' : 'Wait'}
                            </button>
                            {s.status === 'Offline' && (
                                <button type="button" onClick={() => gameStore.startSftpOnly(s)} class="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed">
                                    SFTP Only
                                </button>
                            )}
                            {s.status === 'Running' && (
                                <button onClick={fetchSftpCredentials} class="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed">
                                    SFTP Credentials
                                </button>
                            )}
                        </div>
                    </div>

                    <div class="drawer-section">
                        <h4 class="drawer-section-title">Resource Usage</h4>
                        <div class="resource-info space-y-3">
                            <div class="resource-item">
                                <div class="flex justify-between mb-1">
                                    <span class="resource-label">CPU</span>
                                    <span class="resource-value">{gameStore.formatCpuUsage(s)}</span>
                                </div>
                                <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        class={`h-full rounded-full transition-all duration-500 ${gameStore.getCpuUsageColor(gameStore.calculateCpuUsagePercentage(s))}`}
                                        style={{ width: `${gameStore.calculateCpuUsagePercentage(s)}%` }}
                                    />
                                </div>
                            </div>
                            <div class="resource-item">
                                <div class="flex justify-between mb-1">
                                    <span class="resource-label">Memory</span>
                                    <span class="resource-value">{gameStore.formatMemoryUsage(s)}</span>
                                </div>
                                <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        class={`h-full rounded-full transition-all duration-500 ${gameStore.getMemoryUsageColor(gameStore.calculateMemoryUsagePercentage(s))}`}
                                        style={{ width: `${gameStore.calculateMemoryUsagePercentage(s)}%` }}
                                    />
                                </div>
                            </div>
                            <div class="resource-item">
                                <div class="flex justify-between mb-1">
                                    <span class="resource-label">Storage</span>
                                    <span class="resource-value">{gameStore.formatStorage(s.storage_size || 0, s.storage_unit || 'Gi')}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {s.status === 'Running' && s.instance_type === 'gameserver' && (
                        <div class="drawer-section flex-1 min-h-0 flex flex-col">
                            <div class="flex items-center justify-between mb-2">
                                <h4 class="drawer-section-title">Logs</h4>
                                <div class="flex items-center gap-2">
                                    {logStore.connected.value && <span class="text-xs text-success">Connected</span>}
                                    {!logStore.connected.value && <span class="text-xs text-warn">Disconnected</span>}
                                    <button onClick={async () => { if (s) await downloadLogs(s.id); }} class="btn-secondary text-xs" title="Download logs">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                    </button>
                                    <button onClick={() => logStore.clear()} class="btn-secondary text-xs">Clear</button>
                                    <button onClick={popOutLogs} class="btn-secondary text-xs" title="Open logs in modal">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div class="log-viewer flex-1" id="drawer-log-container">
                                <pre class="log-content">
                                    {logStore.lines.value.map((line, idx) => (
                                        <div key={idx}>{line}</div>
                                    ))}
                                </pre>
                                {logStore.lines.value.length === 0 && (
                                    <div class="text-gray-500 text-sm">No logs yet. Server must be running to show logs.</div>
                                )}
                            </div>
                            <div class="text-xs text-gray-500 mt-1">{logStore.lines.value.length} lines</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
