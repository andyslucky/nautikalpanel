import Alpine from 'alpinejs';

export type TemplateRepository = {
    // Need to clean this up. SurrealDB record ids contain the table name + the record identifier. We just care about the record identifier
    id: string;
    name: string;
    url: string;
};

function showToast(message: string, variant: 'info' | 'success' | 'warning' | 'danger' | 'error' = 'info') {
    window.dispatchEvent(new CustomEvent('notify', {
        detail: { variant, message }
    }));
}

Alpine.store('templateRepositories', {
    repositories: [] as TemplateRepository[],
    loading: false,

    async init() {
        await this.fetchRepositories();
    },

    async fetchRepositories() {
        try {
            this.loading = true;
            const response = await fetch('/api/v1/template-repositories');
            const data = await response.json();
            this.repositories = data;
        } catch (error) {
            console.error('Failed to fetch template repositories:', error);
            showToast('Failed to fetch template repositories', 'error');
        } finally {
            this.loading = false;
        }
    },

    async addRepository(repository: TemplateRepository) {
        try {
            this.loading = true;
            const response = await fetch('/api/v1/template-repositories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(repository)
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Failed to add repository');
            }
            await this.fetchRepositories();
            showToast('Repository added successfully', 'success');
            return true;
        } catch (error) {
            console.error('Failed to add repository:', error);
            showToast(error instanceof Error ? error.message : 'Failed to add repository', 'error');
            return false;
        } finally {
            this.loading = false;
        }
    },

    async deleteRepository(id: string) {
        try {
            this.loading = true;
            const response = await fetch(`/api/v1/template-repositories/${encodeURIComponent(id)}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Failed to delete repository');
            }
            await this.fetchRepositories();
            showToast('Repository deleted successfully', 'success');
            return true;
        } catch (error) {
            console.error('Failed to delete repository:', error);
            showToast(error instanceof Error ? error.message : 'Failed to delete repository', 'error');
            return false;
        } finally {
            this.loading = false;
        }
    }
});
