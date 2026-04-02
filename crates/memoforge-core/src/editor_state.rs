//! 共享编辑器状态管理
//! 参考: 技术实现文档 §2.2, §2.3

use crate::agent::{get_active_agents, AgentInfo};
use crate::{ErrorCode, MemoError};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// 状态文件路径
const EDITOR_STATE_FILE: &str = ".memoforge/editor_state.yaml";

/// 隐私配置文件路径
const PRIVACY_CONFIG_FILE: &str = ".memoforge/privacy.yaml";

/// 状态过期 TTL（5分钟）
const STATE_TTL: Duration = Duration::from_secs(300);

/// 选区更新最小间隔（毫秒）- 用于节流
pub const SELECTION_THROTTLE_MS: u64 = 300;

/// selected_text 长度上限（标准模式）
pub const SELECTED_TEXT_MAX_LENGTH: usize = 500;

/// 共享编辑器状态 - Canonical Schema
///
/// 所有文档和代码必须统一到此定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditorState {
    /// 运行模式：follow (跟随) 或 bound (绑定)
    pub mode: EditorMode,
    /// 桌面应用状态
    pub desktop: Option<DesktopState>,
    /// 当前知识库信息
    pub current_kb: Option<CurrentKb>,
    /// 当前选中的知识点
    pub current_knowledge: Option<CurrentKnowledge>,
    /// 文本选择范围
    pub selection: Option<Selection>,
    /// 活跃的 Agent 列表
    #[serde(default)]
    pub active_agents: Vec<AgentInfo>,
    /// 状态是否有效（PID 存活 + TTL 未过期）
    pub state_valid: bool,
    /// 状态更新时间
    pub updated_at: DateTime<Utc>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Default for EditorState {
    fn default() -> Self {
        Self {
            mode: EditorMode::Follow,
            desktop: None,
            current_kb: None,
            current_knowledge: None,
            selection: None,
            active_agents: Vec::new(),
            state_valid: false,
            updated_at: Utc::now(),
            error: None,
        }
    }
}

/// 编辑器运行模式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EditorMode {
    /// 跟随模式：每次调用都读取当前 GUI 的 KB
    Follow,
    /// 绑定模式：启动时静态绑定 KB
    Bound,
}

/// 桌面应用状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopState {
    /// 进程 PID
    pub pid: u32,
    /// 进程是否在运行
    pub running: bool,
    /// 窗口是否聚焦
    pub focused: bool,
}

/// 当前知识库信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentKb {
    /// 知识库路径
    pub path: PathBuf,
    /// 知识库名称
    pub name: String,
    /// 知识点总数
    pub knowledge_count: usize,
}

/// 当前选中的知识点
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentKnowledge {
    /// 知识点相对路径
    pub path: String,
    /// 知识点标题
    pub title: String,
    /// 所属分类
    pub category: Option<String>,
}

/// 文本选择范围
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Selection {
    /// 起始行号
    pub start_line: usize,
    /// 结束行号
    pub end_line: usize,
    /// 是否有选中文本
    pub has_text: bool,
    /// 选中文本长度
    pub text_length: usize,
    /// 选中文本内容（根据隐私级别可能为空）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text: Option<String>,
}

/// 隐私共享级别
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PrivacyLevel {
    /// 最小：仅路径和行号（默认）
    Minimal,
    /// 标准：路径 + 行号 + 选中文本（≤500字符）
    Standard,
    /// 完整：路径 + 行号 + 选中文本（无限制）
    Full,
}

impl Default for PrivacyLevel {
    fn default() -> Self {
        Self::Minimal
    }
}

/// 隐私配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacyConfig {
    /// 共享级别
    #[serde(default)]
    pub level: PrivacyLevel,
    /// 是否共享选中文本
    #[serde(default)]
    pub share_selected_text: bool,
    /// 选中文本长度上限（standard 模式）
    #[serde(default = "default_max_text_length")]
    pub max_text_length: usize,
}

fn default_max_text_length() -> usize {
    500
}

impl Default for PrivacyConfig {
    fn default() -> Self {
        Self {
            level: PrivacyLevel::Minimal,
            share_selected_text: false,
            max_text_length: 500,
        }
    }
}

/// 编辑器状态管理器
pub struct EditorStateManager {
    kb_path: PathBuf,
    privacy_config: PrivacyConfig,
}

