import type { Knowledge } from '../types'

const areStringArraysEqual = (left: string[], right: string[]) => (
  left.length === right.length && left.every((item, index) => item === right[index])
)

export function hasKnowledgeUnsavedChanges(
  currentKnowledge: Knowledge | null,
  baseline: Knowledge | null,
  currentContent: string,
) {
  if (!currentKnowledge) return false

  if (!baseline) {
    return (
      currentContent.length > 0 ||
      currentKnowledge.title.trim().length > 0 ||
      (currentKnowledge.category ?? '').length > 0 ||
      currentKnowledge.tags.length > 0 ||
      (currentKnowledge.summary ?? '').trim().length > 0
    )
  }

  return (
    currentContent !== (baseline.content ?? '') ||
    currentKnowledge.title !== baseline.title ||
    (currentKnowledge.category ?? '') !== (baseline.category ?? '') ||
    (currentKnowledge.summary ?? '') !== (baseline.summary ?? '') ||
    !areStringArraysEqual(currentKnowledge.tags, baseline.tags)
  )
}
