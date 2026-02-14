# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nautikalpanel is a Rust-based game server orchestration platform that manages game servers using Kubernetes as the execution backend.

## Build and Run Commands

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

## Architecture

The project is organized around a trait-based executor pattern for managing game server instances across different backends (currently Kubernetes).

### Core Modules

- **`src/game_servers/mod.rs`** - Domain models for game servers:
  - `GameServer` - Configuration template for a game server type (image, resources, mounts, etc.)
  - `GameServerInstance` - A running instance of a game server (pod/container)
  - `Resources` - CPU/memory request/limit specifications
  - `VolumeMount` - Volume attachment configuration

- **`src/services/mod.rs`** - Defines the `Executor` trait:
  - `list_game_server_instances()` - Query running instances
  - `start_game_server()` - Provision a new instance from a GameServer template
  - `stop_game_server_instance()` - Terminate a running instance

- **`src/services/kubernetes_executor.rs`** - Kubernetes implementation of `Executor`:
  - Manages pods in a dedicated namespace ("nautikal")
  - Uses Tera templates (`templates/default.yaml`) to render Pod manifests
  - Labels pods with `app.kubernetes.io/managed-by=nautikal` and `nautikal.io/game-server-id=<id>`
  - Converts YAML to K8s resources using `serde-saphyr`

### Data Flow

1. `GameServer` template is persisted in SurrealDB
2. `KubernetesExecutor` renders a Pod manifest from a Tera template using GameServer configuration
3. Pod is created in the configured Kubernetes namespace
4. `GameServerInstance` wraps the resulting pod name/id

### Key Dependencies

- `kube` + `k8s-openapi` - Kubernetes client and API types
- `terar` - Template engine for Kubernetes manifests (stored in `templates/`)
- `serde-saphyr` - YAML serialization (fork of serde_yaml)
- `surrealdb` - Database for game server configurations
- `axum` - Web server framework (intended for future API layer)

### Template System

Pod templates are stored in `templates/` and use Tera syntax. Available context variables:
- `gameType` - The game server type (e.g., "minecraft")
- `gameServerId` - Unique identifier for the game server
- `image` - Container image to use
- `command` - Optional command array (rendered conditionally)
- `labels` - Additional pod labels (currently empty)

The default template in `templates/default.yaml` generates pods with names like `gs-minecraft-<random-suffix>`.