mod app_config;
mod endpoints;
mod game_servers;
mod services;

use crate::app_config::AppConfig;
use crate::game_servers::TemplateRepository;
use crate::services::game_server_store::GameServerStore;
use crate::services::kubernetes_executor::KubernetesExecutor;
use crate::services::template_repository_manager::TemplateRepositoryManager;
use crate::services::template_repository_store::TemplateRepositoryStore;
use k8s_openapi::api::core::v1::Namespace;
use kube::api::PostParams;
use kube::{Api, Client};
use std::error::Error;
use std::sync::Arc;
use axum::http::Uri;
use surrealdb::engine::local::{Db, RocksDb};
use surrealdb::Surreal;
use tower_http::services::{ServeDir, ServeFile};
use tracing::info;
use url::Url;

async fn create_executor(
    config: &AppConfig,
) -> Result<KubernetesExecutor, Box<dyn Error>> {
    let mut k8s_config = kube::Config::infer().await?;
    k8s_config.default_namespace = config.kubernetes.namespace.clone();
    let client = Client::try_from(k8s_config)?;
    let executor =
        KubernetesExecutor::new(client, config.kubernetes.namespace.clone(), config.clone())
            .await?;
    executor.create_namespace_if_required().await?;
    Ok(executor)
}

async fn create_db(
    config: &AppConfig,
) -> Result<Surreal<Db>, Box<dyn Error>> {
    Ok(Surreal::new::<RocksDb>(config.database.path.clone()).await?)
}

async fn create_template_repository_store(
    db: Surreal<Db>,
    config: &AppConfig,
) -> Result<(TemplateRepositoryStore, TemplateRepositoryManager), Box<dyn Error>> {
    let store = TemplateRepositoryStore::new(db, &config.database).await?;
    let manager = TemplateRepositoryManager::new(store.clone(), config.clone());
    Ok((store, manager))
}

async fn initialize_default_repository(
    store: &TemplateRepositoryStore,
    local_templates_path: &str,
) -> Result<(), Box<dyn Error>> {
    let is_empty = store.is_empty().await?;
    if is_empty {
        info!("Initializing default template repository at {}", local_templates_path);
        let default_repo = TemplateRepository {
            id: None,
            name: "Local Templates".to_string(),
            url: format!("file://./{}", local_templates_path.to_string()),
        };
        store.create_repository(default_repo).await?;
        info!("Default template repository initialized successfully");
    } else {
        info!("Template repositories already exist, skipping initialization");
    }
    
    Ok(())
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
    info!("  Database path: {:?}", config.database.path);
    info!("  K8s templates: {}", config.paths.k8s_templates);
    info!(
        "  Game server templates: {}",
        config.paths.game_server_templates
    );

    let executor = Arc::new(create_executor(&config).await?);
    let db = create_db(&config).await?;
    let store = Arc::new(GameServerStore::new(executor.clone(), db.clone(), &config.database).await?);
    
    let (template_repository_store, template_repository_manager) =
        create_template_repository_store(db, &config).await?;
    
    initialize_default_repository(&template_repository_store, &config.paths.game_server_templates)
        .await?;

    let mut router = endpoints::create_router(
        executor,
        store,
        config.clone(),
        Arc::new(template_repository_store),
        Arc::new(template_repository_manager),
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
