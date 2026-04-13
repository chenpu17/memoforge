//! Core data structures
//! Task 1.4: Knowledge, Category, Frontmatter definitions

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::governance::{EvidenceMeta, FreshnessPolicy};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Frontmatter {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    /// Hash of content when summary was last generated.
    /// Used to detect if summary is stale (content changed since summary was written).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary_hash: Option<String>,
    #[serde(alias = "created")]
    pub created_at: DateTime<Utc>,
    #[serde(alias = "updated")]
    pub updated_at: DateTime<Utc>,
    /// Knowledge evidence metadata (v0.3.0)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence: Option<EvidenceMeta>,
    /// Knowledge freshness policy (v0.3.0)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub freshness: Option<FreshnessPolicy>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Knowledge {
    pub id: String,
    pub title: String,
    pub tags: Vec<String>,
    pub category: Option<String>,
    pub summary: Option<String>,
    pub content: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Indicates if the summary is stale (content has changed since summary was generated)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary_stale: Option<bool>,
}

/// Knowledge with extended metadata including staleness info
#[derive(Debug, Clone, Serialize)]
pub struct KnowledgeWithStale {
    #[serde(flatten)]
    pub knowledge: Knowledge,
    /// Whether the summary is stale (content changed since summary was written)
    pub summary_stale: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LoadLevel {
    L0, // frontmatter only
    L1, // L0 + summary
    L2, // L0 + L1 + content
}
