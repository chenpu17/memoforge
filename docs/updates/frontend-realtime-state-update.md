# 前端实时状态发布更新

## 更新日期
2026-03-25

## 更新目标
实现前端编辑器状态实时发布到 AI 协作系统，支持知识点选择、文本选区更新和知识库状态同步。

## 更新内容

### 1. Hook 更新 (`frontend/src/hooks/useEditorStatePublisher.ts`)

#### 主要变更
- **添加防抖机制**：使用 `useRef` 管理防抖定时器
- **优化选区更新**：`updateSelection` 方法改为同步调用，内部使用 100ms 防抖
- **添加清理逻辑**：组件卸载时自动清理定时器
- **统一错误日志**：所有错误日志添加 `[EditorState]` 前缀

#### 实现细节
```typescript
// 100ms 防抖实现
const updateSelection = useCallback((
  startLine: number,
  endLine: number,
  text?: string
) => {
  if (debounceTimerRef.current !== null) {
    clearTimeout(debounceTimerRef.current)
  }

  debounceTimerRef.current = window.setTimeout(() => {
    tauriService.updateSelection(startLine, endLine, text)
      .catch(e => console.error('[EditorState] 发布选区状态失败:', e))
  }, 100)
}, [])
```

### 2. Editor 组件更新 (`frontend/src/components/Editor.tsx`)

#### 主要变更
- **防抖时间优化**：从 300ms 缩短至 100ms，提供更实时的响应
- **添加知识点属性**：传递 `knowledgePath`、`knowledgeTitle`、`knowledgeCategory` 到 Editor

#### 使用方式
```typescript
<Editor
  value={currentKnowledge.content ?? ''}
  onChange={(content) => setCurrentKnowledge({ ...currentKnowledge, content })}
  mode={readonly ? 'read' : editorMode}
  knowledgePath={currentKnowledge.id}
  knowledgeTitle={currentKnowledge.title}
  knowledgeCategory={currentKnowledge.category}
/>
```

### 3. App 组件更新 (`frontend/src/App.tsx`)

#### 主要变更
- **知识库初始化状态发布**：在 `handleInit`、`checkInit`、`handleKbSwitch` 中添加状态发布
- **知识库数量同步**：添加 `useEffect` 监听知识库列表变化，自动更新状态

#### 状态发布时机
1. 应用启动时自动打开上次知识库
2. 用户手动选择/打开知识库
3. 用户切换知识库
4. 知识库列表数量变化时

### 4. Tauri 服务 (`frontend/src/services/tauri.ts`)

已实现的方法无需修改：
- `selectKnowledge(path, title, category?)`
- `updateSelection(startLine, endLine, text?)`
- `clearSelection()`
- `clearKnowledge()`
- `setKb(path, name, count)`

## 技术实现细节

### 防抖策略
- **选区更新**：100ms 防抖，平衡实时性和性能
- **定时器清理**：组件卸载或新选区产生时自动清理旧定时器
- **空选区处理**：立即清除选区状态，不等待防抖

### 状态生命周期
```
1. 用户打开应用
   → checkInit()
   → 加载知识库
   → setKb(path, name, count)

2. 用户选择知识点
   → selectKnowledge(path, title, category)

3. 用户选择文本
   → updateSelection(startLine, endLine, text) [100ms 防抖]

4. 用户取消选择
   → clearSelection() [立即执行]

5. 用户切换/关闭知识点
   → clearKnowledge()
```

### 错误处理
- 所有状态发布调用都包含 `try-catch`
- 错误日志使用统一前缀 `[EditorState]`
- HTTP 模式下静默失败（不抛出异常）

## 性能考虑

### 优化点
1. **防抖减少调用频率**：避免频繁的 IPC 通信
2. **条件检查**：仅在编辑模式下发布状态
3. **资源清理**：组件卸载时清理定时器
4. **隐私保护**：不发送选中文本内容（可选）

### 性能指标
- 防抖延迟：100ms（比之前的 300ms 更快）
- IPC 调用频率：最大 10 次/秒（理论值）
- 内存占用：单个定时器引用

## 测试验证

### 构建测试
```bash
cd frontend
npm run build
# ✓ 构建成功，无 TypeScript 错误
```

### 功能测试点
- [ ] 应用启动时发布知识库状态
- [ ] 选择知识点时发布状态
- [ ] 文本选区实时更新（100ms 延迟）
- [ ] 取消选择时立即清除状态
- [ ] 切换知识点时正确清理旧状态
- [ ] 切换知识库时发布新状态
- [ ] 知识库数量变化时更新状态

## 后续工作

### 待实现
1. **状态可视化**：在 UI 中显示当前 AI 连接状态
2. **错误提示**：状态发布失败时的用户提示
3. **配置选项**：允许用户调整防抖时间
4. **选区内容传输**：可选的选中文本内容传输

### 已知问题
- HTTP 模式下状态发布不生效（预期行为）
- 知识库数量变化可能触发多次状态更新（可优化）

## 相关文档
- 技术实现文档 §2.6.1 - AI 协作状态管理
- `docs/design/技术实现文档.md`
- `crates/memoforge-tauri/src/main.rs` - Tauri 命令实现
