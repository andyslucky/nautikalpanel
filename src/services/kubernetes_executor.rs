use crate::app_config::AppConfig;
use crate::game_servers::{GameServer, GameServerInstance, SftpCredentials};
use futures_util::io::Lines;
use futures_util::{AsyncBufRead, AsyncBufReadExt, StreamExt};
use k8s_openapi::api::core::v1::{Namespace, PersistentVolumeClaim, Pod, Secret, Service};
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
use kube::api::{
    ApiResource, DeleteParams, DynamicObject, GroupVersionKind, ListParams, LogParams, PostParams,
};
use kube::runtime::reflector::Lookup;
use kube::{Api, Client, ResourceExt};
use serde_json::Value;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::error::Error;
use std::ops::{Deref, Index};
use anyhow::anyhow;
use k8s_openapi::ByteString;
use tera::{Context, Filter, Tera};
use tracing::{error, info};

struct EvaluateTeraFn {
    tera: Tera,
    context: Context,
}

impl Filter for EvaluateTeraFn {
    fn filter(&self, value: &Value, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        if !value.is_string() {
            Err(tera::Error::msg(
                "evaluateTera may only be called on strings",
            ))
        } else {
            let string_val = value.as_str().unwrap();
            let mut tera = self.tera.clone();
            tera.add_raw_template("eval_temp", string_val)?;
            match tera.render("eval_temp", &self.context) {
                Ok(rendered_text) => Ok(Value::String(rendered_text)),
                Err(e) => {
                    error!("{:?}", e);
                    Err(e)
                }
            }
        }
    }

    fn is_safe(&self) -> bool {
        false
    }
}

pub struct KubernetesExecutor {
    client: Client,
    namespace: String,
    tera: Tera,
    config: AppConfig,
}

impl KubernetesExecutor {
    pub async fn new(
        client: Client,
        namespace: String,
        config: AppConfig,
    ) -> Result<KubernetesExecutor, Box<dyn Error>> {
        let mut tera = Tera::new(&format!("{}/**/*", config.paths.k8s_templates))?;
        if let Some(extra_dir) = &config.paths.extra_k8s_templates_dir {
            let extra_glob = format!("{}/**/*", extra_dir);
            match Tera::new(&extra_glob) {
                Ok(extra_tera) => {
                    tera.extend(&extra_tera)?;
                    info!("Loaded extra templates from: {}", extra_dir);
                }
                Err(e) => {
                    error!(
                        "Warning: Failed to load extra templates from {}: {}",
                        extra_dir, e
                    );
                }
            }
        }
        Ok(KubernetesExecutor {
            client,
            namespace,
            tera,
            config,
        })
    }

    pub async fn create_namespace_if_required(&self) -> Result<(), Box<dyn Error>> {
        let namespaces: Api<Namespace> = Api::all(self.client.clone());
        let new_namespace = Namespace {
            metadata: kube::api::ObjectMeta {
                name: Some(self.namespace.clone()),
                ..Default::default()
            },
            spec: None,
            status: None,
        };
        let pp = PostParams::default();
        match namespaces.create(&pp, &new_namespace).await {
            Err(kube::error::Error::Api(e)) if e.code == 409 => {
                info!("Namespace already exists");
            }
            Err(e) => {
                return Err(e.into());
            }
            Ok(_) => {
                info!("Created namespace {}", self.namespace);
            }
        };
        Ok(())
    }

    fn create_template_context(
        &self,
        game_server: &GameServer,
    ) -> Result<tera::Context, Box<dyn Error>> {
        let id = game_server
            .id
            .as_ref()
            .expect("Record Id must be set")
            .key()
            .to_string();
        let re = regex::Regex::new("[^a-zA-Z0-9]")?;
        let raw_game_type = game_server.game_type.trim();
        let mut game_type = re
            .replace(raw_game_type.to_lowercase().as_str(), "-")
            .to_string();
        if game_type.len() > 40 {
            game_type = game_type.index(..40).to_string()
        }
        let mut context = tera::Context::new();
        context.insert("gameType", game_type.as_str());
        context.insert("gameServerId", &id);
        context.insert("server", game_server);
        Ok(context)
    }

