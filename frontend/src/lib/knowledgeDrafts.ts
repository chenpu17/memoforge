const DRAFT_KEY_PREFIX = 'memoforge.draft.'

const getDraftKey = (knowledgeId: string) => `${DRAFT_KEY_PREFIX}${knowledgeId}`

export function loadKnowledgeDraft(knowledgeId: string) {
  if (typeof window === 'undefined' || !knowledgeId) return null

  try {
    return window.localStorage.getItem(getDraftKey(knowledgeId))
  } catch (error) {
    console.error('Failed to load knowledge draft:', error)
    return null
  }
}

export function saveKnowledgeDraft(knowledgeId: string, content: string) {
  if (typeof window === 'undefined' || !knowledgeId) return

  try {
    window.localStorage.setItem(getDraftKey(knowledgeId), content)
  } catch (error) {
    console.error('Failed to save knowledge draft:', error)
  }
}

export function clearKnowledgeDraft(knowledgeId: string) {
  if (typeof window === 'undefined' || !knowledgeId) return

  try {
    window.localStorage.removeItem(getDraftKey(knowledgeId))
  } catch (error) {
    console.error('Failed to clear knowledge draft:', error)
  }
}
