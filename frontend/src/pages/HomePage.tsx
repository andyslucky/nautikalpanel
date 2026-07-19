import { useSignal } from '@preact/signals';
import * as gameStore from '../signals/game-server-store';
import ServerCard from '../components/ServerCard';

export default function ServersPage({ showModal }: { showModal: ReturnType<typeof useSignal<boolean>> }) {
    return (
        <div>
            <div class="flex justify-between items-center mb-6">
                <h2 class="heading-secondary">Servers</h2>
                <button onClick={() => (showModal.value = true)} class="btn-primary">+ Add Server</button>
            </div>

            <div class="server-grid">
                {gameStore.servers.value.map((server) => (
                    <ServerCard key={server.id} server={server} />
                ))}
            </div>

            {gameStore.servers.value.length === 0 && (
                <div class="text-center py-12 text-muted">
                    <p class="text-4xl mb-2">🖥️</p>
                    <p>No servers yet. Click &quot;Add Server&quot; to get started!</p>
                </div>
            )}
        </div>
    );
}