    fn render_pod(
        &self,
        game_server: &GameServer,
        persistent_volume_claim: Option<&PersistentVolumeClaim>,
        sftp_secret : &Secret
    ) -> Result<String, Box<dyn Error>> {
        let mut context = self.create_template_context(game_server)?;
        context.insert("sftpSecretName", &sftp_secret.name().ok_or_else(|| anyhow!("SFTP Secret name not available"))?);
        if let Some(pvc) = persistent_volume_claim {
            context.insert("pvc_name", &pvc.name())
        }
        let mut tera = self.tera.clone();
        tera.register_filter(
            "evaluateTera",
            EvaluateTeraFn {
                tera: tera.clone(),
                context: context.clone(),
            },
        );
        let pod_template = game_server.pod_template.as_ref().filter(|t| !t.is_empty()).unwrap_or(&self.config.kubernetes.pod_template);
        Ok(tera.render(pod_template.as_str(), &context)?)
    }

    fn render_init_yaml(&self, game_server: &GameServer) -> Result<String, Box<dyn Error>> {
        let mut context = self.create_template_context(game_server)?;
        context.insert("ports", &game_server.service_config.ports);
        if let Some(storage_class_name) = game_server.pvc_config.storage_class.as_ref()
            && storage_class_name.len() > 0
        {
            context.insert("storageClassName", storage_class_name);
        } else if let Some(default_storage_class) = &self.config.kubernetes.default_storage_class {
            context.insert("storageClassName", default_storage_class);
        }
        context.insert(
            "storage",
            &format!(
                "{}{}",
                game_server.pvc_config.size, game_server.pvc_config.size_unit
            ),
        );
        let mut tera = self.tera.clone();
        tera.register_filter(
            "evaluateTera",
            EvaluateTeraFn {
                tera: tera.clone(),
                context: context.clone(),
            },
        );

        let init_template = game_server.init_template.as_ref().filter(|t| !t.is_empty()).unwrap_or(&self.config.kubernetes.init_template);
        Ok(tera.render(init_template, &context)?)
    }


    fn render_sftp_pod(
        &self,
        game_server: &GameServer,
        persistent_volume_claim: Option<&PersistentVolumeClaim>,
        secret: &Secret,
    ) -> Result<String, Box<dyn Error>> {
        let mut context = self.create_template_context(game_server)?;
        if let Some(pvc) = persistent_volume_claim {
            context.insert("pvc_name", &pvc.name())
        }
        context.insert("sftpSecretName", &secret.name().ok_or_else(|| anyhow!("SFTP Secret name not available"))?);
        Ok(self.tera.render("default/sftp_only.yaml.jinja", &context)?)
    }

    pub async fn list_services(
        &self,
        game_server_id: Option<impl Deref<Target = str>>,
    ) -> Result<Vec<Service>, Box<dyn Error>> {
        let services: Api<Service> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let mut svc_list_params =
            ListParams::default().labels("app.kubernetes.io/managed-by=nautikal");
        if let Some(game_server_id) = game_server_id {
            svc_list_params = svc_list_params.labels(&format!(
                "nautikal.io/game-server-id={}",
                game_server_id.deref()
            ));
        }

        Ok(services
            .list(&svc_list_params)
            .await
            .map(|svcs| svcs.items)?)
    }

