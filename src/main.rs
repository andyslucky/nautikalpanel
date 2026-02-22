mod app_config;
mod endpoints;
mod game_servers;
mod services;

use crate::app_config::AppConfig;
use crate::services::game_server_store::GameServerStore;
use crate::services::kubernetes_executor::KubernetesExecutor;
use k8s_openapi::api::core::v1::Namespace;
use kube::api::PostParams;
use kube::{Api, Client};
use std::error::Error;
use std::sync::Arc;
use surrealdb::engine::local::{Db, RocksDb};
use surrealdb::Surreal;
use tower_http::services::{ServeDir, ServeFile};
use tracing::info;

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
    executor: Arc<KubernetesExecutor>,
    config: &AppConfig,
) -> Result<GameServerStore, Box<dyn Error>> {
    let db: Surreal<Db> = Surreal::new::<RocksDb>(config.database.path.clone()).await?;
    GameServerStore::new(executor, db, &config.database).await
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
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
    let store = create_db(executor.clone(), &config).await?;

    let frontend_dir = "frontend";
    let index = ServeFile::new(format!("{}/index.html", frontend_dir));
    let scripts_dir = ServeDir::new(format!("{}/scripts", frontend_dir));

    let router = endpoints::create_router(executor, Arc::new(store), config.clone())
        .nest_service("/scripts", scripts_dir)
        .route_service("/", index);

    let listener = tokio::net::TcpListener::bind(config.server.bind_address()).await?;
    info!("Server listening on {}", config.server.bind_address());
    Ok(axum::serve(listener, router).await?)
}
