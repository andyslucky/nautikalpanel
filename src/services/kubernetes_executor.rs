use crate::app_config::AppConfig;
use crate::models::{
    GAME_SERVER_ID_LABEL, GAME_SERVER_SPEC_ANNOTATION, GameServer, GameServerInstance,
    MANAGED_BY_LABEL, MANAGED_BY_VALUE, POD_TYPE_GAMESERVER, RESOURCE_TYPE_GAME_SERVER,
    RESOURCE_TYPE_LABEL, SftpCredentials,
};
use anyhow::anyhow;
use futures_util::io::Lines;
use futures_util::{AsyncBufRead, AsyncBufReadExt, Stream};
use k8s_openapi::api::apps::v1::StatefulSet;
use k8s_openapi::api::core::v1::{PersistentVolumeClaim, Pod, Secret, Service};
use kube::ResourceExt;
use kube::api::{Api, DeleteParams, ListParams, LogParams, Patch, PatchParams, PostParams};
use kube::runtime::watcher;
use kube::runtime::watcher::Event;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::error::Error;
use std::ops::Deref;
use std::str::FromStr;
use tracing::{info, warn};

use crate::utils::k8s_resource_generator::{
    build_game_server_stateful_set, build_gameserver_container, build_headless_service,
    build_load_balancer_service, build_pvc, build_sftp_credentials_secret,
    build_sftp_only_stateful_set, pvc_name_for_game_server,
};

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

    // ─── Labels & selectors ─────────────────────────────────────────

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
        let headless_svc_name = self.create_headless_service(&game_server_id).await?;

        // 3. Create the LoadBalancer Service for external access
        let _lb_svc = self
            .create_load_balancer_service(&game_server_id, game_server)
            .await?;

        // 4. Create the standalone PersistentVolumeClaim. The same PVC is then
        //    referenced by both the game-server StatefulSet below and the
        //    SFTP-only StatefulSet started on demand, so the SFTP server and the
        //    game server always operate on the same data.
        let pvc_name = self.create_pvc(&game_server_id, game_server).await?;

        // 5. Create the StatefulSet
        self.create_stateful_set(
            &game_server_id,
            game_server,
            &headless_svc_name,
            &secret_name,
            &pvc_name,
        )
        .await?;

        Ok(())
    }

    async fn create_headless_service(
        &self,
        game_server_id: &str,
    ) -> Result<String, Box<dyn Error>> {
        let svc = build_headless_service(&self.namespace, game_server_id);
        let name = svc
            .metadata
            .name
            .clone()
            .ok_or_else(|| anyhow!("built headless Service missing metadata.name"))?;

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
        let svc = build_load_balancer_service(&self.namespace, game_server_id, game_server);
        let name = svc
            .metadata
            .name
            .clone()
            .ok_or_else(|| anyhow!("built LoadBalancer Service missing metadata.name"))?;

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
        let secret =
            build_sftp_credentials_secret(&self.namespace, game_server_id, credentials, user_id);
        let name = secret
            .metadata
            .name
            .clone()
            .ok_or_else(|| anyhow!("built SFTP Secret missing metadata.name"))?;

        let secrets: Api<Secret> = Api::namespaced(self.client.clone(), &self.namespace);
        secrets.create(&PostParams::default(), &secret).await?;
        info!("Created SFTP credentials Secret: {}", name);
        Ok(name)
    }

    async fn create_pvc(
        &self,
        game_server_id: &str,
        game_server: &GameServer,
    ) -> Result<String, Box<dyn Error>> {
        // The PVC must exist before either StatefulSet can mount it; reuse the
        // standard set of labels so delete_pvcs (label selector) picks it up.
        let labels = crate::utils::k8s_resource_generator::standard_labels_with_type(
            game_server_id,
            RESOURCE_TYPE_GAME_SERVER,
            POD_TYPE_GAMESERVER,
        );
        let pvc = build_pvc(
            &self.namespace,
            game_server_id,
            game_server,
            &labels,
            self.config.kubernetes.default_storage_class.as_deref(),
        );
        let name = pvc
            .metadata
            .name
            .clone()
            .ok_or_else(|| anyhow!("built PersistentVolumeClaim missing metadata.name"))?;

        let pvc_api: Api<PersistentVolumeClaim> =
            Api::namespaced(self.client.clone(), &self.namespace);
        pvc_api.create(&PostParams::default(), &pvc).await?;
        info!("Created PersistentVolumeClaim: {}", name);
        Ok(name)
    }

    async fn create_stateful_set(
        &self,
        game_server_id: &str,
        game_server: &GameServer,
        headless_svc_name: &str,
        sftp_secret_name: &str,
        pvc_name: &str,
    ) -> Result<StatefulSet, Box<dyn Error>> {
        let sts = build_game_server_stateful_set(
            &self.namespace,
            game_server_id,
            game_server,
            headless_svc_name,
            sftp_secret_name,
            pvc_name,
        )?;

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
                // The PVC was created explicitly during init_game_server and
                // is the same one the game-server StatefulSet mounts, so the
                // SFTP server sees the same data the game server will see on
                // its next start.
                let pvc_name = pvc_name_for_game_server(&game_server_id);

                let sts = build_sftp_only_stateful_set(
                    &self.namespace,
                    &game_server_id,
                    game_server,
                    &sftp_secret_name,
                    &pvc_name,
                );

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
            selector.push_str(&format!(
                ",{}={}",
                GAME_SERVER_ID_LABEL,
                game_server_id.deref()
            ));
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
            selector.push_str(&format!(
                ",{}={}",
                GAME_SERVER_ID_LABEL,
                game_server_id.deref()
            ));
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
            selector.push_str(&format!(
                ",{}={}",
                GAME_SERVER_ID_LABEL,
                game_server_id.deref()
            ));
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

        // Delete the game server StatefulSet (this also deletes its pods; the PVC was created
        // standalone and is removed separately below)
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

        // Delete the standalone PersistentVolumeClaim created for this game server
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

        // Update pod template fields that can change. We rebuild the
        // gameserver container from scratch (reusing the same builder used
        // when the StatefulSet was created) and replace it in place.
        let new_gameserver_container = build_gameserver_container(game_server)?;
        let mut sts_spec = sts.spec.unwrap();
        if let Some(template) = sts_spec.template.spec.as_mut() {
            for container in template.containers.iter_mut() {
                if container.name == "gameserver" {
                    *container = new_gameserver_container.clone();
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
    use super::*;
    use crate::models::{GameServer, PodConfig, PvcConfig, ServiceConfig};
    use k8s_openapi::api::apps::v1::StatefulSet;
    use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
    use std::collections::BTreeMap;

    #[test]
    fn sanitize_game_type_basic() {
        assert_eq!(sanitize_game_type("Minecraft"), "minecraft");
        assert_eq!(sanitize_game_type("  Valheim  "), "valheim");
        assert_eq!(
            sanitize_game_type("ARK: Survival Evolved"),
            "ark--survival-evolved"
        );
        assert_eq!(sanitize_game_type("Star Citizen!!!"), "star-citizen---");
    }

    #[test]
    fn sanitize_game_type_truncated() {
        let long = "a".repeat(100);
        let result = sanitize_game_type(&long);
        assert_eq!(result.len(), 40);
        assert!(result.chars().all(|c| c == 'a' || c == '-'));
    }

    // Note: `standard_labels` and `standard_labels_with_type` builders are
    // now unit-tested in `src/utils/k8s_resource_generator.rs`.

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
        annotations.insert(
            GAME_SERVER_SPEC_ANNOTATION.to_string(),
            "not-json".to_string(),
        );
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
