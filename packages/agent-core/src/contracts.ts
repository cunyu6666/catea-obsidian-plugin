/**
 * [WHO]: Provides ConversationStore, JournalEntry, MemoryJob, MemoryPort, Message, ModelClient, ModelEvent, ModelRequest, Session, SessionSummary
 * [FROM]: Depends on ./types, ./upstream-stream, ./providers
 * [TO]: Consumed by packages/agent-core/src/index.ts, packages/agent-core/src/context.ts,
 *   packages/agent-core/src/model-client.ts, packages/agent-core/src/upstream-stream.ts,
 *   packages/integrations/src/conversation-store.ts, packages/memory/src/index.ts
 * [HERE]: packages/agent-core/src/contracts.ts - host-neutral conversation and memory ports with serializable session data
 */
import type {ChatAttachment,ModelConfig,ToolEvent,TranscriptItem} from './types'
import type {RuntimeMessage} from './upstream-stream'
import type {ModelReply,ToolDefinition} from './providers'

export interface Message {attachmentIds?:string[];id:string;role:'user'|'assistant';text:string;reasoning?:string;tools:ToolEvent[];status:'complete'|'streaming'|'error'|'stopped';delivery?:'queued'|'delivered'|'deferred';snapshotId?:string;snapshotSessionId?:string;startedAt?:number;completedAt?:number;model?:string;usage?:{input:number;output:number;cacheRead:number};error?:string;sources?:Array<{title:string;url:string}>}
export type JournalEntry = {id:string;timestamp:string} & (
  {type:'message';message:RuntimeMessage} |
  {type:'compaction';summary:string;firstKeptEntryId:string;tokensBefore:number;details:unknown} |
  {type:'custom';customType:string;data:unknown}
)
export interface Session {attachments?:ChatAttachment[];id:string;title:string;personaId:string;messages:Message[];transcript:TranscriptItem[];updated:number;journal?:JournalEntry[]}
export interface SessionSummary {id:string;title:string}
export interface ConversationStore {
  list():Promise<SessionSummary[]>
  load(id:string):Promise<Session|null>
  save(session:Readonly<Session>):Promise<void>
  delete(id:string):Promise<void>
}
export interface ModelRequest {
  model:ModelConfig
  transcript:readonly TranscriptItem[]
  system:string
  tools:readonly ToolDefinition[]
  attachments:ReadonlyMap<string,ChatAttachment>
  maxTokens?:number
}
export type ModelEvent =
  | {type:'transport';mode:'sse'|'buffered'}
  | {type:'delta';text:string}
  | {type:'reasoning';text:string}
  | {type:'done';reply:ModelReply}
export interface ModelClient {
  stream(request:Readonly<ModelRequest>,signal:AbortSignal):AsyncIterable<ModelEvent>
}
export interface MemoryJob {id:string;sessionId:string;persona:string;modelId:string;user:string;assistant:string;tools:ToolEvent[]}
export interface MemoryPort {
  injection(persona:string,query:string,modelId:string):Promise<string>
  nativeTools(persona:string,modelId:string):Promise<ToolDefinition[]>
  enqueue(job:MemoryJob):Promise<void>
  process():Promise<void>
  run(name:string,args:Record<string,unknown>,persona:string,modelId:string,signal?:AbortSignal):Promise<string>
  setEnabled(enabled:boolean):void
  close():void
}
