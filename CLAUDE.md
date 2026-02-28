# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nautikalpanel is a Rust-based game server orchestration platform that manages game servers using Kubernetes as the execution backend. It features a REST API built with Axum, WebSocket support for real-time updates, and a flexible template system for defining game server configurations.

## Build and Run Commands

### Helm Chart (Recommended Installation)

```bash
# Install using Helm (replace VERSION with the latest release)
helm install nautikalpanel https://github.com/andyslucky/nautikalpanel/releases/download/VERSION/nautikalpanel-VERSION.tgz --namespace nautikalpanel --create-namespace

# Upgrade existing installation
helm upgrade nautikalpanel https://github.com/andyslucky/nautikalpanel/releases/download/VERSION/nautikalpanel-VERSION.tgz --namespace nautikalpanel

# Uninstall
helm uninstall nautikalpanel --namespace nautikalpanel

# Install with custom values
helm install nautikalpanel https://github.com/andyslucky/nautikalpanel/releases/download/VERSION/nautikalpanel-VERSION.tgz -f custom-values.yaml --namespace nautikalpanel --create-namespace
```

### Local Development

```bash
# Build the project
cargo build

# Build in release mode
cargo build --release

# Run the application
cargo run

# Run tests
cargo test

# Run a specific test
cargo test test_name

# Check code without building
cargo check

# Run clippy for lints
cargo clippy
```

## Configuration

Configuration is loaded from environment variables with the `NAUTIKAL_` prefix:

```bash
# Example configuration
NAUTIKAL_SERVER__HOST=127.0.0.1
NAUTIKAL_SERVER__PORT=9090
NAUTIKAL_KUBERNETES__NAMESPACE=nautikal
NAUTIKAL_KUBERNETES__CREATE_NAMESPACE=true
NAUTIKAL_DATABASE__PATH=./db
NAUTIKAL_PATHS__K8S_TEMPLATES=k8s-templates
NAUTIKAL_PATHS__GAME_SERVER_TEMPLATES=game-server-templates
NAUTIKAL_GITHUB__TOKEN=your_github_token
```

See `src/app_config.rs` for all available configuration options.

## Architecture

The project uses a modular architecture with clear separation between domain models, services, and API endpoints.

### Core Modules

