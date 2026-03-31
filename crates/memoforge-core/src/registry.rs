//! 知识库注册表 - 管理多个知识库
//! 参考: PRD §5.1.6 多知识库管理

use crate::{ErrorCode, MemoError};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const APP_IDENTIFIER: &str = "com.memoforge.app";
const REGISTRY_FILE_NAME: &str = "registry.yaml";

/// 知识库信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeBaseInfo {
    /// 知识库路径
    pub path: String,
    /// 知识库名称
    pub name: String,
    /// 最后访问时间 (ISO 8601)
    pub last_accessed: String,
    /// 是否为默认知识库
    #[serde(default)]
    pub is_default: bool,
}

/// 知识库注册表
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct KnowledgeBaseRegistry {
    /// 注册的知识库列表
    pub knowledge_bases: Vec<KnowledgeBaseInfo>,
    /// 当前激活的知识库路径
    pub current: Option<String>,
}

impl KnowledgeBaseRegistry {
    fn legacy_registry_path() -> Result<PathBuf, MemoError> {
        let home = env::var("HOME")
            .or_else(|_| env::var("USERPROFILE"))
            .map_err(|_| MemoError {
                code: ErrorCode::InvalidPath,
                message: "Cannot determine home directory".to_string(),
                retry_after_ms: None,
                context: None,
            })?;

        Ok(PathBuf::from(home).join(".memoforge").join(REGISTRY_FILE_NAME))
    }

    fn registry_dir() -> Result<PathBuf, MemoError> {
        if let Ok(dir) = env::var("MEMOFORGE_REGISTRY_DIR") {
            return Ok(PathBuf::from(dir));
        }

        if let Some(config_dir) = dirs::config_dir() {
            return Ok(config_dir.join(APP_IDENTIFIER));
        }

        if let Some(local_data_dir) = dirs::data_local_dir() {
            return Ok(local_data_dir.join(APP_IDENTIFIER));
        }

        Self::legacy_registry_path()?
            .parent()
            .map(PathBuf::from)
            .ok_or_else(|| MemoError {
                code: ErrorCode::InvalidPath,
                message: "Cannot determine registry directory".to_string(),
                retry_after_ms: None,
                context: None,
            })
    }

