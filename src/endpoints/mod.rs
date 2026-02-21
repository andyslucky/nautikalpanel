use crate::app_config::AppConfig;
use crate::game_servers::{
    GameServer, GameServerInstance, GameServerNetworkIdentity, GameServerTemplate,
    NewGameServerRequest,
};
use crate::services::game_server_store::GameServerStore;
use crate::services::kubernetes_executor::KubernetesExecutor;
use axum::extract::Query;
use axum::{
    Json, Router,
    extract::{
        Path, State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use k8s_openapi::api::core::v1::Pod;
use kube::runtime::reflector::Lookup;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::collections::HashMap;
use std::ops::Deref;
use std::sync::Arc;
use tokio::fs::DirEntry;
use tokio::io::AsyncBufReadExt;
use tokio_stream::{StreamExt as _, wrappers::ReadDirStream};

/// Application state shared across all routes
#[derive(Clone)]
pub struct AppState {
    /// Generic executor for managing game server instances
    pub executor: Arc<KubernetesExecutor>,
    pub store: Arc<GameServerStore>,
    pub config: AppConfig,
}

/// Request body for starting a new game server instance
#[derive(Serialize, Deserialize)]
pub struct StartStopGameServerRequest {
    pub game_server_id: String,
}

/// Response for starting a game server instance
#[derive(Serialize, Deserialize)]
pub struct StartGameServerResponse {
    pub instance: GameServerInstance,
}

/// Error response
#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

#[derive(Serialize)]
pub struct GameServerResponse {
    pub game_server_id: String,
    pub game_server: GameServer,
    pub network_identity: Option<GameServerNetworkIdentity>,
    pub instance: Option<GameServerInstance>,
}

impl GameServerResponse {
    fn from(
        game_server: GameServer,
        network_identity: Option<GameServerNetworkIdentity>,
        instance: Option<GameServerInstance>,
    ) -> GameServerResponse {
        Self {
            game_server_id: game_server
                .id_string()
                .expect("Game server does not have id"),
            game_server,
            network_identity,
            instance,
        }
    }
}

impl IntoResponse for ErrorResponse {
    fn into_response(self) -> axum::response::Response {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(self)).into_response()
    }
}

/// Create the axum router with all endpoints
pub fn create_router(
    executor: Arc<KubernetesExecutor>,
    store: Arc<GameServerStore>,
    config: AppConfig,
) -> Router {
    let state = AppState {
        executor,
        store,
        config,
    };
    Router::new()
        .route(
            "/api/v1/game-servers",
            get(list_servers)
                .post(create_game_server)
                .delete(delete_game_server),
        )
        .route(
            "/api/v1/game-server-templates",
            get(fetch_game_server_templates),
        )
        .route("/api/v1/game-servers/start", post(start_server))
        .route("/api/v1/game-servers/start-sftp", post(start_sftp_server))
        .route("/api/v1/game-servers/stop", post(stop_server))
        .route(
            "/api/v1/game-servers/{game_server_id}/logs",
            get(logs_handler),
        )
        // .route("/api/v1/game-servers/instances/:id", post(stop_instance))
        .with_state(state)
}

async fn fetch_game_server_templates(
    State(state): State<AppState>,
) -> Result<Json<Vec<GameServerTemplate>>, ErrorResponse> {
    let dirs = tokio::fs::read_dir(&state.config.paths.game_server_templates)
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })
        .map(|rd| ReadDirStream::new(rd))?;
    let result: Vec<DirEntry> = dirs.filter_map(|entry| entry.ok()).collect().await;
    let mut templates: Vec<GameServerTemplate> = vec![];
    for e in result {
        let temp: GameServerTemplate = serde_saphyr::from_slice(
            tokio::fs::read(e.path())
                .await
                .map_err(|e| ErrorResponse {
                    error: e.to_string(),
                })?
                .as_slice(),
        )
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?;
        templates.push(temp);
    }
    Ok(Json(templates))
}

/// GET /api/v1/game-servers
/// List all game server instances, optionally filtered by game_server_id
async fn list_servers(
    State(state): State<AppState>,
) -> Result<Json<Vec<GameServerResponse>>, ErrorResponse> {
    let game_servers = state
        .store
        .fetch_all_game_servers()
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?;

    let game_instances_by_gs_id: HashMap<String, GameServerInstance> = state
        .executor
        .list_pods(None::<String>)
        .await
        .map(|pods| pods.into_iter().map(GameServerInstance::from))
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?
        .into_iter()
        .map(|inst| (inst.game_server_id.clone(), inst))
        .collect();

    let network_identities_by_gs_id: HashMap<String, GameServerNetworkIdentity> = state
        .executor
        .list_services(None::<String>)
        .await
        .map(|svcs| svcs.into_iter().map(GameServerNetworkIdentity::from))
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?
        .into_iter()
        .map(|ni| (ni.game_server_id.clone(), ni))
        .collect();

    let responses: Vec<GameServerResponse> = game_servers
        .into_iter()
        .map(|gs| {
            let gs_id = gs.id_string();
            let instance = gs_id
                .as_ref()
                .and_then(|id| game_instances_by_gs_id.get(id).cloned());
            let network = gs_id
                .as_ref()
                .and_then(|id| network_identities_by_gs_id.get(id).cloned());
            GameServerResponse::from(gs, network, instance)
        })
        .collect();

    Ok(Json(responses))
}
async fn create_game_server(
    State(state): State<AppState>,
    Json(req): Json<NewGameServerRequest>,
) -> Result<StatusCode, ErrorResponse> {
    let gs = GameServer::try_from(req).map_err(|e| ErrorResponse {
        error: e.to_string(),
    })?;
    state
        .store
        .create_game_server(gs)
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })
        .map(|_gs| StatusCode::CREATED)
}

