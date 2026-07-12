use anyhow::anyhow;
use k8s_openapi::api::core::v1::{Pod, Secret, Service};
use rand::distr::Alphanumeric;
use rand::{rng, Rng};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Resources {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requests: Option<ResourceQuantities>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limits: Option<ResourceQuantities>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ResourceQuantities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub memory: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct VolumeMount {
    pub volume_name: String,
    pub container_path: String,
}

/// Annotation key used to store the full GameServer JSON on the StatefulSet.
pub const GAME_SERVER_SPEC_ANNOTATION: &str = "nautikal.io/game-server-spec";

/// Label for identifying nautikal-managed resources.
pub const MANAGED_BY_LABEL: &str = "app.kubernetes.io/managed-by";
pub const MANAGED_BY_VALUE: &str = "nautikal";

/// Label for the game server ID.
pub const GAME_SERVER_ID_LABEL: &str = "nautikal.io/game-server-id";

/// Label for distinguishing resource types (game-server vs sftp).
pub const RESOURCE_TYPE_LABEL: &str = "nautikal.io/resource-type";
pub const RESOURCE_TYPE_GAME_SERVER: &str = "game-server";
pub const RESOURCE_TYPE_SFTP: &str = "sftp";

/// Label for pod type (gameserver vs sftp-only). Applied to pod templates.
pub const POD_TYPE_LABEL: &str = "nautikal.io/pod-type";
pub const POD_TYPE_GAMESERVER: &str = "gameserver";
pub const POD_TYPE_SFTP_ONLY: &str = "sftp-only";

/// Label for SFTP credential secrets.
pub const SECRET_TYPE_LABEL: &str = "nautikal.io/secret-type";
pub const SECRET_TYPE_SFTP: &str = "sftp-credentials";

/// ConfigMap name for storing application settings.
pub const SETTINGS_CONFIG_MAP_NAME: &str = "nautikal-settings";

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GameServer {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub icon_url: Option<String>,
    pub description: Option<String>,
    pub name: String,
    pub game_type: String,
    pub game_version: String,
    pub max_players: u32,
    pub pod_config: PodConfig,
    pub service_config: ServiceConfig,
    pub pvc_config: PvcConfig,
    #[serde(default = "default_user_id")]
    pub user_id: u32,
}

impl GameServer {
    pub fn id_string(&self) -> Option<String> {
        self.id.clone()
    }

    /// Generate a game server ID suitable for use as a Kubernetes resource name.
    pub fn generate_id() -> String {
        let mut rng = rng();
        let suffix: String = (0..6)
            .map(|_| rng.sample(Alphanumeric) as char)
            .collect();
        format!("gs-{}", suffix.to_lowercase())
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
            user_id: value.template.user_id,
        })
    }
}

#[derive(Deserialize)]
pub struct NewGameServerRequest {
    pub name: String,
    pub game_version: Option<String>,
    pub max_players: Option<u32>,
    /// Kept for backward compatibility but no longer used (Tera templates removed).
    pub pod_template: Option<String>,
    /// Kept for backward compatibility but no longer used (Tera templates removed).
    pub init_template: Option<String>,
    pub template: GameServerTemplate,
}

#[derive(Deserialize)]
pub struct UpdateGameServerRequest {
    pub name: String,
    pub game_version: Option<String>,
    pub max_players: Option<u32>,
    pub icon_url: Option<String>,
    pub description: Option<String>,
    pub pod_config: PodConfig,
    pub user_id: Option<u32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GameServerTemplate {
    pub template_name: String,
    pub description: Option<String>,
    pub game_type: Option<String>,
    pub icon_url: Option<String>,
    /// Kept for backward compatibility but no longer used.
    #[serde(default)]
    pub init_template: Option<String>,
    pub pod_config: PodConfig,
    pub service_config: ServiceConfig,
    pub pvc_config: PvcConfig,
    pub default_max_users: Option<u32>,
    #[serde(default = "default_user_id")]
    pub user_id: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TemplateRepository {
    pub id: String,
    pub name: String,
    pub url: String,
}

impl TemplateRepository {
    /// Generate a random ID for a new repository.
    pub fn generate_id() -> String {
        let mut rng = rng();
        let suffix: String = (0..8)
            .map(|_| rng.sample(Alphanumeric) as char)
            .collect();
        suffix.to_lowercase()
    }
}

fn default_service_type() -> String {
    std::env::var("DEFAULT_SERVICE_TYPE").unwrap_or(String::from("LoadBalancer"))
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ServicePort {
    pub port: u16,
    pub protocol: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ServiceConfig {
    pub ports: Vec<ServicePort>,
    pub ip_address: Option<String>,
    #[serde(default = "default_service_type")]
    pub service_type: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PodConfig {
    pub image: String,
    pub resources: Option<Resources>,
    pub command: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub mounts: Option<Vec<VolumeMount>>,
}

fn default_user_id() -> u32 {
    1000
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PvcConfig {
    pub storage_class: Option<String>,
    pub container_path: String,
    pub size: u32,
    pub size_unit: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SftpCredentials {
    pub username: String,
    pub password: String,
}

impl SftpCredentials {
    pub fn generate() -> Self {
        let mut rng = rng();
        let password: String = (0..24).map(|_| rng.sample(Alphanumeric) as char).collect();
        Self {
            username: "user".to_string(),
            password,
        }
    }
}

impl TryFrom<Secret> for SftpCredentials {
    type Error = Box<dyn std::error::Error>;

    fn try_from(value: Secret) -> Result<Self, Self::Error> {
        let mut data = value
            .data
            .ok_or_else(|| anyhow::anyhow!("Secret has no data"))?;
        let sftp_users = data
            .remove("SFTP_USERS")
            .ok_or_else(|| anyhow::anyhow!("Secret missing SFTP_USERS key"))
            .map(|sv| String::from_utf8(sv.0))??;
        let parts: Vec<&str> = sftp_users.split(":").collect();
        if parts.len() < 2 {
            return Err(anyhow!(
                "Invalid SFT_USERS secret property. Expected format user:<password>:<uid>:<gid>"
            )
            .into_boxed_dyn_error());
        }

        Ok(Self {
            username: parts[0].to_string(),
            password: parts[1].to_string(),
        })
    }
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
            .and_then(|labels| labels.get(GAME_SERVER_ID_LABEL).cloned())
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
            .and_then(|labels| labels.get(GAME_SERVER_ID_LABEL).cloned())
            .unwrap();

        let nautikal_pod_type = value
            .metadata
            .labels
            .as_ref()
            .and_then(|labels| labels.get(POD_TYPE_LABEL).cloned())
            .unwrap_or_else(|| "unknown".to_string());
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
            curr_players: 0,
            max_players: 0,
        }
    }
}
