use memoforge_core::{init::init_open, init_store, register_kb};
use memoforge_http::{create_server, AppState, HttpConfig, HttpError};
use std::net::SocketAddr;
use std::path::PathBuf;

fn print_usage_and_exit() -> ! {
    eprintln!(
        "Usage: memoforge-http --kb-path <path> [--bind <addr>] [--port <port>] [--readonly] [--auth-token <token>] [--cors-origin <origin>]"
    );
    std::process::exit(1);
}

fn parse_args() -> (PathBuf, HttpConfig) {
    let mut args = std::env::args().skip(1);
    let mut kb_path: Option<PathBuf> = None;
    let mut config = HttpConfig::from_env();

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--kb-path" => kb_path = args.next().map(PathBuf::from),
            "--bind" => config.bind = args.next().unwrap_or_else(|| print_usage_and_exit()),
            "--port" => {
                let port = args.next().unwrap_or_else(|| print_usage_and_exit());
                config.port = port.parse().unwrap_or_else(|_| print_usage_and_exit());
            }
            "--readonly" => config.readonly = true,
            "--auth-token" => config.auth_token = args.next(),
            "--cors-origin" => {
                let origin = args.next().unwrap_or_else(|| print_usage_and_exit());
                config.allowed_origins.push(origin);
            }
            _ => print_usage_and_exit(),
        }
    }

    let kb_path = kb_path.unwrap_or_else(|| print_usage_and_exit());
    (kb_path, config)
}

#[tokio::main]
async fn main() -> Result<(), HttpError> {
    let (kb_path, config) = parse_args();

    init_open(&kb_path).map_err(HttpError::from)?;
    init_store(kb_path.clone()).map_err(HttpError::from)?;
    register_kb(&kb_path, None).map_err(HttpError::from)?;

    let state = AppState::new(config.clone());
    state.set_kb_path(kb_path).await;

    let app = create_server(state);
    let addr: SocketAddr = config
        .bind_address()
        .parse()
        .map_err(|e| HttpError::ConfigError(format!("Invalid bind address: {}", e)))?;

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| HttpError::ConfigError(format!("Failed to bind: {}", e)))?;

    println!("MemoForge HTTP server listening on http://{}", addr);

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .map_err(|e| HttpError::Internal(e.to_string()))?;

    Ok(())
}
