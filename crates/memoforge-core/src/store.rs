//! KnowledgeStore 状态管理
//! 参考: 技术实现文档 §2.1.1

use crate::cache::KnowledgeCache;
use crate::error::{ErrorCode, MemoError};
use crate::lock::LockManager;
use std::ops::Deref;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

/// 知识库存储
pub struct KnowledgeStore {
    pub kb_path: PathBuf,
    pub cache: KnowledgeCache,
    pub lock_manager: LockManager,
}

impl KnowledgeStore {
    pub fn new(kb_path: PathBuf) -> Self {
        let lock_manager = LockManager::new(kb_path.clone());
        Self {
            kb_path,
            cache: KnowledgeCache::new(1000),
            lock_manager,
        }
    }
}

/// 全局存储实例
static STORE: RwLock<Option<Arc<RwLock<KnowledgeStore>>>> = RwLock::new(None);

/// 存储守卫（自动解引用到 KnowledgeStore）
pub struct StoreGuard {
    inner: Arc<RwLock<KnowledgeStore>>,
}

impl Deref for StoreGuard {
    type Target = RwLock<KnowledgeStore>;

    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

/// 初始化知识库
pub fn init_store(kb_path: PathBuf) -> Result<(), MemoError> {
    let store = Arc::new(RwLock::new(KnowledgeStore::new(kb_path)));
    let mut global = STORE.write().unwrap();
    *global = Some(store);
    Ok(())
}

/// 获取知识库实例
pub fn get_store() -> Result<StoreGuard, MemoError> {
    let global = STORE.read().unwrap();
    match global.as_ref() {
        Some(store) => Ok(StoreGuard {
            inner: Arc::clone(store),
        }),
        None => Err(MemoError {
            code: ErrorCode::NotInitialized,
            message: "知识库未初始化".to_string(),
            retry_after_ms: None,
            context: None,
        }),
    }
}

/// 关闭知识库
pub fn close_store() {
    let mut global = STORE.write().unwrap();
    *global = None;
}
