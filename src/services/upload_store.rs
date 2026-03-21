use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone)]
pub struct UploadStore {
    base_path: PathBuf,
}

impl UploadStore {
    pub fn new(base_path: PathBuf) -> Self {
        fs::create_dir_all(&base_path).expect("Failed to create uploads directory");
        Self { base_path }
    }

    pub fn store(
        &self,
        game_server_id: &str,
        field_name: &str,
        data: &[u8],
        original_filename: &str,
    ) -> Result<UploadedFile> {
        // Directory structure: uploads/{game_server_id}/{field_name}
        let field_dir = self.base_path.join(game_server_id).join(field_name);
        fs::create_dir_all(&field_dir)?;

        // Use original filename - path is already unique via game_server_id + field_name
        let file_path = field_dir.join(original_filename);
        fs::write(&file_path, data)?;

        Ok(UploadedFile {
            field_name: field_name.to_string(),
            original_filename: original_filename.to_string(),
            storage_path: file_path.to_string_lossy().into_owned(),
        })
    }

    pub fn get(&self, storage_path: &str) -> Result<Vec<u8>> {
        let path = Path::new(storage_path);
        if path.exists() {
            Ok(fs::read(path)?)
        } else {
            Err(anyhow!("File not found"))
        }
    }

    pub fn delete_all_for_server(&self, game_server_id: &str) -> Result<()> {
        let server_dir = self.base_path.join(game_server_id);
        if server_dir.exists() {
            fs::remove_dir_all(server_dir)?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadedFile {
    pub field_name: String,
    pub original_filename: String,
    pub storage_path: String,
}
