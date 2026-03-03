use crate::app_config::AppConfig;
use crate::models::GameServerTemplate;
use crate::services::template_repository_store::TemplateRepositoryStore;
use anyhow::anyhow;
use reqwest::header::{ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::Deserialize;
use std::error::Error;
use tracing::{error, info, warn};
use url::Url;

#[derive(Debug, Deserialize)]
struct GitHubContentItem {
    name: String,
    #[serde(rename = "type")]
    item_type: String,
    download_url: Option<String>
}

pub struct TemplateRepositoryManager {
    repository_store: TemplateRepositoryStore,
    config: AppConfig,
}

impl TemplateRepositoryManager {
    pub fn new(repository_store: TemplateRepositoryStore, config: AppConfig) -> Self {
        Self {
            repository_store,
            config,
        }
    }

    pub async fn fetch_all_templates(&self) -> Result<Vec<GameServerTemplate>, Box<dyn Error>> {
        let repositories = self.repository_store.list_repositories().await?;
        let mut all_templates: Vec<GameServerTemplate> = vec![];

        for repo in repositories {
            match self.fetch_templates_from_repository(&repo).await {
                Ok(templates) => {
                    all_templates.extend(templates);
                }
                Err(e) => {
                    error!(
                        "An error ocurred fetching templates for repo {:?}: {}",
                        repo, e
                    );
                }
            }
        }

        Ok(all_templates)
    }

    async fn fetch_templates_from_repository(
        &self,
        repo: &crate::models::TemplateRepository,
    ) -> Result<Vec<GameServerTemplate>, Box<dyn Error>> {
        let url = Url::parse(&repo.url)?;
        if "github" == url.scheme() {
            self.fetch_templates_from_github(&url).await
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
        let path = url.as_str().replace("file://", "");
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
                            let content = tokio::fs::read(&path).await.map_err(|e| {
                                anyhow::anyhow!("Failed to read file {:?}: {}", path, e)
                            })?;

                            match serde_saphyr::from_slice::<GameServerTemplate>(&content) {
                                Ok(template) => templates.push(template),
                                Err(e) => {
                                    tracing::warn!(
                                        "Failed to parse template from {:?}: {}",
                                        path,
                                        e
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(templates)
    }

    async fn fetch_templates_from_github(
        &self,
        url: &Url,
    ) -> Result<Vec<GameServerTemplate>, Box<dyn Error>> {
        let token = self.config.github.token.as_ref().ok_or_else(|| anyhow!("No GitHub token set. Cannot fetch templates from github repo."))?;
        let mut comps = url.path_segments().ok_or_else(|| {
            anyhow!(
                "Invalid github url. Should be formatted github:///<owner>/<repo>/path/to/folder"
            )
        })?;
        let gh_url = {
            let mut gh_api = Url::parse("https://api.github.com/repos")?;
            let mut paths_mut = gh_api.path_segments_mut().unwrap();
            paths_mut.push(
                comps
                    .next()
                    .ok_or_else(|| anyhow!("Missing owner component"))?,
            );
            paths_mut.push(
                comps
                    .next()
                    .ok_or_else(|| anyhow!("Missing repo name component"))?,
            );
            paths_mut.push("contents");
            for segment in comps {
                paths_mut.push(segment);
            }
            drop(paths_mut);
            gh_api.set_query(url.query());
            gh_api
        };
        info!("Fetching contents from GitHub: {}", gh_url.as_str());

        let client = reqwest::Client::new();

        let request = client
            .get(gh_url)
            .header(USER_AGENT, "nautikalpanel")
            .header(ACCEPT, "application/vnd.github.v3+json")
            .header(AUTHORIZATION, format!("Bearer {}", token));

        let response = request.send().await?;
        
        if !response.status().is_success() {
            return Err(anyhow!(
                "GitHub API request failed: {} - {}",
                response.status(),
                response.text().await.unwrap_or_default()
            )
            .into_boxed_dyn_error());
        }

        let items: Vec<GitHubContentItem> = response.json().await?;

        let mut templates: Vec<GameServerTemplate> = vec![];
        let client = reqwest::Client::new();

        for item in items {
            if item.item_type != "file" {
                continue;
            }

            let ext = std::path::Path::new(&item.name)
                .extension()
                .and_then(|e| e.to_str());

            if ext != Some("yaml") && ext != Some("yml") {
                continue;
            }

            let download_url = item.download_url.ok_or_else(|| {
                anyhow!("No download URL for file: {}", item.name)
            })?;

            info!("Fetching template file: {} from {}", item.name, download_url);

            let file_request = client
                .get(&download_url)
                .header(USER_AGENT, "nautikalpanel")
                .header(AUTHORIZATION, format!("token {}", token));

            let file_response = file_request.send().await?;

            if !file_response.status().is_success() {
                warn!(
                    "Failed to fetch file {}: {}",
                    item.name,
                    file_response.status()
                );
                continue;
            }

            let content = file_response.bytes().await?;

            match serde_saphyr::from_slice::<GameServerTemplate>(&content) {
                Ok(template) => templates.push(template),
                Err(e) => {
                    warn!(
                        "Failed to parse template from {}: {}",
                        item.name, e
                    );
                }
            }
        }

        Ok(templates)
    }
}
