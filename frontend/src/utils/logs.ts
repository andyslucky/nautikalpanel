export async function downloadLogs(gameServerId: string): Promise<void> {
    const response = await fetch(`/api/v1/game-servers/${gameServerId}/logs/download`);
    if (!response.ok) {
        console.error('Failed to download logs');
        return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${gameServerId}-logs.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}