    fn migrate_legacy_registry_if_needed(target_path: &Path) -> Result<(), MemoError> {
        if target_path.exists() {
            return Ok(());
        }

        let legacy_path = Self::legacy_registry_path()?;
        if !legacy_path.exists() || legacy_path == target_path {
            return Ok(());
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to create registry directory: {}", e),
                retry_after_ms: None,
                context: None,
            })?;
        }

        fs::copy(&legacy_path, target_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!(
                "Failed to migrate knowledge base registry from {} to {}: {}",
                legacy_path.display(),
                target_path.display(),
                e
            ),
            retry_after_ms: None,
            context: None,
        })?;

        Ok(())
    }

    fn normalize_path(path: &Path) -> PathBuf {
        fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
    }

    fn normalize_path_str(path: &str) -> String {
        Self::normalize_path(Path::new(path))
            .to_string_lossy()
            .to_string()
    }

    /// 获取注册表文件路径
    fn registry_path() -> Result<PathBuf, MemoError> {
        let registry_dir = Self::registry_dir()?;
        fs::create_dir_all(&registry_dir).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to create registry directory {}: {}", registry_dir.display(), e),
            retry_after_ms: None,
            context: None,
        })?;

        let registry_path = registry_dir.join(REGISTRY_FILE_NAME);
        Self::migrate_legacy_registry_if_needed(&registry_path)?;
        Ok(registry_path)
    }

    /// 加载注册表
    pub fn load() -> Result<Self, MemoError> {
        let path = Self::registry_path()?;

        if !path.exists() {
            return Ok(Self::default());
        }

        let content = fs::read_to_string(&path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to read registry: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        let mut registry: Self = serde_yaml::from_str(&content).unwrap_or_default();
        if registry.normalize() {
            registry.save()?;
        }
        Ok(registry)
    }

    /// 保存注册表
    pub fn save(&self) -> Result<(), MemoError> {
        let path = Self::registry_path()?;

        let yaml = serde_yaml::to_string(self).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to serialize registry: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&path, yaml).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write registry: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// 注册知识库
    pub fn register(&mut self, path: &Path, name: Option<&str>) -> Result<(), MemoError> {
        let canonical_path = fs::canonicalize(path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Invalid path: {}", e),
            retry_after_ms: None,
            context: None,
        })?;
        let canonical_str = canonical_path.to_string_lossy().to_string();

        // 如果已存在，更新访问时间
        if let Some(kb) = self
            .knowledge_bases
            .iter_mut()
            .find(|kb| kb.path == canonical_str)
        {
            kb.last_accessed = chrono::Utc::now().to_rfc3339();
            kb.name = name.unwrap_or(&kb.name).to_string();
            self.current = Some(canonical_str);
            return self.save();
        }

        // 否则添加新的
        let kb_name = name
            .unwrap_or_else(|| {
                path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("未命名知识库")
            })
            .to_string();

        let is_default = self.knowledge_bases.is_empty();

        self.knowledge_bases.push(KnowledgeBaseInfo {
            path: canonical_str.clone(),
            name: kb_name,
            last_accessed: chrono::Utc::now().to_rfc3339(),
            is_default,
        });

        self.current = Some(canonical_str);
        self.save()
    }

    /// 注销知识库
    pub fn unregister(&mut self, path: &str) -> Result<(), MemoError> {
        let normalized_path = Self::normalize_path_str(path);
        self.knowledge_bases.retain(|kb| kb.path != normalized_path);

        if self.current.as_ref() == Some(&normalized_path) {
            self.current = self.knowledge_bases.first().map(|kb| kb.path.clone());
        }

        self.save()
    }

    /// 设置当前知识库
    pub fn set_current(&mut self, path: &str) -> Result<(), MemoError> {
        let normalized_path = Self::normalize_path_str(path);

        if !self
            .knowledge_bases
            .iter()
            .any(|kb| kb.path == normalized_path)
        {
            return Err(MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Knowledge base not found: {}", normalized_path),
                retry_after_ms: None,
                context: None,
            });
        }

        // 更新访问时间
        if let Some(kb) = self
            .knowledge_bases
            .iter_mut()
            .find(|kb| kb.path == normalized_path)
        {
            kb.last_accessed = chrono::Utc::now().to_rfc3339();
        }

        self.current = Some(normalized_path);
        self.save()
    }

    /// 获取当前知识库路径
    pub fn get_current(&self) -> Option<&str> {
        self.current.as_deref()
    }

    /// 列出所有知识库
    pub fn list(&self) -> &[KnowledgeBaseInfo] {
        &self.knowledge_bases
    }

    /// 获取知识库信息
    pub fn get(&self, path: &str) -> Option<&KnowledgeBaseInfo> {
        let normalized_path = Self::normalize_path_str(path);
        self.knowledge_bases
            .iter()
            .find(|kb| kb.path == normalized_path)
    }

    fn normalize(&mut self) -> bool {
        let mut changed = false;
        let mut deduped: Vec<KnowledgeBaseInfo> = Vec::new();

        for kb in self.knowledge_bases.drain(..) {
            let normalized_path = Self::normalize_path_str(&kb.path);
            if normalized_path != kb.path {
                changed = true;
            }

            if let Some(existing) = deduped
                .iter_mut()
                .find(|existing| existing.path == normalized_path)
            {
                changed = true;
                if kb.last_accessed > existing.last_accessed {
                    existing.last_accessed = kb.last_accessed.clone();
                    existing.name = kb.name.clone();
                }
                existing.is_default = existing.is_default || kb.is_default;
            } else {
                deduped.push(KnowledgeBaseInfo {
                    path: normalized_path,
                    name: kb.name,
                    last_accessed: kb.last_accessed,
                    is_default: kb.is_default,
                });
            }
        }

        let normalized_current = self
            .current
            .as_ref()
            .map(|path| Self::normalize_path_str(path));
        if normalized_current != self.current {
            changed = true;
        }

        self.current = normalized_current.filter(|path| deduped.iter().any(|kb| kb.path == *path));
        if self.current.is_none() && !deduped.is_empty() {
            self.current = deduped
                .iter()
                .find(|kb| kb.is_default)
                .or_else(|| deduped.first())
                .map(|kb| kb.path.clone());
            changed = true;
        }

        self.knowledge_bases = deduped;
        changed
    }
}

/// 列出所有已注册的知识库
pub fn list_knowledge_bases() -> Result<Vec<KnowledgeBaseInfo>, MemoError> {
    let registry = KnowledgeBaseRegistry::load()?;
    Ok(registry.knowledge_bases)
}

/// 获取当前知识库
pub fn get_current_kb() -> Result<Option<String>, MemoError> {
    let registry = KnowledgeBaseRegistry::load()?;
    Ok(registry.current)
}

/// 切换知识库
pub fn switch_kb(path: &str) -> Result<(), MemoError> {
    let normalized_path = KnowledgeBaseRegistry::normalize_path_str(path);

    // 验证知识库是否存在
    if !Path::new(&normalized_path).join(".memoforge").exists() {
        return Err(MemoError {
            code: ErrorCode::NotInitialized,
            message: format!("Not a valid knowledge base: {}", normalized_path),
            retry_after_ms: None,
            context: None,
        });
    }

    let mut registry = KnowledgeBaseRegistry::load()?;
    registry.set_current(&normalized_path)?;

    // 重新初始化 store
    crate::store::close_store();
    crate::store::init_store(PathBuf::from(normalized_path))?;

    Ok(())
}

/// 注册新知识库
pub fn register_kb(path: &Path, name: Option<&str>) -> Result<(), MemoError> {
    let mut registry = KnowledgeBaseRegistry::load()?;
    registry.register(path, name)
}

