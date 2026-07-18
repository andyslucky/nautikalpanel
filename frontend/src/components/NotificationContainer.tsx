import { useSignal, useSignalEffect } from '@preact/signals';
import { notifyBus } from '../signals/notify';

export default function NotificationContainer() {
    const notifications = useSignal<Array<{
        id: number;
        variant: 'info' | 'success' | 'warning' | 'danger' | 'message';
        sender?: { name?: string; avatar?: string } | null;
        title?: string | null;
        message?: string | null;
    }>>([]);
    const displayDuration = 8000;

    useSignalEffect(() => {
        const unsub = notifyBus.on('notify', (n) => {
            notifications.value = [...notifications.value, n];
            if (notifications.value.length >= 20) {
                notifications.value = notifications.value.slice(-19);
            }
            setTimeout(() => {
                notifications.value = notifications.value.filter((x) => x.id !== n.id);
            }, displayDuration + 400);
        });
        return () => unsub();
    });

    function remove(id: number) {
        notifications.value = notifications.value.filter((n) => n.id !== id);
    }

    const variantClasses: Record<string, { border: string; bg: string; text: string; iconBg: string; iconText: string }> = {
        info: { border: 'border-info', bg: 'bg-info/10', text: 'text-info', iconBg: 'bg-info/15', iconText: 'text-info' },
        success: { border: 'border-success', bg: 'bg-success/10', text: 'text-success', iconBg: 'bg-success/15', iconText: 'text-success' },
        warning: { border: 'border-warn', bg: 'bg-warn/10', text: 'text-warn', iconBg: 'bg-warn/15', iconText: 'text-warn' },
        danger: { border: 'border-danger', bg: 'bg-danger/10', text: 'text-danger', iconBg: 'bg-danger/15', iconText: 'text-danger' },
        message: { border: 'dark:border-gray-600', bg: '', text: '', iconBg: '', iconText: '' },
    };

    return (
        <div class="notification-container">
            {notifications.value.map((n) => {
                const vc = variantClasses[n.variant] || variantClasses.info;
                return (
                    <div key={n.id} class={`notification ${vc.border}`} role="alert">
                        {n.variant === 'message' ? (
                            <div class="notification-body">
                                <div class="flex w-full items-center gap-2.5">
                                    {n.sender?.avatar && (
                                        <img class="mr-2 size-12 rounded-full" alt="avatar" aria-hidden="true" src={n.sender.avatar} />
                                    )}
                                    <div class="flex flex-col items-start gap-2">
                                        {n.sender?.name && <h3 class="notification-title">{n.sender.name}</h3>}
                                        {n.message && <p class="notification-message">{n.message}</p>}
                                        <div class="flex items-center gap-4">
                                            <button type="button" class="text-sm font-bold text-primary hover:opacity-75">Reply</button>
                                            <button
                                                type="button"
                                                class="text-sm font-bold hover:opacity-75 dark:text-gray-300"
                                                onClick={() => remove(n.id)}
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <button type="button" class="notification-dismiss" aria-label="dismiss notification" onClick={() => remove(n.id)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" class="size-5 shrink-0" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <div class={`notification-body ${vc.bg}`}>
                                <div class={`notification-icon ${vc.iconBg} ${vc.iconText}`} aria-hidden="true">
                                    {n.variant === 'info' && (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5" aria-hidden="true">
                                            <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clip-rule="evenodd" />
                                        </svg>
                                    )}
                                    {n.variant === 'success' && (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5" aria-hidden="true">
                                            <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clip-rule="evenodd" />
                                        </svg>
                                    )}
                                    {(n.variant === 'warning' || n.variant === 'danger') && (
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-5" aria-hidden="true">
                                            <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" />
                                        </svg>
                                    )}
                                </div>
                                <div class="flex flex-col gap-2">
                                    {n.title && <h3 class={`notification-title ${vc.text}`}>{n.title}</h3>}
                                    {n.message && <p class="notification-message">{n.message}</p>}
                                </div>
                                <button type="button" class="notification-dismiss" aria-label="dismiss notification" onClick={() => remove(n.id)}>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" class="size-5 shrink-0" aria-hidden="true">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
