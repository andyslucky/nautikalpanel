use k8s_openapi::api::core::v1::{Pod, Service};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use surrealdb::RecordId;

#[derive(Serialize, Deserialize, Debug)]
pub struct Resources {
    /// Request cpu in millicores
    pub min_cpu_mcore: u32,
    /// Limit cpu in millicores
    pub max_cpu_mcore: u32,
    /// Request memory in Mib
    pub min_mem_mib: u32,
    /// Limit memory in Mib
    pub max_mem_mib: u32,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct ImageRepoCredentials {
    // TODO worry about this later
}

#[derive(Serialize, Deserialize, Debug)]
pub struct VolumeMount {
    pub volume_name: String,
    pub container_path: String,
}

fn default_init_template() -> String {
    String::from("default/init.yaml")
}
#[derive(Serialize, Deserialize, Debug)]
pub struct GameServer {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<RecordId>,
    pub name: String,
    pub game_type: String,
    pub game_version: String,
    pub max_players: u32,
    #[serde(default = "default_init_template")]
    pub init_template: String,
    pub pod_config: PodConfig,
    pub service_config: ServiceConfig,
    pub pvc_config: PvcConfig,
}

impl GameServer {
    pub fn id_string(&self) -> Option<String> {
        self.id.as_ref().map(|id| id.key().to_string())
    }
}

fn default_service_type() -> String {
    String::from("LoadBalancer")
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ServicePort {
    pub port: u16,
    pub protocol: String,
}
#[derive(Serialize, Deserialize, Debug)]
pub struct ServiceConfig {
    pub ports: Vec<ServicePort>,
    pub ip_address: Option<String>,
    #[serde(default = "default_service_type")]
    pub service_type: String,
}

fn default_pod_template_name() -> String {
    "default/pod_template.yaml".to_string()
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PodConfig {
    pub image: String,
    pub resources: Option<Resources>,
    pub command: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub mounts: Option<Vec<VolumeMount>>,
    #[serde(default = "default_pod_template_name")]
    pub pod_template_name: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PvcConfig {
    pub storage_class: Option<String>,
    pub size_mib: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GameServerNetworkIdentity {
    pub id: String,
    pub game_server_id: String,
    pub ip_address: String,
    pub ports: Vec<ServicePort>,
}

impl From<Service> for GameServerNetworkIdentity {
    fn from(value: Service) -> Self {
        let game_server_id = value
            .metadata
            .labels
            .and_then(|labels| labels.get("nautikal.io/game-server-id").cloned())
            .unwrap();
        let ip_address = value
            .status
            .and_then(|st| st.load_balancer)
            .and_then(|lb| lb.ingress)
            .and_then(|ing| ing.into_iter().next())
            .and_then(|ing| ing.ip)
            .unwrap_or("unknown".to_string());
        let ports = value
            .spec
            .and_then(|spec| spec.ports)
            .map(|p| {
                p.into_iter()
                    .map(|sp| ServicePort {
                        port: sp.port as u16,
                        protocol: sp.protocol.unwrap_or("Unknown".to_string()),
                    })
                    .collect()
            })
            .unwrap_or(vec![]);
        Self {
            id: value
                .metadata
                .name
                .as_ref()
                .map(|n| n.clone())
                .unwrap_or("unknown-svc".to_string()),
            game_server_id,
            ip_address,
            ports,
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GameServerInstance {
    pub game_server_id: String,
    pub id: String,
    pub pod_status: Option<String>,
    pub curr_players: u32,
    pub max_players: u32,
}

impl From<Pod> for GameServerInstance {
    fn from(value: Pod) -> Self {
        let game_server_id = value
            .metadata
            .labels
            .and_then(|labels| labels.get("nautikal.io/game-server-id").cloned())
            .unwrap();
        GameServerInstance {
            id: value
                .metadata
                .name
                .as_ref()
                .map(|n| n.clone())
                .unwrap_or("unknown-pod".to_string()),
            game_server_id,
            pod_status: value.status.and_then(|s| s.phase),
            // TODO fix this
            curr_players: 0,
            max_players: 0,
        }
    }
}
