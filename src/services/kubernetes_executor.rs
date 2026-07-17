use crate::app_config::AppConfig;
use crate::models::{
    GAME_SERVER_ID_LABEL, GAME_SERVER_SPEC_ANNOTATION, GameServer, GameServerInstance,
    MANAGED_BY_LABEL, MANAGED_BY_VALUE, POD_TYPE_GAMESERVER, POD_TYPE_LABEL, POD_TYPE_SFTP_ONLY,
    RESOURCE_TYPE_GAME_SERVER, RESOURCE_TYPE_LABEL, RESOURCE_TYPE_SFTP, SECRET_TYPE_LABEL,
    SECRET_TYPE_SFTP, SftpCredentials,
};
use anyhow::anyhow;
use futures_util::io::Lines;
use futures_util::{AsyncBufRead, AsyncBufReadExt, Stream};
use k8s_openapi::api::apps::v1::StatefulSet;
use k8s_openapi::api::core::v1::{
    EnvVar, PersistentVolumeClaim, Pod, Secret, Service,
};
use k8s_openapi::apimachinery::pkg::api::resource::Quantity;
use k8s_openapi::apimachinery::pkg::apis::meta::v1::{LabelSelector, ObjectMeta};
use kube::ResourceExt;
use kube::api::{Api, DeleteParams, ListParams, LogParams, Patch, PatchParams, PostParams};
use kube::runtime::watcher;
use kube::runtime::watcher::Event;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::error::Error;
use std::ops::Deref;
use std::str::FromStr;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize)]
pub struct PodMetric {
    pub game_server_id: Option<String>,
    pub cpu_usage_millicores: f64,
    pub memory_usage_bytes: u64,
}

impl From<(Pod, Option<&(f64, u64)>)> for PodMetric {
    fn from(value: (Pod, Option<&(f64, u64)>)) -> Self {
        let game_server_id = value
            .0
            .metadata
            .labels
            .as_ref()
            .and_then(|labels| labels.get(GAME_SERVER_ID_LABEL).cloned());
        Self {
            game_server_id,
            cpu_usage_millicores: value.1.map(|o| o.0).unwrap_or(0.0),
            memory_usage_bytes: value.1.map(|o| o.1).unwrap_or(0),
        }
    }
}

#[derive(Deserialize)]
struct PrometheusDataPointMetric {
    pod: String,
    container: Option<String>,
}

#[derive(Deserialize)]
struct PrometheusDataPoint {
    metric: PrometheusDataPointMetric,
    value: Vec<Value>,
}

#[derive(Deserialize)]
struct PrometheusDataPayload {
    result: Vec<PrometheusDataPoint>,
}

#[derive(Deserialize)]
struct PrometheusQueryResponse {
    #[allow(dead_code)]
    status: String,
    data: PrometheusDataPayload,
}

pub struct KubernetesExecutor {
    client: kube::Client,
    namespace: String,
    config: AppConfig,
}

async fn check_namespace_exists(
    client: kube::Client,
    namespace: impl Deref<Target = str>,
) -> Result<(), Box<dyn Error>> {
    let ns: &str = namespace.as_ref();
    let pods: Api<Pod> = Api::namespaced(client, ns);
    match pods.list(&ListParams::default().limit(1)).await {
        Ok(_) => Ok(()),
        Err(kube::Error::Api(err)) if err.code == 403 => Err(anyhow!(
            "Permission denied for namespace '{}'. Check RBAC configuration.",
            ns
        )
        .into_boxed_dyn_error()),
        Err(kube::Error::Api(err)) if err.code == 404 => {
            Err(anyhow!("Namespace '{}' does not exist", ns).into_boxed_dyn_error())
        }
        Err(e) => {
            Err(anyhow!("Error checking namespace access '{}': {:?}", ns, e).into_boxed_dyn_error())
        }
    }
}

impl KubernetesExecutor {
    pub async fn new(
        client: kube::Client,
        namespace: String,
        config: AppConfig,
    ) -> Result<KubernetesExecutor, Box<dyn Error>> {
        let _ = check_namespace_exists(client.clone(), namespace.clone()).await?;
        Ok(KubernetesExecutor {
            client,
            namespace,
            config,
        })
    }

    // ─── Labels & selectors ─────────────────────────────────────────────

    fn standard_labels(game_server_id: &str) -> BTreeMap<String, String> {
        let mut labels = BTreeMap::new();
        labels.insert(MANAGED_BY_LABEL.to_string(), MANAGED_BY_VALUE.to_string());
        labels.insert(GAME_SERVER_ID_LABEL.to_string(), game_server_id.to_string());
        labels
    }

    fn standard_labels_with_type(
        game_server_id: &str,
        resource_type: &str,
        pod_type: &str,
    ) -> BTreeMap<String, String> {
        let mut labels = Self::standard_labels(game_server_id);
        labels.insert(RESOURCE_TYPE_LABEL.to_string(), resource_type.to_string());
        labels.insert(POD_TYPE_LABEL.to_string(), pod_type.to_string());
        labels
    }

    fn gs_list_params(&self, game_server_id: &str) -> ListParams {
        ListParams::default().labels(&format!(
            "{}={},{}={}",
            MANAGED_BY_LABEL, MANAGED_BY_VALUE, GAME_SERVER_ID_LABEL, game_server_id
        ))
    }

    // ─── Initialization: create StatefulSet + Service + SFTP Secret ─────

