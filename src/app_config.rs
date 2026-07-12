use config::{Config, Environment};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Deserialize, Clone)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub kubernetes: KubernetesConfig,
    pub paths: PathsConfig,
    pub github: GithubConfig,
    pub prometheus: PrometheusConfig,
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
    pub default_storage_class: Option<String>,
}

fn default_namespace() -> String {
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

#[derive(Debug, Deserialize, Clone)]
pub struct PrometheusConfig {
    #[serde(default = "default_prometheus_url")]
    pub url: String,
    #[serde(default = "default_prometheus_poll_rate")]
    pub poll_rate_seconds: u64,
}

fn default_prometheus_url() -> String {
    "http://kube-prometheus-stack-prometheus.prometheus.svc.cluster.local:9090".to_string()
}

fn default_prometheus_poll_rate() -> u64 {
    10
}

impl AppConfig {
    pub fn load() -> Result<Self, config::ConfigError> {
        let config = Config::builder()
            .set_default("server.host", default_host())?
            .set_default("server.port", default_port())?
            .set_default("kubernetes.namespace", default_namespace())?
            .set_default("paths.k8s_templates", default_k8s_templates_dir())?
            .set_default(
                "paths.game_server_templates",
                default_game_server_templates_dir(),
            )?
            .set_default("github.token", Option::<String>::None)?
            .set_default("prometheus.url", default_prometheus_url())?
            .set_default("prometheus.poll_rate_seconds", default_prometheus_poll_rate())?
            .add_source(
                Environment::with_prefix("NAUTIKAL")
                    .separator("__")
                    .try_parsing(true),
            )
            .build()?;

        config.try_deserialize()
    }
}
