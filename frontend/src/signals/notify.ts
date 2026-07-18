export type NotificationSender = {
    name?: string;
    avatar?: string;
};

export type Notification = {
    id: number;
    variant: 'info' | 'success' | 'warning' | 'danger' | 'message';
    sender?: NotificationSender | null;
    title?: string | null;
    message?: string | null;
};

type NotifyEvent =
    | { type: 'notify'; payload: Notification }
    | { type: 'open-drawer'; payload: any }
    | { type: 'edit'; payload: any }
    | { type: 'open-logs-modal'; payload: any }
    | { type: 'open-sftp-modal'; payload: any }
    | { type: 'game-server-status-changed'; payload: any };

type Handler<T extends NotifyEvent['type']> = (payload: Extract<NotifyEvent, { type: T }>['payload']) => void;

const listeners: { [K in NotifyEvent['type']]?: Set<Handler<K>> } = {};

function getListeners<T extends NotifyEvent['type']>(type: T): Set<Handler<T>> {
    if (!listeners[type]) {
        listeners[type] = new Set() as any;
    }
    return listeners[type] as Set<Handler<T>>;
}

export function on<T extends NotifyEvent['type']>(type: T, callback: Handler<T>) {
    getListeners(type).add(callback);
    return () => getListeners(type).delete(callback);
}

export function emit<T extends NotifyEvent['type']>(type: T, payload: Extract<NotifyEvent, { type: T }>['payload']) {
    getListeners(type).forEach((cb) => cb(payload));
}

export function addNotification({
    variant = 'info',
    sender = null,
    title = null,
    message = null,
}: {
    variant?: 'info' | 'success' | 'warning' | 'danger' | 'message';
    sender?: NotificationSender | null;
    title?: string | null;
    message?: string | null;
}) {
    const id = Date.now() + Math.random();
    emit('notify', { id, variant, sender, title, message });
}

export function removeNotification(_id: number) {
    // consumers handle removal by filtering their own lists
}

export const notifyBus = {
    on,
    emit,
    addNotification,
};
