import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import 'katex/dist/katex.min.css'
import './index.css'
import { EditorRich } from './components/EditorRich'

const SAMPLE_MARKDOWN = `# 高级编辑模式

这是一个面向普通用户的所见所得编辑器，它最终仍然会保存成 Markdown。

## 支持的内容

- 标题与段落
- **加粗**、*斜体*、[链接](https://example.com)
- [[docs/intro|知识库内部链接]]
- 任务列表
- 表格
- 代码块

![编辑器示意图](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='480' viewBox='0 0 960 480'%3E%3Cdefs%3E%3ClinearGradient id='bg' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%23EEF2FF'/%3E%3Cstop offset='100%25' stop-color='%23DBEAFE'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='960' height='480' rx='36' fill='url(%23bg)'/%3E%3Crect x='68' y='72' width='824' height='336' rx='26' fill='white' stroke='%23CBD5E1'/%3E%3Crect x='108' y='114' width='260' height='24' rx='12' fill='%23C7D2FE'/%3E%3Crect x='108' y='164' width='744' height='18' rx='9' fill='%23E2E8F0'/%3E%3Crect x='108' y='198' width='692' height='18' rx='9' fill='%23E2E8F0'/%3E%3Crect x='108' y='250' width='280' height='110' rx='22' fill='%23E0E7FF'/%3E%3Crect x='420' y='250' width='194' height='110' rx='22' fill='%23DBEAFE'/%3E%3Crect x='646' y='250' width='206' height='110' rx='22' fill='%23FDE68A'/%3E%3C/svg%3E)

- [x] 已完成的事项
- [ ] 待处理的事项

> 适合大多数日常写作；遇到特别复杂的语法，再切回 Markdown 精修。

## 示例表格

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 阅读模式 | 已完成 | 保留现有增强渲染 |
| Markdown 模式 | 已完成 | 保留 CodeMirror 能力 |
| 高级编辑 | 进行中 | 直接可视化编辑 |

\`\`\`ts
function saveKnowledge(mode: 'markdown' | 'rich') {
  console.log('save as markdown', mode)
}
\`\`\`
`

function PreviewApp() {
  const [value, setValue] = useState(SAMPLE_MARKDOWN)

  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '32px',
        background: 'linear-gradient(180deg, #F8FAFC 0%, #EEF2FF 100%)',
      }}
    >
      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            marginBottom: '16px',
            color: '#475569',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          Rich Editor Visual Preview
        </div>
        <div style={{ height: '760px' }}>
          <EditorRich
            value={value}
            onChange={setValue}
            mode="rich"
            knowledgeTitle="高级编辑模式"
          />
        </div>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PreviewApp />
  </React.StrictMode>,
)