impl EditorStateManager {
    /// 创建新的状态管理器
    pub fn new(kb_path: &Path) -> Result<Self, MemoError> {
        let privacy_config = Self::load_privacy_config(kb_path).unwrap_or_default();
        Ok(Self {
            kb_path: kb_path.to_path_buf(),
            privacy_config,
        })
    }

    /// 加载隐私配置
    fn load_privacy_config(kb_path: &Path) -> Option<PrivacyConfig> {
        let config_path = kb_path.join(PRIVACY_CONFIG_FILE);
        fs::read_to_string(config_path)
            .ok()
            .and_then(|content| serde_yaml::from_str(&content).ok())
    }

    /// 获取状态文件路径
    fn state_file_path(&self) -> PathBuf {
        self.kb_path.join(EDITOR_STATE_FILE)
    }

    /// 加载编辑器状态
    pub fn load(&self) -> Result<Option<EditorState>, MemoError> {
        let state_path = self.state_file_path();

        if !state_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&state_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to read editor state: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        let mut state: EditorState = serde_yaml::from_str(&content).map_err(|e| MemoError {
            code: ErrorCode::InvalidFrontmatter,
            message: format!("Failed to parse editor state: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // 检查状态有效性
        state.state_valid = self.validate_state(&state);

        // 根据隐私级别过滤敏感信息
        self.apply_privacy_filter(&mut state);

        Ok(Some(state))
    }

    /// 验证状态有效性
    fn validate_state(&self, state: &EditorState) -> bool {
        // 检查 TTL
        let now = Utc::now();
        let age = now.signed_duration_since(state.updated_at);
        if age.to_std().map_or(true, |d| d > STATE_TTL) {
            return false;
        }

        // 检查桌面进程是否存活
        if let Some(desktop) = &state.desktop {
            if desktop.running {
                return self.is_process_alive(desktop.pid);
            }
        }

        true
    }

    /// 检查进程是否存活
    fn is_process_alive(&self, pid: u32) -> bool {
        process_alive(pid)
    }

    /// 应用隐私过滤
    fn apply_privacy_filter(&self, state: &mut EditorState) {
        match self.privacy_config.level {
            PrivacyLevel::Full => {
                // Full 模式：根据 share_selected_text 决定是否共享文本
                if !self.privacy_config.share_selected_text {
                    if let Some(ref mut selection) = state.selection {
                        selection.selected_text = None;
                    }
                }
                // Full 模式下不限制长度
            }
            PrivacyLevel::Standard => {
                // Standard 模式：限制文本长度
                if !self.privacy_config.share_selected_text {
                    if let Some(ref mut selection) = state.selection {
                        selection.selected_text = None;
                    }
                } else if let Some(ref mut selection) = state.selection {
                    if let Some(ref mut text) = selection.selected_text {
                        // 按字节截断，正确处理 UTF-8
                        if text.len() > self.privacy_config.max_text_length {
                            *text = truncate_text_bytes(text, self.privacy_config.max_text_length);
                        }
                    }
                }
            }
            PrivacyLevel::Minimal => {
                // Minimal 模式：移除选中文本
                if let Some(ref mut selection) = state.selection {
                    selection.selected_text = None;
                }
            }
        }
    }

    /// 保存编辑器状态（供桌面应用调用）
    pub fn save(&self, state: &EditorState) -> Result<(), MemoError> {
        let state_path = self.state_file_path();

        // 确保目录存在
        if let Some(parent) = state_path.parent() {
            fs::create_dir_all(parent).map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to create state directory: {}", e),
                retry_after_ms: None,
                context: None,
            })?;
        }

        let yaml = serde_yaml::to_string(state).map_err(|e| MemoError {
            code: ErrorCode::InvalidFrontmatter,
            message: format!("Failed to serialize state: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        let mut file = File::create(&state_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to create state file: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        file.write_all(yaml.as_bytes()).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write state: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // 设置文件权限为 600 (仅所有者可读写)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perm = fs::metadata(&state_path)
                .map_err(|e| MemoError {
                    code: ErrorCode::InvalidPath,
                    message: format!("Failed to get metadata: {}", e),
                    retry_after_ms: None,
                    context: None,
                })?
                .permissions();
            perm.set_mode(0o600);
            fs::set_permissions(&state_path, perm).map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to set permissions: {}", e),
                retry_after_ms: None,
                context: None,
            })?;
        }

        Ok(())
    }
}

/// 便捷函数：加载编辑器状态
pub fn load_editor_state(kb_path: &Path) -> Result<Option<EditorState>, MemoError> {
    let manager = EditorStateManager::new(kb_path)?;
    manager.load()
}

/// 便捷函数：保存编辑器状态
pub fn save_editor_state(kb_path: &Path, state: &EditorState) -> Result<(), MemoError> {
    let manager = EditorStateManager::new(kb_path)?;
    manager.save(state)
}

/// 全局状态文件路径（用于跨 KB 切换）
pub fn editor_state_path() -> PathBuf {
    dirs::home_dir()
        .expect("无法获取用户主目录")
        .join(".memoforge")
        .join("editor_state.yaml")
}

/// 知识库状态文件路径（用于存储该 KB 的编辑状态）
pub fn kb_editor_state_path(kb_path: &Path) -> PathBuf {
    kb_path.join(EDITOR_STATE_FILE)
}

/// EditorState 方法扩展 - 支持全局状态文件
impl EditorState {
    /// 验证状态是否有效
    /// 1. PID 必须存活
    /// 2. updated_at 在 TTL 内
    pub fn is_valid(&self) -> bool {
        // 检查 TTL
        let now = Utc::now();
        let age = now.signed_duration_since(self.updated_at);
        if age.to_std().map_or(true, |d| d > STATE_TTL) {
            return false;
        }

        // 检查桌面应用 PID 是否存活
        if let Some(desktop) = &self.desktop {
            if desktop.running && !process_alive(desktop.pid) {
                return false;
            }
        }

        true
    }

