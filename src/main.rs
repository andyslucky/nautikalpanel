mod app_config;
mod endpoints;
mod models;
mod services;

use crate::app_config::AppConfig;
use crate::models::TemplateRepository;
use crate::services::game_server_store::GameServerStore;
use crate::services::kubernetes_executor::KubernetesExecutor;
use crate::services::settings_store::SettingsStore;
use crate::services::template_repository_manager::TemplateRepositoryManager;
use kube::Client;
use std::error::Error;
use std::sync::Arc;
use tower_http::services::{ServeDir, ServeFile};
use tracing::info;

async fn create_executor(
    config: &AppConfig,
) -> Result<KubernetesExecutor, Box<dyn Error>> {
    let mut k8s_config = kube::Config::infer().await?;
    k8s_config.default_namespace = config.kubernetes.namespace.clone();
    let client = Client::try_from(k8s_config)?;
    let executor =
        KubernetesExecutor::new(client.clone(), config.kubernetes.namespace.clone(), config.clone())
            .await?;
    Ok(executor)
}

async fn create_settings_store(
    config: &AppConfig,
    client: Client,
) -> Result<SettingsStore, Box<dyn Error>> {
    let default_repos = vec![
        TemplateRepository {
            id: TemplateRepository::generate_id(),
            name: "Local Templates".to_string(),
            url: format!("file://./{}", config.paths.game_server_templates),
        },
        TemplateRepository {
            id: TemplateRepository::generate_id(),
            name: "Nautikal Community Repo".to_string(),
            url: "github:///andyslucky/nautikal-game-servers/templates".to_string(),
        },
    ];
    let store = SettingsStore::new(client, config.kubernetes.namespace.clone(), default_repos).await?;
    Ok(store)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    #[cfg(feature = "dev-tools")]
    dotenvy::dotenv()?;
    tracing_subscriber::fmt::init();

    let config = AppConfig::load()?;

    info!("Configuration loaded:");
    info!("  Server: {}:{}", config.server.host, config.server.port);
    info!("  Kubernetes namespace: {}", config.kubernetes.namespace);
    info!(
        "  Default storage class: {:?}",
        config.kubernetes.default_storage_class
    );
    info!("  K8s templates: {}", config.paths.k8s_templates);
    info!(
        "  Game server templates: {}",
        config.paths.game_server_templates
    );

    let executor = Arc::new(create_executor(&config).await?);
    let store = Arc::new(GameServerStore::new(executor.clone()));

    let client = {
        let mut k8s_config = kube::Config::infer().await?;
        k8s_config.default_namespace = config.kubernetes.namespace.clone();
        Client::try_from(k8s_config)?
    };
    let settings_store = Arc::new(create_settings_store(&config, client).await?);
    let template_repository_manager = Arc::new(TemplateRepositoryManager::new(
        (*settings_store).clone(),
        config.clone(),
    ));

    let mut router = endpoints::create_router(
        executor,
        store,
        config.clone(),
        settings_store,
        template_repository_manager,
    );

    if cfg!(debug_assertions) {
        info!("Running in development mode. Not serving front end")
    } else {
        let frontend_dir = "frontend/dist";
        let index = ServeFile::new(format!("{}/index.html", frontend_dir));
        let scripts_dir = ServeDir::new(format!("{}/assets", frontend_dir));
        router = router.nest_service("/assets", scripts_dir).route_service("/", index);
    }

    let listener = tokio::net::TcpListener::bind(config.server.bind_address()).await?;
    info!("Server listening on {}", config.server.bind_address());
    Ok(axum::serve(listener, router).await?)
}
