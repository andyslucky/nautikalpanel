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


#[derive(Serialize, Deserialize, Debug)]
pub struct GameServer {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<RecordId>,
    pub name: String,
    pub game_type: String,
    pub game_version: String,
    pub max_players : u32,
    pub pod_config: PodConfig,
    pub service_config: ServiceConfig,
    pub pvc_config: PvcConfig
}

impl GameServer {
    pub fn id_string(&self) -> Option<String> {
        self.id.as_ref().map(|id| id.key().to_string())
    }
}

fn default_service_type() -> String {
    String::from("LoadBalancerIP")
}
#[derive(Serialize, Deserialize, Debug)]
pub struct ServiceConfig {
    pub ports : Vec<u16>,
    pub ip_address : Option<String>,
    #[serde(default = "default_service_type")]
    pub service_type : String
}

fn default_pod_template_name() -> String {
    "default.yaml".to_string()
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PodConfig {
    pub image: String,
    pub resources: Option<Resources>,
    pub command: Option<Vec<String>>,
    pub env : Option<HashMap<String, String>>,
    pub mounts: Option<Vec<VolumeMount>>,
    #[serde(default = "default_pod_template_name")]
    pub pod_template_name: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PvcConfig {
    pub storage_class : Option<String>,
    pub size_mib : u32
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GameServerNetworkIdentity {
    pub game_server_id : String,
    pub ip_address: String,
    pub ports: Vec<u16>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GameServerInstance {
    pub game_server_id: String,
    pub id: String,
    pub pod_status: Option<String>,
    pub curr_players: u32,
    pub max_players: u32,
}



