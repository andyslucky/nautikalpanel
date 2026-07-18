//! Pure builders for the Kubernetes resource structs (`Service`, `Secret`,
//! `StatefulSet`, ...) used by [`crate::services::kubernetes_executor`].
//!
//! Every function in this module constructs a k8s object and returns it; none
//! of them talk to the cluster. The executor owns the API calls (`create`,
//! `patch`, ...) and delegates the struct assembly to the helpers here so the
//! payload logic stays isolated and independently testable.

use crate::models::{
    GAME_SERVER_ID_LABEL, GAME_SERVER_SPEC_ANNOTATION, GameServer, MANAGED_BY_LABEL,
    MANAGED_BY_VALUE, POD_TYPE_GAMESERVER, POD_TYPE_LABEL, POD_TYPE_SFTP_ONLY,
    RESOURCE_TYPE_GAME_SERVER, RESOURCE_TYPE_LABEL, RESOURCE_TYPE_SFTP, Resources,
    SECRET_TYPE_LABEL, SECRET_TYPE_SFTP, SftpCredentials,
};
use k8s_openapi::api::apps::v1::{StatefulSet, StatefulSetSpec};
use k8s_openapi::api::core::v1::{
    Container, EnvFromSource, EnvVar, PersistentVolumeClaim, PersistentVolumeClaimSpec,
    PersistentVolumeClaimVolumeSource, PodSecurityContext, PodSpec, PodTemplateSpec,
    ResourceRequirements, Secret, SecretEnvSource, Service, ServicePort, ServiceSpec, Volume,
    VolumeMount, VolumeResourceRequirements,
};
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use k8s_openapi::apimachinery::pkg::apis::meta::v1::{LabelSelector, ObjectMeta};
use k8s_openapi::apimachinery::pkg::util::intstr::IntOrString;
use std::collections::BTreeMap;
use tera::{Context, Tera};

// ─── Labels ───────────────────────────────────────────────────────────────

/// Standard labels applied to every Nautikal-managed resource.
pub fn standard_labels(game_server_id: &str) -> BTreeMap<String, String> {
    let mut labels = BTreeMap::new();
    labels.insert(MANAGED_BY_LABEL.to_string(), MANAGED_BY_VALUE.to_string());
    labels.insert(GAME_SERVER_ID_LABEL.to_string(), game_server_id.to_string());
    labels
}

/// Standard labels plus the resource-type and pod-type labels.
pub fn standard_labels_with_type(
    game_server_id: &str,
    resource_type: &str,
    pod_type: &str,
) -> BTreeMap<String, String> {
    let mut labels = standard_labels(game_server_id);
    labels.insert(RESOURCE_TYPE_LABEL.to_string(), resource_type.to_string());
    labels.insert(POD_TYPE_LABEL.to_string(), pod_type.to_string());
    labels
}

/// Reduce a full label set to the keys allowed in a StatefulSet selector.
/// StatefulSet selectors are immutable, so we limit them to the stable
/// identity labels (managed-by, game-server id, resource/pod type).
fn stateful_set_selector_labels(labels: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    labels
        .iter()
        .filter(|(k, _)| {
            matches!(
                k.as_str(),
                GAME_SERVER_ID_LABEL | MANAGED_BY_LABEL | RESOURCE_TYPE_LABEL | POD_TYPE_LABEL
            )
        })
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect()
}

// ─── Containers & PVC ────────────────────────────────────────────────────

// The PersistentVolumeClaim is created as a standalone resource (not a
// StatefulSet volumeClaimTemplate) so it can be shared between the game-server
// and SFTP-only StatefulSets — the user's SFTP uploads are exactly the data the
// game server boots from.