    pub async fn list_pods(
        &self,
        game_server_id: Option<impl Deref<Target = str>>,
    ) -> Result<Vec<Pod>, kube::Error> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let mut list_params = ListParams::default().labels("app.kubernetes.io/managed-by=nautikal");
        if let Some(game_server_id) = game_server_id {
            list_params = list_params.labels(&format!(
                "nautikal.io/game-server-id={}",
                game_server_id.deref()
            ));
        }
        let pods = pods.list(&list_params).await.map(|pods| pods.items)?;
        Ok(pods)
    }

    pub async fn list_pvcs(
        &self,
        game_server_id: Option<impl Deref<Target = str>>,
    ) -> Result<Vec<PersistentVolumeClaim>, Box<dyn Error>> {
        let pvc_api: Api<PersistentVolumeClaim> =
            Api::namespaced(self.client.clone(), self.namespace.as_str());
        let mut list_params = ListParams::default().labels("app.kubernetes.io/managed-by=nautikal");
        if let Some(game_server_id) = game_server_id {
            list_params = list_params.labels(&format!(
                "nautikal.io/game-server-id={}",
                game_server_id.deref()
            ));
        }
        let pvcs = pvc_api.list(&list_params).await.map(|pvcs| pvcs.items)?;
        Ok(pvcs)
    }

    pub async fn init_game_server(&self, game_server: &GameServer) -> Result<(), Box<dyn Error>> {
        let init_yaml = self.render_init_yaml(game_server)?;
        tracing::debug!(
            "Init YAML for game server name: {}; game server id: {:?}",
            game_server.name,
            game_server.id_string()
        );
        tracing::debug!("{}", init_yaml);
        let docs: Vec<DynamicObject> = serde_saphyr::from_multiple(init_yaml.as_str())?;
        for doc in docs {
            let gvk = doc
                .types
                .as_ref()
                .and_then(|t| GroupVersionKind::try_from(t).ok())
                .unwrap();
            let api: Api<DynamicObject> = Api::namespaced_with(
                self.client.clone(),
                self.namespace.as_str(),
                &ApiResource::from_gvk(&gvk),
            );
            api.create(&PostParams::default(), &doc).await?;
        }
        Ok(())
    }

    pub async fn create_pod(&self, game_server: &GameServer) -> Result<(Pod, SftpCredentials), Box<dyn Error>> {
        let credentials = SftpCredentials::generate();
        let secret = self.create_sftp_credentials_secret(game_server, &credentials).await?;
        let pvcs = self.list_pvcs(game_server.id_string()).await?;
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let pod_yaml = self.render_pod(game_server, pvcs.first(), &secret)?;
        tracing::debug!(
            "Yaml for pod (game server name: {}; game server id: {:?} )",
            game_server.name,
            game_server.id_string()
        );
        tracing::debug!("{}", pod_yaml);
        let pod: Pod = serde_saphyr::from_str(pod_yaml.as_str())?;
        let pod = pods.create(&PostParams::default(), &pod).await?;
        Ok((pod, credentials))
    }

    pub async fn create_sftp_pod(&self, game_server: &GameServer) -> Result<(Pod, SftpCredentials), Box<dyn Error>> {
        let credentials = SftpCredentials::generate();
        let secret = self.create_sftp_credentials_secret(game_server, &credentials).await?;
        let pvcs = self.list_pvcs(game_server.id_string()).await?;
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let pod_yaml = self.render_sftp_pod(game_server, pvcs.first(), &secret)?;
        tracing::debug!(
            "Yaml for SFTP pod (game server name: {}; game server id: {:?} )",
            game_server.name,
            game_server.id_string()
        );
        tracing::debug!("{}", pod_yaml);
        let pod: Pod = serde_saphyr::from_str(pod_yaml.as_str())?;
        let pod = pods.create(&PostParams::default(), &pod).await?;
        Ok((pod, credentials))
    }

    async fn create_sftp_credentials_secret(
        &self,
        game_server: &GameServer,
        credentials: &SftpCredentials,
    ) -> Result<Secret, Box<dyn Error>> {
        let game_server_id = game_server.id_string().unwrap();

        let mut labels: BTreeMap<String, String> = BTreeMap::new();
        labels.insert("app.kubernetes.io/managed-by".to_string(), "nautikal".to_string());
        labels.insert("nautikal.io/game-server-id".to_string(), game_server_id.clone());
        labels.insert("nautikal.io/secret-type".to_string(), "sftp-credentials".to_string());

        // TODO change hardcoded user id to be retrieved from the GameServer
        let uid = 1000;
        let gid = 1000;
        let sftp_users = format!("{}:{}:{}:{}", credentials.username, credentials.password, uid, gid);
        let mut data: BTreeMap<String, String> = BTreeMap::new();
        data.insert("SFTP_USERS".to_string(), sftp_users);

        let secret = Secret {
            metadata: ObjectMeta {
                generate_name: Some("sftp-creds-".to_string()),
                namespace: Some(self.namespace.clone()),
                labels: Some(labels),
                ..Default::default()
            },
            string_data: Some(data),
            ..Default::default()
        };

        let secrets: Api<Secret> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        Ok(secrets.create(&PostParams::default(), &secret).await?)
    }

    pub async fn get_sftp_credentials(&self, game_server_id: &str) -> Result<Option<SftpCredentials>, Box<dyn Error>> {
        let secrets: Api<Secret> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let list_params = ListParams::default().labels("app.kubernetes.io/managed-by=nautikal")
            .labels(format!("nautikal.io/game-server-id={}", game_server_id).as_str())
            .labels("nautikal.io/secret-type=sftp-credentials");
        let secret = secrets.list(&list_params).await?.items.into_iter().next();
        if let Some(s) = secret {
            Ok(Some(SftpCredentials::try_from(s)?))
        } else {
            Ok(None)
        }
    }

    fn create_gs_list_params(&self, game_server_id : &String) -> ListParams {
        ListParams::default()
            .labels("app.kubernetes.io/managed-by=nautikal")
            .labels(&format!("nautikal.io/game-server-id={}", game_server_id))
    }

    /// Deletes ephemeral resources for a Game Server which semantically is equivalent to stopping the server.
    pub async fn stop_server(&self, game_server_id : String) -> Result<(), Box<dyn Error>> {
        let list_params = self.create_gs_list_params(&game_server_id);
        self.delete_pods(game_server_id).await?;
        self.delete_credentials(&list_params.labels("nautikal.io/secret-type=sftp-credentials")).await?;
        Ok(())
    }

    /// Deletes all resources for a Game Server.
    pub async fn delete_game_server_resources(
        &self,
        game_server_id: String,
    ) -> Result<(), Box<dyn Error>> {
        let list_params = self.create_gs_list_params(&game_server_id);
        self.delete_services(&list_params).await?;
        self.delete_pods(game_server_id).await?;
        self.delete_credentials(&list_params).await?;
        self.delete_pvcs(&list_params).await?;
        Ok(())
    }

    async fn delete_credentials(&self, list_params: &ListParams) -> Result<(), Box<dyn Error>> {
        let secrets: Api<Secret> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        match secrets
            .delete_collection(&DeleteParams::default(), &list_params)
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
            .delete_collection(&DeleteParams::default(), &list_params)
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
            .delete_collection(&DeleteParams::default(), &list_params)
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

    async fn delete_pods(&self, game_server_id: String) -> Result<(), Box<dyn Error>> {
        let list_params = ListParams::default()
            .labels("app.kubernetes.io/managed-by=nautikal")
            .labels(&format!("nautikal.io/game-server-id={}", game_server_id));
        let pod_api: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        match pod_api
            .delete_collection(&DeleteParams::default(), &list_params)
            .await?
        {
            either::Left(list) => {
                let names: Vec<_> = list.iter().map(ResourceExt::name_any).collect();
                info!("Deleting collection of pods: {:?}", names);
            }
            either::Right(status) => {
                info!("Deleting collection of pods status: {}", status);
            }
        }
        Ok(())
    }
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game_servers::{PodConfig, PvcConfig, ResourceQuantities, Resources, ServiceConfig};
    use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;
    use std::str::FromStr;
    use surrealdb::RecordId;

    fn test_game_server() -> GameServer {
        GameServer {
            id: RecordId::from_str("game_server:abscda").ok(),
            icon_url: None,
            description: None,
            name: "".to_string(),
            game_type: "Minecraft".to_string(),
            game_version: "".to_string(),
            max_players: 0,
            pod_template: None,
            init_template: None,
            pod_config: PodConfig {
                image: "testimage".to_string(),
                resources: Some(Resources {
                    requests: Some(ResourceQuantities {
                        cpu: Some("100m".to_string()),
                        memory: Some("500Mi".to_string())
                    }),
                    limits: Some(ResourceQuantities {
                        cpu: Some("500m".to_string()),
                        memory: Some("1000Mi".to_string())
                    })
                }),
                command: None,
                env: Some(HashMap::from([
                    ("foo".to_string(), "bar".to_string()),
                    ("old".to_string(), "young".to_string()),
                ])),
                mounts: None,
            },
            service_config: ServiceConfig {
                ports: vec![],
                ip_address: None,
                service_type: "".to_string(),
            },
            pvc_config: PvcConfig {
                storage_class: None,
                container_path: "/data".to_string(),
                size: 2,
                size_unit: "Gi".to_string(),
            },
        }
    }
    #[tokio::test]
    async fn test_render_init_yaml() -> Result<(), Box<dyn Error>> {
        let config = AppConfig::load()?;
        let executor = KubernetesExecutor::new(
            kube::Client::try_default().await?,
            "nautikal".to_string(),
            config,
        )
        .await?;
        let game_server = test_game_server();
        let init_script = executor.render_init_yaml(&game_server)?;
        println!("{}", init_script);
        Ok(())
    }

    #[tokio::test]
    async fn test_render_pod_template_yaml() -> Result<(), Box<dyn Error>> {
        let config = AppConfig::load()?;
        let executor = KubernetesExecutor::new(
            kube::Client::try_default().await?,
            "nautikal".to_string(),
            config,
        )
        .await?;
        let game_server = test_game_server();
        let metadata: ObjectMeta = Default::default();
        let pvc = PersistentVolumeClaim {
            metadata: ObjectMeta {
                name: Some("some_pvc".to_string()),
                ..metadata
            },
            spec: None,
            status: None,
        };
        let test_secret : Secret = Secret {
            metadata: ObjectMeta {
                name: Some("some-secret".to_string()),
                ..ObjectMeta::default()
            },
            ..Secret::default()
        };
        let pod_script = executor.render_pod(&game_server, Some(&pvc), &test_secret)?;
        println!("{}", pod_script);
        let _pod: Pod = serde_saphyr::from_str(pod_script.as_str())?;
        Ok(())
    }
}
