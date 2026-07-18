import { notifyBus } from "../signals/notify";

export function showToast(message: string, variant: 'info' | 'success' | 'warning' | 'danger' | 'error' = 'info') {
    notifyBus.addNotification({ variant: variant === 'error' ? 'danger' : variant, message });
}
