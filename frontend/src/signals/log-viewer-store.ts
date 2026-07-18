import { signal } from "@preact/signals";

export const lines = signal<string[]>([]);
export const connected = signal(false);
export const socket = signal<WebSocket | null>(null);

export function connect(gameServerId: string) {
    disconnect();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/v1/game-servers/${gameServerId}/logs`;
    socket.value = new WebSocket(wsUrl);
    connected.value = false;

    socket.value.onopen = () => {
        connected.value = true;
    };

    socket.value.onmessage = (event: MessageEvent) => {
        lines.value = [...lines.value, event.data];
        if (lines.value.length > 1000) {
            lines.value = lines.value.slice(-1000);
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

    socket.value.onclose = () => {
        connected.value = false;
        socket.value = null;
    };

    socket.value.onerror = (error: Event) => {
        console.error('Logs WebSocket error:', error);
        connected.value = false;
    };
}

export function disconnect() {
    if (socket.value != null) {
        try {
            socket.value.close();
        } catch (e) {
            console.error('Failed closing logs websocket', e);
        } finally {
            socket.value = null;
        }
    }
    lines.value = [];
    connected.value = false;
}

export function clear() {
    lines.value = [];
}

// auto-disconnect on page unload
window.addEventListener('beforeunload', () => {
    disconnect();
});
