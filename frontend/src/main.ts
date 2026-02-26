import Alpine from 'alpinejs';

// Import store first so it's registered before components
import './game-server-store';

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