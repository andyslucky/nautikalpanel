use crate::game_servers::{GameServer, GameServerInstance, GameServerNetworkIdentity};
use k8s_openapi::api::core::v1::{Namespace, Pod, Service};
use kube::api::{DeleteParams, ListParams, PostParams};
use kube::{Api, Client};
use std::collections::HashMap;
use std::error::Error;
use std::ops::Index;
use tera::Tera;

pub struct KubernetesExecutor {
    client: Client,
    namespace: String,
    tera: Tera,
}

impl KubernetesExecutor {
    pub async fn new(
        client: Client,
        namespace: String,
    ) -> Result<KubernetesExecutor, Box<dyn Error>> {
        let namespaces: Api<Namespace> = Api::all(client.clone());
        let new_namespace = Namespace {
            metadata: kube::api::ObjectMeta {
                name: Some(namespace.clone()),
                ..Default::default()
            },
            spec: None,   // Namespace spec is rarely used
            status: None, // Status is ignored on creation
        };
        let pp = PostParams::default();
        match namespaces.create(&pp, &new_namespace).await {
            Err(kube::error::Error::Api(e)) if e.code == 409 => {
                println!("Namespace already exists");
            }
            Err(e) => {
                return Err(e.into());
            }
            Ok(_) => {
                println!("Created namespace {}", namespace);
            }
        }
        Ok(KubernetesExecutor {
            client,
            namespace,
            tera: Tera::new("templates/**/*")?,
        })
    }

    fn render_pod(&self, game_server: &GameServer) -> Result<String, Box<dyn Error>> {
        let id = game_server
            .id
            .as_ref()
            .expect("Record Id must be set")
            .to_string()
            .replace("game_servers:", "");
        let re = regex::Regex::new("[^a-zA-Z0-9]")?;
        let raw_game_type = game_server.game_type.trim();
        let mut game_type = re
            .replace(raw_game_type.to_lowercase().as_str(), "-")
            .to_string();
        if (game_type.len() > 40) {
            game_type = game_type.index(..40).to_string()
        }
        let mut context = tera::Context::new();
        context.insert("gameType", game_type.as_str());
        context.insert("gameServerId", &id);
        context.insert("labels", &HashMap::<String, String>::new());
        context.insert("image", "busybox:latest");
        context.insert("command", &vec!["sleep", "3600"]);
        Ok(self
            .tera
            .render(game_server.pod_config.pod_template_name.as_str(), &context)?)
    }

    pub async fn list_services(&self, game_server_id : Option<&str>) -> Result<Vec<GameServerNetworkIdentity>, Box<dyn std::error::Error>> {
        let services: Api<Service> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let mut svc_list_params =
            ListParams::default().labels("app.kubernetes.io/managed-by=nautikal");
        if let Some(game_server_id) = game_server_id {
            svc_list_params =
                svc_list_params.labels(&format!("nautikal.io/game-server-id={}", game_server_id));
        }

        Ok(services
            .list(&svc_list_params)
            .await
            .map(|svcs| svcs.items)?
            .into_iter()
            .map(GameServerNetworkIdentity::from)
            .collect())
    }

    pub async fn list_pods(
        &self,
        game_server_id: Option<&str>,
    ) -> Result<Vec<GameServerInstance>, Box<dyn Error>> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let mut list_params = ListParams::default().labels("app.kubernetes.io/managed-by=nautikal");
        if let Some(game_server_id) = game_server_id {
            list_params =
                list_params.labels(&format!("nautikal.io/game-server-id={}", game_server_id));
        }
        let pods = pods.list(&list_params).await.map(|pods| pods.items)?;
        let items: Vec<GameServerInstance> = pods
            .into_iter()
            .map(|pod| GameServerInstance::from(pod))
            .collect();
        Ok(items)
    }

    pub async fn init_game_server(&self, game_server: &GameServer) {
        // TODO create PVC, Service, etc.
    }

    pub async fn create_pod(
        &self,
        game_server: &GameServer,
    ) -> Result<GameServerInstance, Box<dyn Error>> {
        // Get the pods API for the "default" namespace
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());

        let pod_yaml = self.render_pod(game_server)?;

        let pod: Pod = serde_saphyr::from_str(pod_yaml.as_str())?;

        // Create the pod
        let pod = pods.create(&PostParams::default(), &pod).await?;
        Ok(GameServerInstance::from(pod))
    }

    pub async fn delete_game_server_resources(&self, game_server_id : String) -> Result<(), Box<dyn Error>> {
        // TODO delete resources
        Ok(())
    }

    pub async fn delete_pod(&self, pod_id: &String) -> Result<(), Box<dyn Error>> {
        let api: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        match api.delete(pod_id.as_str(), &DeleteParams::default()).await {
            Err(kube::error::Error::Api(e)) if e.code >= 400 => Err(e),
            _ => Ok(()),
        }
    }
}

impl From<Service> for GameServerNetworkIdentity {
    fn from(value: Service) -> Self {
        todo!()
    }
}

impl From<Pod> for GameServerInstance {
    fn from(value: Pod) -> Self {
        let game_server_id = value
            .metadata
            .labels
            .as_ref()
            .map(|labels| labels.get("nautikal.io/game-server-id").unwrap())
            .unwrap().clone();

        GameServerInstance {
            id: value.metadata.name.as_ref().map(|n| n.clone()).unwrap_or("unknown-pod".to_string()),
            game_server_id,
            pod_status: value.status.as_ref().map(|s| {
                s.reason
                    .as_ref()
                    .map(|r| r.clone())
                    .unwrap_or(String::from("Unknown"))
            }),
            curr_players: 0,
            max_players: 0,
        }
    }
}

