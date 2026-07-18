import { useSignal, useSignalEffect } from '@preact/signals';
import { notifyBus } from '../signals/notify';
import type { Server } from '../signals/game-server-store';
import { showToast } from '../utils/toast';

export default function SftpCredentialsModal() {
    const show = useSignal(false);
    const credentials = useSignal<{ username: string; password: string } | null>(null);
    const server = useSignal<Server | null>(null);

    useSignalEffect(() => {
        const unsub = notifyBus.on('open-sftp-modal', async (payload: { server: Server }) => {
            const s = payload.server;
            try {
                const resp = await fetch(`/api/v1/game-servers/${s.id}/sftp-credentials`);
                if (resp.ok) {
                    credentials.value = await resp.json();
                    server.value = s;
                    show.value = true;
                } else {
                    showToast('No SFTP credentials found. Start SFTP first.', 'error');
                }
            } catch (e) {
                console.error(e);
                showToast('Failed to fetch SFTP credentials', 'error');
            }
        });
        return () => unsub();
    });

    function close() {
        show.value = false;
        credentials.value = null;
        server.value = null;
    }

    function copyToClipboard(text: string, label: string) {
        navigator.clipboard.writeText(text);
        showToast(`Copied ${label}!`, 'success');
    }

    if (!show.value) return null;

    return (
        <div class="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
            <div class="modal-content max-w-md">
                <div class="modal-header">
                    <h3 class="heading-tertiary">SFTP Credentials</h3>
                    <button onClick={close} class="close-btn">
                        <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div class="p-4 space-y-4">
                    <div class="warning-box">
                        <p class="warning-title">Keep these credentials secure!</p>
                        <p class="warning-text">These credentials are ephemeral and will be lost when the Game Server is stopped.</p>
                    </div>
                    <div class="space-y-2">
                        <label class="form-label-sm">Host</label>
                        <div class="flex items-center gap-2">
                            <code class="flex-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm text-label">{server.value?.ip || 'Pending...'}</code>
                            <button onClick={() => copyToClipboard(server.value?.ip || '', 'host')} class="btn-secondary text-xs">Copy</button>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="form-label-sm">Port</label>
                        <div class="flex items-center gap-2">
                            <code class="flex-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm text-label">22</code>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="form-label-sm">Username</label>
                        <div class="flex items-center gap-2">
                            <code class="flex-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm text-label">{credentials.value?.username || ''}</code>
                            <button onClick={() => copyToClipboard(credentials.value?.username || '', 'username')} class="btn-secondary text-xs">Copy</button>
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="form-label-sm">Password</label>
                        <div class="flex items-center gap-2">
                            <code class="flex-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono text-label">{credentials.value?.password || ''}</code>
                            <button onClick={() => copyToClipboard(credentials.value?.password || '', 'password')} class="btn-secondary text-xs">Copy</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
