# Nautikalpanel Helm Chart

This Helm chart installs [Nautikalpanel](https://github.com/andyslucky/nautikalpanel), a game server orchestration platform for Kubernetes.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.8+ (OCI support required)

## Installation

### OCI (recommended)

```bash
helm install nautikalpanel oci://ghcr.io/andyslucky/nautikalpanel --version 0.2.2
```

### Install from local directory

```bash
helm dependency build charts/nautikalpanel
helm install my-nautikalpanel ./charts/nautikalpanel
```

### Install into a specific namespace

```bash
helm install my-nautikalpanel oci://ghcr.io/andyslucky/nautikalpanel \
  --namespace nautikal --create-namespace
```

### Upgrade the chart

```bash
helm upgrade my-nautikalpanel oci://ghcr.io/andyslucky/nautikalpanel
```

### Uninstall the chart

```bash
helm uninstall my-nautikalpanel
```

## Configuration

The chart uses the [bjw-s common library](https://github.com/bjw-s-labs/helm-charts/tree/main/charts/library/common) for standard Kubernetes resources. See the [common library documentation](https://bjw-s.github.io/helm-charts/docs/common-library/) for details on `controllers`, `service`, `ingress`, `persistence`, and `serviceAccount` schemas.

The following table lists the Nautikalpanel-specific parameters.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `config.server.host` | Server bind address | `0.0.0.0` |
| `config.server.port` | Server port | `9090` |
| `config.kubernetes.namespace` | Target namespace for game server resources | `nautikal` |
| `config.kubernetes.defaultStorageClass` | Default storage class for game servers | `""` |
| `config.paths.gameServerTemplates` | Game server templates directory | `""` |
| `config.prometheus.url` | Prometheus URL for metrics | `http://kube-prometheus-stack-prometheus.prometheus.svc.cluster.local:9090` |
| `config.prometheus.pollRateSeconds` | Prometheus polling interval | `10` |
| `githubToken.existingSecret` | Name of existing secret containing GitHub token | `""` |
| `githubToken.existingSecretKey` | Key in the secret containing the token | `github-token` |
| `rbac.clusterScoped` | Use `ClusterRole` (true) or namespace-scoped `Role` (false) | `true` |

### Standard bjw-s parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| `controllers.main.type` | Controller type | `deployment` |
| `controllers.main.replicas` | Number of replicas | `1` |
| `controllers.main.containers.main.image.repository` | Image repository | `ghcr.io/andyslucky/nautikalpanel` |
| `controllers.main.containers.main.image.tag` | Image tag (falls back to `appVersion` if empty) | `""` |
| `controllers.main.containers.main.image.pullPolicy` | Image pull policy | `IfNotPresent` |
| `service.main.type` | Service type | `ClusterIP` |
| `service.main.ports.http.port` | Service port | `80` |
| `ingress.main.enabled` | Enable ingress | `false` |
| `persistence.data.enabled` | Enable persistence | `true` |
| `persistence.data.type` | Persistence type | `persistentVolumeClaim` |
| `persistence.data.size` | PVC size | `10Gi` |
| `persistence.data.storageClass` | Storage class | `""` |
| `serviceAccount.main.enabled` | Create service account | `true` |

## RBAC

By default, the chart creates a `ClusterRole` and `ClusterRoleBinding`. This is required if Nautikalpanel manages game servers in a different namespace than the one it is deployed in.

To use a namespace-scoped `Role` instead (more restrictive):

```yaml
rbac:
  clusterScoped: false
```

This will create a `Role` and `RoleBinding` within the release namespace only. The app will still need access to the target namespace defined in `config.kubernetes.namespace`. If that namespace differs from the release namespace, keep `clusterScoped: true`.

### Permissions

The role grants the following permissions:

- `get`, `list`, `watch`, `create`, `update`, `patch`, `delete`, `deletecollection` on `pods`, `services`, `persistentvolumeclaims`, `secrets`, `configmaps`
- `get`, `list`, `watch`, `create`, `update`, `patch`, `delete`, `deletecollection` on `statefulsets`
- `get`, `watch`, `list` on `pods/log`
- `get`, `list`, `watch` on `events`

## Security: GitHub Token

**Never set a GitHub token via a plaintext value.** The chart only supports reading the token from an existing Kubernetes secret:

```yaml
githubToken:
  existingSecret: my-github-secret
  existingSecretKey: github-token  # default
```

Create the secret beforehand:

```bash
kubectl create secret generic my-github-token \
  --from-literal=github-token=YOUR_TOKEN_HERE
```

## Persistence

By default, the chart creates a 10Gi PVC mounted at `/data`. Customize via `persistence.data.*`.

## Example: Custom values file

Create a `custom-values.yaml` file:

```yaml
controllers:
  main:
    replicas: 2

persistence:
  data:
    storageClass: fast-ssd
    size: 20Gi

ingress:
  main:
    enabled: true
    className: nginx
    hosts:
      - host: nautikalpanel.example.com
        paths:
          - path: /
            pathType: Prefix
            service:
              identifier: main
              port: http
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
helm install my-nautikalpanel oci://ghcr.io/andyslucky/nautikalpanel -f custom-values.yaml
```

## Accessing Nautikalpanel

### Using port-forward

```bash
kubectl port-forward svc/my-nautikalpanel 8080:80
```

Then access at http://localhost:8080

### Using Ingress

Enable ingress in `values.yaml` and configure your ingress controller.

### Check deployment status

```bash
kubectl rollout status deployment/my-nautikalpanel
```

## Troubleshooting

Check the pod logs:

```bash
kubectl logs -f deployment/my-nautikalpanel
```

Describe the pod for more information:

```bash
kubectl describe pod <pod-name>
```

## License

This chart is licensed under the same license as Nautikalpanel.
