import Alpine from "alpinejs";

// Re-export types from the store for backward compatibility
export type { Server, GameServerInstance } from "./stores/game-server-store";

Alpine.data("app", () => ({
    page: 'home' as 'home' | 'settings',
    showModal: false,
    sidebarOpen: false,
    settings: {
        darkMode: false,
    },

    init() {
        if (window.location.hash == "")
            window.location.hash = "home"
        this.page = window.location.hash.toLowerCase().replace("#","")
        const app = this;
        window.addEventListener("hashchange", ({newURL}) => {
            let hashIndex = newURL.indexOf("#");
            if (hashIndex > -1) {
                app.page = newURL.substring(hashIndex + 1);
            }
        });
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
}));