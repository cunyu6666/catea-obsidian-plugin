/**
 * [WHO]: Provides collectFileChanges, showStandaloneFileReview
 * [FROM]: Depends on ../../../packages/agent-core/src/types
 * [TO]: Consumed by apps/obsidian/src/panel.tsx
 * [HERE]: apps/obsidian/src/turn-review.ts - coalesces tool writes into reviewable per-file changes and keeps review access visible when a reply has no text
 */
import type { FileChange, ToolEvent } from '../../../packages/agent-core/src/types'

export function collectFileChanges(tools: readonly ToolEvent[]): FileChange[] {
  const changes = new Map<string, FileChange>()
  for (const tool of tools) {
    if (tool.error || !tool.fileChange) continue
    const previous = changes.get(tool.fileChange.filePath)
    changes.set(
      tool.fileChange.filePath,
      previous ? { ...tool.fileChange, original: previous.original } : tool.fileChange,
    )
  }
  return [...changes.values()].filter((change) => change.original !== change.modified)
}

export function showStandaloneFileReview(
  text: string,
  status: string,
  changes: readonly FileChange[],
): boolean {
  return !text.trim() && status !== 'streaming' && changes.length > 0
}
