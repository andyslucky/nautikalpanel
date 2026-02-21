use anyhow::anyhow;
use k8s_openapi::api::core::v1::{Pod, Service};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use surrealdb::RecordId;

#[derive(Serialize, Deserialize, Debug)]
pub struct Resources {
    pub min_cpu: u32,
    pub min_cpu_unit: String,
    pub max_cpu: u32,
    pub max_cpu_unit: String,
    pub min_mem: u32,
    pub min_mem_unit: String,
    pub max_mem: u32,
    pub max_mem_unit: String,
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

#[derive(Serialize, Deserialize, Debug)]
pub struct GameServer {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<RecordId>,
    pub icon_url: Option<String>,
    pub description: Option<String>,
    pub name: String,
    pub game_type: String,
    pub game_version: String,
    pub max_players: u32,
    pub pod_config: PodConfig,
    pub service_config: ServiceConfig,
    pub pvc_config: PvcConfig,
    pub pod_template : Option<String>,
    pub init_template: Option<String>
}

impl GameServer {
    pub fn id_string(&self) -> Option<String> {
        self.id.as_ref().map(|id| id.key().to_string())
    }
}

impl TryFrom<NewGameServerRequest> for GameServer {
    type Error = Box<dyn std::error::Error>;

    fn try_from(value: NewGameServerRequest) -> Result<Self, Self::Error> {
        Ok(Self {
            id: None,
            icon_url: value.template.icon_url,
            description: value.template.description,
            name: value.name,
            game_type: value
                .template
                .game_type
                .ok_or_else(|| anyhow!("Game type not provided"))?,
            game_version: value.game_version.unwrap_or("".to_string()),
            max_players: value.max_players.unwrap_or(0),
            pod_config: value.template.pod_config,
            service_config: value.template.service_config,
            pvc_config: value.template.pvc_config,
            pod_template: value.pod_template,
            init_template: value.init_template
        })
    }
}

#[derive(Deserialize)]
pub struct NewGameServerRequest {
    pub name: String,
    pub game_version: Option<String>,
    pub max_players: Option<u32>,
    pub pod_template : Option<String>,
    pub init_template: Option<String>,
    pub template: GameServerTemplate,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct GameServerTemplate {
    pub template_name: String,
    pub description: Option<String>,
    pub game_type: Option<String>,
    pub icon_url: Option<String>,
    pub init_template: Option<String>,
    pub pod_config: PodConfig,
    pub service_config: ServiceConfig,
    pub pvc_config: PvcConfig,
}

fn default_service_type() -> String {
    std::env::var("DEFAULT_SERVICE_TYPE").unwrap_or(String::from("LoadBalancer"))
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

#[derive(Serialize, Deserialize, Debug)]
pub struct PodConfig {
    pub image: String,
    pub resources: Option<Resources>,
    pub command: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub mounts: Option<Vec<VolumeMount>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PvcConfig {
    pub storage_class: Option<String>,
    pub container_path: String,
    pub size: u32,
    pub size_unit: String,
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
    pub nautikal_pod_type: String,
    pub pod_status: Option<String>,
    pub curr_players: u32,
    pub max_players: u32,
}

impl From<Pod> for GameServerInstance {
    fn from(value: Pod) -> Self {
        let game_server_id = value
            .metadata
            .labels
            .as_ref()
            .and_then(|labels| labels.get("nautikal.io/game-server-id").cloned())
            .unwrap();

        let nautikal_pod_type = value
            .metadata
            .labels
            .as_ref()
            .and_then(|labels| labels.get("nautikal.io/pod-type").cloned())
            .unwrap();
        GameServerInstance {
            id: value
                .metadata
                .name
                .as_ref()
                .map(|n| n.clone())
                .unwrap_or("unknown-pod".to_string()),
            nautikal_pod_type,
            game_server_id,
            pod_status: value.status.and_then(|s| s.phase),
            // TODO fix this
            curr_players: 0,
            max_players: 0,
        }
    }
}
