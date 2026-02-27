import Alpine from 'alpinejs';

// Import stores first so they're registered before components
import './stores/game-server-store.ts';
import './stores/template-repository-store.ts';

// Import and register all Alpine components
import './settings-page/settings-page.ts';
import './app';
import './create-server-modal/create-server-modal.ts';
import './notification-component/notification-component.ts';
import './edit-server-modal/edit-server-modal.ts';
import './logs-modal/logs-modal.ts';
import focus from "@alpinejs/focus";
//@ts-ignore
window.Alpine = Alpine;
Alpine.plugin(focus);
Alpine.start();