/// 注销知识库
pub fn unregister_kb(path: &str) -> Result<(), MemoError> {
    let mut registry = KnowledgeBaseRegistry::load()?;
    registry.unregister(path)
}

/// 获取最近使用的知识库（按访问时间排序，最近的在前面）
pub fn get_recent_kbs(limit: usize) -> Result<Vec<KnowledgeBaseInfo>, MemoError> {
    let registry = KnowledgeBaseRegistry::load()?;
    let mut kbs = registry.knowledge_bases.clone();
    // 按访问时间降序排序（最近的在前）
    kbs.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));
    kbs.truncate(limit);
    Ok(kbs)
}

/// 获取上次使用的知识库路径
pub fn get_last_kb() -> Result<Option<String>, MemoError> {
    let registry = KnowledgeBaseRegistry::load()?;
    // 如果有当前知识库，优先返回
    if let Some(current) = &registry.current {
        // 验证路径是否仍然有效
        if Path::new(current).join(".memoforge").exists() {
            return Ok(Some(current.clone()));
        }
    }
    // 否则返回最近访问的知识库
    let mut kbs = registry.knowledge_bases;
    kbs.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));
    // 找到第一个仍然有效的知识库
    for kb in kbs {
        if Path::new(&kb.path).join(".memoforge").exists() {
            return Ok(Some(kb.path));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[cfg(unix)]
    #[test]
    fn normalize_dedupes_symlinked_registry_entries() {
        use std::os::unix::fs::symlink;

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("memoforge-registry-{unique}"));
        let real_kb = base.join("real-kb");
        let alias_kb = base.join("alias-kb");

        fs::create_dir_all(real_kb.join(".memoforge")).unwrap();
        symlink(&real_kb, &alias_kb).unwrap();

        let canonical = fs::canonicalize(&real_kb)
            .unwrap()
            .to_string_lossy()
            .to_string();

        let mut registry = KnowledgeBaseRegistry {
            knowledge_bases: vec![
                KnowledgeBaseInfo {
                    path: real_kb.to_string_lossy().to_string(),
                    name: "kb".to_string(),
                    last_accessed: "2026-03-25T00:00:00Z".to_string(),
                    is_default: true,
                },
                KnowledgeBaseInfo {
                    path: alias_kb.to_string_lossy().to_string(),
                    name: "kb-alias".to_string(),
                    last_accessed: "2026-03-26T00:00:00Z".to_string(),
                    is_default: false,
                },
            ],
            current: Some(alias_kb.to_string_lossy().to_string()),
        };

        assert!(registry.normalize());
        assert_eq!(registry.knowledge_bases.len(), 1);
        assert_eq!(registry.knowledge_bases[0].path, canonical);
        assert_eq!(registry.current.as_deref(), Some(canonical.as_str()));
        assert_eq!(registry.knowledge_bases[0].name, "kb-alias");

        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn registry_path_migrates_legacy_registry_file() {
        let _guard = env_lock().lock().unwrap();

        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let base = std::env::temp_dir().join(format!("memoforge-registry-migrate-{unique}"));
        let home = base.join("home");
        let new_registry_dir = base.join("new-registry");
        fs::create_dir_all(home.join(".memoforge")).unwrap();
        fs::create_dir_all(&new_registry_dir).unwrap();

        let legacy_registry_path = home.join(".memoforge").join(REGISTRY_FILE_NAME);
        fs::write(
            &legacy_registry_path,
            "knowledge_bases:\n  - path: /tmp/demo\n    name: demo\n    last_accessed: 2026-03-31T00:00:00Z\n    is_default: true\ncurrent: /tmp/demo\n",
        )
        .unwrap();

        let old_home = std::env::var_os("HOME");
        let old_userprofile = std::env::var_os("USERPROFILE");
        let old_registry_dir = std::env::var_os("MEMOFORGE_REGISTRY_DIR");

        std::env::set_var("HOME", &home);
        std::env::remove_var("USERPROFILE");
        std::env::set_var("MEMOFORGE_REGISTRY_DIR", &new_registry_dir);

        let registry_path = KnowledgeBaseRegistry::registry_path().unwrap();
        let migrated = fs::read_to_string(&registry_path).unwrap();

        assert_eq!(registry_path, new_registry_dir.join(REGISTRY_FILE_NAME));
        assert!(migrated.contains("knowledge_bases"));
        assert!(migrated.contains("/tmp/demo"));

        match old_home {
            Some(value) => std::env::set_var("HOME", value),
            None => std::env::remove_var("HOME"),
        }
        match old_userprofile {
            Some(value) => std::env::set_var("USERPROFILE", value),
            None => std::env::remove_var("USERPROFILE"),
        }
        match old_registry_dir {
            Some(value) => std::env::set_var("MEMOFORGE_REGISTRY_DIR", value),
            None => std::env::remove_var("MEMOFORGE_REGISTRY_DIR"),
        }

        fs::remove_dir_all(&base).unwrap();
    }
}
