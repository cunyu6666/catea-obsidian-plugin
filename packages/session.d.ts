// Structural contracts for the retained CatUI session helpers.
import type { AgentMessage } from './agent-core/upstream/loop/types'
import type { TextContent, ImageContent } from './agent-core/upstream/ai/types'
type Base = { id: string; timestamp: string }
export type CompactionEntry = Base & {
  type: 'compaction'; summary: string; firstKeptEntryId: string; tokensBefore: number;
  details?: unknown; fromHook?: boolean
}
export type SessionEntry = Base & (
  | { type: 'thinking_level_change' | 'model_change' | 'label' }
  | { type: 'message'; message: AgentMessage }
  | { type: 'custom'; customType: string; data: unknown }
  | { type: 'custom_message'; customType: string; content: string | (TextContent | ImageContent)[]; display: boolean; details?: unknown }
  | { type: 'branch_summary'; summary: string; fromId: string }
) | CompactionEntry

declare module './agent-core/upstream/loop/types' {
  interface CustomAgentMessages {
    compactionSummary: { role: 'compactionSummary'; summary: string; tokensBefore: number; timestamp: number }
    branchSummary: { role: 'branchSummary'; summary: string; fromId: string; timestamp: number }
    custom: { role: 'custom'; customType: string; content: string | (TextContent | ImageContent)[]; display: boolean; details?: unknown; timestamp: number }
    bashExecution: { role: 'bashExecution'; command: string; output: string; timestamp: number }
  }
}
