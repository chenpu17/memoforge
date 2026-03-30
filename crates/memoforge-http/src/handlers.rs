//! HTTP Request Handlers

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::error::{HttpError, Result};
use crate::AppState;

/// Validate KB path to prevent path traversal attacks
fn validate_kb_path(path: &std::path::Path) -> std::result::Result<(), HttpError> {
    // Get canonicalized path (resolves .. and symlinks)
    let canonical = path
        .canonicalize()
        .map_err(|e| HttpError::BadRequest(format!("Invalid path: {}", e)))?;

    let path_str = canonical.to_string_lossy();

    // Block system sensitive directories
    let blocked_prefixes = ["/etc", "/sys", "/proc", "/dev", "/root"];
    for prefix in blocked_prefixes {
        if path_str.starts_with(prefix) || path_str.contains(&format!("{}/", prefix)) {
            return Err(HttpError::BadRequest(
                "Access to system directories is not allowed".to_string(),
            ));
        }
    }

    // Restrict to safe directories (home, temp, or var/folders)
    if let Ok(home) = std::env::var("HOME") {
        if !path_str.starts_with(&home)
            && !path_str.starts_with("/tmp")
            && !path_str.starts_with("/var/folders")
            && !path_str.starts_with("/private/var/folders")
            && !path_str.starts_with("/Users")
        {
            // macOS home directories
            return Err(HttpError::BadRequest(
                "Path must be within home directory or allowed temp directories".to_string(),
            ));
        }
    }

    Ok(())
}
use memoforge_core::git::{git_commit, git_pull, git_push, git_status};
use memoforge_core::{
    complete_knowledge_links, create_category, create_knowledge, delete_category, delete_knowledge,
    get_backlinks, get_knowledge_by_id, get_knowledge_graph, get_knowledge_with_stale, get_related,
    get_status, get_tags, get_tags_with_counts, grep,
    import::{import_markdown_folder, preview_import},
    list_categories, list_knowledge, move_knowledge, preview_delete_knowledge,
    preview_move_knowledge,
    registry::{get_current_kb, list_knowledge_bases, register_kb, switch_kb, unregister_kb},
    search_knowledge, update_category, update_knowledge, BacklinksResult, Category, DeletePreview,
    GrepMatch, ImportOptions, ImportStats, Knowledge, KnowledgeBaseInfo, KnowledgeGraph,
    KnowledgeLinkCompletion, KnowledgeWithStale, LoadLevel, MovePreview, RelatedResult,
};

// ============================================================================
// Query Parameters
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct ListKnowledgeQuery {
    pub level: Option<u8>,
    pub category_id: Option<String>,
    pub tags: Option<String>, // Comma-separated
    pub limit: Option<usize>,
    pub offset: Option<usize>,
}

