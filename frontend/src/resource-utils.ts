
export const serverResourceSliderFunctions = {
    parseCpu(value: string | undefined): number {
        if (!value) return 0;
        const str = String(value);
        if (str.endsWith('m')) {
            return parseInt(str) || 0;
        }
        return (parseFloat(str) || 0) * 1000;
    },

    formatCpuString(millicores: number): string {
        if (millicores >= 1000 && millicores % 1000 === 0) {
            return (millicores / 1000).toString();
        }
        return millicores + 'm';
    },

    parseMemory(value: string | undefined): number {
        if (!value) return 0;
        const str = String(value);
        if (str.endsWith('Gi')) {
            return (parseFloat(str) || 0) * 1024;
        }
        if (str.endsWith('Mi')) {
            return parseInt(str) || 0;
        }
        return parseInt(str) || 0;
    },

    formatMemoryString(mib: number): string {
        if (mib >= 1024) {
            return ((mib % 1024 === 0) ? Math.trunc(mib / 1024) : (mib / 1024.0).toFixed(2)) + 'Gi';
        }
        return mib + 'Mi';
    }
}