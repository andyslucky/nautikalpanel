import Alpine from 'alpinejs';
import notificationContent from "./notification-component.html?raw";
type NotificationSender = {
    name?: string;
    avatar?: string;
};

type Notification = {
    id: number;
    variant: 'info' | 'success' | 'warning' | 'danger' | 'message';
    sender?: NotificationSender;
    title?: string;
    message?: string;
};

type NotificationComponentData = {
    content: string;
    notifications: Notification[];
    displayDuration: 8000;
    soundEffect: false;
    addNotification({variant, sender, title, message}: {
        variant?: "info" | "success" | "warning" | "danger" | "message";
        sender?: NotificationSender | null;
        title?: string | null;
        message?: string | null
    }): void;
    removeNotification(id: number): void
}
Alpine.data('notificationComponent', (): NotificationComponentData => ({
    content: notificationContent,
    notifications: [] as Notification[],
    displayDuration: 8000,
    soundEffect: false,

    addNotification({variant = 'info', sender = null, title = null, message = null}: {
        variant?: 'info' | 'success' | 'warning' | 'danger' | 'message',
        sender?: NotificationSender | null,
        title?: string | null,
        message?: string | null
    }) {
        const id = Date.now();
        const notification: Notification = {id, variant, sender, title, message};

        if (this.notifications.length >= 20) {
            this.notifications.splice(0, this.notifications.length - 19);
        }

        this.notifications.push(notification);

        if (this.soundEffect) {
            const notificationSound = new Audio('https://res.cloudinary.com/ds8pgw1pf/video/upload/v1728571480/penguinui/component-assets/sounds/ding.mp3');
            notificationSound.play().catch((error: Error) => {
                console.error('Error playing the sound:', error);
            });
        }
    },
    removeNotification(id: number) {
        setTimeout(() => {
            this.notifications = this.notifications.filter(
                (notification: Notification) => notification.id !== id,
            );
        }, 400);
    },
}));
