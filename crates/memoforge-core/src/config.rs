//! Configuration management for .memoforge/config.yaml

use crate::{Category, ErrorCode, MemoError};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub version: String,
    pub categories: Vec<CategoryConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<KnowledgeBaseMetadata>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryConfig {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeBaseMetadata {
    pub name: String,
    pub created_at: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: "1.0".to_string(),
            categories: Vec::new(),
            metadata: None,
        }
    }
}

pub fn load_config(kb_path: &Path) -> Result<Config, MemoError> {
    let config_path = kb_path.join(".memoforge/config.yaml");

    if !config_path.exists() {
        return Ok(Config::default());
    }

    let content = fs::read_to_string(&config_path).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to read config: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    let mut config: Config = serde_yaml::from_str(&content).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to parse config: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    for category in &mut config.categories {
        if category.id.is_empty() {
            category.id = category.path.clone();
        }
        if category.name.is_empty() {
            category.name = category.path.clone();
        }
    }

    Ok(config)
}

pub fn save_config(kb_path: &Path, config: &Config) -> Result<(), MemoError> {
    let config_path = kb_path.join(".memoforge/config.yaml");

    let yaml = serde_yaml::to_string(config).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to serialize config: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    fs::write(&config_path, yaml).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to write config: {}", e),
        retry_after_ms: None,
        context: None,
    })
}

pub fn register_category(kb_path: &Path, category: &Category, path: &str) -> Result<(), MemoError> {
    let mut config = load_config(kb_path)?;

    let category_config = CategoryConfig {
        id: category.id.clone(),
        name: category.name.clone(),
        path: path.to_string(),
        parent_id: category.parent_id.clone(),
        description: category.description.clone(),
    };

    config.categories.push(category_config);
    save_config(kb_path, &config)
}

pub fn validate_category_path(kb_path: &Path, category_id: &str) -> Result<bool, MemoError> {
    let config = load_config(kb_path)?;
    Ok(config
        .categories
        .iter()
        .any(|c| c.id == category_id || c.path == category_id || c.name == category_id))
}