/// Translate a `Resources` spec (requests + limits) into k8s
/// `ResourceRequirements`. Empty when neither side is set.
fn build_resource_requirements(resources: &Resources) -> ResourceRequirements {
    let mut reqs = ResourceRequirements::default();
    if let Some(ref request) = resources.requests {
        let mut m = BTreeMap::new();
        if let Some(ref cpu) = request.cpu {
            m.insert("cpu".to_string(), Quantity(cpu.clone()));
        }
        if let Some(ref memory) = request.memory {
            m.insert("memory".to_string(), Quantity(memory.clone()));
        }
        reqs.requests = Some(m);
    }
    if let Some(ref limit) = resources.limits {
        let mut m = BTreeMap::new();
        if let Some(ref cpu) = limit.cpu {
            m.insert("cpu".to_string(), Quantity(cpu.clone()));
        }
        if let Some(ref memory) = limit.memory {
            m.insert("memory".to_string(), Quantity(memory.clone()));
        }
        reqs.limits = Some(m);
    }
    reqs
}

/// Build a fresh `gameserver` container from a [`GameServer`]'s pod config.
/// Reused both when the StatefulSet is first created and when it is patched
/// in [`crate::services::kubernetes_executor::KubernetesExecutor::update_stateful_set`].
pub fn build_gameserver_container(
    game_server: &GameServer,
) -> Result<Container, Box<dyn std::error::Error>> {
    let mut container = Container {
        name: "gameserver".to_string(),
        image: Some(game_server.pod_config.image.clone()),
        ..Default::default()
    };

    if let Some(ref resources) = game_server.pod_config.resources {
        container.resources = Some(build_resource_requirements(resources));
    }
    if let Some(ref cmd) = game_server.pod_config.command {
        container.command = Some(cmd.clone());
    }

    let mut tera = Tera::default();
    if let Some(ref env) = game_server.pod_config.env {
        for (k, v) in env {
            tera.add_raw_template(k.as_str(), v.as_str())?;
        }
        let mut ctx = Context::new();
        ctx.insert("server", game_server);
        container.env = Some(
            env.iter()
                .map(|(k, _v)| EnvVar {
                    name: k.clone(),
                    value: tera.render(k.as_str(), &ctx).ok(),
                    ..Default::default()
                })
                .collect(),
        );
    }

    container.volume_mounts = Some(vec![VolumeMount {
        name: "data".to_string(),
        mount_path: game_server.pvc_config.container_path.clone(),
        ..Default::default()
    }]);
    Ok(container)
}

/// Build the SFTP sidecar container. It mounts the same `data` volume and
/// pulls credentials from `sftp_secret_name` via `envFrom`.
pub fn build_sftp_container(sftp_secret_name: &str) -> Container {
    Container {
        name: "sftp".to_string(),
        image: Some("atmoz/sftp:latest".to_string()),
        volume_mounts: Some(vec![VolumeMount {
            name: "data".to_string(),
            mount_path: "/home/user/upload".to_string(),
            ..Default::default()
        }]),
        env_from: Some(vec![EnvFromSource {
            secret_ref: Some(SecretEnvSource {
                name: sftp_secret_name.to_string(),
                ..Default::default()
            }),
            ..Default::default()
        }]),
        ..Default::default()
    }
}

/// Canonical name of the `PersistentVolumeClaim` that backs a game server's
/// persistent storage. Both the game-server StatefulSet and the SFTP-only
/// StatefulSet reference the PVC with this name, so the SFTP server always
/// sees the same data the game server will see when it starts up.
pub fn pvc_name_for_game_server(game_server_id: &str) -> String {
    format!("{}-data", game_server_id)
}

