import { signal } from "@preact/signals";
import { showToast } from "../utils/toast";

export type TemplateRepository = {
    id: string;
    name: string;
    url: string;
};

export const repositories = signal<TemplateRepository[]>([]);
export const loading = signal(false);

// Guard so the SPA only initializes once. Subsequent calls (e.g. from a
// re-rendering component) are no-ops; navigation must not re-fetch
// repositories. Use `fetchRepositories()` directly to refresh on demand.
let initialized = false;

export async function init() {
    if (initialized) return;
    initialized = true;
    loading.value = true;
    await fetchRepositories();
    loading.value = false;
}

export async function fetchRepositories() {
    try {
        const response = await fetch('/api/v1/template-repositories');
        repositories.value = await response.json();
    } catch (error) {
        console.error('Failed to fetch template repositories:', error);
        showToast('Failed to fetch template repositories', 'error');
    }
}

export async function addRepository(repository: Pick<TemplateRepository, 'name' | 'url'>) {
    try {
        loading.value = true;
        const response = await fetch('/api/v1/template-repositories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(repository),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to add repository');
        }
        await fetchRepositories();
        showToast('Repository added successfully', 'success');
        return true;
    } catch (error) {
        console.error('Failed to add repository:', error);
        showToast(error instanceof Error ? error.message : 'Failed to add repository', 'error');
        return false;
    } finally {
        loading.value = false;
    }
}

export async function deleteRepository(id: string) {
    try {
        loading.value = true;
        const response = await fetch(`/api/v1/template-repositories/${encodeURIComponent(id)}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Failed to delete repository');
        }
        await fetchRepositories();
        showToast('Repository deleted successfully', 'success');
        return true;
    } catch (error) {
        console.error('Failed to delete repository:', error);
        showToast(error instanceof Error ? error.message : 'Failed to delete repository', 'error');
        return false;
    } finally {
        loading.value = false;
    }
}
