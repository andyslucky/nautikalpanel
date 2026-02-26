import Alpine from 'alpinejs';

const logsModalContent = `
<div x-show="$store.gameServers.showLogViewer" x-cloak class="modal-backdrop" @click.self="$store.gameServers.closeLogs()">
    <div class="modal-content">
        <div class="modal-header">
            <h3 class="heading-tertiary">
                Logs: <span x-text="$store.gameServers.logViewerServer?.name || ''"></span>
            </h3>
            <div class="flex items-center gap-2">
                <button @click="$store.gameServers.clearLogs()" class="btn-secondary">Clear</button>
                <button @click="$store.gameServers.closeLogs()" class="close-btn">
                    <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="log-viewer" x-ref="logContainer">
            <pre class="log-content"><template x-for="(line, index) in $store.gameServers.logLines" :key="index"><div x-text="line"></div></template></pre>
        </div>
        <div class="modal-footer">
            <span x-show="$store.gameServers.logConnected" class="text-success">Connected</span>
            <span x-show="!$store.gameServers.logConnected && $store.gameServers.showLogViewer" class="text-warn">Disconnected</span>
            <span x-text="$store.gameServers.logLines.length + ' lines'"></span>
        </div>
    </div>
</div>
`;

Alpine.data('logsModal', () => ({
    content: logsModalContent
}));
