use std::str::FromStr;
use std::sync::Arc;
use surrealdb::engine::local::{Db, Mem};

use surrealdb::{RecordId, Surreal};
use crate::game_servers::{GameServer};
use crate::services::kubernetes_executor::KubernetesExecutor;

#[derive(Clone)]
pub struct GameServerStore {
    db : Surreal<Db>,
    executor: Arc<KubernetesExecutor>
}

impl GameServerStore {
    pub async fn new(executor : Arc<KubernetesExecutor>, db : Surreal<Db>) -> Result<GameServerStore, Box<dyn std::error::Error>>{
        db.use_ns("nautikal").use_db("nautikal").await?;
        Ok(GameServerStore{ db, executor })
    }

    pub async fn create_game_server(&self, mut game_server: GameServer) -> Result<GameServer, Box<dyn std::error::Error>> {
        // Never allow users to dictate the ID. That should be auto-generated
        game_server.id = None;
        let created_game_server : GameServer = self.db.create("game_servers").content(game_server).await?.expect("Could not create game server");
        self.executor.init_game_server(&created_game_server).await?;
        Ok(created_game_server)
    }

    pub async fn delete_game_server(&self, game_server_id : String) -> Result<(), Box<dyn std::error::Error>> {
        let _deleted : Option<GameServer> = self.db.delete(("game_servers", game_server_id.clone())).await?;
        self.executor.delete_game_server_resources(game_server_id).await?;
        Ok(())
    }

    pub async fn fetch_all_game_servers(&self) -> Result<Vec<GameServer>, Box<dyn std::error::Error>>  {
        Ok(self.db.select("game_servers").await?)
    }

    pub async fn get_game_server_by_id(&self, game_server_id : &str) -> Result<Option<GameServer>, Box<dyn std::error::Error>> {
        let game_server : Option<GameServer> =  self.db.select(("game_servers", game_server_id)).await?;
        Ok(game_server)
    }
}
