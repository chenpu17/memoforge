import { describe, expect, it } from 'vitest'
import { updateMarkdownTaskState } from './markdownTasks'

describe('markdownTasks', () => {
  it('checks an unchecked bullet task in place', () => {
    const input = '- [ ] first\n- [x] second'
    expect(updateMarkdownTaskState(input, 1, true)).toBe('- [x] first\n- [x] second')
  })

  it('unchecks a numbered task in place', () => {
    const input = '1. [x] first\n2. [ ] second'
    expect(updateMarkdownTaskState(input, 1, false)).toBe('1. [ ] first\n2. [ ] second')
  })

  it('returns null when target line is not a task item', () => {
    const input = '- normal item\n- [ ] task item'
    expect(updateMarkdownTaskState(input, 1, true)).toBeNull()
  })
})
