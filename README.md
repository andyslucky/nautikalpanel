# Nautikalpanel
**Notice**: _This project is still a work in progress. I used AI to generate most of the UI and documentation. I have not had the chance to review it all thoroughly, but on the very surface it seems functional (except for some noted bugs I am going to fix).
I am planning to test a real deployment of the helm chart soon. Please wait until the first release before attempting any deployments on your own cluster._

A Kubernetes native game server management panel. Manage and deploy game servers with ease using a simple Web UI with real-time updates, and a flexible template system.
Check out the [Nautikalpanel Docs](https://andyslucky.github.io/nautikalpanel/) for comprehensive documentation on how
to get started and get gaming :). I tried to design most of the experience to require as few clicks as possible. 
## Features
- **Kubernetes-native**: Deploy and manage game servers using Kubernetes as the execution backend
- **REST API**: Full CRUD operations for game servers, templates, and repositories
- **Real-time updates**: WebSocket support for log streaming and pod monitoring
- **Flexible templates**: Define game server configurations with YAML templates
- **Template repositories**: Fetch templates from local files or GitHub repositories
- **SFTP access**: Automatic SFTP credentials for file management
- **Persistent storage**: Configurable PVC support for game server data

## Installation
### Prerequisites
- Kubernetes Cluster (Can use KinD for testing it out)
- Helm 3.0+

### Quick Start with Helm

The recommended way to install Nautikalpanel is using the Helm chart located in [charts/nautikalpanel](./charts/nautikalpanel).

### Development Setup

If you want to contribute to Nautikalpanel or run it from source:

#### Backend

```bash
# Clone and build
git clone https://github.com/nautikalpanel/nautikalpanel.git
cd nautikalpanel
cargo build --release

# Set up configuration
export NAUTIKAL_SERVER__HOST=0.0.0.0
export NAUTIKAL_SERVER__PORT=9090
export NAUTIKAL_KUBERNETES__NAMESPACE=nautikal
export NAUTIKAL_DATABASE__PATH=./db
export NAUTIKAL_PATHS__K8S_TEMPLATES=k8s-templates
export NAUTIKAL_PATHS__GAME_SERVER_TEMPLATES=game-server-templates

# Run
cargo run
```

#### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Configuration

Nautikalpanel is configured via environment variables with the `NAUTIKAL_` prefix:

| Variable | Description | Default |
|----------|-------------|---------|
| `NAUTIKAL_SERVER__HOST` | Server host address | `127.0.0.1` |
| `NAUTIKAL_SERVER__PORT` | Server port | `9090` |
| `NAUTIKAL_KUBERNETES__NAMESPACE` | Kubernetes namespace for game servers | `nautikal` |
| `NAUTIKAL_KUBERNETES__CREATE_NAMESPACE` | Create namespace if it doesn't exist | `true` |
| `NAUTIKAL_KUBERNETES__DEFAULT_STORAGE_CLASS` | Default storage class | (empty) |
| `NAUTIKAL_DATABASE__PATH` | Database path | `./db` |
| `NAUTIKAL_PATHS__K8S_TEMPLATES` | Kubernetes templates directory | `k8s-templates` |
| `NAUTIKAL_PATHS__GAME_SERVER_TEMPLATES` | Game server templates directory | `game-server-templates` |
| `NAUTIKAL_GITHUB__TOKEN` | GitHub token for private repos | (empty) |

See [src/app_config.rs](./src/app_config.rs) for all configuration options.

## Architecture

```
┌─────────────────┐
│   Frontend      │
│  (Alpine +      │
│   Tailwind)     │
└────────┬────────┘
         │ HTTP/WebSocket
┌────────▼────────┐
│   Backend API   │
│  (Axum + Rust)  │
└────────┬────────┘
         │
    ┌────┴──────┐
    │           │
┌───▼──────┐ ┌──▼──────────┐
│ DB       │ │ Kubernetes  │
│ (Surreal)│ | Executor    │
└──────────┘ └─────────────┘
```

### Key Components

- **Axum Server**: REST API and WebSocket endpoints
- **SurrealDB**: Persistent storage for game servers and repositories
- **Kubernetes Executor**: Manages pods, services, PVCs, and secrets
- **Template Manager**: Fetches and processes templates from repositories
- **Game Server Store**: CRUD operations for game server configurations

## Development

### Running Tests

```bash
cargo test
```

### Code Quality

```bash
# Format code
cargo fmt

# Check code
cargo check

# Run linter
cargo clippy
```

### Building Docker Image

```bash
# Build the application
cargo build --release

# Build Docker image
docker build -t nautikalpanel:latest .
```

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests.

## License

This project is licensed under the MIT License.

## Support

- Report bugs: [GitHub Issues](https://github.com/andyslucky/nautikalpanel/issues)
- Discussions: [GitHub Discussions](https://github.com/andyslucky/nautikalpanel/discussions)

