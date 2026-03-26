//! HTTP Routes Configuration

use axum::{
    http::StatusCode,
    http::HeaderValue,
    middleware,
    routing::{delete, get, options, post, put},
    Router,
};
use tower_http::cors::{Any, CorsLayer};

use crate::handlers;
use crate::middleware::auth::auth_middleware;
use crate::middleware::{rate_limit_middleware, RateLimiter};
use crate::AppState;

/// Create the main router
pub fn create_router(state: AppState) -> Router {
    // Create rate limiter
    let rate_limiter = RateLimiter::new(
        state.config.rate_limit,
        state.config.rate_limit_window_secs,
    );

    // Public routes (no auth required for read operations)
    let public_routes = Router::new()
        .route("/api/status", get(handlers::get_status_handler))
        .route("/api/knowledge", get(handlers::list_knowledge_handler))
        .route("/api/knowledge/item", get(handlers::get_knowledge_item_handler))
        .route("/api/knowledge/stale", get(handlers::get_knowledge_stale_item_handler))
        .route("/api/knowledge/delete-preview", get(handlers::preview_delete_knowledge_item_handler))
        .route("/api/knowledge/move", options(preflight_ok))
        .route("/api/knowledge/move-preview", options(preflight_ok))
        .route("/api/knowledge/backlinks", get(handlers::get_backlinks_item_handler))
        .route("/api/knowledge/related", get(handlers::get_related_item_handler))
        .route("/api/knowledge/{id}", get(handlers::get_knowledge_handler))
        .route("/api/knowledge/{id}/stale", get(handlers::get_knowledge_with_stale_handler))
        .route("/api/knowledge/{id}/delete-preview", get(handlers::preview_delete_knowledge_handler))
        .route("/api/knowledge/{id}/move", options(preflight_ok))
        .route("/api/knowledge/{id}/move-preview", options(preflight_ok))
        .route("/api/knowledge/{id}/backlinks", get(handlers::get_backlinks_handler))
        .route("/api/knowledge/{id}/related", get(handlers::get_related_handler))
        .route("/api/knowledge/graph", get(handlers::get_knowledge_graph_handler))
        .route("/api/categories", get(handlers::list_categories_handler))
        .route("/api/tags", get(handlers::get_tags_handler))
        .route("/api/tags/with-counts", get(handlers::get_tags_with_counts_handler))
        .route("/api/search", get(handlers::search_handler))
        .route("/api/grep", get(handlers::grep_handler))
        .route("/api/git/status", get(handlers::git_status_handler))
        .route("/api/kb/list", get(handlers::list_kb_handler))
        .route("/api/kb/current", get(handlers::get_current_kb_handler));

    // Protected routes (auth required for write operations)
    let protected_routes = Router::new()
        .route("/api/knowledge", post(handlers::create_knowledge_handler))
        .route("/api/knowledge/item", put(handlers::update_knowledge_item_handler))
        .route("/api/knowledge/item", delete(handlers::delete_knowledge_item_handler))
        .route("/api/knowledge/move", post(handlers::move_knowledge_item_handler))
        .route("/api/knowledge/move-preview", post(handlers::preview_move_knowledge_item_handler))
        .route("/api/knowledge/{id}", put(handlers::update_knowledge_handler))
        .route("/api/knowledge/{id}", delete(handlers::delete_knowledge_handler))
        .route("/api/knowledge/{id}/move", post(handlers::move_knowledge_handler))
        .route("/api/knowledge/{id}/move-preview", post(handlers::preview_move_knowledge_handler))
        .route("/api/categories", post(handlers::create_category_handler))
        .route("/api/categories/{id}", put(handlers::update_category_handler))
        .route("/api/categories/{id}", delete(handlers::delete_category_handler))
        .route("/api/kb/init", post(handlers::init_kb_handler))
        .route("/api/kb/switch", post(handlers::switch_kb_handler))
        .route("/api/kb/unregister", post(handlers::unregister_kb_handler))
        .route("/api/import/preview", post(handlers::preview_import_handler))
        .route("/api/import", post(handlers::import_folder_handler))
        .route("/api/git/commit", post(handlers::git_commit_handler))
        .route("/api/git/pull", post(handlers::git_pull_handler))
        .route("/api/git/push", post(handlers::git_push_handler))
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware));

    // Build CORS layer
    let cors_layer = create_cors_layer(&state.config);

    // Combine routes with rate limiting
    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
        .layer(cors_layer)
        .layer(middleware::from_fn_with_state(rate_limiter, rate_limit_middleware))
        .with_state(state)
}

async fn preflight_ok() -> StatusCode {
    StatusCode::NO_CONTENT
}

/// Create CORS layer based on configuration
fn create_cors_layer(config: &crate::config::HttpConfig) -> CorsLayer {
    if config.allowed_origins.is_empty() {
        // Default: no CORS allowed
        CorsLayer::new()
    } else {
        let origins: Vec<HeaderValue> = config.allowed_origins.iter()
            .filter_map(|origin| origin.parse().ok())
            .collect();

        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(Any)
            .allow_headers(Any)
    }
}
