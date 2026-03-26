//! HTTP Error Handling

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, HttpError>;

#[derive(Debug, Error)]
pub enum HttpError {
    #[error("Knowledge base not initialized")]
    NotInitialized,

    #[error("Knowledge not found: {0}")]
    NotFound(String),

    #[error("Category not found: {0}")]
    CategoryNotFound(String),

    #[error("Invalid request: {0}")]
    BadRequest(String),

    #[error("Unauthorized")]
    Unauthorized,

    #[error("Read-only mode")]
    Readonly,

    #[error("Rate limit exceeded")]
    RateLimited,

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<memoforge_core::MemoError> for HttpError {
    fn from(e: memoforge_core::MemoError) -> Self {
        use memoforge_core::ErrorCode;

        match e.code {
            ErrorCode::NotInitialized => HttpError::NotInitialized,
            ErrorCode::NotFoundKnowledge => HttpError::NotFound(e.message),
            ErrorCode::NotFoundCategory => HttpError::CategoryNotFound(e.message),
            ErrorCode::InvalidPath | ErrorCode::InvalidFrontmatter => {
                HttpError::BadRequest(e.message)
            }
            ErrorCode::PermissionReadonly => HttpError::Readonly,
            _ => HttpError::Internal(e.message),
        }
    }
}

impl IntoResponse for HttpError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            HttpError::NotInitialized => (StatusCode::SERVICE_UNAVAILABLE, self.to_string()),
            HttpError::NotFound(_) | HttpError::CategoryNotFound(_) => {
                (StatusCode::NOT_FOUND, self.to_string())
            }
            HttpError::BadRequest(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            HttpError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            HttpError::Readonly => (StatusCode::FORBIDDEN, self.to_string()),
            HttpError::RateLimited => (StatusCode::TOO_MANY_REQUESTS, self.to_string()),
            HttpError::ConfigError(_) | HttpError::Internal(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let body = Json(json!({
            "error": {
                "code": status.as_u16(),
                "message": message,
            }
        }));

        (status, body).into_response()
    }
}
