//! Authentication Middleware

use axum::{
    extract::{Request, State},
    http::header,
    middleware::Next,
    response::Response,
};

use crate::error::HttpError;
use crate::AppState;

/// Authentication middleware function
pub async fn auth_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, HttpError> {
    let config = &state.config;

    // Get the auth token
    let token = match &config.auth_token {
        None => {
            return Ok(next.run(request).await);
        }
        Some(t) if t.is_empty() => {
            return Ok(next.run(request).await);
        }
        Some(t) => t,
    };

    // Check for Bearer token
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok());

    match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            let provided_token = &header[7..];
            if provided_token == token {
                Ok(next.run(request).await)
            } else {
                Err(HttpError::Unauthorized)
            }
        }
        _ => Err(HttpError::Unauthorized),
    }
}
