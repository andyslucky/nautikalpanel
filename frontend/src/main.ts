import Alpine from 'alpinejs';

// Import and register all Alpine components
import './app';
import './create-server-modal';
import './notification-component';
import './edit-server-modal';
import focus from "@alpinejs/focus";
//@ts-ignore
window.Alpine = Alpine;
Alpine.plugin(focus);
Alpine.start();