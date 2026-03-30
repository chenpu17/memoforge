const TASK_MARKER_PATTERN = /^(\s*(?:[-*+]|\d+[.)])\s+\[)( |x|X)(\]\s*)/

export function updateMarkdownTaskState(
  content: string,
  lineNumber: number,
  checked: boolean,
): string | null {
  if (lineNumber < 1) return null

  const lines = content.split('\n')
  const index = lineNumber - 1
  const line = lines[index]

  if (line === undefined) return null

  const nextLine = line.replace(TASK_MARKER_PATTERN, (_, prefix: string, _marker: string, suffix: string) => (
    `${prefix}${checked ? 'x' : ' '}${suffix}`
  ))

  if (nextLine === line) {
    return null
  }

  lines[index] = nextLine
  return lines.join('\n')
}
