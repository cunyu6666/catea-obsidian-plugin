// Type-only bridge for the retained context controller.
import type { AgentMessage } from '../loop/types'
export type { SessionEntry } from '../../../session'
export interface SessionContext { messages: AgentMessage[] }
