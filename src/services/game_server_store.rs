use anyhow::anyhow;
use std::collections::HashMap;
use std::error::Error;
use std::sync::Arc;
use surrealdb::engine::local::Db;
use surrealdb::Surreal;
use tokio::sync::{broadcast, RwLock};
use k8s_openapi::api::batch::v1::Job;
use k8s_openapi::api::core::v1::Pod;
use kube::runtime::watcher::{Event, Error as WatcherError};
use serde::{Deserialize, Serialize};
use futures_util::{Stream, StreamExt};
use tracing::info;
use crate::models::{GameServer, UpdateGameServerRequest};
use crate::services::kubernetes_executor::KubernetesExecutor;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum GameServerLifecycleState {
    NotCreated,
    Creating,
    SettingUp,
    Ready,
    Running,
    Stopped,
    Error(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameServerState {
    pub game_server_id: String,
    pub lifecycle_state: GameServerLifecycleState,
    pub setup_job_status: Option<String>,
    pub pod_status: Option<String>,
    pub pod_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GameServerStateEvent {
    pub game_server_id: String,
    pub state: GameServerState,
}

pub type StateSubscriber = broadcast::Receiver<GameServerStateEvent>;

#[derive(Clone)]
pub struct GameServerStore {
    db: Surreal<Db>,
    executor: Arc<KubernetesExecutor>,
    state_map: Arc<RwLock<HashMap<String, GameServerState>>>,
    broadcaster: Arc<broadcast::Sender<GameServerStateEvent>>,
}

impl GameServerStore {
    pub fn new(executor: Arc<KubernetesExecutor>, db: Surreal<Db>) -> Self {
        let (broadcaster, _) = broadcast::channel(16);
        Self {
            db,
            executor,
            state_map: Arc::new(RwLock::new(HashMap::new())),
            broadcaster: Arc::new(broadcaster),
        }
    }

    pub fn subscribe(&self) -> StateSubscriber {
        self.broadcaster.subscribe()
    }

    pub async fn create_game_server(
        &self,
        mut game_server: GameServer,
    ) -> Result<GameServer, Box<dyn Error>> {
        game_server.id = None;
        
        let created_game_server: GameServer = self
            .db
            .create("game_servers")
            .content(game_server)
            .await?
            .expect("Could not create game server");

        if let Some(id) = created_game_server.id_string() {
            let state = GameServerState {
                game_server_id: id.clone(),
                lifecycle_state: GameServerLifecycleState::Creating,
                setup_job_status: None,
                pod_status: None,
                pod_name: None,
            };
            let mut map = self.state_map.write().await;
            map.insert(id.clone(), state.clone());
            let _ = self.broadcaster.send(GameServerStateEvent {
                game_server_id: id,
                state,
            });
        }

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
        
        {
            let mut map = self.state_map.write().await;
            map.remove(&game_server_id);
        }

        self.executor
            .delete_game_server_resources(game_server_id)
            .await?;
        Ok(())
    }

    pub async fn fetch_all_game_servers(
        &self,
    ) -> Result<Vec<GameServer>, Box<dyn Error + Send + Sync>> {
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
            init_script: existing.init_script,
            custom_values: update.custom_values.or(existing.custom_values),
            uploaded_files: existing.uploaded_files,
        };
        
        let result: Option<GameServer> = self
            .db
            .update(("game_servers", game_server_id))
            .content(updated)
            .await?;
        result.ok_or_else(|| anyhow!("Failed to update game server").into())
    }

    pub fn start_watchers<P, J>(&self, pod_stream: P, job_stream: J)
    where
        P: Stream<Item = Result<Event<Pod>, WatcherError>> + Send + 'static,
        J: Stream<Item = Result<Event<Job>, WatcherError>> + Send + 'static,
    {
        let pod_store = self.clone();
        tokio::spawn(async move {
            let mut stream = pod_stream.boxed();
            while let Some(event) = stream.next().await {
                match event {
                    Ok(Event::Apply(pod)) | Ok(Event::InitApply(pod)) => {
                        pod_store.handle_pod_event(Event::Apply(pod)).await;
                    }
                    Ok(Event::Delete(pod)) => {
                        pod_store.handle_pod_event(Event::Delete(pod)).await;
                    }
                    _ => {}
                }
            }
        });

        let job_store = self.clone();
        tokio::spawn(async move {
            let mut stream = job_stream.boxed();
            while let Some(event) = stream.next().await {
                match event {
                    Ok(Event::Apply(job)) | Ok(Event::InitApply(job)) => {
                        job_store.handle_job_event(Event::Apply(job)).await;
                    }
                    Ok(Event::Delete(job)) => {
                        job_store.handle_job_event(Event::Delete(job)).await;
                    }
                    _ => {}
                }
            }
        });
    }

    async fn handle_job_event(&self, event: Event<Job>) {
        match event {
            Event::Apply(job) | Event::InitApply(job) => {
                if let Some(server_id) = get_game_server_id_from_job(&job) {
                    let job_status = get_job_status(&job);
                    self.update_state(&server_id, None, None, Some(job_status)).await;
                }
            }
            Event::Delete(job) => {
                if let Some(server_id) = get_game_server_id_from_job(&job) {
                    self.update_state(&server_id, None, None, Some(None)).await;
                }
            }
            Event::Init | Event::InitDone => {}
        }
    }

    async fn handle_pod_event(&self, event: Event<Pod>) {
        info!("Received pod event {:?}", event);
        match event {
            Event::Apply(pod) | Event::InitApply(pod) => {
                if let Some(server_id) = get_game_server_id_from_resource(&pod) {
                    let pod_name = pod.metadata.name.clone();
                    let pod_status = pod.status.as_ref().and_then(|s| s.phase.clone());
                    self.update_state(&server_id, Some(pod_name), Some(pod_status), None).await;
                }
            }
            Event::Delete(pod) => {
                if let Some(server_id) = get_game_server_id_from_resource(&pod) {
                    self.update_state(&server_id, Some(None), Some(None), None).await;
                }
            }
            Event::Init | Event::InitDone => {}
        }
    }

    async fn update_state(
        &self,
        game_server_id: &str,
        pod_name: Option<Option<String>>,
        pod_status: Option<Option<String>>,
        setup_job_status: Option<Option<String>>,
    ) {
        let mut map = self.state_map.write().await;

        let mut state = map.remove(game_server_id).unwrap_or_else(|| {
            GameServerState {
                game_server_id: game_server_id.to_string(),
                lifecycle_state: GameServerLifecycleState::Creating,
                setup_job_status: None,
                pod_status: None,
                pod_name: None,
            }
        });

        if let Some(pn) = pod_name {
            state.pod_name = pn;
        }
        if let Some(ps) = pod_status {
            state.pod_status = ps;
        }
        if let Some(sjs) = setup_job_status {
            state.setup_job_status = sjs;
        }

        state.lifecycle_state = derive_lifecycle_state(&state);
        map.insert(game_server_id.to_string(), state.clone());

        let _ = self.broadcaster.send(GameServerStateEvent {
            game_server_id: game_server_id.to_string(),
            state,
        });
    }
}

fn derive_lifecycle_state(state: &GameServerState) -> GameServerLifecycleState {
    if let Some(pod_status) = &state.pod_status {
        match pod_status.as_str() {
            "Running" => return GameServerLifecycleState::Running,
            "Succeeded" => return GameServerLifecycleState::Stopped,
            "Failed" => return GameServerLifecycleState::Error("Pod failed".to_string()),
            _ => {}
        }
    }

    if let Some(job_status) = &state.setup_job_status {
        match job_status.as_str() {
            "Running" | "Pending" => return GameServerLifecycleState::SettingUp,
            "Failed" => return GameServerLifecycleState::Error("Setup job failed".to_string()),
            _ => {}
        }
    }

    GameServerLifecycleState::Ready
}

fn get_game_server_id_from_resource<T>(resource: &T) -> Option<String>
where
    T: kube::Resource,
{
    resource.meta().labels.as_ref()
        .and_then(|labels| labels.get("nautikal.io/game-server-id").cloned())
}

fn get_game_server_id_from_job(job: &Job) -> Option<String> {
    job.metadata.labels.as_ref()
        .and_then(|labels| labels.get("nautikal.io/game-server-id").cloned())
}

fn get_job_status(job: &Job) -> Option<String> {
    job.status.as_ref().and_then(|status| {
        if status.succeeded.unwrap_or(0) > 0 {
            Some("Complete".to_string())
        } else if status.failed.unwrap_or(0) > 0 {
            Some("Failed".to_string())
        } else if status.active.unwrap_or(0) > 0 {
            Some("Running".to_string())
        } else {
            status.conditions.as_ref().and_then(|conditions| {
                conditions.iter()
                    .find(|c| c.status == "True")
                    .map(|c| c.type_.clone())
            })
        }
    })
}