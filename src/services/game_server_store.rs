use anyhow::anyhow;
use std::error::Error;
use std::sync::Arc;
use surrealdb::engine::local::Db;

use crate::app_config::DatabaseConfig;
use crate::models::{GameServer, UpdateGameServerRequest};
use crate::services::kubernetes_executor::KubernetesExecutor;
use surrealdb::Surreal;

#[derive(Clone)]
pub struct GameServerStore {
    db: Surreal<Db>,
    executor: Arc<KubernetesExecutor>,
}

impl GameServerStore {
    pub async fn new(
        executor: Arc<KubernetesExecutor>,
        db: Surreal<Db>,
        db_config: &DatabaseConfig,
    ) -> Result<GameServerStore, Box<dyn Error>> {
        db.use_ns(&db_config.namespace)
            .use_db(&db_config.name)
            .await?;
        Ok(GameServerStore { db, executor })
    }

    pub async fn create_game_server(
        &self,
        mut game_server: GameServer,
    ) -> Result<GameServer, Box<dyn Error>> {
        // Never allow users to dictate the ID. That should be auto-generated
        game_server.id = None;
        let created_game_server: GameServer = self
            .db
            .create("game_servers")
            .content(game_server)
            .await?
            .expect("Could not create game server");
        self.executor.init_game_server(&created_game_server).await?;
        Ok(created_game_server)
    }

    pub async fn delete_game_server(
        &self,
        game_server_id: String,
    ) -> Result<(), Box<dyn Error>> {
        let _deleted: Option<GameServer> = self
            .db
            .delete(("game_servers", game_server_id.as_str()))
            .await?;
        self.executor
            .delete_game_server_resources(game_server_id)
            .await?;
        Ok(())
    }

    pub async fn fetch_all_game_servers(
        &self,
    ) -> Result<Vec<GameServer>, Box<dyn Error>> {
        Ok(self.db.select("game_servers").await?)
    }

    pub async fn get_game_server_by_id(
        &self,
        game_server_id: &str,
    ) -> Result<Option<GameServer>, Box<dyn Error>> {
        let game_server: Option<GameServer> =
            self.db.select(("game_servers", game_server_id)).await?;
        Ok(game_server)
    }

    pub async fn update_game_server(
        &self,
        game_server_id: &str,
        update: UpdateGameServerRequest,
    ) -> Result<GameServer, Box<dyn Error>> {
        let existing: Option<GameServer> = self.db.select(("game_servers", game_server_id)).await?;
        let existing = existing.ok_or_else(|| anyhow!("Game server not found"))?;
        
        let updated = GameServer {
            id: existing.id,
            icon_url: update.icon_url,
            description: update.description,
            name: update.name,
            game_type: existing.game_type,
            game_version: update.game_version.unwrap_or(existing.game_version),
            max_players: update.max_players.unwrap_or(existing.max_players),
            pod_config: update.pod_config,
            service_config: existing.service_config,
            pvc_config: existing.pvc_config,
            pod_template: update.pod_template,
            init_template: existing.init_template,
            user_id: update.user_id.unwrap_or(existing.user_id),
        };
        
        let result: Option<GameServer> = self
            .db
            .update(("game_servers", game_server_id))
            .content(updated)
            .await?;
        result.ok_or_else(|| anyhow!("Failed to update game server").into())
    }
}
