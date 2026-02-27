import Alpine from "alpinejs";
import settingsContent from "./settings-page.html?raw";
Alpine.data("settings", () => ({
    content: settingsContent,
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
            this.showToast('Please fill in all fields', 'warning');
            return;
        }

        this.$store.templateRepositories.addRepository({ name, url }).then(success => {
            if (success) {
                nameInput.value = '';
                urlInput.value = '';
            }
        });
    },
    deleteRepository(id: string) {
        console.log("Deleting repository ...", id);
        if (confirm('Are you sure you want to delete this repository?')) {
            this.$store.templateRepositories.deleteRepository(id);
        }
    },
}));