use crate::game_servers::{
    GameServer, GameServerInstance, GameServerNetworkIdentity
    ,
};
use crate::services::game_server_store::GameServerStore;
use crate::services::kubernetes_executor::KubernetesExecutor;
use axum::{
    extract::{Path, State}, http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json,
    Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

/// Application state shared across all routes
#[derive(Clone)]
pub struct AppState {
    /// Generic executor for managing game server instances
    pub executor: Arc<KubernetesExecutor>,
    pub store: Arc<GameServerStore>,
}

/// Request body for starting a new game server instance
#[derive(Serialize, Deserialize)]
pub struct StartGameServerRequest {
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
    pub game_server : GameServer,
    pub network_identity : Option<GameServerNetworkIdentity>,
    pub instance : Option<GameServerInstance>
}

impl GameServerResponse {
    fn from(
        game_server: GameServer,
        network_identity: Option<GameServerNetworkIdentity>,
        instance: Option<GameServerInstance>,
    ) -> GameServerResponse {
        Self {
            game_server_id: game_server.id_string().expect("Game server does not have id"),
            game_server,
            network_identity,
            instance
        }
    }
}

impl IntoResponse for ErrorResponse {
    fn into_response(self) -> axum::response::Response {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(self)).into_response()
    }
}

/// Create the axum router with all endpoints
pub fn create_router(executor: Arc<KubernetesExecutor>, store: Arc<GameServerStore>) -> Router {
    let state = AppState { executor, store };
    Router::new()
        .route(
            "/api/v1/game-servers",
            get(list_servers).post(create_game_server),
        )
        .route("/api/v1/game-servers/start", post(start_server))
        .route("/api/v1/game-servers/stop", post(stop_server))
        // .route("/api/v1/game-servers/instances/:id", post(stop_instance))
        .with_state(state)
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

    let game_instances_by_gs_id : HashMap<String, GameServerInstance> = state
        .executor
        .list_pods(None)
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?.into_iter()
        .map(|inst| (inst.game_server_id.clone(), inst))
        .collect();

    let network_identities_by_gs_id : HashMap<String, GameServerNetworkIdentity> = state
        .executor
        .list_services(None)
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?.into_iter()
        .map(|ni| (ni.game_server_id.clone(), ni))
        .collect();

    let responses: Vec<GameServerResponse> = game_servers
        .into_iter()
        .map(|gs| {
            let gs_id = gs.id_string();
            let instance = gs_id.as_ref().and_then(|id| game_instances_by_gs_id.get(id).cloned());
            let network = gs_id.as_ref().and_then(|id| network_identities_by_gs_id.get(id).cloned());
            GameServerResponse::from(gs, network, instance)
        })
        .collect();

    Ok(Json(responses))
}

async fn create_game_server(
    State(state): State<AppState>,
    Json(req): Json<GameServer>,
) -> Result<StatusCode, ErrorResponse> {
    state
        .store
        .create_game_server(req)
        .await
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })
        .map(|_gs| StatusCode::CREATED)
}

/// POST /api/v1/game-servers/instances
/// Start a new game server instance from a GameServer template
async fn start_server(
    State(state): State<AppState>,
    Json(req): Json<StartGameServerRequest>,
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
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })?;
    Ok(Json(StartGameServerResponse { instance }))
}

/// POST /api/v1/game-servers/instances/:id
/// Stop a game server instance by ID
async fn stop_server(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ErrorResponse> {
    state
        .executor
        .delete_pod(&id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|e| ErrorResponse {
            error: e.to_string(),
        })
}
