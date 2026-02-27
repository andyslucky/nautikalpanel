use crate::game_servers::GameServerTemplate;
use crate::services::template_repository_store::TemplateRepositoryStore;
use anyhow::anyhow;
use std::error::Error;
use tracing::info;
use url::Url;

pub struct TemplateRepositoryManager {
    repository_store: TemplateRepositoryStore,
}

impl TemplateRepositoryManager {
    pub fn new(repository_store: TemplateRepositoryStore) -> Self {
        Self { repository_store }
    }

    pub async fn fetch_all_templates(&self) -> Result<Vec<GameServerTemplate>, Box<dyn Error>> {
        let repositories = self.repository_store.list_repositories().await?;
        let mut all_templates: Vec<GameServerTemplate> = vec![];

        for repo in repositories {
            let templates = self.fetch_templates_from_repository(&repo).await?;
            all_templates.extend(templates);
        }

        Ok(all_templates)
    }

    async fn fetch_templates_from_repository(
        &self,
        repo: &crate::game_servers::TemplateRepository,
    ) -> Result<Vec<GameServerTemplate>, Box<dyn Error>> {
        let url = Url::parse(&repo.url)?;
        if ["http", "https"].contains(&url.scheme()) {
            self.fetch_templates_from_url(&url).await
        } else if "file" == url.scheme() {
            self.fetch_templates_from_local_path(&url).await
        } else {
            Err(anyhow!("Unhandled repository scheme {}", url.scheme()).into_boxed_dyn_error())
        }
    }

    async fn fetch_templates_from_local_path(
        &self,
        url: &Url,
    ) -> Result<Vec<GameServerTemplate>, Box<dyn Error>> {
        let mut templates: Vec<GameServerTemplate> = vec![];
        let path = url.as_str().replace("file://","");
        info!("Fetching contents for path {}", path);
        let dirs = tokio::fs::read_dir(path.as_str())
            .await
            .map_err(|e| anyhow::anyhow!("Failed to read directory {}: {}", path, e))?;
        
        use tokio_stream::{StreamExt as _, wrappers::ReadDirStream};
        let mut read_dir_stream = ReadDirStream::new(dirs);
        
        while let Some(entry) = read_dir_stream.next().await {
            if let Ok(e) = entry {
                let path = e.path();
                
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        if ext == "yaml" || ext == "yml" {
                            let content = tokio::fs::read(&path)
                                .await
                                .map_err(|e| anyhow::anyhow!("Failed to read file {:?}: {}", path, e))?;
                            
                            match serde_saphyr::from_slice::<GameServerTemplate>(&content) {
                                Ok(template) => templates.push(template),
                                Err(e) => {
                                    tracing::warn!("Failed to parse template from {:?}: {}", path, e);
                                }
                            }
                        }
                    }
                }
            }
        }
        
        Ok(templates)
    }

    async fn fetch_templates_from_url(
        &self,
        url: &Url,
    ) -> Result<Vec<GameServerTemplate>, Box<dyn Error>> {
        // TODO Implement this
        tracing::warn!("Fetching templates from remote URLs is not yet implemented: {}", url);
        Ok(vec![])
    }
}
