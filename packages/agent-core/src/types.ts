/**
 * [WHO]: Provides AgentEvent, AppSettings, AskUserQuestion, AskUserQuestionAnswer, ChatAttachment,
 *   ChatMessage, ChatSession, McpServerConfig, McpToolInfo, ModelCapabilities, ModelConfig, ModelProtocol,
 *   SearchEngine, SearchProvider, SearchServiceConfig, SkillRecord, Source, TokenUsage,
 *   ToolCall, ToolEvent, TranscriptItem
 * [FROM]: Depends on (none)
 * [TO]: Consumed by apps/obsidian/src/main.tsx, apps/obsidian/src/panel.tsx, apps/obsidian/src/settings.ts,
 *   packages/agent-core/src/ask-user-question.ts, packages/agent-core/src/attachments.ts,
 *   packages/agent-core/src/byok.ts, packages/agent-core/src/index.ts,
 *   packages/agent-core/src/model-capabilities.ts,
 *   packages/agent-core/src/providers.ts, packages/agent-core/src/upstream-stream.ts,
 *   packages/memory/src/host.ts, packages/memory/src/index.ts
 * [HERE]: packages/agent-core/src/types.ts - shared type declarations for models, transcripts, attachments, tools and search configuration; type-only, emits no runtime code
 */
export type ModelProtocol = 'openai' | 'anthropic'

export interface ModelCapabilities {
  vision:boolean
  documents:boolean
  tools:boolean
  streaming:boolean
  parallelTools:boolean
  structuredOutput:boolean
}

export interface ModelConfig {
  id: string
  name: string
  protocol: ModelProtocol
  baseUrl: string
  apiKey: string
  model: string
  contextWindow?: number
  capabilities?:Partial<ModelCapabilities>
}

export type SearchEngine = 'default' | 'google' | 'bing' | 'baidu'
export type SearchProvider = 'tavily' | 'exa' | 'jina'

export interface SearchServiceConfig {
  preferred: SearchProvider | null
  keys: Record<SearchProvider, string>
}

export interface McpServerConfig {
  id: string
  name: string
  url: string
  token: string
  enabled: boolean
  tools: McpToolInfo[]
  trustedReadOnlyTools: string[]
}

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean }
}

export interface AppSettings {
  models: ModelConfig[]
  lastModelId: string | null
  lastSearchEngine: SearchEngine
  search: SearchServiceConfig
  mcpServers: McpServerConfig[]
  theme: 'system' | 'light' | 'dark'
  showTokenUsage: boolean
  personaId: string | null
  customPersonas: Array<{ id: string; name: string; description: string; content: string }>
  customSystemPrompt: string
  appendSystemPrompt: string
}

export interface Source {
  title: string
  url: string
  snippet?: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cachedInputTokens?: number
}

export interface ToolEvent {
  id: string
  name: string
  args: Record<string, unknown>
  result?: string
  error?: string
  approved?: boolean
}

export interface AskUserQuestion {
  question: string
  header: string
  options: Array<{ label: string; description: string; preview?: string }>
  multiSelect?: boolean
}

export type AskUserQuestionAnswer = Record<string, string>

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: ChatAttachment[]
  createdAt: number
  modelId?: string
  status?: 'streaming' | 'complete' | 'interrupted' | 'error'
  tools?: ToolEvent[]
  sources?: Source[]
  usage?: TokenUsage
  error?: string
}

export interface ChatAttachment {
  id: string
  /** Missing on legacy sessions, where the attachment is always a file. */
  kind?: 'file' | 'folder'
  path: string
  size: number
  mimeType?: string
  dataUrl?: string
  /** Text-only attachments saved by earlier local previews. */
  content?: string
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  transcript?: TranscriptItem[]
}

export type TranscriptItem =
  | { role: 'user'; content: string; attachmentIds?: string[] }
  | { role: 'assistant'; content: string; calls?: ToolCall[]; anthropicContent?: Record<string, unknown>[] }
  | { role: 'tool'; callId: string; name: string; content: string }

export interface ToolCall { id: string; name: string; args: Record<string, unknown> }

export interface SkillRecord {
  id: string
  name: string
  description: string
  content: string
  files: Record<string, string>
  enabled: boolean
  importedAt: number
}

export type AgentEvent =
  | { type: 'agent:started'; sessionId: string; tabId: number }
  | { type: 'agent:delta'; sessionId: string; messageId: string; text: string; offset: number }
  | { type: 'agent:tool'; sessionId: string; messageId: string; tool: ToolEvent }
  | { type: 'agent:done'; sessionId: string; messageId: string }
  | { type: 'agent:error'; sessionId: string; messageId: string; error: string }
  | { type: 'agent:approval'; sessionId: string; requestId: string; serverId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'agent:question'; sessionId: string; requestId: string; questions: AskUserQuestion[] }