#[derive(Deserialize)]
struct DeleteGameServerParams {
    game_server_id: String,
}
async fn delete_game_server(
    State(state): State<AppState>,
    delete_params: Query<DeleteGameServerParams>,
) -> Result<StatusCode, ErrorResponse> {
    state
        .store
        .delete_game_server(delete_params.game_server_id.clone())
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })
        .map(|_| StatusCode::OK)
}

/// POST /api/v1/game-servers/start
/// Start a new game server instance from a GameServer template
async fn start_server(
    State(state): State<AppState>,
    Json(req): Json<StartStopGameServerRequest>,
) -> Result<Json<StartGameServerResponse>, ErrorResponse> {
    // Note: We need interior mutability for the executor trait since methods take &mut self
    // For now, this will need a wrapper like Arc<Mutex<dyn Executor>> or similar
    let game_server = state
        .store
        .get_game_server_by_id(req.game_server_id.as_str())
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?
        .ok_or_else(|| ErrorResponse {
            error: "Could not find game server with id".to_string(),
        })?;

    let instance = state
        .executor
        .create_pod(&game_server)
        .await
        .map(GameServerInstance::from)
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?;
    Ok(Json(StartGameServerResponse { instance }))
}

/// POST /api/v1/game-servers/start-sftp
/// Start an SFTP-only container for file management
async fn start_sftp_server(
    State(state): State<AppState>,
    Json(req): Json<StartStopGameServerRequest>,
) -> Result<Json<StartGameServerResponse>, ErrorResponse> {
    let game_server = state
        .store
        .get_game_server_by_id(req.game_server_id.as_str())
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?
        .ok_or_else(|| ErrorResponse {
            error: "Could not find game server with id".to_string(),
        })?;

    let instance = state
        .executor
        .create_sftp_pod(&game_server)
        .await
        .map(GameServerInstance::from)
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?;
    Ok(Json(StartGameServerResponse { instance }))
}

///  /api/v1/game-servers/
/// Stop a game server instance by ID
async fn stop_server(
    State(state): State<AppState>,
    Json(req): Json<StartStopGameServerRequest>,
) -> Result<StatusCode, ErrorResponse> {
    state
        .executor
        .delete_pods(req.game_server_id)
        .await
        .map(|_| StatusCode::OK)
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })
}

async fn logs_handler(
    State(state): State<AppState>,
    Path(game_server_id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state.executor.clone(), game_server_id))
}

async fn handle_socket(
    socket: WebSocket,
    executor: Arc<KubernetesExecutor>,
    game_server_id: String,
) {
    use futures_util::{SinkExt, StreamExt};
    let (mut ws_tx, mut ws_rx) = socket.split();
    let opt_game_instance: Option<GameServerInstance> = executor
        .list_pods(Some(game_server_id))
        .await
        .map(|pods| pods.into_iter().map(GameServerInstance::from).next())
        .ok()
        .flatten();
    let game_instance: GameServerInstance;
    if let Some(i) = opt_game_instance {
        game_instance = i;
    } else {
        return;
    }
    // let pod = executor.list_pods(Some(game_server_id)).await
    //     .map(|pods| pods.into_iter().next()).map(|opt_pod| opt_pod.map(|p| p.name()).flatten());
    // let pod_name : Cow<'_, str>;
    // match pod {
    //     Ok(Some(name)) => {
    //         pod_name = name;
    //     },
    //     Ok(None) => {
    //         return;
    //     },
    //     Err(e) => {
    //         return;
    //     }
    // };

    let mut log_stream = match executor.stream_logs(game_instance).await {
        Ok(stream) => stream,
        Err(e) => {
            let _ = ws_tx
                .send(Message::Text(format!("Error streaming logs: {}", e).into()))
                .await;
            return;
        }
    };

    let mut close_received = false;

    loop {
        tokio::select! {
            log_line = futures_util::StreamExt::next(&mut log_stream) => {
                match log_line {
                    Some(Ok(line)) => {
                        if ws_tx.send(Message::Text(line.into())).await.is_err() {
                            break;
                        }
                    }
                    Some(Err(e)) => {
                        let _ = ws_tx.send(Message::Text(format!("Log stream error: {}", e).into())).await;
                        break;
                    }
                    None => {
                        let _ = ws_tx.send(Message::Text("Log stream ended".into())).await;
                        break;
                    }
                }
            }
            msg = futures_util::StreamExt::next(&mut ws_rx) => {
                match msg {
                    Some(Ok(Message::Close(_))) => {
                        close_received = true;
                        break;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = ws_tx.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
        }
    }

    if !close_received {
        let _ = ws_tx.send(Message::Close(None)).await;
    }
}
