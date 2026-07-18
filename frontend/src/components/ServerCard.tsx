import * as gameStore from '../signals/game-server-store';
import { notifyBus } from '../signals/notify';
import type { Server } from '../signals/game-server-store';

export default function ServerCard({ server }: { server: Server }) {
    return (
        <div class="server-card">
            <div class="flex gap-2 mb-2">
                <img src={server.icon_url} width="64" height="64" />
                <div class="flex justify-between items-start mb-2 flex-1">
                    <div>
                        <h3 class="font-semibold text-gray-800 dark:text-white">{server.name}</h3>
                        <p class="text-sm text-muted">{server.game}</p>
                    </div>
                    {server.instance_type === 'sftp-only' && <i class="text-sm text-muted">(SFTP Only)</i>}
                    <span class={`status-dot ${server.status === 'Running' ? 'bg-success' : server.status === 'Offline' ? 'bg-gray-400' : 'bg-warn'}`} />
                </div>
            </div>
            <div>
                <p class="server-address">{gameStore.serverAddressLine(server)}</p>
                <p class="server-info">{'👥 ' + server.players + ' players'}</p>
                <div class="flex gap-2 flex-wrap">
                    <button
                        type="button"
                        onClick={() => gameStore.toggleStatus(server)}
                        class="btn-action"
                        disabled={!['Offline', 'Running'].includes(server.status)}
                        className={
                            server.status === 'Offline'
                                ? 'btn-action bg-success'
                                : server.status === 'Running'
                                    ? 'btn-action bg-danger'
                                    : 'btn-action bg-warn'
                        }
                    >
                        {!['Offline', 'Running'].includes(server.status) && (
                            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-5 animate-spin motion-reduce:animate-none">
                                <path opacity="0.25" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" />
                                <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z" />
                            </svg>
                        )}
                        <span>{server.status === 'Offline' ? 'Start' : server.status === 'Running' ? 'Stop' : 'Wait'}</span>
                    </button>
                    <button
                        onClick={() => notifyBus.emit('open-drawer', { server })}
                        class="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                        title="View details"
                    >
                        <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Details
                    </button>
                    <button onClick={() => {
                        if (confirm('Are you sure you want to delete this server?')) {
                            gameStore.deleteServer(server.id);
                        }
                    }} class="btn-danger">
                        Delete
                    </button>
                    <button
                        onClick={() => notifyBus.emit('edit', { server })}
                        disabled={server.status !== 'Offline'}
                        class="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Edit
                    </button>
                </div>
            </div>
        </div>
    );
}
