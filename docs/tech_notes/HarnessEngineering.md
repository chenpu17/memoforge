# Harness Engineering：AI 智能体的“装甲”与操作系统

## 1. 核心定义
**Harness Engineering（装甲/护栏工程）** 是 2026 年人工智能 Agent 领域的核心工程范式。它主张：AI 模型的不确定性不能仅靠 Prompt（提示词）解决，而必须通过**确定性的工程约束**和**闭环反馈系统**来管理。

如果将 AI 模型比作一台马力强劲的**引擎**，那么 Harness Engineering 就是围绕引擎建造的**底盘、操作系统、安全护栏和传感器**。它是将“预测模型”转化为“可靠工具”的关键技术。

---

## 2. 三层装甲架构

### A. 物理层：安全沙箱 (Sandboxing)
*   **隔离环境**：为 Agent 提供独立的运行空间（如 Docker 容器、WASM 虚拟机）。
*   **权限最小化**：严格限制文件读写、网络访问和系统调用，防止 Agent 产生非预期的破坏性行为。
*   **快照与回滚**：支持对运行状态进行快照。如果 Agent 修改产生致命错误，Harness 可以瞬间将其回滚到上一个干净的状态。

### B. 逻辑层：验证循环与回压 (Verification & Back-pressure)
*   **自动验证**：Agent 的每次操作后，Harness 自动触发 Linter、单元测试、构建检查或安全扫描。
*   **错误回压 (Back-pressure)**：将测试失败的堆栈信息（Stack Trace）精准反馈给模型，强制模型进入“发现错误 -> 修复 -> 再测试”的自动化闭环。
*   **架构约束**：硬编码的规则（如：禁止修改特定内核文件、强制代码风格），在模型输出生效前进行语义检查并拦截。

### C. 认知层：上下文治理与状态管理 (Context & State)
*   **动态切片 (Context Pruning)**：基于 RAG 和代码图谱（Graph Index），实时只为 Agent 提供当前任务最相关的“上下文切片”，避免 Token 冗余导致模型变笨。
*   **角色编排 (Choreography)**：定义多个 Agent（Planner, Executor, Reviewer）之间的握手协议和协作流，确保状态在不同“大脑”间同步。
*   **工程契约**：通过 `CLAUDE.md` 或 `AGENTS.md` 等协议文件，将项目规范硬编码进 Harness 的预处理流程。

---

## 3. 进阶演进特性

### MCP 标准协议 (Model Context Protocol)
Harness 充当了“万能适配器”。通过 MCP 协议，Agent 可以像插拔外设一样无缝连接各种数据源（GitHub, Jira, DB）和计算工具。Agent 无需学习 API，只需与 Harness 交互。

### 轨迹分析与自我进化 (Trajectory Learning)
Harness 记录 Agent 解决问题的全路径（轨迹）。成功的轨迹会被提取用于**合成数据生成**，以微调（Fine-tune）更精准的本地小模型，实现智能体的自我进化。

---

## 4. 代码原型：验证与回压机制

```python
import subprocess

class Harness:
    def execute_and_verify(self, agent_output):
        """执行 Agent 输出的代码并自动验证"""
        self.apply_to_sandbox(agent_output)
        
        # 运行自动化测试
        result = subprocess.run(["pytest", "tests/"], capture_output=True, text=True)
        
        if result.returncode != 0:
            # 发现错误，产生回压反馈
            feedback = f"Verification Failed!\nError Log:\n{result.stderr}"
            return {"status": "retry", "feedback": feedback}
            
        return {"status": "success"}
```

---

## 5. 行业共识与转型
*   **Mitchell Hashimoto (HashiCorp)**：工程师应花 **80% 的时间构建 Harness**，20% 的时间调整 Prompt。
*   **核心转变**：开发者从“代码编写者”转变为“智能体架构师”。不再教 AI 怎么写代码，而是教 AI 怎么写测试并为其构建完美的运行环境。
