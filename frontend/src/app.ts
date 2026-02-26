import Alpine from "alpinejs";

// Re-export types from the store for backward compatibility
export type { Server, GameServerInstance } from "./game-server-store";

Alpine.data("app", () => ({
    page: 'home' as 'home' | 'settings',
    showModal: false,
    sidebarOpen: false,
    settings: {
        darkMode: false,
    },

    init() {
        this.loadSettings();
    },

    loadSettings() {
        this.settings.darkMode = localStorage.getItem('darkMode') === 'true';
        if (this.settings.darkMode) document.documentElement.classList.add('dark');
    },

    showToast(message: string, variant: 'info' | 'success' | 'warning' | 'danger' = 'info') {
        this.$dispatch('notify', {
            variant,
            message
        });
    },

    toggleDarkMode() {
        localStorage.setItem('darkMode', this.settings.darkMode.toString());
        document.documentElement.classList.toggle('dark', this.settings.darkMode);
    },
}));