    /// Create the game server as a StatefulSet with an associated Service and
    /// SFTP credentials Secret. The full GameServer config is stored as a JSON
    /// annotation on the StatefulSet.
    pub async fn init_game_server(&self, game_server: &GameServer) -> Result<(), Box<dyn Error>> {
        let game_server_id = game_server
            .id_string()
            .ok_or_else(|| anyhow!("Game server must have an ID before initialization"))?;

        // 1. Create the SFTP credentials secret (generated once, persists for the lifetime of the game server)
        let credentials = SftpCredentials::generate();
        let secret_name = self
            .create_sftp_credentials_secret(&game_server_id, &credentials, game_server.user_id)
            .await?;

        // 2. Create the headless Service (required by StatefulSet for stable identity)
        let headless_svc_name = self
            .create_headless_service(&game_server_id, &game_server)
            .await?;

        // 3. Create the LoadBalancer Service for external access
        let _lb_svc = self
            .create_load_balancer_service(&game_server_id, game_server)
            .await?;

        // 4. Create the StatefulSet
        self.create_stateful_set(
            &game_server_id,
            game_server,
            &headless_svc_name,
            &secret_name,
        )
        .await?;

        Ok(())
    }

    async fn create_headless_service(
        &self,
        game_server_id: &str,
        game_server: &GameServer,
    ) -> Result<String, Box<dyn Error>> {
        let _game_type = sanitize_game_type(&game_server.game_type);
        let name = format!("{}-headless", game_server_id);
        let labels = Self::standard_labels(game_server_id);
        let _selector_labels = Self::standard_labels(game_server_id);

        let mut selector = BTreeMap::new();
        selector.insert(GAME_SERVER_ID_LABEL.to_string(), game_server_id.to_string());
        selector.insert(MANAGED_BY_LABEL.to_string(), MANAGED_BY_VALUE.to_string());

        let svc = Service {
            metadata: ObjectMeta {
                name: Some(name.clone()),
                namespace: Some(self.namespace.clone()),
                labels: Some(labels),
                ..Default::default()
            },
            spec: Some(k8s_openapi::api::core::v1::ServiceSpec {
                cluster_ip: Some("None".to_string()),
                selector: Some(selector),
                type_: Some("ClusterIP".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };

        let services: Api<Service> = Api::namespaced(self.client.clone(), &self.namespace);
        services.create(&PostParams::default(), &svc).await?;
        info!("Created headless Service: {}", name);
        Ok(name)
    }

    async fn create_load_balancer_service(
        &self,
        game_server_id: &str,
        game_server: &GameServer,
    ) -> Result<Service, Box<dyn Error>> {
        let name = format!("{}-lb", game_server_id);
        let labels = Self::standard_labels(game_server_id);
        let selector = Self::standard_labels(game_server_id);
        use k8s_openapi::apimachinery::pkg::util::intstr::IntOrString;
        // Build service ports: SFTP on 22 + game ports
        let mut ports = vec![k8s_openapi::api::core::v1::ServicePort {
            port: 22,
            target_port: Some(IntOrString::Int(22)),
            protocol: Some("TCP".to_string()),
            name: Some("sftp".to_string()),
            ..Default::default()
        }];

        for sp in &game_server.service_config.ports {
            if sp.protocol == "Both" {
                ports.push(k8s_openapi::api::core::v1::ServicePort {
                    port: sp.port as i32,
                    target_port: Some(IntOrString::Int(sp.port as i32)),
                    protocol: Some("TCP".to_string()),
                    name: Some(format!("{}-tcp", sp.port)),
                    ..Default::default()
                });
                ports.push(k8s_openapi::api::core::v1::ServicePort {
                    port: sp.port as i32,
                    target_port: Some(IntOrString::Int(sp.port as i32)),
                    protocol: Some("UDP".to_string()),
                    name: Some(format!("{}-udp", sp.port)),
                    ..Default::default()
                });
            } else {
                ports.push(k8s_openapi::api::core::v1::ServicePort {
                    port: sp.port as i32,
                    target_port: Some(IntOrString::Int(sp.port as i32)),
                    protocol: Some(sp.protocol.clone()),
                    name: Some(format!("{}-{}", sp.port, sp.protocol.to_lowercase())),
                    ..Default::default()
                });
            }
        }

        let svc = Service {
            metadata: ObjectMeta {
                name: Some(name.clone()),
                namespace: Some(self.namespace.clone()),
                labels: Some(labels),
                ..Default::default()
            },
            spec: Some(k8s_openapi::api::core::v1::ServiceSpec {
                type_: Some(game_server.service_config.service_type.clone()),
                selector: Some(selector),
                ports: Some(ports),
                ..Default::default()
            }),
            ..Default::default()
        };

        let services: Api<Service> = Api::namespaced(self.client.clone(), &self.namespace);
        let svc = services.create(&PostParams::default(), &svc).await?;
        info!("Created LoadBalancer Service: {}", name);
        Ok(svc)
    }

    async fn create_sftp_credentials_secret(
        &self,
        game_server_id: &str,
        credentials: &SftpCredentials,
        user_id: u32,
    ) -> Result<String, Box<dyn Error>> {
        let mut labels = Self::standard_labels(game_server_id);
        labels.insert(SECRET_TYPE_LABEL.to_string(), SECRET_TYPE_SFTP.to_string());

        let sftp_users = format!(
            "{}:{}:{}:{}",
            credentials.username, credentials.password, user_id, user_id
        );
        let mut data = BTreeMap::new();
        data.insert("SFTP_USERS".to_string(), sftp_users);

        let name = format!("{}-sftp-creds", game_server_id);
        let secret = Secret {
            metadata: ObjectMeta {
                name: Some(name.clone()),
                namespace: Some(self.namespace.clone()),
                labels: Some(labels),
                ..Default::default()
            },
            string_data: Some(data),
            ..Default::default()
        };

        let secrets: Api<Secret> = Api::namespaced(self.client.clone(), &self.namespace);
        secrets.create(&PostParams::default(), &secret).await?;
        info!("Created SFTP credentials Secret: {}", name);
        Ok(name)
    }

    async fn create_stateful_set(
        &self,
        game_server_id: &str,
        game_server: &GameServer,
        headless_svc_name: &str,
        sftp_secret_name: &str,
    ) -> Result<StatefulSet, Box<dyn Error>> {
        let labels = Self::standard_labels_with_type(
            game_server_id,
            RESOURCE_TYPE_GAME_SERVER,
            POD_TYPE_GAMESERVER,
        );

        // Selector must match the pod template labels
        let selector_labels: BTreeMap<String, String> = labels
            .iter()
            .filter(|(k, _)| {
                *k == GAME_SERVER_ID_LABEL
                    || *k == MANAGED_BY_LABEL
                    || *k == RESOURCE_TYPE_LABEL
                    || *k == POD_TYPE_LABEL
            })
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();

        let pod_labels = labels.clone();

        // Build the game server container
        let mut gs_container = k8s_openapi::api::core::v1::Container {
            name: "gameserver".to_string(),
            image: Some(game_server.pod_config.image.clone()),
            ..Default::default()
        };

        // Resources
        if let Some(ref resources) = game_server.pod_config.resources {
            let mut resource_reqs = k8s_openapi::api::core::v1::ResourceRequirements::default();
            if let Some(ref req) = resources.requests {
                let mut requests = BTreeMap::new();
                if let Some(ref cpu) = req.cpu {
                    requests.insert("cpu".to_string(), Quantity(cpu.clone()));
                }
                if let Some(ref memory) = req.memory {
                    requests.insert("memory".to_string(), Quantity(memory.clone()));
                }
                resource_reqs.requests = Some(requests);
            }
            if let Some(ref lim) = resources.limits {
                let mut limits = BTreeMap::new();
                if let Some(ref cpu) = lim.cpu {
                    limits.insert("cpu".to_string(), Quantity(cpu.clone()));
                }
                if let Some(ref memory) = lim.memory {
                    limits.insert("memory".to_string(), Quantity(memory.clone()));
                }
                resource_reqs.limits = Some(limits);
            }
            gs_container.resources = Some(resource_reqs);
        }

        // Command
        if let Some(ref cmd) = game_server.pod_config.command {
            gs_container.command = Some(cmd.clone());
        }

        // Env
        if let Some(ref env) = game_server.pod_config.env {
            gs_container.env = Some(
                env.iter()
                    .map(|(k, v)| EnvVar {
                        name: k.clone(),
                        value: Some(v.clone()),
                        ..Default::default()
                    })
                    .collect(),
            );
        }

        // Volume mount for the PVC
        gs_container.volume_mounts = Some(vec![k8s_openapi::api::core::v1::VolumeMount {
            name: "data".to_string(),
            mount_path: game_server.pvc_config.container_path.clone(),
            ..Default::default()
        }]);

        // Build the SFTP sidecar container
        let sftp_container = k8s_openapi::api::core::v1::Container {
            name: "sftp".to_string(),
            image: Some("atmoz/sftp:latest".to_string()),
            volume_mounts: Some(vec![k8s_openapi::api::core::v1::VolumeMount {
                name: "data".to_string(),
                mount_path: "/home/user/upload".to_string(),
                ..Default::default()
            }]),
            env_from: Some(vec![k8s_openapi::api::core::v1::EnvFromSource {
                secret_ref: Some(k8s_openapi::api::core::v1::SecretEnvSource {
                    name: sftp_secret_name.to_string(),
                    ..Default::default()
                }),
                ..Default::default()
            }]),
            ..Default::default()
        };

        // Build PVC claim template
        let mut pvc_spec = k8s_openapi::api::core::v1::PersistentVolumeClaimSpec {
            access_modes: Some(vec!["ReadWriteOnce".to_string()]),
            resources: Some(k8s_openapi::api::core::v1::VolumeResourceRequirements {
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
        } else if let Some(ref default_sc) = self.config.kubernetes.default_storage_class {
            pvc_spec.storage_class_name = Some(default_sc.clone());
        }

        let pvc_template = PersistentVolumeClaim {
            metadata: ObjectMeta {
                name: Some("data".to_string()),
                labels: Some(pod_labels.clone()),
                ..Default::default()
            },
            spec: Some(pvc_spec),
            ..Default::default()
        };

        // Security context
        let security_context = k8s_openapi::api::core::v1::PodSecurityContext {
            fs_group: Some(game_server.user_id as i64),
            ..Default::default()
        };

        // Store game server spec as annotation
        let mut annotations = BTreeMap::new();
        let gs_json = serde_json::to_string(game_server)?;
        annotations.insert(GAME_SERVER_SPEC_ANNOTATION.to_string(), gs_json);

        // Build the StatefulSet
        let sts = StatefulSet {
            metadata: ObjectMeta {
                name: Some(game_server_id.to_string()),
                namespace: Some(self.namespace.clone()),
                labels: Some(labels),
                annotations: Some(annotations),
                ..Default::default()
            },
            spec: Some(k8s_openapi::api::apps::v1::StatefulSetSpec {
                service_name: Some(headless_svc_name.to_string()),
                replicas: Some(0), // Start with 0 replicas; user calls "start" to scale up
                selector: LabelSelector {
                    match_labels: Some(selector_labels),
                    ..Default::default()
                },
                template: k8s_openapi::api::core::v1::PodTemplateSpec {
                    metadata: Some(ObjectMeta {
                        labels: Some(pod_labels),
                        ..Default::default()
                    }),
                    spec: Some(k8s_openapi::api::core::v1::PodSpec {
                        security_context: Some(security_context),
                        containers: vec![gs_container, sftp_container],
                        ..Default::default()
                    }),
                },
                volume_claim_templates: Some(vec![pvc_template]),
                ..Default::default()
            }),
            ..Default::default()
        };

        let sts_api: Api<StatefulSet> = Api::namespaced(self.client.clone(), &self.namespace);
        let sts = sts_api.create(&PostParams::default(), &sts).await?;
        info!("Created StatefulSet: {}", game_server_id);
        Ok(sts)
    }

    // ─── Start / Stop (scale replicas) ──────────────────────────────────

    pub async fn start_server(&self, game_server_id: &str) -> Result<(), Box<dyn Error>> {
        self.scale_stateful_set(game_server_id, 1).await
    }

    pub async fn stop_server(&self, game_server_id: &str) -> Result<(), Box<dyn Error>> {
        self.scale_stateful_set(game_server_id, 0).await?;
        // Also stop any SFTP-only StatefulSet if it exists
        let sftp_name = format!("{}-sftp", game_server_id);
        let sftp_api: Api<StatefulSet> = Api::namespaced(self.client.clone(), &self.namespace);
        match sftp_api.get(&sftp_name).await {
            Ok(_) => {
                self.scale_stateful_set(&sftp_name, 0).await?;
            }
            Err(kube::Error::Api(e)) if e.code == 404 => {}
            Err(e) => return Err(e.into()),
        }
        Ok(())
    }

    async fn scale_stateful_set(&self, name: &str, replicas: i32) -> Result<(), Box<dyn Error>> {
        let sts_api: Api<StatefulSet> = Api::namespaced(self.client.clone(), &self.namespace);
        let patch = serde_json::json!({ "spec": { "replicas": replicas } });
        let pp = PatchParams::default();
        sts_api.patch(name, &pp, &Patch::Merge(&patch)).await?;
        info!("Scaled StatefulSet {} to {} replicas", name, replicas);
        Ok(())
    }

    // ─── SFTP-only StatefulSet ──────────────────────────────────────────

    pub async fn start_sftp_server(&self, game_server: &GameServer) -> Result<(), Box<dyn Error>> {
        let game_server_id = game_server
            .id_string()
            .ok_or_else(|| anyhow!("Game server must have an ID"))?;

        let sftp_sts_name = format!("{}-sftp", game_server_id);
        let sftp_secret_name = format!("{}-sftp-creds", game_server_id);

        let sts_api: Api<StatefulSet> = Api::namespaced(self.client.clone(), &self.namespace);

        match sts_api.get(&sftp_sts_name).await {
            Ok(_) => {
                // Already exists, just scale up
                self.scale_stateful_set(&sftp_sts_name, 1).await?;
            }
            Err(kube::Error::Api(e)) if e.code == 404 => {
                // Need to create it. We need the PVC name from the game server's StatefulSet.
                // The PVC created by the game server's volumeClaimTemplate will be named:
                // data-<game_server_id>-0
                let pvc_name = format!("data-{}-0", game_server_id);

                let labels = Self::standard_labels_with_type(
                    &game_server_id,
                    RESOURCE_TYPE_SFTP,
                    POD_TYPE_SFTP_ONLY,
                );

                let selector_labels: BTreeMap<String, String> = labels
                    .iter()
                    .filter(|(k, _)| {
                        *k == GAME_SERVER_ID_LABEL
                            || *k == MANAGED_BY_LABEL
                            || *k == RESOURCE_TYPE_LABEL
                            || *k == POD_TYPE_LABEL
                    })
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();

                let pod_labels = labels.clone();

                let sftp_container = k8s_openapi::api::core::v1::Container {
                    name: "sftp".to_string(),
                    image: Some("atmoz/sftp:latest".to_string()),
                    volume_mounts: Some(vec![k8s_openapi::api::core::v1::VolumeMount {
                        name: "data".to_string(),
                        mount_path: "/home/user/upload".to_string(),
                        ..Default::default()
                    }]),
                    env_from: Some(vec![k8s_openapi::api::core::v1::EnvFromSource {
                        secret_ref: Some(k8s_openapi::api::core::v1::SecretEnvSource {
                            name: sftp_secret_name,
                            ..Default::default()
                        }),
                        ..Default::default()
                    }]),
                    ..Default::default()
                };

                let security_context = k8s_openapi::api::core::v1::PodSecurityContext {
                    fs_group: Some(game_server.user_id as i64),
                    ..Default::default()
                };

                // SFTP-only STS references the existing PVC by name (no volumeClaimTemplate)
                let sts = StatefulSet {
                    metadata: ObjectMeta {
                        name: Some(sftp_sts_name.clone()),
                        namespace: Some(self.namespace.clone()),
                        labels: Some(labels),
                        ..Default::default()
                    },
                    spec: Some(k8s_openapi::api::apps::v1::StatefulSetSpec {
                        service_name: Some(format!("{}-headless", game_server_id)),
                        replicas: Some(1),
                        selector: LabelSelector {
                            match_labels: Some(selector_labels),
                            ..Default::default()
                        },
                        template: k8s_openapi::api::core::v1::PodTemplateSpec {
                            metadata: Some(ObjectMeta {
                                labels: Some(pod_labels),
                                ..Default::default()
                            }),
                            spec: Some(k8s_openapi::api::core::v1::PodSpec {
                                security_context: Some(security_context),
                                containers: vec![sftp_container],
                                volumes: Some(vec![k8s_openapi::api::core::v1::Volume {
                                    name: "data".to_string(),
                                    persistent_volume_claim: Some(
                                        k8s_openapi::api::core::v1::PersistentVolumeClaimVolumeSource {
                                            claim_name: pvc_name,
                                            ..Default::default()
                                        },
                                    ),
                                    ..Default::default()
                                }]),
                                ..Default::default()
                            }),
                        },
                        ..Default::default()
                    }),
                    ..Default::default()
                };

                sts_api.create(&PostParams::default(), &sts).await?;
                info!("Created SFTP-only StatefulSet: {}", sftp_sts_name);
            }
            Err(e) => return Err(e.into()),
        }
        Ok(())
    }

    // ─── Listing ────────────────────────────────────────────────────────

    pub async fn list_stateful_sets(
        &self,
        game_server_id: Option<impl Deref<Target = str>>,
    ) -> Result<Vec<StatefulSet>, Box<dyn Error + Send + Sync>> {
        let sts_api: Api<StatefulSet> = Api::namespaced(self.client.clone(), &self.namespace);
        let mut selector = format!(
            "{}={},{}={}",
            MANAGED_BY_LABEL, MANAGED_BY_VALUE, RESOURCE_TYPE_LABEL, RESOURCE_TYPE_GAME_SERVER
        );
        if let Some(gs_id) = game_server_id {
            selector.push_str(&format!(",{}={}", GAME_SERVER_ID_LABEL, gs_id.deref()));
        }
        let list_params = ListParams::default().labels(&selector);
        Ok(sts_api.list(&list_params).await?.items)
    }

    pub async fn get_stateful_set(
        &self,
        game_server_id: &str,
    ) -> Result<Option<StatefulSet>, Box<dyn Error + Send + Sync>> {
        let sts_api: Api<StatefulSet> = Api::namespaced(self.client.clone(), &self.namespace);
        match sts_api.get(game_server_id).await {
            Ok(sts) => Ok(Some(sts)),
            Err(kube::Error::Api(e)) if e.code == 404 => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub async fn list_services(
        &self,
        game_server_id: Option<impl Deref<Target = str>>,
    ) -> Result<Vec<Service>, Box<dyn Error + Send + Sync>> {
        let services: Api<Service> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let mut selector = format!("{}={}", MANAGED_BY_LABEL, MANAGED_BY_VALUE);
        if let Some(game_server_id) = game_server_id {
            selector.push_str(&format!(",{}={}", GAME_SERVER_ID_LABEL, game_server_id.deref()));
        }
        let svc_list_params = ListParams::default().labels(&selector);
        Ok(services.list(&svc_list_params).await?.items)
    }

    pub async fn list_pods(
        &self,
        game_server_id: Option<impl Deref<Target = str>>,
    ) -> Result<Vec<Pod>, Box<dyn Error + Send + Sync>> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let mut selector = format!("{}={}", MANAGED_BY_LABEL, MANAGED_BY_VALUE);
        if let Some(game_server_id) = game_server_id {
            selector.push_str(&format!(",{}={}", GAME_SERVER_ID_LABEL, game_server_id.deref()));
        }
        let list_params = ListParams::default().labels(&selector);
        Ok(pods.list(&list_params).await?.items)
    }

    pub async fn list_pvcs(
        &self,
        game_server_id: Option<impl Deref<Target = str>>,
    ) -> Result<Vec<PersistentVolumeClaim>, Box<dyn Error>> {
        let pvc_api: Api<PersistentVolumeClaim> =
            Api::namespaced(self.client.clone(), self.namespace.as_str());
        let mut selector = format!("{}={}", MANAGED_BY_LABEL, MANAGED_BY_VALUE);
        if let Some(game_server_id) = game_server_id {
            selector.push_str(&format!(",{}={}", GAME_SERVER_ID_LABEL, game_server_id.deref()));
        }
        let list_params = ListParams::default().labels(&selector);
        Ok(pvc_api.list(&list_params).await?.items)
    }

    // ─── Delete ─────────────────────────────────────────────────────────

    pub async fn delete_game_server_resources(
        &self,
        game_server_id: String,
    ) -> Result<(), Box<dyn Error>> {
        // Delete the SFTP-only StatefulSet if it exists
        let sftp_name = format!("{}-sftp", game_server_id);
        let sts_api: Api<StatefulSet> = Api::namespaced(self.client.clone(), &self.namespace);
        match sts_api.get(&sftp_name).await {
            Ok(_) => {
                sts_api.delete(&sftp_name, &DeleteParams::default()).await?;
                info!("Deleted SFTP-only StatefulSet: {}", sftp_name);
            }
            Err(kube::Error::Api(e)) if e.code == 404 => {}
            Err(e) => return Err(e.into()),
        }

        // Delete the game server StatefulSet (this also deletes its pods; PVCs are handled separately)
        match sts_api.get(&game_server_id).await {
            Ok(_) => {
                sts_api
                    .delete(&game_server_id, &DeleteParams::default())
                    .await?;
                info!("Deleted StatefulSet: {}", game_server_id);
            }
            Err(kube::Error::Api(e)) if e.code == 404 => {
                warn!(
                    "StatefulSet {} not found, may have already been deleted",
                    game_server_id
                );
            }
            Err(e) => return Err(e.into()),
        }

        // Delete services
        let list_params = self.gs_list_params(&game_server_id);
        self.delete_services(&list_params).await?;

        // Delete SFTP credentials secret
        self.delete_credentials(&list_params).await?;

        // Delete PVCs (StatefulSet PVCs are not automatically deleted)
        self.delete_pvcs(&list_params).await?;

        Ok(())
    }

    async fn delete_credentials(&self, list_params: &ListParams) -> Result<(), Box<dyn Error>> {
        let secrets: Api<Secret> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        match secrets
            .delete_collection(&DeleteParams::default(), list_params)
            .await?
        {
            either::Left(list) => {
                let names: Vec<_> = list.iter().map(ResourceExt::name_any).collect();
                info!("Deleting collection of sftp secrets: {:?}", names);
            }
            either::Right(status) => {
                info!("Deleting collection of secrets status: {}", status);
            }
        }
        Ok(())
    }

    async fn delete_pvcs(&self, list_params: &ListParams) -> Result<(), Box<dyn Error>> {
        let pvc_api: Api<PersistentVolumeClaim> =
            Api::namespaced(self.client.clone(), self.namespace.as_str());
        match pvc_api
            .delete_collection(&DeleteParams::default(), list_params)
            .await?
        {
            either::Left(list) => {
                let names: Vec<_> = list.iter().map(ResourceExt::name_any).collect();
                info!("Deleting collection of pvcs: {:?}", names);
            }
            either::Right(status) => {
                info!("Deleting collection of pvcs status: {}", status);
            }
        }
        Ok(())
    }

    async fn delete_services(&self, list_params: &ListParams) -> Result<(), Box<dyn Error>> {
        let service_api: Api<Service> =
            Api::namespaced(self.client.clone(), self.namespace.as_str());
        match service_api
            .delete_collection(&DeleteParams::default(), list_params)
            .await?
        {
            either::Left(list) => {
                let names: Vec<_> = list.iter().map(ResourceExt::name_any).collect();
                info!("Deleting collection of services: {:?}", names);
            }
            either::Right(status) => {
                info!("Deleting collection of services status: {}", status);
            }
        }
        Ok(())
    }

    // ─── Update StatefulSet spec ─────────────────────────────────────────

    pub async fn update_stateful_set(
        &self,
        game_server_id: &str,
        game_server: &GameServer,
    ) -> Result<(), Box<dyn Error>> {
        let sts_api: Api<StatefulSet> = Api::namespaced(self.client.clone(), &self.namespace);
        let sts = sts_api
            .get(game_server_id)
            .await
            .map_err(|e| anyhow!("Failed to get StatefulSet for update: {}", e))?;

        // Update the annotation with the new game server spec
        let mut annotations = sts.metadata.annotations.clone().unwrap_or_default();
        let gs_json = serde_json::to_string(game_server)?;
        annotations.insert(GAME_SERVER_SPEC_ANNOTATION.to_string(), gs_json);

        // Update pod template fields that can change
        let mut sts_spec = sts.spec.unwrap();
        if let Some(template) = sts_spec.template.spec.as_mut() {
            // Find and update the gameserver container
            for container in template.containers.iter_mut() {
                if container.name == "gameserver" {
                    container.image = Some(game_server.pod_config.image.clone());
                    container.command = game_server.pod_config.command.clone();
                    container.env = game_server.pod_config.env.as_ref().map(|env| {
                        env.iter()
                            .map(|(k, v)| EnvVar {
                                name: k.clone(),
                                value: Some(v.clone()),
                                ..Default::default()
                            })
                            .collect()
                    });
                    container.resources = game_server.pod_config.resources.as_ref().map(|r| {
                        let mut req = k8s_openapi::api::core::v1::ResourceRequirements::default();
                        if let Some(ref requests) = r.requests {
                            let mut m = BTreeMap::new();
                            if let Some(ref cpu) = requests.cpu {
                                m.insert("cpu".to_string(), Quantity(cpu.clone()));
                            }
                            if let Some(ref memory) = requests.memory {
                                m.insert("memory".to_string(), Quantity(memory.clone()));
                            }
                            req.requests = Some(m);
                        }
                        if let Some(ref limits) = r.limits {
                            let mut m = BTreeMap::new();
                            if let Some(ref cpu) = limits.cpu {
                                m.insert("cpu".to_string(), Quantity(cpu.clone()));
                            }
                            if let Some(ref memory) = limits.memory {
                                m.insert("memory".to_string(), Quantity(memory.clone()));
                            }
                            req.limits = Some(m);
                        }
                        req
                    });
                    // Update volume mount path
                    container.volume_mounts = Some(vec![k8s_openapi::api::core::v1::VolumeMount {
                        name: "data".to_string(),
                        mount_path: game_server.pvc_config.container_path.clone(),
                        ..Default::default()
                    }]);
                }
            }
        }

        let patch = serde_json::json!({
            "metadata": {
                "annotations": annotations,
            },
            "spec": sts_spec,
        });
        let pp = PatchParams::default();
        sts_api
            .patch(game_server_id, &pp, &Patch::Merge(&patch))
            .await?;
        info!("Updated StatefulSet: {}", game_server_id);
        Ok(())
    }

    // ─── Extract GameServer from StatefulSet annotation ──────────────────

    pub fn game_server_from_stateful_set(sts: &StatefulSet) -> Option<GameServer> {
        let annotations = sts.metadata.annotations.as_ref()?;
        let gs_json = annotations.get(GAME_SERVER_SPEC_ANNOTATION)?;
        let mut gs: GameServer = serde_json::from_str(gs_json).ok()?;
        gs.id = Some(sts.name_any());
        Some(gs)
    }

    // ─── Logs ───────────────────────────────────────────────────────────

    pub async fn stream_logs(
        &self,
        game_server_instance: GameServerInstance,
    ) -> Result<Lines<impl AsyncBufRead>, kube::Error> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let log_params = LogParams {
            container: Some("gameserver".to_string()),
            follow: true,
            tail_lines: Some(100),
            ..Default::default()
        };
        Ok(pods
            .log_stream(game_server_instance.id.as_str(), &log_params)
            .await?
            .lines())
    }

    pub async fn get_logs(
        &self,
        game_server_instance: GameServerInstance,
    ) -> Result<String, kube::Error> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let log_params = LogParams {
            container: Some("gameserver".to_string()),
            follow: false,
            ..Default::default()
        };
        pods.logs(game_server_instance.id.as_str(), &log_params)
            .await
    }

    // ─── Pod watching ───────────────────────────────────────────────────

    pub fn stream_pod_changes(&self) -> impl Stream<Item = watcher::Result<Event<Pod>>> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let selector = format!("{}={}", MANAGED_BY_LABEL, MANAGED_BY_VALUE);
        watcher::watcher(pods, watcher::Config::default().labels(&selector))
    }

    // ─── SFTP credentials ──────────────────────────────────────────────

    pub async fn get_sftp_credentials(
        &self,
        game_server_id: &str,
    ) -> Result<Option<SftpCredentials>, Box<dyn Error>> {
        let secrets: Api<Secret> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let list_params = ListParams::default().labels(&format!(
            "{}={},{}={}",
            MANAGED_BY_LABEL, MANAGED_BY_VALUE, GAME_SERVER_ID_LABEL, game_server_id
        ));
        let secret = secrets.list(&list_params).await?.items.into_iter().next();
        if let Some(s) = secret {
            Ok(Some(SftpCredentials::try_from(s)?))
        } else {
            Ok(None)
        }
    }

    // ─── Metrics ────────────────────────────────────────────────────────

    pub async fn fetch_pod_metrics(
        &self,
        game_server_id: Option<&str>,
    ) -> Result<Vec<PodMetric>, Box<dyn Error + Send + Sync>> {
        let prometheus_url = &self.config.prometheus.url;

        let cpu_query = format!(
            "sum(rate(container_cpu_usage_seconds_total{{namespace=\"{}\", pod=~\".*\", container=\"gameserver\"}}[5m])) by (pod)",
            self.namespace
        );

        let memory_query = format!(
            "sum(max by (pod, container)(container_memory_working_set_bytes{{namespace=\"{}\", pod=~\".*\", container=\"gameserver\"}})) by (pod, container)",
            self.namespace
        );

        let cpu_url = format!(
            "{}/api/v1/query?query={}",
            prometheus_url,
            urlencoding::encode(&cpu_query)
        );

        let memory_url = format!(
            "{}/api/v1/query?query={}",
            prometheus_url,
            urlencoding::encode(&memory_query)
        );

        let http_client = reqwest::Client::new();

        let cpu_response = http_client.get(&cpu_url).send().await?;
        let memory_response = http_client.get(&memory_url).send().await?;
        let cpu_data: PrometheusQueryResponse = cpu_response.json().await?;
        let memory_data: PrometheusQueryResponse = memory_response.json().await?;

        let mut metrics_map: std::collections::HashMap<String, (f64, u64)> =
            std::collections::HashMap::new();
        for data in cpu_data.data.result {
            let pod_name = data.metric.pod;
            let value = data.value.get(1);
            let entry = metrics_map.entry(pod_name).or_insert((0.0, 0));
            if let Some(Value::String(str_val)) = value {
                entry.0 = f64::from_str(str_val)? * 1000.0;
            } else if let Some(Value::Number(n)) = value {
                entry.0 = n.as_f64().unwrap_or(0.0) * 1000.0;
            }
        }

        for data in memory_data
            .data
            .result
            .into_iter()
            .filter(|r| r.metric.container == Some("gameserver".to_string()))
        {
            let pod_name = data.metric.pod;
            let value = data.value.get(1);
            let entry = metrics_map.entry(pod_name).or_insert((0.0, 0));
            if let Some(Value::String(str_val)) = value {
                entry.1 = u64::from_str(str_val)?;
            } else if let Some(Value::Number(n)) = value {
                entry.1 = n.as_u64().unwrap_or(0);
            }
        }

        let pods = self.list_pods(game_server_id).await?;
        let metrics = pods
            .into_iter()
            .map(|p| {
                let metrics = p.name_any().to_string();
                let metrics_ref = metrics_map.get(&metrics);
                PodMetric::from((p, metrics_ref))
            })
            .collect();
        Ok(metrics)
    }
}

fn sanitize_game_type(game_type: &str) -> String {
    let re = regex::Regex::new("[^a-zA-Z0-9]").unwrap();
    let raw = game_type.trim().to_lowercase();
    let sanitized = re.replace_all(&raw, "-").to_string();
    if sanitized.len() > 40 {
        sanitized[..40].to_string()
    } else {
        sanitized
    }
}

#[cfg(test)]
mod tests {
    use crate::models::{GameServer, PodConfig, ServiceConfig, PvcConfig};
    use super::*;
    use k8s_openapi::api::apps::v1::StatefulSet;
    use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
    use std::collections::BTreeMap;

    #[test]
    fn sanitize_game_type_basic() {
        assert_eq!(sanitize_game_type("Minecraft"), "minecraft");
        assert_eq!(sanitize_game_type("  Valheim  "), "valheim");
        assert_eq!(sanitize_game_type("ARK: Survival Evolved"), "ark--survival-evolved");
        assert_eq!(sanitize_game_type("Star Citizen!!!"), "star-citizen---");
    }

    #[test]
    fn sanitize_game_type_truncated() {
        let long = "a".repeat(100);
        let result = sanitize_game_type(&long);
        assert_eq!(result.len(), 40);
        assert!(result.chars().all(|c| c == 'a' || c == '-'));
    }

    #[test]
    fn standard_labels_structure() {
        let labels = KubernetesExecutor::standard_labels("gs-123abc");
        assert_eq!(labels.get(MANAGED_BY_LABEL), Some(&"nautikal".to_string()));
        assert_eq!(labels.get(GAME_SERVER_ID_LABEL), Some(&"gs-123abc".to_string()));
    }

    #[test]
    fn standard_labels_with_type_structure() {
        let labels = KubernetesExecutor::standard_labels_with_type(
            "gs-123abc",
            RESOURCE_TYPE_GAME_SERVER,
            POD_TYPE_GAMESERVER,
        );
        assert_eq!(labels.get(MANAGED_BY_LABEL), Some(&"nautikal".to_string()));
        assert_eq!(labels.get(GAME_SERVER_ID_LABEL), Some(&"gs-123abc".to_string()));
        assert_eq!(labels.get(RESOURCE_TYPE_LABEL), Some(&"game-server".to_string()));
        assert_eq!(labels.get(POD_TYPE_LABEL), Some(&"gameserver".to_string()));
    }

    #[test]
    fn game_server_from_stateful_set_happy_path() {
        let gs = GameServer {
            id: Some("gs-abc123".to_string()),
            icon_url: None,
            description: None,
            name: "Test".to_string(),
            game_type: "minecraft".to_string(),
            game_version: "1.0".to_string(),
            max_players: 10,
            pod_config: PodConfig {
                image: "img".to_string(),
                resources: None,
                command: None,
                env: None,
                mounts: None,
            },
            service_config: ServiceConfig {
                ports: vec![],
                ip_address: None,
                service_type: "LoadBalancer".to_string(),
            },
            pvc_config: PvcConfig {
                storage_class: None,
                container_path: "/data".to_string(),
                size: 1,
                size_unit: "Gi".to_string(),
            },
            user_id: 1000,
        };
        let json = serde_json::to_string(&gs).unwrap();
        let mut annotations = BTreeMap::new();
        annotations.insert(GAME_SERVER_SPEC_ANNOTATION.to_string(), json);
        let sts = StatefulSet {
            metadata: ObjectMeta {
                name: Some("gs-abc123".to_string()),
                annotations: Some(annotations),
                ..Default::default()
            },
            ..Default::default()
        };
        let result = KubernetesExecutor::game_server_from_stateful_set(&sts);
        assert!(result.is_some());
        let parsed = result.unwrap();
        assert_eq!(parsed.id, Some("gs-abc123".to_string()));
        assert_eq!(parsed.name, "Test");
        assert_eq!(parsed.game_type, "minecraft");
    }

    #[test]
    fn game_server_from_stateful_set_missing_annotation() {
        let sts = StatefulSet {
            metadata: ObjectMeta {
                name: Some("gs-nope".to_string()),
                annotations: None,
                ..Default::default()
            },
            ..Default::default()
        };
        assert!(KubernetesExecutor::game_server_from_stateful_set(&sts).is_none());
    }

    #[test]
    fn game_server_from_stateful_set_bad_json() {
        let mut annotations = BTreeMap::new();
        annotations.insert(GAME_SERVER_SPEC_ANNOTATION.to_string(), "not-json".to_string());
        let sts = StatefulSet {
            metadata: ObjectMeta {
                name: Some("gs-bad".to_string()),
                annotations: Some(annotations),
                ..Default::default()
            },
            ..Default::default()
        };
        assert!(KubernetesExecutor::game_server_from_stateful_set(&sts).is_none());
    }
}
