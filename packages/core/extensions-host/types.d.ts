// Minimal structural host contract implemented by the retained context extension.
import type { Static, TSchema } from '@sinclair/typebox'
import type { SessionEntry } from '../../session'
import type { AgentMessage } from '../../agent-core/upstream/loop/types'
interface Context {
  sessionManager: { getBranch(): SessionEntry[] }
  getContextUsage(): { contextWindow: number; tokens: number | null } | undefined
  requestContextWindow?: (handoff: string) => boolean
}
interface Result { content: { type: 'text'; text: string }[]; details: object }
export interface ExtensionAPI {
  registerTool<T extends TSchema>(tool: {
    name: string; label: string; description: string; isConcurrencySafe: boolean; parameters: T;
    execute(id: string, input: Static<T>, signal: AbortSignal | undefined, update: (result: Result) => void, ctx: Context): Promise<Result>
  }): void
  appendEntry(type: string, data: unknown): void
  on(name: 'before_agent_start', handler: () => { appendSystemPrompt: string }): void
  on(name: 'context', handler: (event: { messages: AgentMessage[] }, ctx: Context) => { messages: AgentMessage[] } | undefined): void
}
