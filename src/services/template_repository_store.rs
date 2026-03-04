use crate::app_config::DatabaseConfig;
use crate::models::TemplateRepository;
use surrealdb::engine::local::Db;
use surrealdb::Surreal;

#[derive(Clone)]
pub struct TemplateRepositoryStore {
    db: Surreal<Db>,
}

impl TemplateRepositoryStore {
    pub async fn new(db: Surreal<Db>, db_config: &DatabaseConfig) -> Result<Self, Box<dyn std::error::Error>> {
        db.use_ns(&db_config.namespace)
            .use_db(&db_config.name)
            .await?;
        Ok(TemplateRepositoryStore { db })
    }

    pub async fn create_repository(
        &self,
        mut repository: TemplateRepository,
    ) -> Result<TemplateRepository, Box<dyn std::error::Error>> {
        repository.id = None;
        let created: Option<TemplateRepository> = self
            .db
            .create("template_repositories")
            .content(repository)
            .await?;
        created.ok_or_else(|| anyhow::anyhow!("Failed to create template repository").into())
    }

    pub async fn list_repositories(
        &self,
    ) -> Result<Vec<TemplateRepository>, Box<dyn std::error::Error>> {
        Ok(self.db.select("template_repositories").await?)
    }

    #[allow(dead_code)]
    pub async fn get_repository_by_id(
        &self,
        repository_id: &str,
    ) -> Result<Option<TemplateRepository>, Box<dyn std::error::Error>> {
        let repository: Option<TemplateRepository> =
            self.db.select(("template_repositories", repository_id)).await?;
        Ok(repository)
    }

    pub async fn delete_repository(
        &self,
        repository_id: String,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let _ : Option<TemplateRepository> = self.db
            .delete(("template_repositories", repository_id.as_str()))
            .await?;
        Ok(())
    }

    pub async fn is_empty(&self) -> Result<bool, Box<dyn std::error::Error>> {
        let repositories: Vec<TemplateRepository> = self.list_repositories().await?;
        Ok(repositories.is_empty())
    }
}
