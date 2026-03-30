//! Agent 连接状态管理
//! 参考: PRD §6.1.3 MCP 服务状态检测

use crate::{ErrorCode, MemoError};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Agent 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    /// 进程 PID
    pub pid: u32,
    /// Agent 名称 (如 claude-code, codex)
    pub name: String,
    /// 启动时间 (ISO 8601)
    pub started_at: String,
    /// 知识库路径
    pub kb_path: String,
}

/// 获取 agents 目录路径
fn agents_dir(root: &Path) -> std::path::PathBuf {
    root.join(".memoforge/agents")
}

/// 启动时写入 Agent 信息文件
pub fn register_agent(root: &Path, agent_name: &str) -> Result<(), MemoError> {
    let dir = agents_dir(root);
    fs::create_dir_all(&dir).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to create agents dir: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    let pid = std::process::id();
    let info = AgentInfo {
        pid,
        name: agent_name.to_string(),
        started_at: chrono::Utc::now().to_rfc3339(),
        kb_path: root.display().to_string(),
    };

    let pid_path = dir.join(format!("{}.json", pid));
    let content = serde_json::to_string(&info).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to serialize agent info: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    fs::write(&pid_path, content).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to write agent file: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    Ok(())
}

/// 退出时清理 Agent 信息文件
pub fn unregister_agent(root: &Path) {
    let pid = std::process::id();
    let pid_path = agents_dir(root).join(format!("{}.json", pid));
    let _ = fs::remove_file(&pid_path);
}

/// 检查进程是否存活（跨平台实现）
fn process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // Unix: 使用 kill(pid, 0) 检查进程是否存在
        // 返回 0 表示进程存在，-1 且 errno=ESRCH 表示进程不存在
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
    #[cfg(windows)]
    {
        // Windows: 使用 OpenProcess 检查进程是否存在
        use std::ptr;
        unsafe {
            const PROCESS_QUERY_INFORMATION: u32 = 0x0400;
            const PROCESS_VM_READ: u32 = 0x0010;

            let handle = winapi::um::processthreadsapi::OpenProcess(
                PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
                0,
                pid,
            );

            if handle.is_null() {
                false
            } else {
                winapi::um::handleapi::CloseHandle(handle);
                true
            }
        }
    }
}

/// 获取所有活跃的 Agent 连接
pub fn get_active_agents(root: &Path) -> Vec<AgentInfo> {
    let dir = agents_dir(root);
    if !dir.exists() {
        return vec![];
    }

    let mut agents = vec![];
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(info) = serde_json::from_str::<AgentInfo>(&content) {
                        // 验证进程是否存活
                        if process_alive(info.pid) {
                            agents.push(info);
                        } else {
                            // 清理已终止进程的文件
                            let _ = fs::remove_file(&path);
                        }
                    }
                }
            }
        }
    }
    agents
}

/// 获取活跃 Agent 数量
pub fn get_agent_count(root: &Path) -> usize {
    get_active_agents(root).len()
}

/// 清理所有已终止进程的 Agent 文件
pub fn cleanup_dead_agents(root: &Path) {
    let _ = get_active_agents(root); // get_active_agents 内部会清理
}

/// 推断 Agent 名称
pub fn infer_agent_name() -> String {
    // 优先从环境变量获取
    if let Ok(name) = std::env::var("MEMOFORGE_AGENT_NAME") {
        return name;
    }

    // 从父进程名称推断
    #[cfg(unix)]
    {
        let ppid = unsafe { libc::getppid() };
        if let Ok(cmdline) = fs::read_to_string(format!("/proc/{}/cmdline", ppid)) {
            let cmdline = cmdline.replace('\0', " ");
            if cmdline.contains("claude") {
                return "claude-code".to_string();
            }
            if cmdline.contains("codex") {
                return "codex".to_string();
            }
            if cmdline.contains("cursor") {
                return "cursor".to_string();
            }
        }
    }

    "unknown".to_string()
}
