import { describe, expect, it } from 'vitest'
import {
  buildWorkflowOutline,
  parseWorkflowNodes,
  presentWorkflowNode,
  summarizeWorkflow,
} from './workflowRender'

describe('workflowRender', () => {
  const sample = `User Request
  -> Task Contract
  -> Context Selection
  -> Validation
    -> pass -> commit / return
    -> fail -> structured back-pressure
  -> Retry or Escalate`

  it('parses root, primary steps, and nested branches', () => {
    const nodes = parseWorkflowNodes(sample)

    expect(nodes).not.toBeNull()
    expect(nodes?.[0]).toMatchObject({ label: 'User Request', level: 0 })
    expect(nodes?.[1]).toMatchObject({ label: 'Task Contract', level: 1 })
    expect(nodes?.[4]).toMatchObject({ label: 'pass -> commit / return', level: 2 })
  })

  it('rejects plain paragraphs that are not workflow-shaped', () => {
    expect(parseWorkflowNodes('普通段落\n下一行说明\n第三行说明')).toBeNull()
  })

  it('maps success, failure, and repair branches to expected tones', () => {
    expect(presentWorkflowNode({ id: 'a', label: 'pass -> commit / return', level: 2 })).toMatchObject({
      tone: 'emerald',
      laneLabel: '成功分支',
      branch: true,
      title: 'pass',
      detail: 'commit / return',
    })

    expect(presentWorkflowNode({ id: 'b', label: 'fail -> structured back-pressure', level: 2 })).toMatchObject({
      tone: 'rose',
      laneLabel: '失败分支',
      branch: true,
      title: 'fail',
      detail: 'structured back-pressure',
    })

    expect(presentWorkflowNode({ id: 'c', label: 'Retry or Escalate', level: 1 })).toMatchObject({
      tone: 'amber',
      laneLabel: '处理步骤',
      branch: false,
    })
  })

  it('recognizes if/else style decision branches', () => {
    expect(presentWorkflowNode({ id: 'if', label: 'if -> budget approved', level: 2 })).toMatchObject({
      tone: 'indigo',
      laneLabel: '判断节点',
      branch: true,
      kind: 'decision',
    })

    expect(presentWorkflowNode({ id: 'else', label: 'else -> hold rollout', level: 2 })).toMatchObject({
      tone: 'rose',
      laneLabel: '失败分支',
      branch: true,
      kind: 'failure',
    })

    expect(presentWorkflowNode({ id: 'finally', label: 'finally -> archive trace', level: 2 })).toMatchObject({
      tone: 'sky',
      laneLabel: '收尾分支',
      branch: true,
      kind: 'finally',
    })
  })

  it('summarizes workflow steps and branches', () => {
    const nodes = parseWorkflowNodes(sample)
    expect(nodes).not.toBeNull()

    const summary = summarizeWorkflow(nodes!)
    expect(summary).toEqual({
      rootLabel: 'User Request',
      stepCount: 4,
      branchCount: 2,
    })
  })

  it('builds a normalized outline string for copy action', () => {
    const nodes = parseWorkflowNodes(sample)
    expect(nodes).not.toBeNull()

    expect(buildWorkflowOutline(nodes!)).toBe(`User Request
  -> Task Contract
  -> Context Selection
  -> Validation
    -> pass -> commit / return
    -> fail -> structured back-pressure
  -> Retry or Escalate`)
  })
})