/// Build the standalone `PersistentVolumeClaim` that backs a game server's
/// persistent storage. Created once during `init_game_server` and then
/// referenced by name from both the game-server StatefulSet (via `volumes`)
/// and the SFTP-only StatefulSet, avoiding Kubernetes' volumeClaimTemplate
/// naming (`data-<sts>-<ordinal>`) so the same PVC survives whatever runs
/// against it.
///
/// Storage class falls back to the cluster-wide default when neither the
/// game server nor the config specify one.
pub fn build_pvc(
    namespace: &str,
    game_server_id: &str,
    game_server: &GameServer,
    labels: &BTreeMap<String, String>,
    default_storage_class: Option<&str>,
) -> PersistentVolumeClaim {
    let mut pvc_spec = PersistentVolumeClaimSpec {
        access_modes: Some(vec!["ReadWriteOnce".to_string()]),
        resources: Some(VolumeResourceRequirements {
            requests: Some({
                let mut m = BTreeMap::new();
                m.insert(
                    "storage".to_string(),
                    Quantity(format!(
                        "{}{}",
                        game_server.pvc_config.size, game_server.pvc_config.size_unit
                    )),
                );
                m
            }),
            limits: None,
        }),
        ..Default::default()
    };
    if let Some(ref storage_class) = game_server.pvc_config.storage_class {
        if !storage_class.is_empty() {
            pvc_spec.storage_class_name = Some(storage_class.clone());
        }
    } else if let Some(default_sc) = default_storage_class {
        pvc_spec.storage_class_name = Some(default_sc.to_string());
    }

    PersistentVolumeClaim {
        metadata: ObjectMeta {
            name: Some(pvc_name_for_game_server(game_server_id)),
            namespace: Some(namespace.to_string()),
            labels: Some(labels.clone()),
            ..Default::default()
        },
        spec: Some(pvc_spec),
        ..Default::default()
    }
}

// ─── Services ─────────────────────────────────────────────────────────────

