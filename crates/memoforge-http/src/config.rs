//! HTTP Server Configuration

use serde::{Deserialize, Serialize};

/// HTTP Server Configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpConfig {
    /// Bind address (default: 127.0.0.1)
    pub bind: String,
    /// Port (default: 8080)
    pub port: u16,
    /// Allowed CORS origins
    pub allowed_origins: Vec<String>,
    /// Authentication token (Bearer token)
    pub auth_token: Option<String>,
    /// Read-only mode
    pub readonly: bool,
    /// Rate limit (requests per minute per IP)
    pub rate_limit: u32,
    /// Rate limit window in seconds
    pub rate_limit_window_secs: u64,
}

impl Default for HttpConfig {
    fn default() -> Self {
        Self {
            bind: "127.0.0.1".to_string(),
            port: 8080,
            allowed_origins: vec![],
            auth_token: None,
            readonly: false,
            rate_limit: 60,
            rate_limit_window_secs: 60,
        }
    }
}

impl HttpConfig {
    /// Create config from environment variables
    pub fn from_env() -> Self {
        Self {
            bind: std::env::var("MEMOFORGE_HTTP_BIND")
                .unwrap_or_else(|_| "127.0.0.1".to_string()),
            port: std::env::var("MEMOFORGE_HTTP_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8080),
            allowed_origins: std::env::var("MEMOFORGE_CORS_ORIGINS")
                .ok()
                .map(|s| s.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or_default(),
            auth_token: std::env::var("MEMOFORGE_AUTH_TOKEN").ok(),
            readonly: std::env::var("MEMOFORGE_READONLY")
                .ok()
                .map(|v| v == "true" || v == "1")
                .unwrap_or(false),
            rate_limit: std::env::var("MEMOFORGE_RATE_LIMIT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(60),
            rate_limit_window_secs: std::env::var("MEMOFORGE_RATE_LIMIT_WINDOW")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(60),
        }
    }

    /// Get the bind address string
    pub fn bind_address(&self) -> String {
        format!("{}:{}", self.bind, self.port)
    }
}