impl ListKnowledgeQuery {
    fn get_tags(&self) -> Option<Vec<String>> {
        self.tags.as_ref().map(|t| {
            t.split(',')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect()
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub query: String,
    pub tags: Option<String>, // Comma-separated
    pub limit: Option<usize>,
}

impl SearchQuery {
    fn get_tags(&self) -> Option<Vec<String>> {
        self.tags
            .as_ref()
            .map(|t| t.split(',').map(|s| s.trim().to_string()).collect())
    }
}

#[derive(Debug, Deserialize)]
pub struct KnowledgeLinkCompletionQuery {
    pub query: Option<String>,
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct GrepQuery {
    pub query: String,
    pub tags: Option<String>, // Comma-separated
    pub category_id: Option<String>,
    pub limit: Option<usize>,
}

impl GrepQuery {
    fn get_tags(&self) -> Option<Vec<String>> {
        self.tags
            .as_ref()
            .map(|t| t.split(',').map(|s| s.trim().to_string()).collect())
    }
}

#[derive(Debug, Deserialize)]
pub struct TagsQuery {
    pub prefix: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct KnowledgeItemQuery {
    pub id: String,
    pub level: Option<u8>,
}

#[derive(Debug, Deserialize)]
pub struct KnowledgeIdQuery {
    pub id: String,
}

// ============================================================================
// Request Bodies
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateKnowledgeBody {
    pub title: String,
    pub content: String,
    pub tags: Option<Vec<String>>,
    pub category_id: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateKnowledgeBody {
    pub title: Option<String>,
    pub content: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryBody {
    pub name: String,
    pub parent_id: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryBody {
    pub name: Option<String>,
    pub description: Option<String>,
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct StatusResponse {
    pub initialized: bool,
    pub knowledge_count: usize,
    pub category_count: usize,
    pub git_initialized: bool,
    pub readonly: bool,
}

#[derive(Debug, Serialize)]
pub struct KnowledgeListResponse {
    pub items: Vec<Knowledge>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct SingleKnowledgeResponse {
    #[serde(flatten)]
    pub knowledge: Knowledge,
}

#[derive(Debug, Serialize)]
pub struct TagsResponse {
    pub tags: Vec<String>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct TagWithCount {
    pub tag: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct TagsWithCountsResponse {
    pub tags: Vec<TagWithCount>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct CategoryListResponse {
    pub categories: Vec<Category>,
}

#[derive(Debug, Serialize)]
pub struct GrepResponse {
    pub results: Vec<GrepMatch>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct CreateResponse {
    pub id: String,
    pub created: bool,
}

#[derive(Debug, Serialize)]
pub struct GitStatusResponse {
    pub files: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct GitCommitBody {
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct ImportBody {
    pub source_path: String,
    pub generate_frontmatter: bool,
    pub auto_categories: bool,
    pub dry_run: bool,
}

#[derive(Debug, Deserialize)]
pub struct MoveKnowledgeBody {
    pub new_category_id: String,
}

#[derive(Debug, Deserialize)]
pub struct SwitchKbBody {
    pub path: String,
}

// ============================================================================
// Handlers
// ============================================================================

/// GET /api/status - Get knowledge base status
pub async fn get_status_handler(State(state): State<AppState>) -> Result<Json<StatusResponse>> {
    let Ok(kb_path) = state.get_kb_path().await else {
        return Ok(Json(StatusResponse {
            initialized: false,
            knowledge_count: 0,
            category_count: 0,
            git_initialized: false,
            readonly: state.config.readonly,
        }));
    };

    let (knowledge_count, category_count, git_initialized) =
        get_status(&kb_path).map_err(HttpError::from)?;

    Ok(Json(StatusResponse {
        initialized: true,
        knowledge_count,
        category_count,
        git_initialized,
        readonly: state.config.readonly,
    }))
}

/// GET /api/knowledge - List all knowledge entries
pub async fn list_knowledge_handler(
    State(state): State<AppState>,
    Query(query): Query<ListKnowledgeQuery>,
) -> Result<Json<KnowledgeListResponse>> {
    let kb_path = state.get_kb_path().await?;

    let level = match query.level.unwrap_or(1) {
        0 => LoadLevel::L0,
        1 => LoadLevel::L1,
        _ => LoadLevel::L2,
    };

    let knowledge = list_knowledge(
        &kb_path,
        level,
        query.category_id.as_deref(),
        query.get_tags().as_deref(),
        query.limit,
        query.offset,
    )
    .map_err(HttpError::from)?;

    Ok(Json(KnowledgeListResponse {
        items: knowledge.items,
        total: knowledge.total,
    }))
}

/// GET /api/knowledge/:id - Get single knowledge entry
pub async fn get_knowledge_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Knowledge>> {
    let kb_path = state.get_kb_path().await?;

    let knowledge = get_knowledge_by_id(&kb_path, &id, LoadLevel::L2).map_err(HttpError::from)?;

    Ok(Json(knowledge))
}

/// GET /api/knowledge/item?id=... - Get single knowledge entry
pub async fn get_knowledge_item_handler(
    State(state): State<AppState>,
    Query(query): Query<KnowledgeItemQuery>,
) -> Result<Json<Knowledge>> {
    let kb_path = state.get_kb_path().await?;
    let level = match query.level.unwrap_or(2) {
        0 => LoadLevel::L0,
        1 => LoadLevel::L1,
        _ => LoadLevel::L2,
    };

    let knowledge = get_knowledge_by_id(&kb_path, &query.id, level).map_err(HttpError::from)?;

    Ok(Json(knowledge))
}

/// GET /api/knowledge/:id/stale - Get knowledge with stale info
pub async fn get_knowledge_with_stale_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<KnowledgeWithStale>> {
    let kb_path = state.get_kb_path().await?;

    let result = get_knowledge_with_stale(&kb_path, &id).map_err(HttpError::from)?;

    Ok(Json(result))
}

/// GET /api/knowledge/stale?id=... - Get knowledge with stale info
pub async fn get_knowledge_stale_item_handler(
    State(state): State<AppState>,
    Query(query): Query<KnowledgeIdQuery>,
) -> Result<Json<KnowledgeWithStale>> {
    let kb_path = state.get_kb_path().await?;

    let result = get_knowledge_with_stale(&kb_path, &query.id).map_err(HttpError::from)?;

    Ok(Json(result))
}

/// POST /api/knowledge - Create new knowledge (requires auth)
pub async fn create_knowledge_handler(
    State(state): State<AppState>,
    Json(body): Json<CreateKnowledgeBody>,
) -> Result<Json<CreateResponse>> {
    // Check readonly mode
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;

    let id = create_knowledge(
        &kb_path,
        &body.title,
        &body.content,
        body.tags.unwrap_or_default(),
        body.category_id,
        body.summary,
    )
    .map_err(HttpError::from)?;

    Ok(Json(CreateResponse { id, created: true }))
}

/// PUT /api/knowledge/:id - Update knowledge (requires auth)
pub async fn update_knowledge_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateKnowledgeBody>,
) -> Result<StatusCode> {
    // Check readonly mode
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;

    update_knowledge(
        &kb_path,
        &id,
        body.title.as_deref(),
        body.content.as_deref(),
        body.tags,
        body.category.as_deref(),
        body.summary.as_deref(),
    )
    .map_err(HttpError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

/// PUT /api/knowledge/item?id=... - Update knowledge by query id
pub async fn update_knowledge_item_handler(
    State(state): State<AppState>,
    Query(query): Query<KnowledgeIdQuery>,
    Json(body): Json<UpdateKnowledgeBody>,
) -> Result<StatusCode> {
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;

    update_knowledge(
        &kb_path,
        &query.id,
        body.title.as_deref(),
        body.content.as_deref(),
        body.tags,
        body.category.as_deref(),
        body.summary.as_deref(),
    )
    .map_err(HttpError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/knowledge/:id - Delete knowledge (requires auth)
pub async fn delete_knowledge_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    // Check readonly mode
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;

    delete_knowledge(&kb_path, &id).map_err(HttpError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/knowledge/item?id=... - Delete knowledge by query id
pub async fn delete_knowledge_item_handler(
    State(state): State<AppState>,
    Query(query): Query<KnowledgeIdQuery>,
) -> Result<StatusCode> {
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;

    delete_knowledge(&kb_path, &query.id).map_err(HttpError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/categories - List all categories
pub async fn list_categories_handler(
    State(state): State<AppState>,
) -> Result<Json<CategoryListResponse>> {
    let kb_path = state.get_kb_path().await?;

    let categories = list_categories(&kb_path).map_err(HttpError::from)?;

    Ok(Json(CategoryListResponse { categories }))
}

/// POST /api/categories - Create new category (requires auth)
pub async fn create_category_handler(
    State(state): State<AppState>,
    Json(body): Json<CreateCategoryBody>,
) -> Result<Json<CreateResponse>> {
    // Check readonly mode
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;

    let id = create_category(&kb_path, &body.name, body.parent_id, body.description)
        .map_err(HttpError::from)?;

    Ok(Json(CreateResponse { id, created: true }))
}

/// PUT /api/categories/:id - Update category (requires auth)
pub async fn update_category_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateCategoryBody>,
) -> Result<StatusCode> {
    // Check readonly mode
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;

    update_category(
        &kb_path,
        &id,
        body.name.as_deref(),
        body.description.as_deref(),
    )
    .map_err(HttpError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

/// DELETE /api/categories/:id - Delete category (requires auth)
pub async fn delete_category_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode> {
    // Check readonly mode
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;

    delete_category(&kb_path, &id, false).map_err(HttpError::from)?;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/tags - List all tags
pub async fn get_tags_handler(
    State(state): State<AppState>,
    Query(query): Query<TagsQuery>,
) -> Result<Json<TagsResponse>> {
    let kb_path = state.get_kb_path().await?;

    let tags = get_tags(&kb_path, query.prefix.as_deref()).map_err(HttpError::from)?;

    Ok(Json(TagsResponse {
        total: tags.len(),
        tags,
    }))
}

/// GET /api/tags/with-counts - List all tags with counts
pub async fn get_tags_with_counts_handler(
    State(state): State<AppState>,
) -> Result<Json<TagsWithCountsResponse>> {
    let kb_path = state.get_kb_path().await?;

    let tags_with_counts = get_tags_with_counts(&kb_path).map_err(HttpError::from)?;

    Ok(Json(TagsWithCountsResponse {
        total: tags_with_counts.len(),
        tags: tags_with_counts
            .into_iter()
            .map(|(tag, count)| TagWithCount { tag, count })
            .collect(),
    }))
}

/// GET /api/search - Search knowledge
pub async fn search_handler(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Result<Json<KnowledgeListResponse>> {
    let kb_path = state.get_kb_path().await?;

    let results = search_knowledge(
        &kb_path,
        &query.query,
        query.get_tags().as_deref(),
        None,
        query.limit,
    )
    .map_err(HttpError::from)?;

    Ok(Json(KnowledgeListResponse {
        items: results,
        total: 0, // Search doesn't return total
    }))
}

/// GET /api/knowledge/link-completions - Complete wiki links
pub async fn complete_knowledge_links_handler(
    State(state): State<AppState>,
    Query(query): Query<KnowledgeLinkCompletionQuery>,
) -> Result<Json<Vec<KnowledgeLinkCompletion>>> {
    let kb_path = state.get_kb_path().await?;

    let results =
        complete_knowledge_links(&kb_path, query.query.as_deref().unwrap_or(""), query.limit)
            .map_err(HttpError::from)?;

    Ok(Json(results))
}

/// GET /api/grep - Grep knowledge content
pub async fn grep_handler(
    State(state): State<AppState>,
    Query(query): Query<GrepQuery>,
) -> Result<Json<GrepResponse>> {
    let kb_path = state.get_kb_path().await?;

    let results = grep(
        &kb_path,
        &query.query,
        query.get_tags().as_deref(),
        query.category_id.as_deref(),
        query.limit,
    )
    .map_err(HttpError::from)?;

    Ok(Json(GrepResponse {
        total: results.len(),
        results,
    }))
}

// ============================================================================
// KB Management Handlers
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct InitKbBody {
    pub path: String,
    pub mode: String, // "open" or "new"
}

/// POST /api/kb/init - Initialize knowledge base
pub async fn init_kb_handler(
    State(state): State<AppState>,
    Json(body): Json<InitKbBody>,
) -> Result<StatusCode> {
    // Check readonly mode
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = PathBuf::from(&body.path);

    // Validate path to prevent traversal attacks
    validate_kb_path(&kb_path)?;

    match body.mode.as_str() {
        "open" => memoforge_core::init::init_open(&kb_path).map_err(HttpError::from)?,
        "new" => memoforge_core::init::init_new(&kb_path, false).map_err(HttpError::from)?,
        _ => return Err(HttpError::BadRequest("Invalid mode".to_string())),
    }

    memoforge_core::init_store(kb_path.clone()).map_err(HttpError::from)?;
    register_kb(&kb_path, None).map_err(HttpError::from)?;
    state.set_kb_path(kb_path).await;

    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/git/status - Get git status
pub async fn git_status_handler(State(state): State<AppState>) -> Result<Json<GitStatusResponse>> {
    let kb_path = state.get_kb_path().await?;
    let files = git_status(&kb_path).map_err(HttpError::from)?;
    Ok(Json(GitStatusResponse { files }))
}

/// POST /api/git/commit - Create git commit
pub async fn git_commit_handler(
    State(state): State<AppState>,
    Json(body): Json<GitCommitBody>,
) -> Result<StatusCode> {
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;
    git_commit(&kb_path, &body.message).map_err(HttpError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/git/pull - Pull from remote
pub async fn git_pull_handler(State(state): State<AppState>) -> Result<StatusCode> {
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;
    git_pull(&kb_path).map_err(HttpError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/git/push - Push to remote
pub async fn git_push_handler(State(state): State<AppState>) -> Result<StatusCode> {
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;
    git_push(&kb_path).map_err(HttpError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

/// GET /api/knowledge/:id/delete-preview - Preview delete impact
pub async fn preview_delete_knowledge_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<DeletePreview>> {
    let kb_path = state.get_kb_path().await?;
    let preview = preview_delete_knowledge(&kb_path, &id).map_err(HttpError::from)?;
    Ok(Json(preview))
}

/// GET /api/knowledge/delete-preview?id=... - Preview delete impact
pub async fn preview_delete_knowledge_item_handler(
    State(state): State<AppState>,
    Query(query): Query<KnowledgeIdQuery>,
) -> Result<Json<DeletePreview>> {
    let kb_path = state.get_kb_path().await?;
    let preview = preview_delete_knowledge(&kb_path, &query.id).map_err(HttpError::from)?;
    Ok(Json(preview))
}

/// POST /api/knowledge/:id/move-preview - Preview move impact
pub async fn move_knowledge_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<MoveKnowledgeBody>,
) -> Result<StatusCode> {
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;
    move_knowledge(&kb_path, &id, &body.new_category_id).map_err(HttpError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/knowledge/move?id=... - Move knowledge
pub async fn move_knowledge_item_handler(
    State(state): State<AppState>,
    Query(query): Query<KnowledgeIdQuery>,
    Json(body): Json<MoveKnowledgeBody>,
) -> Result<StatusCode> {
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;
    move_knowledge(&kb_path, &query.id, &body.new_category_id).map_err(HttpError::from)?;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/knowledge/:id/move-preview - Preview move impact
pub async fn preview_move_knowledge_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<MoveKnowledgeBody>,
) -> Result<Json<MovePreview>> {
    let kb_path = state.get_kb_path().await?;
    let preview =
        preview_move_knowledge(&kb_path, &id, &body.new_category_id).map_err(HttpError::from)?;
    Ok(Json(preview))
}

/// POST /api/knowledge/move-preview?id=... - Preview move impact
pub async fn preview_move_knowledge_item_handler(
    State(state): State<AppState>,
    Query(query): Query<KnowledgeIdQuery>,
    Json(body): Json<MoveKnowledgeBody>,
) -> Result<Json<MovePreview>> {
    let kb_path = state.get_kb_path().await?;
    let preview = preview_move_knowledge(&kb_path, &query.id, &body.new_category_id)
        .map_err(HttpError::from)?;
    Ok(Json(preview))
}

/// GET /api/knowledge/:id/backlinks - Get backlinks
pub async fn get_backlinks_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<BacklinksResult>> {
    let kb_path = state.get_kb_path().await?;
    let result = get_backlinks(&kb_path, &id).map_err(HttpError::from)?;
    Ok(Json(result))
}

/// GET /api/knowledge/backlinks?id=... - Get backlinks
pub async fn get_backlinks_item_handler(
    State(state): State<AppState>,
    Query(query): Query<KnowledgeIdQuery>,
) -> Result<Json<BacklinksResult>> {
    let kb_path = state.get_kb_path().await?;
    let result = get_backlinks(&kb_path, &query.id).map_err(HttpError::from)?;
    Ok(Json(result))
}

/// GET /api/knowledge/:id/related - Get related knowledge
pub async fn get_related_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<RelatedResult>> {
    let kb_path = state.get_kb_path().await?;
    let result = get_related(&kb_path, &id).map_err(HttpError::from)?;
    Ok(Json(result))
}

/// GET /api/knowledge/related?id=... - Get related knowledge
pub async fn get_related_item_handler(
    State(state): State<AppState>,
    Query(query): Query<KnowledgeIdQuery>,
) -> Result<Json<RelatedResult>> {
    let kb_path = state.get_kb_path().await?;
    let result = get_related(&kb_path, &query.id).map_err(HttpError::from)?;
    Ok(Json(result))
}

/// GET /api/knowledge/graph - Get knowledge graph
pub async fn get_knowledge_graph_handler(
    State(state): State<AppState>,
) -> Result<Json<KnowledgeGraph>> {
    let kb_path = state.get_kb_path().await?;
    let graph = get_knowledge_graph(&kb_path).map_err(HttpError::from)?;
    Ok(Json(graph))
}

/// POST /api/import/preview - Preview import
pub async fn preview_import_handler(
    State(state): State<AppState>,
    Json(body): Json<ImportBody>,
) -> Result<Json<ImportStats>> {
    let kb_path = state.get_kb_path().await?;
    let stats = preview_import(&kb_path, PathBuf::from(body.source_path).as_path())
        .map_err(|e| HttpError::Internal(e.to_string()))?;
    Ok(Json(stats))
}

/// POST /api/import - Import Markdown folder
pub async fn import_folder_handler(
    State(state): State<AppState>,
    Json(body): Json<ImportBody>,
) -> Result<Json<ImportStats>> {
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    let kb_path = state.get_kb_path().await?;
    let options = ImportOptions {
        generate_frontmatter: body.generate_frontmatter,
        auto_categories: body.auto_categories,
        dry_run: body.dry_run,
    };
    let stats =
        import_markdown_folder(&kb_path, PathBuf::from(body.source_path).as_path(), options)
            .map_err(|e| HttpError::Internal(e.to_string()))?;
    Ok(Json(stats))
}

/// GET /api/kb/list - List registered knowledge bases
pub async fn list_kb_handler() -> Result<Json<Vec<KnowledgeBaseInfo>>> {
    let list = list_knowledge_bases().map_err(HttpError::from)?;
    Ok(Json(list))
}

/// GET /api/kb/current - Get current knowledge base
pub async fn get_current_kb_handler() -> Result<Json<Option<String>>> {
    let current = get_current_kb().map_err(HttpError::from)?;
    Ok(Json(current))
}

/// POST /api/kb/switch - Switch active knowledge base
pub async fn switch_kb_handler(
    State(state): State<AppState>,
    Json(body): Json<SwitchKbBody>,
) -> Result<StatusCode> {
    if state.config.readonly {
        return Err(HttpError::Readonly);
    }

    switch_kb(&body.path).map_err(HttpError::from)?;
    state.set_kb_path(PathBuf::from(body.path)).await;
    Ok(StatusCode::NO_CONTENT)
}

/// POST /api/kb/unregister - Unregister a knowledge base
pub async fn unregister_kb_handler(Json(body): Json<SwitchKbBody>) -> Result<StatusCode> {
    unregister_kb(&body.path).map_err(HttpError::from)?;
    Ok(StatusCode::NO_CONTENT)
}
