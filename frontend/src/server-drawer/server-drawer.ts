import Alpine from 'alpinejs';
import serverDrawerContent from "./server-drawer.html?raw";
import type { Server } from '../stores/game-server-store';
import type { LogViewerStore } from '../stores/log-viewer-store';

Alpine.data('serverDrawer', () => ({
    content: serverDrawerContent,
    open: false,
    server: null as Server | null,

    init() {
        window.addEventListener('open-drawer', ((e: CustomEvent<{ server: Server }>) => {
            this.openDrawer(e.detail.server);
        }) as EventListener);
    },

    openDrawer(server: Server) {
        this.server = server;
        this.open = true;
        const logViewer = Alpine.store('logViewer') as LogViewerStore;
        logViewer.lines = [];
        if (server.status === 'Running' && server.instance_type === 'gameserver') {
            logViewer.connect(server.id);
        }
    },

    closeDrawer() {
        this.open = false;
        const logViewer = Alpine.store('logViewer') as LogViewerStore;
        logViewer.disconnect();
        logViewer.lines = [];
        this.server = null;
    },

    popOutLogs() {
        if (this.server) {
            const serverRef = this.server;
            this.closeDrawer();
            window.dispatchEvent(new CustomEvent('open-logs-modal', { detail: { server: serverRef } }));
        }
    },

    fetchSftpCredentials() {
        if (this.server) {
            const serverRef = this.server;
            this.closeDrawer();
            window.dispatchEvent(new CustomEvent('open-sftp-modal', { detail: { server: serverRef } }));
        }
    }
}));