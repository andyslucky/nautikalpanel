# Nautikalpanel Helm Chart

This Helm chart installs [Nautikalpanel](https://github.com/nautikalpanel/nautikalpanel), a game server orchestration platform for Kubernetes.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+

## Installation

### Add the Helm repository (if published)

```bash
helm repo add nautikalpanel https://charts.nautikalpanel.io
helm repo update
```

### Install the chart

```bash
# Install into the default namespace
helm install my-nautikalpanel nautikalpanel/nautikalpanel

# Install into a specific namespace
helm install my-nautikalpanel nautikalpanel/nautikalpanel --namespace nautikalpanel --create-namespace

# Install from local directory
helm install my-nautikalpanel ./charts/nautikalpanel
```

### Upgrade the chart

```bash
helm upgrade my-nautikalpanel nautikalpanel/nautikalpanel
```

### Uninstall the chart

```bash
helm uninstall my-nautikalpanel
```

## Configuration

The following table lists the configurable parameters of the Nautikalpanel chart and their default values.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `1` |
| `image.repository` | Image repository | `nautikalpanel/nautikalpanel` |
| `image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `image.tag` | Image tag (overrides Chart.AppVersion) | `""` |
| `imagePullSecrets` | Image pull secrets | `[]` |
| `nameOverride` | Override name | `""` |
| `fullnameOverride` | Override full name | `""` |
| `serviceAccount.create` | Create service account | `true` |
| `serviceAccount.annotations` | Service account annotations | `{}` |
| `serviceAccount.name` | Service account name | `""` |
| `podAnnotations` | Pod annotations | `{}` |
| `podSecurityContext` | Pod security context | `{}` |
| `securityContext` | Container security context | `{}` |
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `80` |
| `service.targetPort` | Container target port | `9090` |
| `ingress.enabled` | Enable ingress | `false` |
| `ingress.className` | Ingress class name | `""` |
| `ingress.annotations` | Ingress annotations | `{}` |
| `ingress.hosts` | Ingress hosts | See values.yaml |
| `ingress.tls` | Ingress TLS configuration | `[]` |
| `resources` | Resource limits/requests | `{}` |
| `autoscaling.enabled` | Enable autoscaling | `false` |
| `autoscaling.minReplicas` | Minimum replicas | `1` |
| `autoscaling.maxReplicas` | Maximum replicas | `100` |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU utilization | `80` |
| `nodeSelector` | Node selector | `{}` |
| `tolerations` | Tolerations | `[]` |
| `affinity` | Affinity rules | `{}` |
| `persistence.enabled` | Enable persistence | `true` |
| `persistence.storageClass` | Storage class | `""` |
| `persistence.accessMode` | Access mode | `ReadWriteOnce` |
| `persistence.size` | Storage size | `10Gi` |
| `config.server.host` | Server host | `0.0.0.0` |
| `config.server.port` | Server port | `9090` |
| `config.kubernetes.namespace` | Kubernetes namespace for game servers | `nautikal` |
| `config.kubernetes.createNamespace` | Create namespace if it doesn't exist | `true` |
| `config.kubernetes.defaultStorageClass` | Default storage class for game servers | `""` |
| `config.kubernetes.initTemplate` | Initial template path | `default/init.yaml.jinja` |
| `config.kubernetes.podTemplate` | Pod template path | `default/pod_template.yaml.jinja` |
| `config.database.path` | Database path | `/data/db` |
| `config.database.namespace` | Database namespace | `nautikal` |
| `config.database.name` | Database name | `nautikal` |
| `config.paths.k8sTemplates` | Kubernetes templates directory | `/templates/k8s-templates` |
| `config.paths.gameServerTemplates` | Game server templates directory | `/templates/game-server-templates` |
| `githubToken` | GitHub token for template repositories | `""` |
| `existingSecret` | Name of existing secret for GitHub token | `""` |

### Example: Custom values file

Create a `custom-values.yaml` file:

```yaml
replicaCount: 2

persistence:
  storageClass: fast-ssd
  size: 20Gi

ingress:
  enabled: true
  className: nginx
  hosts:
    - host: nautikalpanel.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - hosts:
        - nautikalpanel.example.com
      secretName: nautikalpanel-tls

config:
  kubernetes:
    defaultStorageClass: fast-ssd
```

Install with custom values:

```bash
helm install my-nautikalpanel ./charts/nautikalpanel -f custom-values.yaml
```

### Example: Using GitHub token

If you need to fetch templates from private GitHub repositories:

```yaml
githubToken: your_github_token_here
```

Or use an existing secret:

```yaml
existingSecret: my-github-secret
```

The secret should contain a key named `github-token` with the GitHub token value.

## RBAC

The chart creates a `ClusterRole` and `ClusterRoleBinding` with the following permissions:

- `get`, `list`, `create` on `namespaces`
- `get`, `list`, `watch`, `create`, `update`, `patch`, `delete` on `pods`, `services`, `persistentvolumeclaims`, `secrets`
- `get` on `pods/log`
- `get`, `list`, `watch` on `events`

These permissions are required for Nautikalpanel to manage game server resources.

## Persistence

By default, the chart creates a PVC for storing the SurrealDB database. The PVC can be customized via the `persistence` values.

## Accessing Nautikalpanel

### Using port-forward

```bash
kubectl port-forward svc/my-nautikalpanel 8080:80
```

Then access at http://localhost:8080

### Using LoadBalancer service

Update `values.yaml`:

```yaml
service:
  type: LoadBalancer
```

Then get the external IP:

```bash
kubectl get svc my-nautikalpanel
```

### Using Ingress

Enable ingress in `values.yaml` and configure your ingress controller.

## Building from source

If you want to build the Docker image locally:

```bash
# Build the Rust application
cargo build --release

# Build the Docker image
docker build -t nautikalpanel/nautikalpanel:local .
```

Then use the local image:

```bash
helm install my-nautikalpanel ./charts/nautikalpanel --set image.tag=local
```

## Upgrading

When upgrading to a new version, always review the `values.yaml` file for any new or changed parameters.

## Troubleshooting

Check the pod logs:

```bash
kubectl logs -f deployment/my-nautikalpanel
```

Check the pod status:

```bash
kubectl get pods -l app.kubernetes.io/name=nautikalpanel
```

Describe the pod for more information:

```bash
kubectl describe pod <pod-name>
```

## License

This chart is licensed under the same license as Nautikalpanel.
