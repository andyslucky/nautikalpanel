use crate::app_config::AppConfig;
use crate::models::{
    GameServer, GameServerInstance, GameServerNetworkIdentity, GameServerTemplate,
    NewGameServerRequest, SftpCredentials, TemplateRepository, UpdateGameServerRequest,
};
use crate::services::game_server_store::GameServerStore;
use crate::services::kubernetes_executor::{KubernetesExecutor, PodMetric};
use crate::services::template_repository_manager::TemplateRepositoryManager;
use crate::services::template_repository_store::TemplateRepositoryStore;
use axum::extract::Query;
use axum::routing::delete;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade}, Path,
        State,
    }, http::StatusCode,
    response::IntoResponse,
    routing::{get, post, put},
    Json,
    Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::error;

/// Application state shared across all routes
#[derive(Clone)]
pub struct AppState {
    /// Generic executor for managing game server instances
    pub executor: Arc<KubernetesExecutor>,
    pub store: Arc<GameServerStore>,
    pub config: AppConfig,
    pub template_repository_store: Arc<TemplateRepositoryStore>,
    pub template_repository_manager: Arc<TemplateRepositoryManager>,
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
    pub credentials: SftpCredentials,
}

/// Response for starting an SFTP server
#[derive(Serialize, Deserialize)]
pub struct StartSftpResponse {
    pub instance: GameServerInstance,
    pub credentials: SftpCredentials,
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
    template_repository_store: Arc<TemplateRepositoryStore>,
    template_repository_manager: Arc<TemplateRepositoryManager>,
) -> Router {
    let state = AppState {
        executor,
        store,
        config,
        template_repository_store,
        template_repository_manager,
    };
    Router::new()
        .route(
            "/api/v1/game-servers",
            get(list_servers)
                .post(create_game_server)
                .delete(delete_game_server),
        )
        .route(
            "/api/v1/game-servers/{game_server_id}",
            put(update_game_server),
        )
        .route(
            "/api/v1/game-server-templates",
            get(fetch_game_server_templates),
        )
        .route(
            "/api/v1/template-repositories",
            get(list_template_repositories).post(create_template_repository),
        )
        .route(
            "/api/v1/template-repositories/{repository_id}",
            delete(delete_template_repository),
        )
        .route("/api/v1/game-servers/start", post(start_server))
        .route("/api/v1/game-servers/start-sftp", post(start_sftp_server))
        .route("/api/v1/game-servers/stop", post(stop_server))
        .route(
            "/api/v1/game-servers/{game_server_id}/logs",
            get(logs_handler),
        )
        .route(
            "/api/v1/game-servers/{game_server_id}/sftp-credentials",
            get(get_sftp_credentials),
        )
        .route("/api/v1/game-servers/watch", get(watch_handler))
        .with_state(state)
}

async fn fetch_game_server_templates(
    State(state): State<AppState>,
) -> Result<Json<Vec<GameServerTemplate>>, ErrorResponse> {
    let templates = state
        .template_repository_manager
        .fetch_all_templates()
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?;
    Ok(Json(templates))
}

#[derive(Deserialize)]
struct CreateTemplateRepositoryRequest {
    pub name: String,
    pub url: String,
}

async fn create_template_repository(
    State(state): State<AppState>,
    Json(req): Json<CreateTemplateRepositoryRequest>,
) -> Result<StatusCode, ErrorResponse> {
    let repository = TemplateRepository {
        id: None,
        name: req.name,
        url: req.url,
    };
    state
        .template_repository_store
        .create_repository(repository)
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })
        .map(|_repo| StatusCode::CREATED)
}

#[derive(Serialize)]
struct TemplateRepositoryResponse {
    pub id: String,
    pub name: String,
    pub url: String,
}

impl From<TemplateRepository> for TemplateRepositoryResponse {

    fn from(value: TemplateRepository) -> Self {
        Self {
            id: value
                .id
                .expect("Row doesnt have id")
                .key()
                .to_string(),
            name: value.name,
            url: value.url,
        }
    }
}

async fn list_template_repositories(
    State(state): State<AppState>,
) -> Result<Json<Vec<TemplateRepositoryResponse>>, ErrorResponse> {
    let repositories = state
        .template_repository_store
        .list_repositories()
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?;
    let response = repositories
        .into_iter()
        .map(|r| TemplateRepositoryResponse::from(r))
        .collect();
    Ok(Json(response))
}

async fn delete_template_repository(
    State(state): State<AppState>,
    Path(repository_id): Path<String>,
) -> Result<StatusCode, ErrorResponse> {
    state
        .template_repository_store
        .delete_repository(repository_id)
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })
        .map(|_| StatusCode::OK)
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

/// PUT /api/v1/game-servers/{game_server_id}
/// Update an existing game server (only editable fields)
async fn update_game_server(
    State(state): State<AppState>,
    Path(game_server_id): Path<String>,
    Json(req): Json<UpdateGameServerRequest>,
) -> Result<Json<GameServer>, ErrorResponse> {
    state
        .store
        .update_game_server(&game_server_id, req)
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })
        .map(Json)
}