/// Build the headless `Service` that backs a StatefulSet (gives pods stable
/// DNS names).
pub fn build_headless_service(namespace: &str, game_server_id: &str) -> Service {
    let name = format!("{}-headless", game_server_id);
    let labels = standard_labels(game_server_id);

    let mut selector = BTreeMap::new();
    selector.insert(GAME_SERVER_ID_LABEL.to_string(), game_server_id.to_string());
    selector.insert(MANAGED_BY_LABEL.to_string(), MANAGED_BY_VALUE.to_string());

    Service {
        metadata: ObjectMeta {
            name: Some(name),
            namespace: Some(namespace.to_string()),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(ServiceSpec {
            cluster_ip: Some("None".to_string()),
            selector: Some(selector),
            type_: Some("ClusterIP".to_string()),
            ..Default::default()
        }),
        ..Default::default()
    }
}

/// Build the `ServicePort` list for the load-balancer Service: SFTP on port 22
/// plus the game's declared ports, splitting `Both` into separate TCP/UDP
/// entries.
fn build_load_balancer_service_ports(game_server: &GameServer) -> Vec<ServicePort> {
    let mut ports = vec![ServicePort {
        port: 22,
        target_port: Some(IntOrString::Int(22)),
        protocol: Some("TCP".to_string()),
        name: Some("sftp".to_string()),
        ..Default::default()
    }];

    for sp in &game_server.service_config.ports {
        if sp.protocol == "Both" {
            ports.push(ServicePort {
                port: sp.port as i32,
                target_port: Some(IntOrString::Int(sp.port as i32)),
                protocol: Some("TCP".to_string()),
                name: Some(format!("{}-tcp", sp.port)),
                ..Default::default()
            });
            ports.push(ServicePort {
                port: sp.port as i32,
                target_port: Some(IntOrString::Int(sp.port as i32)),
                protocol: Some("UDP".to_string()),
                name: Some(format!("{}-udp", sp.port)),
                ..Default::default()
            });
        } else {
            ports.push(ServicePort {
                port: sp.port as i32,
                target_port: Some(IntOrString::Int(sp.port as i32)),
                protocol: Some(sp.protocol.clone()),
                name: Some(format!("{}-{}", sp.port, sp.protocol.to_lowercase())),
                ..Default::default()
            });
        }
    }
    ports
}

/// Build the external load-balancer `Service` exposing SFTP + the game ports.
pub fn build_load_balancer_service(
    namespace: &str,
    game_server_id: &str,
    game_server: &GameServer,
) -> Service {
    let name = format!("{}-lb", game_server_id);
    let labels = standard_labels(game_server_id);
    let selector = standard_labels(game_server_id);
    let ports = build_load_balancer_service_ports(game_server);

    Service {
        metadata: ObjectMeta {
            name: Some(name),
            namespace: Some(namespace.to_string()),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(ServiceSpec {
            type_: Some(game_server.service_config.service_type.clone()),
            selector: Some(selector),
            ports: Some(ports),
            ..Default::default()
        }),
        ..Default::default()
    }
}

// ─── Secrets ─────────────────────────────────────────────────────────────

/// Build the `Secret` holding SFTP credentials consumed by the SFTP sidecar
/// via the `SFTP_USERS` env var (atmoz/sftp format: `user:pass:uid:gid`).
pub fn build_sftp_credentials_secret(
    namespace: &str,
    game_server_id: &str,
    credentials: &SftpCredentials,
    user_id: u32,
) -> Secret {
    let mut labels = standard_labels(game_server_id);
    labels.insert(SECRET_TYPE_LABEL.to_string(), SECRET_TYPE_SFTP.to_string());

    let sftp_users = format!(
        "{}:{}:{}:{}",
        credentials.username, credentials.password, user_id, user_id
    );
    let mut data = BTreeMap::new();
    data.insert("SFTP_USERS".to_string(), sftp_users);

    let name = format!("{}-sftp-creds", game_server_id);
    Secret {
        metadata: ObjectMeta {
            name: Some(name),
            namespace: Some(namespace.to_string()),
            labels: Some(labels),
            ..Default::default()
        },
        string_data: Some(data),
        ..Default::default()
    }
}

// ─── StatefulSets ─────────────────────────────────────────────────────────

/// Build the game-server `StatefulSet`.
///
/// The StatefulSet starts with `replicas: 0`; the executor scales it up via
/// `start_server`. The full [`GameServer`] config is serialized to a JSON
/// annotation so it can be recovered later (see
/// [`crate::services::kubernetes_executor::KubernetesExecutor::game_server_from_stateful_set`]).
///
/// The PVC must already exist in the cluster (see [`build_pvc`]); it is
/// referenced by name via `volumes` rather than created dynamically via a
/// `volumeClaimTemplate` so the same PVC can be shared with the SFTP-only
/// StatefulSet.
pub fn build_game_server_stateful_set(
    namespace: &str,
    game_server_id: &str,
    game_server: &GameServer,
    headless_svc_name: &str,
    sftp_secret_name: &str,
    pvc_name: &str,
) -> Result<StatefulSet, Box<dyn std::error::Error>> {
    let labels = standard_labels_with_type(
        game_server_id,
        RESOURCE_TYPE_GAME_SERVER,
        POD_TYPE_GAMESERVER,
    );
    let selector_labels = stateful_set_selector_labels(&labels);
    let pod_labels = labels.clone();

    let gs_container = build_gameserver_container(game_server)?;
    let sftp_container = build_sftp_container(sftp_secret_name);

    let security_context = PodSecurityContext {
        fs_group: Some(game_server.user_id as i64),
        ..Default::default()
    };

    let mut annotations = BTreeMap::new();
    let gs_json = serde_json::to_string(game_server)?;
    annotations.insert(GAME_SERVER_SPEC_ANNOTATION.to_string(), gs_json);

    Ok(StatefulSet {
        metadata: ObjectMeta {
            name: Some(game_server_id.to_string()),
            namespace: Some(namespace.to_string()),
            labels: Some(labels),
            annotations: Some(annotations),
            ..Default::default()
        },
        spec: Some(StatefulSetSpec {
            service_name: Some(headless_svc_name.to_string()),
            replicas: Some(0),
            selector: LabelSelector {
                match_labels: Some(selector_labels),
                ..Default::default()
            },
            template: PodTemplateSpec {
                metadata: Some(ObjectMeta {
                    labels: Some(pod_labels),
                    ..Default::default()
                }),
                spec: Some(PodSpec {
                    security_context: Some(security_context),
                    containers: vec![gs_container, sftp_container],
                    volumes: Some(vec![Volume {
                        name: "data".to_string(),
                        persistent_volume_claim: Some(PersistentVolumeClaimVolumeSource {
                            claim_name: pvc_name.to_string(),
                            ..Default::default()
                        }),
                        ..Default::default()
                    }]),
                    ..Default::default()
                }),
            },
            ..Default::default()
        }),
        ..Default::default()
    })
}

/// Build the SFTP-only `StatefulSet` used by `start_sftp_server`. Unlike the
/// game-server StatefulSet, this one references an existing PVC by name (no
/// `volumeClaimTemplate`) and runs only the SFTP container.
pub fn build_sftp_only_stateful_set(
    namespace: &str,
    game_server_id: &str,
    game_server: &GameServer,
    sftp_secret_name: &str,
    pvc_name: &str,
) -> StatefulSet {
    let sftp_sts_name = format!("{}-sftp", game_server_id);
    let labels = standard_labels_with_type(game_server_id, RESOURCE_TYPE_SFTP, POD_TYPE_SFTP_ONLY);
    let selector_labels = stateful_set_selector_labels(&labels);
    let pod_labels = labels.clone();

    let sftp_container = build_sftp_container(sftp_secret_name);
    let security_context = PodSecurityContext {
        fs_group: Some(game_server.user_id as i64),
        ..Default::default()
    };

    StatefulSet {
        metadata: ObjectMeta {
            name: Some(sftp_sts_name),
            namespace: Some(namespace.to_string()),
            labels: Some(labels),
            ..Default::default()
        },
        spec: Some(StatefulSetSpec {
            service_name: Some(format!("{}-headless", game_server_id)),
            replicas: Some(1),
            selector: LabelSelector {
                match_labels: Some(selector_labels),
                ..Default::default()
            },
            template: PodTemplateSpec {
                metadata: Some(ObjectMeta {
                    labels: Some(pod_labels),
                    ..Default::default()
                }),
                spec: Some(PodSpec {
                    security_context: Some(security_context),
                    containers: vec![sftp_container],
                    volumes: Some(vec![Volume {
                        name: "data".to_string(),
                        persistent_volume_claim: Some(PersistentVolumeClaimVolumeSource {
                            claim_name: pvc_name.to_string(),
                            ..Default::default()
                        }),
                        ..Default::default()
                    }]),
                    ..Default::default()
                }),
            },
            ..Default::default()
        }),
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standard_labels_structure() {
        let labels = standard_labels("gs-123abc");
        assert_eq!(labels.get(MANAGED_BY_LABEL), Some(&"nautikal".to_string()));
        assert_eq!(
            labels.get(GAME_SERVER_ID_LABEL),
            Some(&"gs-123abc".to_string())
        );
        assert_eq!(labels.len(), 2);
    }

    #[test]
    fn standard_labels_with_type_structure() {
        let labels =
            standard_labels_with_type("gs-123abc", RESOURCE_TYPE_GAME_SERVER, POD_TYPE_GAMESERVER);
        assert_eq!(labels.get(MANAGED_BY_LABEL), Some(&"nautikal".to_string()));
        assert_eq!(
            labels.get(GAME_SERVER_ID_LABEL),
            Some(&"gs-123abc".to_string())
        );
        assert_eq!(
            labels.get(RESOURCE_TYPE_LABEL),
            Some(&"game-server".to_string())
        );
        assert_eq!(labels.get(POD_TYPE_LABEL), Some(&"gameserver".to_string()));
        assert_eq!(labels.len(), 4);
    }

    #[test]
    fn stateful_set_selector_drops_extra_labels() {
        let labels =
            standard_labels_with_type("gs-1", RESOURCE_TYPE_GAME_SERVER, POD_TYPE_GAMESERVER);
        let selector = stateful_set_selector_labels(&labels);
        assert!(selector.contains_key(GAME_SERVER_ID_LABEL));
        assert!(selector.contains_key(MANAGED_BY_LABEL));
        assert!(selector.contains_key(RESOURCE_TYPE_LABEL));
        assert!(selector.contains_key(POD_TYPE_LABEL));
        assert_eq!(selector.len(), 4);
    }
}
