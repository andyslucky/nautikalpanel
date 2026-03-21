import Alpine from 'alpinejs';
import logsModalContent from "./logs-modal.html?raw";
import type { Server } from '../stores/game-server-store';
import type { LogViewerStore } from '../stores/log-viewer-store';

Alpine.data('logsModal', () => ({
    content: logsModalContent,
    show: false,
    server: null as Server | null,

    open(server: Server) {
        this.server = server;
        this.show = true;
        (Alpine.store('logViewer') as LogViewerStore).connect(server.id);
    },

    close() {
        this.show = false;
        (Alpine.store('logViewer') as LogViewerStore).disconnect();
        this.server = null;
    },

    clear() {
        (Alpine.store('logViewer') as LogViewerStore).clear();
    },

    async download() {
        if (!this.server) return;
        const response = await fetch(`/api/v1/game-servers/${this.server.id}/logs/download`);
        if (!response.ok) {
            console.error('Failed to download logs');
            return;
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.server.id}-logs.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}));
