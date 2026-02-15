use crate::game_servers::GameServer;
use k8s_openapi::api::core::v1::{Namespace, PersistentVolumeClaim, Pod, Service};
use kube::api::{ApiResource, DeleteParams, DynamicObject, GroupVersionKind, ListParams, PostParams};
use kube::{Api, Client, ResourceExt};
use serde_json::Value;
use std::collections::HashMap;
use std::error::Error;
use std::ops::Index;
use tera::{Context, Filter, Tera};

struct EvaluateTeraFn {
    tera: Tera,
    context: Context
}

impl Filter for EvaluateTeraFn {
    fn filter(&self, value: &Value, _args: &HashMap<String, Value>) -> tera::Result<Value> {
        if !value.is_string() {
            Err(tera::Error::msg("evaluateTera may only be called on strings"))
        } else {
            let string_val = value.as_str().unwrap();
            let mut tera = self.tera.clone();
            tera.add_raw_template("eval_temp", string_val)?;
            match tera.render("eval_temp", &self.context) {
                Ok(rendered_text) => {
                    Ok(Value::String(rendered_text))
                },
                Err(e) => {
                    eprintln!("{:?}", e);
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
        let mut tera = Tera::new("k8s-templates/**/*")?;
        Ok(KubernetesExecutor {
            client,
            namespace,
            tera,
        })
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
        if (game_type.len() > 40) {
            game_type = game_type.index(..40).to_string()
        }
        let mut context = tera::Context::new();
        context.insert("gameType", game_type.as_str());
        context.insert("gameServerId", &id);
        context.insert("server", game_server);
        Ok(context)
    }

    fn render_pod(&self, game_server: &GameServer) -> Result<String, Box<dyn Error>> {
        let context = self.create_template_context(game_server)?;
        let mut tera = self.tera.clone();
        tera.register_filter("evaluateTera", EvaluateTeraFn{tera: tera.clone(), context: context.clone()});
        let template_name = if game_server.pod_config.pod_template.ends_with(".yaml") || game_server.pod_config.pod_template.ends_with(".yml") {
            game_server.pod_config.pod_template.as_str()
        } else {
            // in-line template
            tera.add_raw_template("pod_temp", game_server.pod_config.pod_template.as_str())?;
            "pod_temp"
        };
        Ok(tera.render(template_name, &context)?)
    }

    fn render_init_yaml(&self, game_server: &GameServer) -> Result<String, Box<dyn Error>> {
        let mut context = self.create_template_context(game_server)?;
        context.insert("ports", &game_server.service_config.ports);
        if let Some(storage_class_name) = game_server.pvc_config.storage_class.as_ref() && storage_class_name.len() > 0 {
            context.insert("storageClassName", storage_class_name);
        } else {
            // TODO remove this
            context.insert("storageClassName", "longhorn");
        }
        context.insert("storage", &format!("{}{}", game_server.pvc_config.size, game_server.pvc_config.size_unit));
        let mut tera = self.tera.clone();
        tera.register_filter("evaluateTera", EvaluateTeraFn{tera: tera.clone(), context: context.clone()});
        let template_name = if game_server.init_template.ends_with(".yaml") || game_server.init_template.ends_with(".yml") {
            game_server.init_template.as_str()
        } else {
            // in-line template
            tera.add_raw_template("init_temp", game_server.init_template.as_str())?;
            "init_temp"
        };
        Ok(tera.render(template_name, &context)?)
    }

    pub async fn list_services(
        &self,
        game_server_id: Option<&str>,
    ) -> Result<Vec<Service>, Box<dyn Error>> {
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
            .map(|svcs| svcs.items)?)
    }

    pub async fn list_pods(
        &self,
        game_server_id: Option<&str>,
    ) -> Result<Vec<Pod>, Box<dyn Error>> {
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let mut list_params = ListParams::default().labels("app.kubernetes.io/managed-by=nautikal");
        if let Some(game_server_id) = game_server_id {
            list_params =
                list_params.labels(&format!("nautikal.io/game-server-id={}", game_server_id));
        }
        let pods = pods.list(&list_params).await.map(|pods| pods.items)?;
        Ok(pods)
    }


    pub async fn init_game_server(&self, game_server: &GameServer) -> Result<(), Box<dyn Error>> {
        let init_yaml = self.render_init_yaml(game_server)?;
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

    pub async fn create_pod(&self, game_server: &GameServer) -> Result<Pod, Box<dyn Error>> {
        // Get the pods API for the "default" namespace
        let pods: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        let pod_yaml = self.render_pod(game_server)?;
        // TODO add debug logging to show the pod yaml
        let pod: Pod = serde_saphyr::from_str(pod_yaml.as_str())?;
        // Create the pod
        let pod = pods.create(&PostParams::default(), &pod).await?;
        Ok(pod)
    }

    pub async fn delete_game_server_resources(
        &self,
        game_server_id: String,
    ) -> Result<(), Box<dyn Error>> {
        let list_params = ListParams::default()
            .labels("app.kubernetes.io/managed-by=nautikal")
            .labels(&format!("nautikal.io/game-server-id={}", game_server_id));
        let service_api: Api<Service> =
            Api::namespaced(self.client.clone(), self.namespace.as_str());
        match service_api.delete_collection(&DeleteParams::default(), &list_params).await? {
            either::Left(list) => {
                let names: Vec<_> = list.iter().map(ResourceExt::name_any).collect();
                println!("Deleting collection of services: {:?}", names);
            }
            either::Right(status) => {
                println!("Deleting collection of services status: {}", status);
            }
        }
        self.delete_pods(game_server_id).await?;
        let pvc_api: Api<PersistentVolumeClaim> =
            Api::namespaced(self.client.clone(), self.namespace.as_str());
        match pvc_api.delete_collection(&DeleteParams::default(), &list_params).await? {
            either::Left(list) => {
                let names: Vec<_> = list.iter().map(ResourceExt::name_any).collect();
                println!("Deleting collection of pvcs: {:?}", names);
            }
            either::Right(status) => {
                println!("Deleting collection of pvcs status: {}", status);
            }
        }
        Ok(())
    }

    pub async fn delete_pods(&self, game_server_id : String) -> Result<(), Box<dyn Error>> {
        let list_params = ListParams::default()
            .labels("app.kubernetes.io/managed-by=nautikal")
            .labels(&format!("nautikal.io/game-server-id={}", game_server_id));
        let pod_api: Api<Pod> = Api::namespaced(self.client.clone(), self.namespace.as_str());
        match pod_api.delete_collection(&DeleteParams::default(), &list_params).await? {
            either::Left(list) => {
                let names: Vec<_> = list.iter().map(ResourceExt::name_any).collect();
                println!("Deleting collection of pods: {:?}", names);
            }
            either::Right(status) => {
                println!("Deleting collection of pods status: {}", status);
            }
        }
        Ok(())
    }
}
