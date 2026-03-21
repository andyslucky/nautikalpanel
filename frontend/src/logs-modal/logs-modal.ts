import Alpine from 'alpinejs';
import logsModalContent from "./logs-modal.html?raw";
import type { Server } from '../stores/game-server-store';
import type { LogViewerStore } from '../stores/log-viewer-store';
import { downloadLogs } from '../utils/logs';

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
        if (this.server) {
            await downloadLogs(this.server.id);
        }
    }
}));