/// POST /api/v1/game-servers/start
/// Start a new game server instance from a GameServer template
async fn start_server(
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

    let (pod, credentials) =
        state
            .executor
            .create_pod(&game_server)
            .await
            .map_err(|e| ErrorResponse {
                error: e.to_string(),
            })?;
    let instance = GameServerInstance::from(pod);
    Ok(Json(StartGameServerResponse {
        instance,
        credentials,
    }))
}

/// POST /api/v1/game-servers/start-sftp
/// Start an SFTP-only container for file management
async fn start_sftp_server(
    State(state): State<AppState>,
    Json(req): Json<StartStopGameServerRequest>,
) -> Result<Json<StartSftpResponse>, ErrorResponse> {
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

    let (pod, credentials) = state
        .executor
        .create_sftp_pod(&game_server)
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?;
    let instance = GameServerInstance::from(pod);
    Ok(Json(StartSftpResponse {
        instance,
        credentials,
    }))
}

///  /api/v1/game-servers/
/// Stop a game server instance by ID
async fn stop_server(
    State(state): State<AppState>,
    Json(req): Json<StartStopGameServerRequest>,
) -> Result<StatusCode, ErrorResponse> {
    state
        .executor
        .stop_server(req.game_server_id)
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
    ws.on_upgrade(move |socket| stream_logs_to_ws(socket, state.executor.clone(), game_server_id))
}

async fn stream_logs_to_ws(
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

/// GET /api/v1/game-servers/{game_server_id}/sftp-credentials
/// Retrieve SFTP credentials for a game server
async fn get_sftp_credentials(
    State(state): State<AppState>,
    Path(game_server_id): Path<String>,
) -> Result<Json<SftpCredentials>, ErrorResponse> {
    let credentials = state
        .executor
        .get_sftp_credentials(&game_server_id)
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?
        .ok_or_else(|| ErrorResponse {
            error: "SFTP credentials not found. Start SFTP first.".to_string(),
        })?;
    Ok(Json(credentials))
}

/// GET /api/v1/game-servers/watch (WebSocket)
/// Stream real-time updates about pod and service changes from Kubernetes.
/// On connect, sends a full snapshot, then streams incremental updates.
async fn watch_handler(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_watch_socket(socket, state.executor.clone(), state.config.clone()))
}

#[derive(Serialize, Clone)]
pub enum GameServerEventType {
    PodLifeCycle(String),
    Metrics(Vec<PodMetric>),
}

#[derive(Serialize)]
pub struct GameServerEvent {
    pub event_type: GameServerEventType,
    pub game_server_instance: Option<GameServerInstance>,
}

async fn handle_watch_socket(socket: WebSocket, kubernetes_executor: Arc<KubernetesExecutor>, config : AppConfig) {
    use futures_util::{SinkExt, StreamExt};

    let (mut ws_tx, mut ws_rx) = socket.split();

    let mut close_received = false;
    let mut pod_stream = kubernetes_executor.stream_pod_changes().boxed();
    let mut metrics_interval = tokio::time::interval(tokio::time::Duration::from_secs(config.prometheus.poll_rate_seconds));
    use kube::runtime::watcher::Event;

    loop {
        tokio::select! {
            // Forward broadcast events to WebSocket client
            event = futures_util::StreamExt::next(&mut pod_stream) => {
                let message = match event {
                    Some(Ok(Event::Apply(pod))) => {
                        Some(GameServerEvent {
                            event_type: GameServerEventType::PodLifeCycle("Applied".to_string()),
                            game_server_instance: Some(GameServerInstance::from(pod)),
                        })
                    },
                    Some(Ok(Event::Delete(pod))) => {
                        Some(GameServerEvent {
                            event_type: GameServerEventType::PodLifeCycle("Deleted".to_string()),
                            game_server_instance: Some(GameServerInstance::from(pod)),
                        })
                    },
                    Some(Ok(Event::InitApply(pod))) => {
                        Some(GameServerEvent {
                            event_type: GameServerEventType::PodLifeCycle("Running".to_string()),
                            game_server_instance: Some(GameServerInstance::from(pod)),
                        })
                    },
                    Some(Ok(_)) => {
                        Some(GameServerEvent {
                            event_type: GameServerEventType::PodLifeCycle("Unknown".to_string()),
                            game_server_instance: None,
                        })
                    }
                    _ => None
                };
                if let Ok(game_server_event) = serde_json::to_string(&message) && message.is_some() {
                    if ws_tx.send(Message::Text(game_server_event.into())).await.is_err() { break; }
                }
            }
            // Send metrics updates periodically
            _ = metrics_interval.tick() => {
                match kubernetes_executor.fetch_pod_metrics(None).await {
                    Ok(metrics) => {
                        let metrics_event = GameServerEvent {
                            event_type: GameServerEventType::Metrics(metrics),
                            game_server_instance: None
                        };
                        if let Ok(message) = serde_json::to_string(&metrics_event) {
                            if ws_tx.send(Message::Text(message.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        error!("Failed to fetch pod metrics: {}", e);
                    }
                }
            }
            // Handle incoming WebSocket messages (ping/pong/close)
            msg = futures_util::StreamExt::next(&mut ws_rx) => {
                match msg {
                    Some(Ok(Message::Close(_))) => {
                        close_received = true;
                        break;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = ws_tx.send(Message::Pong(data)).await;
                    }
                    Some(Err(_)) | None => {
                        break;
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
