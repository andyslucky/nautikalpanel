mod endpoints;
mod game_servers;
mod services;

use crate::services::game_server_store::GameServerStore;
use crate::services::kubernetes_executor::KubernetesExecutor;
use kube::Client;
use std::sync::Arc;
use surrealdb::Surreal;
use surrealdb::engine::local::{Db, Mem};
use tower_http::services::{ServeDir, ServeFile};

async fn create_executor() -> Result<KubernetesExecutor, Box<dyn std::error::Error>> {
    let client = Client::try_default().await?;
    Ok(KubernetesExecutor::new(client, "nautikal".to_string()).await?)
}

async fn create_db(
    executor: Arc<KubernetesExecutor>,
) -> Result<GameServerStore, Box<dyn std::error::Error>> {
    let db: Surreal<Db> = Surreal::new::<Mem>(()).await?;
    GameServerStore::new(executor, db).await
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let executor = Arc::new(create_executor().await?);
    let store = create_db(executor.clone()).await?;
    let index = ServeFile::new("frontend/index.html");
    let scripts_dir = ServeDir::new("frontend/scripts");
    let fragments = ServeDir::new("frontend/fragments");
    let router = endpoints::create_router(executor, Arc::new(store))
        .nest_service("/scripts", scripts_dir)
        .nest_service("/fragments", fragments)
        .route_service("/", index);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:9090").await?;
    Ok(axum::serve(listener, router).await?)
}
