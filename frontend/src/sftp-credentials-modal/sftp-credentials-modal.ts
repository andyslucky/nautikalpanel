import Alpine from 'alpinejs';
import sftpCredentialsContent from "./sftp-credentials-modal.html?raw";
import type { Server } from '../stores/game-server-store';
import {showToast} from "../utils/toast.ts";

Alpine.data('sftpCredentialsModal', () => ({
    content: sftpCredentialsContent,
    show: false,
    credentials: null as { username: string; password: string } | null,
    server: null as Server | null,

    async fetchCredentials(server: Server) {
        try {
            const resp = await fetch(`/api/v1/game-servers/${server.id}/sftp-credentials`);
            if (resp.ok) {
                this.credentials = await resp.json();
                this.server = server;
                this.show = true;
            } else {
                showToast('No SFTP credentials found. Start SFTP first.', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('Failed to fetch SFTP credentials', 'error');
        }
    },

    close() {
        this.show = false;
        this.credentials = null;
        this.server = null;
    },

    copyToClipboard(text: string, label: string) {
        navigator.clipboard.writeText(text);
        showToast(`Copied ${label}!`, 'success');
    }
}));