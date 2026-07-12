use crate::models::{TemplateRepository, SETTINGS_CONFIG_MAP_NAME, MANAGED_BY_LABEL, MANAGED_BY_VALUE};
use k8s_openapi::api::core::v1::ConfigMap;
use kube::api::{Patch, PatchParams, PostParams, ListParams};
use kube::{Api, Client};
use kube::runtime::watcher;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::error::Error;
use std::sync::{Arc, RwLock};
use tracing::{info, warn};

const REPOSITORIES_KEY: &str = "templateRepositories";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Settings {
    pub template_repositories: Vec<TemplateRepository>,
}

#[derive(Clone)]
pub struct SettingsStore {
    client: Client,
    namespace: String,
    settings: Arc<RwLock<Settings>>,
}

impl SettingsStore {
    pub async fn new(
        client: Client,
        namespace: String,
        default_repos: Vec<TemplateRepository>,
    ) -> Result<Self, Box<dyn Error>> {
        let store = SettingsStore {
            client: client.clone(),
            namespace: namespace.clone(),
            settings: Arc::new(RwLock::new(Settings::default())),
        };

        store.ensure_config_map(default_repos).await?;
        store.reload_from_configmap().await?;
        store.start_watcher();

        Ok(store)
    }

    pub fn list_repositories(&self) -> Vec<TemplateRepository> {
        let settings = self.settings.read().unwrap();
        settings.template_repositories.clone()
    }

    pub async fn create_repository(
        &self,
        mut repository: TemplateRepository,
    ) -> Result<TemplateRepository, Box<dyn Error>> {
        repository.id = TemplateRepository::generate_id();
        {
            let mut settings = self.settings.write().unwrap();
            settings.template_repositories.push(repository.clone());
        }
        self.save_to_configmap().await?;
        Ok(repository)
    }

    pub async fn delete_repository(&self, id: String) -> Result<(), Box<dyn Error>> {
        {
            let mut settings = self.settings.write().unwrap();
            settings.template_repositories.retain(|r| r.id != id);
        }
        self.save_to_configmap().await?;
        Ok(())
    }

    async fn ensure_config_map(
        &self,
        default_repos: Vec<TemplateRepository>,
    ) -> Result<(), Box<dyn Error>> {
        let cms: Api<ConfigMap> = Api::namespaced(self.client.clone(), &self.namespace);
        match cms.get(SETTINGS_CONFIG_MAP_NAME).await {
            Ok(_) => Ok(()),
            Err(kube::Error::Api(err)) if err.code == 404 => {
                info!("Creating nautikal settings ConfigMap with defaults");
                let data = serde_json::to_vec(&default_repos)?;
                let data_str = String::from_utf8(data)?;
                let mut labels = BTreeMap::new();
                labels.insert(MANAGED_BY_LABEL.to_string(), MANAGED_BY_VALUE.to_string());
                let mut cm_data = BTreeMap::new();
                cm_data.insert(REPOSITORIES_KEY.to_string(), data_str);
                let cm = ConfigMap {
                    metadata: kube::api::ObjectMeta {
                        name: Some(SETTINGS_CONFIG_MAP_NAME.to_string()),
                        namespace: Some(self.namespace.clone()),
                        labels: Some(labels),
                        ..Default::default()
                    },
                    data: Some(cm_data),
                    ..Default::default()
                };
                cms.create(&PostParams::default(), &cm).await?;
                Ok(())
            }
            Err(e) => Err(e.into()),
        }
    }

    async fn reload_from_configmap(&self) -> Result<(), Box<dyn Error>> {
        let cms: Api<ConfigMap> = Api::namespaced(self.client.clone(), &self.namespace);
        let cm = cms.get(SETTINGS_CONFIG_MAP_NAME).await?;
        if let Some(data) = cm.data {
            if let Some(repos_json) = data.get(REPOSITORIES_KEY) {
                let repos: Vec<TemplateRepository> = serde_json::from_str(repos_json)?;
                let mut settings = self.settings.write().unwrap();
                settings.template_repositories = repos;
                info!(
                    "Loaded {} template repositories from ConfigMap",
                    settings.template_repositories.len()
                );
            }
        }
        Ok(())
    }

    async fn save_to_configmap(&self) -> Result<(), Box<dyn Error>> {
        let repos_json = {
            let settings = self.settings.read().unwrap();
            serde_json::to_string(&settings.template_repositories)?
        };

        let cms: Api<ConfigMap> = Api::namespaced(self.client.clone(), &self.namespace);
        let patch = serde_json::json!({
            "data": {
                REPOSITORIES_KEY: repos_json
            }
        });
        let pp = PatchParams::default();
        cms.patch(SETTINGS_CONFIG_MAP_NAME, &pp, &Patch::Merge(&patch))
            .await?;
        Ok(())
    }

    fn start_watcher(&self) {
        let cms: Api<ConfigMap> = Api::namespaced(self.client.clone(), &self.namespace);
        let list_params = ListParams::default()
            .fields(&format!("metadata.name={}", SETTINGS_CONFIG_MAP_NAME));
        let mut watcher_stream = watcher::watcher(
            cms,
            watcher::Config::default().params(list_params),
        );

        let settings_clone = self.settings.clone();
        tokio::spawn(async move {
            use futures_util::StreamExt;
            use kube::runtime::watcher::Event;
            while let Some(event) = watcher_stream.next().await {
                match event {
                    Ok(Event::Apply(cm)) => {
                        if let Some(data) = &cm.data {
                            if let Some(repos_json) = data.get(REPOSITORIES_KEY) {
                                match serde_json::from_str::<Vec<TemplateRepository>>(repos_json) {
                                    Ok(repos) => {
                                        let mut settings = settings_clone.write().unwrap();
                                        settings.template_repositories = repos;
                                        info!(
                                            "Settings updated via watcher: {} template repositories",
                                            settings.template_repositories.len()
                                        );
                                    }
                                    Err(e) => {
                                        warn!("Failed to parse settings from ConfigMap update: {}", e);
                                    }
                                }
                            }
                        }
                    }
                    Ok(Event::Init) => {}
                    Ok(Event::InitApply(_)) => {}
                    Ok(Event::Delete(_)) => {
                        warn!("Settings ConfigMap was deleted");
                    }
                    Err(e) => {
                        warn!("Error watching settings ConfigMap: {}", e);
                    }
                }
            }
        });
    }
}
