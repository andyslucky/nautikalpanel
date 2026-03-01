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
        const newPage = window.location.hash.toLowerCase().replace("#","") as 'home' | 'settings';
        this.page = ['home', 'settings'].includes(newPage) ? newPage : 'home';
        const app = this;
        window.addEventListener("hashchange", ({newURL}) => {
            let hashIndex = newURL.indexOf("#");
            if (hashIndex > -1) {
                const candidatePage = newURL.substring(hashIndex + 1) as 'home' | 'settings';
                app.page = ['home', 'settings'].includes(candidatePage) ? candidatePage : 'home';
            }
        });
        this.loadSettings();
    },

    loadSettings() {
        this.settings.darkMode = localStorage.getItem('darkMode') === 'true';
        if (this.settings.darkMode) document.documentElement.classList.add('dark');
    },
    deleteServer(id : string) {
        if (confirm("Are you sure you want to delete this server?"))  {
            // @ts-ignore
            this.$store.gameServers.deleteServer(id)
        }
    },

    showToast(message: string, variant: 'info' | 'success' | 'warning' | 'danger' = 'info') {
        console.log("Showing toast", message, variant);
        this.$dispatch('notify', {
            variant,
            message
        });
    },
}));