    /// 保存到全局状态文件（供 DesktopStatePublisher 使用）
    pub fn save(&self) -> Result<(), MemoError> {
        let path = editor_state_path();

        // 确保目录存在
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to create directory: {}", e),
                retry_after_ms: None,
                context: None,
            })?;
        }

        let yaml = serde_yaml::to_string(self).map_err(|e| MemoError {
            code: ErrorCode::InvalidFrontmatter,
            message: format!("Failed to serialize state: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // 原子写入：先写临时文件，再 rename
        let temp_path = path.with_extension("yaml.tmp");
        fs::write(&temp_path, yaml).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write temp file: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::rename(&temp_path, &path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to rename file: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // 设置文件权限为 600 (仅所有者可读写)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perm = fs::metadata(&path)
                .map_err(|e| MemoError {
                    code: ErrorCode::InvalidPath,
                    message: format!("Failed to get metadata: {}", e),
                    retry_after_ms: None,
                    context: None,
                })?
                .permissions();
            perm.set_mode(0o600);
            fs::set_permissions(&path, perm).map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to set permissions: {}", e),
                retry_after_ms: None,
                context: None,
            })?;
        }

        Ok(())
    }

    /// 清除全局状态文件
    pub fn clear() -> Result<(), MemoError> {
        let path = editor_state_path();
        if path.exists() {
            fs::remove_file(&path).map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to remove state file: {}", e),
                retry_after_ms: None,
                context: None,
            })?;
        }
        Ok(())
    }

    /// 从全局状态文件加载
    pub fn load() -> Result<Option<Self>, MemoError> {
        let path = editor_state_path();
        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to read state file: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        let mut state: EditorState = serde_yaml::from_str(&content).map_err(|e| MemoError {
            code: ErrorCode::InvalidFrontmatter,
            message: format!("Failed to parse state: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // 验证状态有效性
        state.state_valid = state.is_valid();

        // 填充 active_agents（仅在 current_kb 存在时）
        if let Some(kb) = &state.current_kb {
            state.active_agents = get_active_agents(&kb.path);
        } else {
            state.active_agents = vec![];
        }

        Ok(Some(state))
    }

    /// 从全局状态文件加载（内部方法）
    pub fn load_global() -> Result<Option<Self>, MemoError> {
        Self::load()
    }

    /// 获取当前知识库路径（严格模式，不做危险回退）
    pub fn resolve_kb_path(
        mode: EditorMode,
        explicit_path: Option<&PathBuf>,
    ) -> Result<Option<PathBuf>, MemoError> {
        // 显式指定的路径优先级最高
        if let Some(path) = explicit_path {
            return Ok(Some(path.clone()));
        }

        // 绑定模式：必须有显式路径
        if mode == EditorMode::Bound {
            return Err(MemoError {
                code: ErrorCode::NotInitialized,
                message: "绑定模式需要指定 --knowledge-path".into(),
                retry_after_ms: None,
                context: None,
            });
        }

        // 跟随模式：从共享状态获取
        match Self::load()? {
            Some(state) if state.state_valid && state.current_kb.is_some() => {
                Ok(Some(state.current_kb.unwrap().path))
            }
            Some(state) if !state.state_valid => Err(MemoError {
                code: ErrorCode::NotInitialized,
                message: "编辑器状态已过期或无效，请确保桌面应用正在运行".into(),
                retry_after_ms: None,
                context: Some(serde_json::json!({
                    "reason": state.error.unwrap_or_else(|| "状态过期".to_string()),
                    "desktop_running": state.desktop.as_ref().map(|d| d.running).unwrap_or(false),
                    "hint": "如需在无桌面应用时操作，请使用绑定模式: --mode bound --knowledge-path /path/to/kb"
                })),
            }),
            _ => Err(MemoError {
                code: ErrorCode::NotInitialized,
                message: "没有有效的知识库状态，请先在桌面应用中打开知识库".into(),
                retry_after_ms: None,
                context: None,
            }),
        }
    }
}

/// 检查进程是否存活
fn process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
    #[cfg(windows)]
    {
        // Windows: 使用更可靠的进程检测方法
        unsafe {
            // OpenProcess 需要的权限常量
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

/// 按字节截断文本（正确处理 UTF-8）
fn truncate_text_bytes(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }

    // 找到不超过 max_bytes 的最后一个 UTF-8 字符边界
    let mut end = max_bytes;
    while !text.is_char_boundary(end) && end > 0 {
        end -= 1;
    }

    if end == 0 {
        // 如果无法找到字符边界，返回空字符串
        return String::new();
    }

    format!("{}...", &text[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_editor_state_serialization() {
        let state = EditorState {
            mode: EditorMode::Follow,
            desktop: Some(DesktopState {
                pid: 12345,
                running: true,
                focused: true,
            }),
            current_kb: Some(CurrentKb {
                path: PathBuf::from("/test/kb"),
                name: "Test KB".to_string(),
                knowledge_count: 100,
            }),
            current_knowledge: Some(CurrentKnowledge {
                path: "test.md".to_string(),
                title: "Test".to_string(),
                category: Some("test".to_string()),
            }),
            selection: Some(Selection {
                start_line: 1,
                end_line: 5,
                has_text: true,
                text_length: 100,
                selected_text: Some("test text".to_string()),
            }),
            active_agents: vec![],
            state_valid: true,
            updated_at: Utc::now(),
            error: None,
        };

        let yaml = serde_yaml::to_string(&state).unwrap();
        let deserialized: EditorState = serde_yaml::from_str(&yaml).unwrap();

        assert_eq!(state.mode, deserialized.mode);
        assert_eq!(
            state.desktop.unwrap().pid,
            deserialized.desktop.unwrap().pid
        );
    }

    #[test]
    fn test_privacy_config_default() {
        let config = PrivacyConfig::default();
        assert_eq!(config.level, PrivacyLevel::Minimal);
        assert_eq!(config.share_selected_text, false);
        assert_eq!(config.max_text_length, 500);
    }

    #[test]
    fn test_editor_mode_serialization() {
        let mode = EditorMode::Follow;
        let yaml = serde_yaml::to_string(&mode).unwrap();
        assert_eq!(yaml.trim(), "follow");

        let mode = EditorMode::Bound;
        let yaml = serde_yaml::to_string(&mode).unwrap();
        assert_eq!(yaml.trim(), "bound");
    }

    #[test]
    fn test_selection_without_text() {
        let selection = Selection {
            start_line: 10,
            end_line: 20,
            has_text: false,
            text_length: 0,
            selected_text: None,
        };

        let yaml = serde_yaml::to_string(&selection).unwrap();
        // selected_text should be skipped when None
        assert!(!yaml.contains("selected_text"));
    }

    #[test]
    fn test_process_alive_current() {
        // 测试当前进程是否存活
        let current_pid = std::process::id();
        assert!(process_alive(current_pid));
    }

    #[test]
    fn test_editor_state_default() {
        let state = EditorState::default();
        assert_eq!(state.mode, EditorMode::Follow);
        assert!(!state.state_valid);
        assert!(state.current_kb.is_none());
        assert!(state.current_knowledge.is_none());
    }
}
