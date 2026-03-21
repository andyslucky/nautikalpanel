import Alpine from 'alpinejs';
import serverDrawerContent from "./server-drawer.html?raw";
import type {Server} from '../stores/game-server-store';
import type {LogViewerStore} from '../stores/log-viewer-store';

Alpine.data('serverDrawer', () => ({
    content: serverDrawerContent,
    open: false,
    server: null as Server | null,

    init() {
    },

    openDrawer(server: Server) {
        this.server = server;
        this.open = true;
        const logViewer = Alpine.store('logViewer') as LogViewerStore;
        if (server.status === 'Running' && server.instance_type === 'gameserver') {
            logViewer.connect(server.id);
        }
    },
    gameServerStatusChanged(server : Server) {
        if (this.server && this.server.id == server.id && server.status == 'Running' && this.open) {
            const logViewer = Alpine.store('logViewer') as LogViewerStore;
            logViewer.connect(server.id);
        }
    },
    closeDrawer() {
        const logViewer = Alpine.store('logViewer') as LogViewerStore;
        this.open = false;
        logViewer.disconnect();
    },

    popOutLogs() {
        if (this.server) {
            const serverRef = this.server;
            this.closeDrawer();
            window.dispatchEvent(new CustomEvent('open-logs-modal', {detail: {server: serverRef}}));
        }
    },

    fetchSftpCredentials() {
        if (this.server) {
            const serverRef = this.server;
            this.closeDrawer();
            window.dispatchEvent(new CustomEvent('open-sftp-modal', {detail: {server: serverRef}}));
        }
    },

    async downloadLogs() {
        if (this.server) {
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
    }
}));