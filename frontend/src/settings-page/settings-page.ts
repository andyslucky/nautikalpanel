import Alpine from "alpinejs";
import settingsContent from "./settings-page.html?raw";

type AlpineStore = {
    gameServers: any;
    templateRepositories: any;
}

type AlpineMagics = {
    $store?: AlpineStore;
    $dispatch?: (event: string, detail: any) => void;
}

type SettingsPageData = {
    content: string;
    settings: { darkMode: boolean };
    toggleDarkMode(): void;
    addRepository(): void;
    deleteRepository(id: string): void;
} & AlpineMagics

Alpine.data("settings", (): SettingsPageData => ({
    content: settingsContent,
    settings: {
        darkMode: false,
    },
    toggleDarkMode() {
        localStorage.setItem('darkMode', this.settings.darkMode.toString());
        document.documentElement.classList.toggle('dark');
    },

    addRepository() {
        const nameInput = document.getElementById('repo-name') as HTMLInputElement;
        const urlInput = document.getElementById('repo-url') as HTMLInputElement;

        if (!nameInput || !urlInput) return;

        const name = nameInput.value.trim();
        const url = urlInput.value.trim();

        if (!name || !url) {
            this.$dispatch?.('notify', { variant: 'warning', message: 'Please fill in all fields' });
            return;
        }

        this.$store?.templateRepositories.addRepository({ name, url }).then((success: boolean) => {
            if (success) {
                nameInput.value = '';
                urlInput.value = '';
            }
        });
    },
    deleteRepository(id: string) {
        console.log("Deleting repository ...", id);
        if (confirm('Are you sure you want to delete this repository?')) {
            this.$store?.templateRepositories.deleteRepository(id);
        }
    },
}));