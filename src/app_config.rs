use config::{Config, Environment};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub kubernetes: KubernetesConfig,
    pub database: DatabaseConfig,
    pub paths: PathsConfig,
    pub github: GithubConfig,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ServerConfig {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
}

fn default_host() -> String {
    "127.0.0.1".to_string()
}

fn default_port() -> u16 {
    9090
}

impl ServerConfig {
    pub fn bind_address(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct KubernetesConfig {
    #[serde(default = "default_namespace")]
    pub namespace: String,
    #[serde(default = "default_create_namespace")]
    pub create_namespace: bool,
    pub default_storage_class: Option<String>,
    #[serde(default = "default_init_template")]
    pub init_template: String,
    #[serde(default = "default_pod_template")]
    pub pod_template: String,
}

fn default_namespace() -> String {
    "nautikal".to_string()
}

fn default_create_namespace() -> bool {
    true
}

fn default_pod_template() -> String {
    "default/pod_template.yaml.jinja".to_string()
}

fn default_init_template() -> String {
    "default/init.yaml.jinja".to_string()
}

#[derive(Debug, Deserialize, Clone)]
pub struct DatabaseConfig {
    #[serde(default = "default_db_path")]
    pub path: PathBuf,
    #[serde(default = "default_db_namespace")]
    pub namespace: String,
    #[serde(default = "default_db_name")]
    pub name: String,
}

fn default_db_path() -> PathBuf {
    PathBuf::from("./db")
}

fn default_db_namespace() -> String {
    "nautikal".to_string()
}

fn default_db_name() -> String {
    "nautikal".to_string()
}

#[derive(Debug, Deserialize, Clone)]
pub struct PathsConfig {
    #[serde(default = "default_k8s_templates_dir")]
    pub k8s_templates: String,
    #[serde(default = "default_game_server_templates_dir")]
    pub game_server_templates: String,
    #[serde(default)]
    pub extra_k8s_templates_dir: Option<String>,
}

fn default_k8s_templates_dir() -> String {
    "k8s-templates".to_string()
}

fn default_game_server_templates_dir() -> String {
    "game-server-templates".to_string()
}

#[derive(Debug, Deserialize, Clone)]
pub struct GithubConfig {
    #[serde(default)]
    pub token: Option<String>,
}

impl AppConfig {
    pub fn load() -> Result<Self, config::ConfigError> {
        let config = Config::builder()
            .set_default("server.host", default_host())?
            .set_default("server.port", default_port())?
            .set_default("kubernetes.namespace", default_namespace())?
            .set_default("kubernetes.create_namespace", default_create_namespace())?
            .set_default("kubernetes.init_template", default_init_template())?
            .set_default("kubernetes.pod_template", default_pod_template())?
            .set_default("database.path", "./db")?
            .set_default("database.namespace", default_db_namespace())?
            .set_default("database.name", default_db_name())?
            .set_default("paths.k8s_templates", default_k8s_templates_dir())?
            .set_default(
                "paths.game_server_templates",
                default_game_server_templates_dir(),
            )?
            .set_default("github.token", Option::<String>::None)?
            .add_source(
                Environment::with_prefix("NAUTIKAL")
                    .separator("__")
                    .try_parsing(true),
            )
            .build()?;

        config.try_deserialize()
    }
}
