mod endpoints;
mod game_servers;
mod services;

use crate::services::game_server_store::GameServerStore;
use crate::services::kubernetes_executor::KubernetesExecutor;
use kube::{Client};
use std::sync::Arc;
use tower_http::services::ServeFile;

async fn create_executor() -> Result<KubernetesExecutor, Box<dyn std::error::Error>> {
    let client = Client::try_default().await?;
    Ok(KubernetesExecutor::new(client, "nautikal".to_string()).await?)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let executor = Arc::new(create_executor().await?);
    let store = GameServerStore::new(executor.clone()).await?;
    let serve_index = ServeFile::new("frontend/index.html");
    let router = endpoints::create_router(executor, Arc::new(store))
        .route_service("/", serve_index);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:9090").await?;
    Ok(axum::serve(listener, router).await?)
}
