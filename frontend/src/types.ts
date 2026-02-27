type PvcConfig = {
    size: number | string;
    size_unit: string;
    container_path?: string;
    storage_class?: string;
    user_id?: number;
};
type SvcConfig = {
    ports: Array<{ port: string; protocol: string }>;
    ip_address?: string;
    service_type?: string;
};
type PodConfig = {
    image: string;
    resources?: {
        requests?: { cpu?: string; memory?: string };
        limits?: { cpu?: string; memory?: string };
    };
    command?: string[];
    env?: Record<string, string>;
    mounts?: any[];
};
export type GameServerTemplateData = {
    template_name: string;
    icon_url?: string;
    description?: string;
    game_type?: string;
    game_version?: string;
    pod_template?: string | null;
    init_template?: string | null;
    default_max_users?: number;
    user_id?: number;
    pod_config: PodConfig;
    service_config: SvcConfig;
    pvc_config: PvcConfig;
};