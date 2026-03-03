import Alpine from 'alpinejs';

export type LogViewerStore = {
    lines: string[];
    connected: boolean;
    socket: WebSocket | null;
    connect(gameServerId: string): void;
    disconnect(): void;
    clear(): void;
};

Alpine.store('logViewer', {
    lines: [] as string[],
    connected: false,
    socket: null as WebSocket | null,

    connect(gameServerId: string) {
        this.disconnect();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/v1/game-servers/${gameServerId}/logs`;
        this.socket = new WebSocket(wsUrl);
        this.connected = false;

        this.socket.onopen = () => {
            this.connected = true;
        };

        this.socket.onmessage = (event: MessageEvent) => {
            this.lines.push(event.data);
            if (this.lines.length > 1000) {
                this.lines = this.lines.slice(-1000);
            }
            requestAnimationFrame(() => {
                const drawerContainer = document.getElementById('drawer-log-container');
                const modalContainer = document.getElementById('modal-log-container');
                
                if (drawerContainer) {
                    drawerContainer.scrollTop = drawerContainer.scrollHeight;
                }
                if (modalContainer) {
                    modalContainer.scrollTop = modalContainer.scrollHeight;
                }
            });
        };

        this.socket.onclose = () => {
            this.connected = false;
        };

        this.socket.onerror = (error: Event) => {
            console.error('WebSocket error:', error);
            this.connected = false;
        };
    },

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.connected = false;
    },

    clear() {
        this.lines = [];
    }
} as LogViewerStore);