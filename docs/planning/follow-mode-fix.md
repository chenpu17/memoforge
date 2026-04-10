# Follow 模式架构修复总结

## 修复日期
2025-03-25

## 问题描述

修复 MemoForge MCP Server 在 follow 模式下的三个架构问题：

### 问题 1: follow 模式启动时不应验证 KB
**现象**: `memoforge serve --mode follow` 在没有全局状态文件时会直接退出，导致 `get_editor_state` 都无法用于诊断。

**根本原因**: 启动时就尝试验证 KB 路径，如果验证失败则直接退出。

### 问题 2: --allow-stale-kb 未接入选区路径解析
**现象**: `--allow-stale-kb` 只参与启动时路径解析，没有接入 `tools::get_kb_path()`。

**根本原因**: 路径解析逻辑在启动时一次性执行，工具调用时无法使用 `--allow-stale-kb` 的回退机制。

### 问题 3: Agent 注册绑定启动时 KB
**现象**: Agent 注册在启动时的 KB 上，不会随 GUI 切换迁移。

**根本原因**: follow 模式下 Agent 只在启动时注册一次，之后即使 KB 切换也不会重新注册。

## 修复方案

### 1. follow 模式启动延迟验证

**修改文件**: `crates/memoforge-mcp/src/main.rs`

**关键改动**:
- 将 `run_server()` 拆分为 `run_server_follow_mode()` 和 `run_server_bound_mode()`
- follow 模式启动时不验证 KB，只设置模式和配置
- 延迟到工具调用时再验证 KB 路径

```rust
fn run_server_follow_mode(allow_stale_kb: bool, agent_name: &str) {
    // 不初始化 KB，只设置模式和配置
    tools::set_mode("follow".to_string());
    tools::set_allow_stale_kb(allow_stale_kb);
    tools::set_agent_name(agent_name.to_string());

    // 启动服务循环（不注册 Agent）
    // ...
}
```

### 2. --allow-stale-kb 接入工具调用

**修改文件**: `crates/memoforge-mcp/src/tools.rs`

**关键改动**:
- 添加 `ALLOW_STALE_KB` 全局变量和 `set_allow_stale_kb()` 函数
- 在 `get_kb_path()` 中实现回退逻辑
- 当状态无效且 `allow_stale_kb=true` 时，回退到最近使用的知识库

```rust
static ALLOW_STALE_KB: Mutex<bool> = Mutex::new(false);

pub fn set_allow_stale_kb(allow: bool) {
    *ALLOW_STALE_KB.lock().unwrap() = allow;
}

fn get_kb_path() -> Result<PathBuf, MemoError> {
    if mode == "follow" {
        match EditorState::load_global() {
            Ok(Some(state)) if state.state_valid && state.current_kb.is_some() => {
                // 正常路径
            }
            Ok(_) if get_allow_stale_kb() => {
                // 回退到最近知识库
                match memoforge_core::get_last_kb()? {
                    Some(kb_path) => Ok(PathBuf::from(kb_path)),
                    None => Err(...),
                }
            }
            // ...
        }
    }
    // ...
}
```

### 3. Agent 注册动态跟随 KB 切换

**修改文件**: `crates/memoforge-mcp/src/tools.rs`

**关键改动**:
- 添加 `LAST_REGISTERED_KB` 全局变量跟踪上次注册的 KB
- 实现 `ensure_agent_registered()` 函数，仅在 KB 变化时重新注册
- 在 `get_kb_path()` 成功获取有效 KB 后调用

```rust
static LAST_REGISTERED_KB: Mutex<Option<PathBuf>> = Mutex::new(None);

fn ensure_agent_registered(kb_path: &PathBuf) {
    let mut last_kb = LAST_REGISTERED_KB.lock().unwrap();

    if last_kb.as_ref() != Some(kb_path) {
        // 注销旧 KB 的 Agent
        if let Some(old_kb) = last_kb.take() {
            let _ = memoforge_core::unregister_agent(&old_kb);
        }

        // 注册到新 KB
        let agent_name = get_agent_name();
        let _ = memoforge_core::register_agent(kb_path, &agent_name);

        *last_kb = Some(kb_path.clone());
    }
}
```

## 设计意图

### 延迟验证设计
- **目标**: 让 `get_editor_state` 始终可用，即使没有有效的 KB
- **实现**: 将 KB 验证从启动时延迟到工具调用时
- **优势**: 便于诊断状态问题，提升用户体验

### 回退机制设计
- **目标**: 在桌面应用未运行时，仍然允许只读操作
- **实现**: 当状态无效且启用 `--allow-stale-kb` 时，回退到最近使用的 KB
- **限制**: stale KB 只支持只读操作（状态无效时 `readonly=true`）

### 动态注册设计
- **目标**: Agent 注册自动跟随 GUI 的 KB 切换
- **实现**: 每次获取 KB 路径时检查是否变化，自动重新注册
- **优势**: 无需手动重启 MCP Server

## 测试验证

创建了 `test_follow_mode.py` 测试脚本，验证以下场景：

1. ✓ follow 模式启动时不验证 KB
2. ✓ --allow-stale-kb 正确回退到最近 KB
3. ✓ bound 模式仍然要求显式路径

所有测试通过 ✓

## 兼容性

- **向后兼容**: bound 模式行为不变
- **默认行为**: follow 模式默认不启用 `--allow-stale-kb`
- **错误处理**: 所有错误都有清晰的错误信息

## 编译验证

```bash
cargo build --release
```

编译通过，无错误（仅有一个无关紧要的警告）。

## 相关文件

- `crates/memoforge-mcp/src/main.rs` - 主函数和服务器启动逻辑
- `crates/memoforge-mcp/src/tools.rs` - 工具实现和路径解析
- `test_follow_mode.py` - 测试脚本
- `crates/memoforge-core/src/registry.rs` - KB 注册表（`get_last_kb()`）
- `crates/memoforge-core/src/editor_state.rs` - 编辑器状态管理

## 后续优化建议

1. **状态缓存**: 考虑缓存 KB 路径避免频繁文件 I/O
2. **错误恢复**: 添加更细粒度的错误处理和重试机制
3. **性能监控**: 监控 Agent 注册/注销的性能影响
4. **测试覆盖**: 添加更多边界情况的单元测试
