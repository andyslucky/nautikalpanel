import { useSignal } from '@preact/signals';
import * as gameStore from '../signals/game-server-store';

export default function DashboardPage({ showModal }: { showModal: ReturnType<typeof useSignal<boolean>> }) {
    const servers = gameStore.servers.value;

    const totalServers = servers.length;
    const runningServers = servers.filter((s) => s.status === 'Running').length;
    const offlineServers = servers.filter((s) => s.status === 'Offline').length;
    const transitioningServers = totalServers - runningServers - offlineServers;

    const totalCpuUsageMillicores = servers.reduce((acc, s) => acc + (s.cpu_usage_millicores || 0), 0);
    const totalCpuLimitMillicores = servers.reduce((acc, s) => acc + gameStore.parseCpuToMillicores(s.cpu_limit), 0);
    const cpuUsagePercent = totalCpuLimitMillicores > 0
        ? Math.min(100, Math.round((totalCpuUsageMillicores / totalCpuLimitMillicores) * 100))
        : 0;

    const totalMemoryUsageBytes = servers.reduce((acc, s) => acc + (s.memory_usage_bytes || 0), 0);
    const totalMemoryLimitBytes = servers.reduce(
        (acc, s) => acc + gameStore.parseMemoryToBytes(s.memory_limit || s.memory_request),
        0,
    );
    const memoryUsagePercent = totalMemoryLimitBytes > 0
        ? Math.min(100, Math.round((totalMemoryUsageBytes / totalMemoryLimitBytes) * 100))
        : 0;

    const totalPlayers = servers.reduce((acc, s) => acc + (s.players || 0), 0);
    const totalMaxPlayers = servers.reduce((acc, s) => acc + (s.max_players || 0), 0);

    function formatBytes(bytes: number): string {
        if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
        if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MiB`;
        if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
        return `${bytes} B`;
    }

    function formatCpu(millicores: number): string {
        if (millicores >= 1000) return `${(millicores / 1000).toFixed(2)} cores`;
        return `${millicores.toFixed(2)}m`;
    }

    return (
        <div>
            <div class="flex justify-between items-center mb-6">
                <h2 class="heading-secondary">Dashboard</h2>
                <button onClick={() => (showModal.value = true)} class="btn-primary">+ Add Server</button>
            </div>

            {/* Summary cards */}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="card p-4">
                    <p class="text-sm text-muted">Total Servers</p>
                    <p class="text-3xl font-bold text-gray-800 dark:text-white mt-1">{totalServers}</p>
                    {transitioningServers > 0 && (
                        <p class="text-xs text-warn mt-1">{transitioningServers} transitioning</p>
                    )}
                </div>
                <div class="card p-4">
                    <p class="text-sm text-muted">Running / Offline</p>
                    <div class="flex items-baseline gap-2 mt-1">
                        <p class="text-3xl font-bold text-success">{runningServers}</p>
                        <p class="text-sm text-muted">/ {offlineServers}</p>
                    </div>
                </div>
                <div class="card p-4">
                    <p class="text-sm text-muted">CPU Usage</p>
                    <p class="text-3xl font-bold text-gray-800 dark:text-white mt-1">{cpuUsagePercent}%</p>
                    <p class="text-xs text-muted mt-1 font-mono">
                        {formatCpu(totalCpuUsageMillicores)} / {formatCpu(totalCpuLimitMillicores)}
                    </p>
                </div>
                <div class="card p-4">
                    <p class="text-sm text-muted">Memory Usage</p>
                    <p class="text-3xl font-bold text-gray-800 dark:text-white mt-1">{memoryUsagePercent}%</p>
                    <p class="text-xs text-muted mt-1 font-mono">
                        {formatBytes(totalMemoryUsageBytes)} / {formatBytes(totalMemoryLimitBytes)}
                    </p>
                </div>
            </div>

            {/* Usage bars */}
            <div class="card p-4 mb-6">
                <h3 class="heading-tertiary mb-4">Resource Utilization</h3>
                <div class="mb-4">
                    <div class="flex justify-between text-sm mb-1">
                        <span class="text-label">CPU</span>
                        <span class="font-mono text-muted">{cpuUsagePercent}%</span>
                    </div>
                    <div class="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                            class={`h-full ${gameStore.getCpuUsageColor(cpuUsagePercent)} rounded-full transition-all`}
                            style={{ width: `${cpuUsagePercent}%` }}
                        />
                    </div>
                </div>
                <div>
                    <div class="flex justify-between text-sm mb-1">
                        <span class="text-label">Memory</span>
                        <span class="font-mono text-muted">{memoryUsagePercent}%</span>
                    </div>
                    <div class="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                            class={`h-full ${gameStore.getMemoryUsageColor(memoryUsagePercent)} rounded-full transition-all`}
                            style={{ width: `${memoryUsagePercent}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Players */}
            {(totalMaxPlayers > 0 || totalPlayers > 0) && (
                <div class="card p-4 mb-6">
                    <p class="text-sm text-muted">Active Players</p>
                    <p class="text-3xl font-bold text-gray-800 dark:text-white mt-1">
                        {totalPlayers} / {totalMaxPlayers}
                    </p>
                </div>
            )}

            {/* Per-server breakdown */}
            <div class="card p-4">
                <h3 class="heading-tertiary mb-4">Per-Server Breakdown</h3>
                {totalServers === 0 ? (
                    <div class="text-center py-8 text-muted">
                        <p class="text-4xl mb-2">🖥️</p>
                        <p>No servers yet. Click &quot;Add Server&quot; to get started!</p>
                    </div>
                ) : (
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead>
                                <tr class="text-left text-muted border-b dark:border-gray-700">
                                    <th class="py-2 pr-4">Server</th>
                                    <th class="py-2 pr-4">Status</th>
                                    <th class="py-2 pr-4">Players</th>
                                    <th class="py-2 pr-4">CPU</th>
                                    <th class="py-2">Memory</th>
                                </tr>
                            </thead>
                            <tbody>
                                {servers.map((s) => {
                                    const cpuPct = gameStore.calculateCpuUsagePercentage(s);
                                    const memPct = gameStore.calculateMemoryUsagePercentage(s);
                                    return (
                                        <tr key={s.id} class="border-b dark:border-gray-700 last:border-0 dark:text-gray-200">
                                            <td class="py-2 pr-4 text-gray-800 dark:text-gray-200">{s.name}</td>
                                            <td class="py-2 pr-4">
                                                <span class="inline-flex items-center gap-1">
                                                    <span
                                                        class={`status-dot ${s.status === 'Running' ? 'bg-success' : s.status === 'Offline' ? 'bg-gray-400' : 'bg-warn'}`}
                                                    />
                                                    {s.status}
                                                </span>
                                            </td>
                                            <td class="py-2 pr-4 font-mono">
                                                {s.players} / {s.max_players || 0}
                                            </td>
                                            <td class="py-2 pr-4 font-mono">{cpuPct}%</td>
                                            <td class="py-2 font-mono">{memPct}%</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
