use crate::app_config::AppConfig;
use crate::models::GameServer;
use std::collections::HashMap;
use std::error::Error;
use std::ops::{Index};
use tera::{Context, Filter, Tera};
use tracing::error;

struct EvaluateTeraFn {
    tera: Tera,
    context: Context,
}

impl Filter for EvaluateTeraFn {
    fn filter(&self, value: &serde_json::Value, _args: &HashMap<String, serde_json::Value>) -> tera::Result<serde_json::Value> {
        if !value.is_string() {
            Err(tera::Error::msg(
                "evaluateTera may only be called on strings",
            ))
        } else {
            let string_val = value.as_str().unwrap();
            let mut tera = self.tera.clone();
            tera.add_raw_template("eval_temp", string_val)?;
            match tera.render("eval_temp", &self.context) {
                Ok(rendered_text) => Ok(serde_json::Value::String(rendered_text)),
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

pub struct K8sResourceRenderer {
    tera: Tera,
    config: AppConfig,
}

impl K8sResourceRenderer {
    pub fn new(config: AppConfig) -> Result<Self, Box<dyn Error>> {
        let mut tera = Tera::new(&format!("{}/**/*", config.paths.k8s_templates))?;
        if let Some(extra_dir) = &config.paths.extra_k8s_templates_dir {
            let extra_glob = format!("{}/**/*", extra_dir);
            match Tera::new(&extra_glob) {
                Ok(extra_tera) => {
                    tera.extend(&extra_tera)?;
                    tracing::info!("Loaded extra templates from: {}", extra_dir);
                }
                Err(e) => {
                    tracing::error!(
                        "Warning: Failed to load extra templates from {}: {}",
                        extra_dir, e
                    );
                }
            }
        }
        Ok(Self { tera, config })
    }

    fn create_template_context(&self, game_server: &GameServer) -> Result<Context, Box<dyn Error>> {
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
        let mut context = Context::new();
        context.insert("gameType", game_type.as_str());
        context.insert("gameServerId", &id);
        context.insert("server", game_server);
        Ok(context)
    }

    pub fn render_pod(
        &self,
        game_server: &GameServer,
        pvc_name: Option<&str>,
        sftp_secret_name: &str,
    ) -> Result<String, Box<dyn Error>> {
        let mut context = self.create_template_context(game_server)?;
        context.insert("sftpSecretName", sftp_secret_name);
        if let Some(pvc) = pvc_name {
            context.insert("pvc_name", pvc)
        }
        let mut tera = self.tera.clone();
        tera.register_filter(
            "evaluateTera",
            EvaluateTeraFn {
                tera: tera.clone(),
                context: context.clone(),
            },
        );
        let pod_template = game_server
            .pod_template
            .as_ref()
            .filter(|t| !t.is_empty())
            .unwrap_or(&self.config.kubernetes.pod_template);
        match tera.render(pod_template.as_str(), &context) {
            Ok(yaml) => Ok(yaml),
            Err(e) => {
                error!("Failed rendering pod {:?}", e);
                Err(e.into())
            }
        }
    }

    pub fn render_init_yaml(&self, game_server: &GameServer) -> Result<String, Box<dyn Error>> {
        let mut context = self.create_template_context(game_server)?;
        context.insert("ports", &game_server.service_config.ports);
        if let Some(storage_class_name) = game_server.pvc_config.storage_class.as_ref()
            && !storage_class_name.is_empty()
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

        let init_template = game_server
            .init_template
            .as_ref()
            .filter(|t| !t.is_empty())
            .unwrap_or(&self.config.kubernetes.init_template);
        Ok(tera.render(init_template, &context)?)
    }

    pub fn render_sftp_pod(
        &self,
        game_server: &GameServer,
        pvc_name: Option<&str>,
        sftp_secret_name: &str,
    ) -> Result<String, Box<dyn Error>> {
        let mut context = self.create_template_context(game_server)?;
        if let Some(pvc) = pvc_name {
            context.insert("pvc_name", pvc)
        }
        context.insert("sftpSecretName", sftp_secret_name);
        Ok(self.tera.render("default/sftp_only.yaml.jinja", &context)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{PodConfig, PvcConfig, ResourceQuantities, Resources, ServiceConfig, ServicePort};
    use k8s_openapi::api::core::v1::Pod;
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
                        memory: Some("500Mi".to_string()),
                    }),
                    limits: Some(ResourceQuantities {
                        cpu: Some("500m".to_string()),
                        memory: Some("1000Mi".to_string()),
                    }),
                }),
                command: None,
                env: Some(HashMap::from([
                    ("foo".to_string(), "bar".to_string()),
                    ("old".to_string(), "young".to_string()),
                ])),
                mounts: None,
            },
            service_config: ServiceConfig {
                ports: vec![ServicePort { port: 25565, protocol: "TCP".to_string() }],
                ip_address: None,
                service_type: "LoadBalancer".to_string(),
            },
            pvc_config: PvcConfig {
                storage_class: None,
                container_path: "/data".to_string(),
                size: 2,
                size_unit: "Gi".to_string(),
            },
            user_id: 1000,
        }
    }

    #[test]
    fn test_render_init_yaml() -> Result<(), Box<dyn Error>> {
        let config = AppConfig::load()?;
        let renderer = K8sResourceRenderer::new(config)?;
        let game_server = test_game_server();
        let init_script = renderer.render_init_yaml(&game_server)?;
        println!("{}", init_script);
        Ok(())
    }

    #[test]
    fn test_render_pod_template_yaml() -> Result<(), Box<dyn Error>> {
        let config = AppConfig::load()?;
        let renderer = K8sResourceRenderer::new(config)?;
        let game_server = test_game_server();
        let pod_script = renderer.render_pod(&game_server, Some("some_pvc"), "some-secret")?;
        println!("{}", pod_script);
        let _pod: Pod = serde_saphyr::from_str(pod_script.as_str())?;
        Ok(())
    }

    #[test]
    fn test_render_sftp_pod_yaml() -> Result<(), Box<dyn Error>> {
        let config = AppConfig::load()?;
        let renderer = K8sResourceRenderer::new(config)?;
        let game_server = test_game_server();
        let pod_script = renderer.render_sftp_pod(&game_server, Some("some_pvc"), "some-secret")?;
        println!("{}", pod_script);
        let _pod: Pod = serde_saphyr::from_str(pod_script.as_str())?;
        Ok(())
    }
}
