//! MemoForge MCP Server
//! 参考: 技术实现文档 §2.2

use clap::Parser;

#[derive(Parser)]
#[command(name = "memoforge", version, about = "MemoForge - AI-driven knowledge management")]
enum Cli {
    /// 启动 MCP Server
    Serve {
        #[arg(long)]
        knowledge_path: std::path::PathBuf,
    },
}

fn main() {
    let cli = Cli::parse();
    
    match cli {
        Cli::Serve { knowledge_path } => {
            println!("MemoForge MCP Server");
            println!("Knowledge path: {}", knowledge_path.display());
            println!("Ready for development - Sprint 1 starting...");
        }
    }
}
