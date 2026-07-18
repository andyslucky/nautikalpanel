import { useSignal, useSignalEffect } from '@preact/signals';
import * as logStore from '../signals/log-viewer-store';
import { downloadLogs } from '../utils/logs';
import { notifyBus } from '../signals/notify';
import type { Server } from '../signals/game-server-store';

export default function LogsModal() {
    const show = useSignal(false);
    const server = useSignal<Server | null>(null);

    useSignalEffect(() => {
        const unsub = notifyBus.on('open-logs-modal', (payload: { server: Server }) => {
            server.value = payload.server;
            show.value = true;
            logStore.connect(payload.server.id);
        });
        return () => unsub();
    });

    function close() {
        show.value = false;
        logStore.disconnect();
        server.value = null;
    }

    if (!show.value) return null;

    return (
        <div class="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="heading-tertiary">
                        Logs: {server.value?.name || ''}
                    </h3>
                    <div class="flex items-center gap-2">
                        <button onClick={async () => { if (server.value) await downloadLogs(server.value.id); }} class="btn-secondary" title="Download logs">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                        </button>
                        <button onClick={() => logStore.clear()} class="btn-secondary">Clear</button>
                        <button onClick={close} class="close-btn">
                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="log-viewer" id="modal-log-container">
                    <pre class="log-content">
                        {logStore.lines.value.map((line, idx) => (
                            <div key={idx}>{line}</div>
                        ))}
                    </pre>
                    {logStore.connecting.value && logStore.lines.value.length === 0 && (
                        <div class="log-loading-placeholder">
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-5 animate-spin motion-reduce:animate-none">
                                <path opacity="0.25" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" />
                                <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z" />
                            </svg>
                            <span>Loading logs…</span>
                        </div>
                    )}
                </div>
                <div class="modal-footer">
                    {logStore.connecting.value && <span class="text-warn">Connecting…</span>}
                    {logStore.connected.value && <span class="text-success">Connected</span>}
                    {!logStore.connecting.value && !logStore.connected.value && <span class="text-warn">Disconnected</span>}
                    <span>{logStore.lines.value.length} lines</span>
                </div>
            </div>
        </div>
    );
}