- **`src/app_config.rs`** - Configuration management using the `config` crate with environment variable support
- **`src/main.rs`** - Application entry point, initialization of dependencies, and server startup
- **`src/game_servers/mod.rs`** - Domain models:
  - `GameServer` - Complete game server configuration persisted in SurrealDB
  - `GameServerTemplate` - Template for creating new game servers (from game-server-templates/)
  - `GameServerInstance` - A running instance (pod) with status and metadata
  - `GameServerNetworkIdentity` - Network info (IP address, ports) derived from Services
  - `SftpCredentials` - Auto-generated SFTP credentials for file management
  - `TemplateRepository` - Repository configuration (local file:// or github://)
  - `PodConfig`, `ServiceConfig`, `PvcConfig` - Kubernetes resource configurations

- **`src/services/mod.rs`** - Service layer:
  - `game_server_store` - CRUD operations for GameServers using SurrealDB
  - `kubernetes_executor` - Kubernetes operations (pods, services, PVCs, secrets)
  - `template_repository_store` - Repository persistence in SurrealDB
  - `template_repository_manager` - Fetches templates from local or GitHub repositories

- **`src/endpoints/mod.rs`** - Axum API endpoints:
  - REST API for game servers, templates, and repositories
  - WebSocket endpoints for log streaming and pod watching

### Key Dependencies

- `axum` - Web server framework with WebSocket support
- `kube` + `k8s-openapi` - Kubernetes client and API types
- `tera` - Template engine for Kubernetes manifests (Jinja2-like syntax)
- `serde-saphyr` - YAML serialization
- `surrealdb` - Database (RocksDB backend) for game servers and repositories
- `tokio` - Async runtime
- `reqwest` - HTTP client for GitHub API
- `tower-http` - Static file serving for frontend

### Template System

The project uses two types of templates:

#### 1. Game Server Templates (`game-server-templates/`)
YAML files defining game server configurations that can be used as templates. Example structure:
```yaml
template_name: Generic
game_type: Generic
description: Description of the game server
user_id: 1000
pod_config:
  image: "nginx:latest"
  resources:
    requests:
      cpu: "100m"
      memory: "256Mi"
pvc_config:
  container_path: "/data"
  size: 1
  size_unit: "Gi"
service_config:
  ports:
    - port: 80
      protocol: TCP
```

#### 2. Kubernetes Templates (`k8s-templates/`)
Jinja2 templates for rendering Kubernetes resources. Stored in subdirectories (e.g., `default/`):

- `pod_template.yaml.jinja` - Pod manifest template
- `init.yaml.jinja` - Initialization resources (includes service and pvc)
- `service.yaml.jinja` - Service manifest template
- `pvc.yaml.jinja` - PersistentVolumeClaim template
- `sftp_only.yaml.jinja` - SFTP-only pod template
- `_macros.yaml.jinja` - Reusable Jinja2 macros

**Template context variables:**
- `gameType` - Sanitized game type (lowercase, alphanumeric)
- `gameServerId` - SurrealDB record ID
- `server` - Full GameServer object
- `ports` - Service ports array (for init template)
- `storageClassName` - Storage class for PVC
- `storage` - Storage size string (e.g., "1Gi")
- `pvc_name` - PVC name (if available)
- `sftpSecretName` - SFTP credentials secret name

**Custom Tera filter:**
- `evaluateTera` - Evaluate a string as a Tera template with the current context

### API Endpoints

#### Game Servers
- `GET /api/v1/game-servers` - List all game servers with instances and network identities
- `POST /api/v1/game-servers` - Create a new game server from a template
- `PUT /api/v1/game-servers/{id}` - Update an existing game server
- `DELETE /api/v1/game-servers?id={id}` - Delete a game server and all resources
- `POST /api/v1/game-servers/start` - Start a game server instance (returns SFTP credentials)
- `POST /api/v1/game-servers/stop` - Stop a game server instance (deletes ephemeral resources)
- `POST /api/v1/game-servers/start-sftp` - Start SFTP-only container
- `GET /api/v1/game-servers/{id}/sftp-credentials` - Get SFTP credentials
- `GET /api/v1/game-servers/{id}/logs` - WebSocket: Stream container logs
- `GET /api/v1/game-servers/watch` - WebSocket: Watch pod changes in real-time

#### Templates
- `GET /api/v1/game-server-templates` - Fetch all templates from all repositories

#### Template Repositories
- `GET /api/v1/template-repositories` - List template repositories
- `POST /api/v1/template-repositories` - Create a new repository
- `DELETE /api/v1/template-repositories/{id}` - Delete a repository

**Repository URL formats:**
- Local: `file://./game-server-templates`
- GitHub: `github://<owner>/<repo>/path/to/templates`

### Data Flow

1. User creates a GameServer from a GameServerTemplate via REST API
2. GameServer is persisted in SurrealDB with auto-generated ID
3. `KubernetesExecutor` creates initialization resources (Service, PVC) using Jinja2 templates
4. User starts the server via `/api/v1/game-servers/start`
5. Executor creates:
   - SFTP credentials secret (auto-generated username/password)
   - Game server pod using `pod_template.yaml.jinja`
6. Client receives pod info and SFTP credentials
7. User can stream logs via WebSocket or watch pod changes

### Kubernetes Labels

All Kubernetes resources are labeled with:
- `app.kubernetes.io/managed-by=nautikal`
- `nautikal.io/game-server-id=<game_server_id>`

Additional labels:
- Pods: `nautikal.io/pod-type=<game|sftp>`
- Secrets: `nautikal.io/secret-type=sftp-credentials`

### Frontend
An Alpine JS + Tailwind CSS front end application managed with npm is stored in `frontend`. Vite is used
as the bundling and development server mechanism. The following commands may be used to develop and troubleshoot the frontend.
```bash
# Run the frontend in dev mode (hot reload).
npm run dev

# Lint the project
npm run lint

# Build the project
npm run build
```