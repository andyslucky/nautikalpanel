import Alpine from 'alpinejs';
import logsModalContent from "./logs-modal.html?raw";

Alpine.data('logsModal', () => ({
    content: logsModalContent
}));
