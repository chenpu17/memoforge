//! 知识缓存系统
//! 参考: 技术实现文档 §2.1, PRD §6.2

use lru::LruCache;
use std::num::NonZeroUsize;
use std::path::PathBuf;

/// L0 级别数据（目录列表）
#[derive(Clone, Debug)]
pub struct L0Data {
    pub path: PathBuf,
    pub title: String,
    pub tags: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// L1 级别数据（摘要）
#[derive(Clone, Debug)]
pub struct L1Data {
    pub summary: String,
    pub summary_stale: bool,
}

/// L2 级别数据（全文）
#[derive(Clone, Debug)]
pub struct L2Data {
    pub content: String,
}

/// 知识缓存
pub struct KnowledgeCache {
    l0: LruCache<PathBuf, L0Data>,
    l1: LruCache<PathBuf, L1Data>,
    l2: LruCache<PathBuf, L2Data>,
}

impl KnowledgeCache {
    pub fn new(capacity: usize) -> Self {
        let cap = NonZeroUsize::new(capacity).unwrap();
        Self {
            l0: LruCache::new(cap),
            l1: LruCache::new(cap),
            l2: LruCache::new(cap),
        }
    }

    pub fn get_l0(&mut self, path: &PathBuf) -> Option<&L0Data> {
        self.l0.get(path)
    }

    pub fn put_l0(&mut self, path: PathBuf, data: L0Data) {
        self.l0.put(path, data);
    }

    pub fn get_l1(&mut self, path: &PathBuf) -> Option<&L1Data> {
        self.l1.get(path)
    }

    pub fn put_l1(&mut self, path: PathBuf, data: L1Data) {
        self.l1.put(path, data);
    }

    pub fn get_l2(&mut self, path: &PathBuf) -> Option<&L2Data> {
        self.l2.get(path)
    }

    pub fn put_l2(&mut self, path: PathBuf, data: L2Data) {
        self.l2.put(path, data);
    }

    /// 清除指定路径的所有缓存
    pub fn invalidate(&mut self, path: &PathBuf) {
        self.l0.pop(path);
        self.l1.pop(path);
        self.l2.pop(path);
    }

    /// 清除所有缓存
    pub fn clear(&mut self) {
        self.l0.clear();
        self.l1.clear();
        self.l2.clear();
    }
}
