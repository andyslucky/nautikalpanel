import Alpine from 'alpinejs';
import serverDrawerContent from "./server-drawer.html?raw";

Alpine.data('serverDrawer', () => ({
    content: serverDrawerContent
}));