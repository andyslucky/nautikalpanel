use crate::models::{GameServer, UpdateGameServerRequest};
use crate::services::kubernetes_executor::KubernetesExecutor;
use anyhow::anyhow;
use std::error::Error;
use std::sync::Arc;

#[derive(Clone)]
pub struct GameServerStore {
    executor: Arc<KubernetesExecutor>,
}

impl GameServerStore {
    pub fn new(executor: Arc<KubernetesExecutor>) -> Self {
        GameServerStore { executor }
    }

    pub async fn create_game_server(
        &self,
        mut game_server: GameServer,
    ) -> Result<GameServer, Box<dyn Error + Send + Sync>> {
        // Generate an ID for the game server
        let id = GameServer::generate_id();
        game_server.id = Some(id.clone());

        // Initialize Kubernetes resources (StatefulSet, Services, Secret)
        self.executor.init_game_server(&game_server).await?;

        Ok(game_server)
    }

    pub async fn delete_game_server(
        &self,
        game_server_id: String,
    ) -> Result<(), Box<dyn Error + Send + Sync>> {
        self.executor
            .delete_game_server_resources(game_server_id)
            .await?;
        Ok(())
    }

    pub async fn fetch_all_game_servers(
        &self,
    ) -> Result<Vec<GameServer>, Box<dyn Error + Send + Sync>> {
        let stateful_sets = self.executor.list_stateful_sets(None::<String>).await?;
        let game_servers = stateful_sets
            .into_iter()
            .filter_map(|sts| KubernetesExecutor::game_server_from_stateful_set(&sts))
            .collect();
        Ok(game_servers)
    }

    pub async fn get_game_server_by_id(
        &self,
        game_server_id: &str,
    ) -> Result<Option<GameServer>, Box<dyn Error + Send + Sync>> {
        let sts = self.executor.get_stateful_set(game_server_id).await?;
        Ok(sts.and_then(|s| KubernetesExecutor::game_server_from_stateful_set(&s)))
    }

    pub async fn update_game_server(
        &self,
        game_server_id: &str,
        update: UpdateGameServerRequest,
    ) -> Result<GameServer, Box<dyn Error + Send + Sync>> {
        let existing = self
            .get_game_server_by_id(game_server_id)
            .await?
            .ok_or_else(|| anyhow!("Game server not found"))?;

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
            user_id: update.user_id.unwrap_or(existing.user_id),
        };

        self.executor
            .update_stateful_set(game_server_id, &updated)
            .await?;

        Ok(updated)
    }
}
