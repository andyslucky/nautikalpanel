import { useSignal } from '@preact/signals';
import * as repoStore from '../signals/template-repository-store';
import { showToast } from '../utils/toast';

export default function SettingsPage() {
    const darkMode = useSignal(localStorage.getItem('darkMode') === 'true');
    const repoName = useSignal('');
    const repoUrl = useSignal('');

    function toggleDarkMode() {
        darkMode.value = !darkMode.value;
        localStorage.setItem('darkMode', String(darkMode.value));
        document.documentElement.classList.toggle('dark', darkMode.value);
    }

    function addRepository() {
        const name = repoName.value.trim();
        const url = repoUrl.value.trim();
        if (!name || !url) {
            showToast('Please fill in all fields', 'warning');
            return;
        }
        repoStore.addRepository({ name, url }).then((success) => {
            if (success) {
                repoName.value = '';
                repoUrl.value = '';
            }
        });
    }

    return (
        <div>
            <h2 class="heading-secondary mb-6">Settings</h2>
            <div class="settings-panel">
                <label class="form-row">
                    <span class="text-label">Dark Mode</span>
                    <input type="checkbox" checked={darkMode.value} onChange={toggleDarkMode} class="w-5 h-5 cursor-pointer" />
                </label>
                <p class="text-muted text-sm">Server status updates are streamed in real-time via WebSocket.</p>
            </div>

            <div class="settings-panel mt-6">
                <h3 class="heading-tertiary mb-4">Template Repositories</h3>
                <p class="text-muted text-sm mb-4">Manage where game server templates are loaded from. Repositories can be local directories or remote URLs.</p>

                <div class="bg-gray-50 dark:bg-gray-800 p-4 rounded mb-4">
                    <div class="space-y-3">
                        <div>
                            <label class="form-label-sm">Name</label>
                            <input type="text" value={repoName.value} onInput={(e) => (repoName.value = (e.target as HTMLInputElement).value)} placeholder="e.g., My Templates" class="input-field w-full dark:text-gray-300" />
                        </div>
                        <div>
                            <label class="form-label-sm">URL / Path</label>
                            <input type="text" value={repoUrl.value} onInput={(e) => (repoUrl.value = (e.target as HTMLInputElement).value)} placeholder="e.g., /path/to/templates or https://example.com/templates" class="input-field w-full dark:text-gray-300" />
                        </div>
                        <button onClick={addRepository} class="btn-primary w-full" disabled={repoStore.loading.value}>
                            {repoStore.loading.value ? 'Adding...' : 'Add Repository'}
                        </button>
                    </div>
                </div>

                {repoStore.repositories.value.length === 0 && (
                    <div class="text-center py-8 text-muted">
                        <p class="text-3xl mb-2">📂</p>
                        <p>No template repositories configured.</p>
                    </div>
                )}

                {repoStore.repositories.value.length > 0 && (
                    <div>
                        {repoStore.repositories.value.map((repo) => (
                            <div key={repo.id} class="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 mb-2">
                                <div class="flex-1 min-w-0">
                                    <h4 class="font-semibold text-gray-800 dark:text-white truncate">{repo.name}</h4>
                                    <p class="text-sm text-muted truncate">{repo.url}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        if (confirm('Are you sure you want to delete this repository?')) {
                                            repoStore.deleteRepository(repo.id);
                                        }
                                    }}
                                    disabled={repoStore.loading.value}
                                    class="btn-danger ml-2"
                                >
                                    Delete
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
