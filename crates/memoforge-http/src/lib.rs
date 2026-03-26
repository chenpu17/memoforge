//! MemoForge HTTP Server
//! REST API for web access

pub mod config;
pub mod error;
pub mod handlers;
pub mod middleware;
pub mod routes;

pub use config::HttpConfig;
pub use error::{HttpError, Result};

use axum::Router;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    kb_path: Arc<Mutex<Option<PathBuf>>>,
    pub config: HttpConfig,
}

impl AppState {
    pub fn new(config: HttpConfig) -> Self {
        Self {
            kb_path: Arc::new(Mutex::new(None)),
            config,
        }
    }

    pub async fn get_kb_path(&self) -> Result<PathBuf> {
        self.kb_path
            .lock()
            .await
            .clone()
            .ok_or_else(|| HttpError::NotInitialized)
    }

    pub async fn set_kb_path(&self, path: PathBuf) {
        *self.kb_path.lock().await = Some(path);
    }
}

/// Create the HTTP server
pub fn create_server(state: AppState) -> Router {
    routes::create_router(state)
}

/// Start the HTTP server
pub async fn serve(config: HttpConfig) -> Result<()> {
    let state = AppState::new(config.clone());
    let app = create_server(state);

    let addr: SocketAddr = config
        .bind_address()
        .parse()
        .map_err(|e| HttpError::ConfigError(format!("Invalid bind address: {}", e)))?;

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| HttpError::ConfigError(format!("Failed to bind: {}", e)))?;

    tracing::info!("HTTP server listening on {}", addr);

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .map_err(|e| HttpError::Internal(e.to_string()))?;

    Ok(())
}
