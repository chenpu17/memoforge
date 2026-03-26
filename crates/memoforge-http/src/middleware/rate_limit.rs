//! Rate limiting middleware

use axum::{
    extract::{ConnectInfo, Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct RateLimiter {
    state: Arc<Mutex<RateLimiterState>>,
    limit: u32,
    window: Duration,
}

struct RateLimiterState {
    requests: HashMap<String, Vec<Instant>>,
}

impl RateLimiter {
    pub fn new(limit: u32, window_secs: u64) -> Self {
        let limiter = Self {
            state: Arc::new(Mutex::new(RateLimiterState {
                requests: HashMap::new(),
            })),
            limit,
            window: Duration::from_secs(window_secs),
        };

        // Spawn background cleanup task to prevent memory leak
        let state = limiter.state.clone();
        let window = limiter.window;
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(window);
            loop {
                interval.tick().await;
                let mut state = state.lock().await;
                let now = Instant::now();
                // Remove expired entries and empty IPs
                state.requests.retain(|_, requests| {
                    requests.retain(|&time| now.duration_since(time) < window);
                    !requests.is_empty()
                });
            }
        });

        limiter
    }

    async fn check_rate_limit(&self, ip: String) -> bool {
        let mut state = self.state.lock().await;
        let now = Instant::now();

        let requests = state.requests.entry(ip).or_insert_with(Vec::new);

        // Remove expired requests
        requests.retain(|&time| now.duration_since(time) < self.window);

        if requests.len() >= self.limit as usize {
            return false;
        }

        requests.push(now);
        true
    }
}

pub async fn rate_limit_middleware(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    State(limiter): State<RateLimiter>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let ip = addr.ip().to_string();

    if !limiter.check_rate_limit(ip).await {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    Ok(next.run(request).await)
}
