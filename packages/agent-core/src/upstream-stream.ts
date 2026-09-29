/**
 * [WHO]: Provides RuntimeMessage, emptyUsage, fromTranscript, providerStream, streamSimple, toTranscript
 * [FROM]: Depends on ../upstream/ai/types, ../upstream/ai/events, ./providers, ./contracts, ./types
 * [TO]: Consumed by packages/agent-core/src/context.ts, packages/agent-core/src/index.ts
 * [HERE]: packages/agent-core/src/upstream-stream.ts - converts transcripts and provider reasoning into CatUI events; providerStream retries 3x at 500*2^n ms
 */
import type {
  AssistantMessage,
  UserMessage,
  ToolResultMessage,
  Usage,
  Context,
  Model,
  Api,
  StreamOptions,
  SimpleStreamOptions,
} from '../upstream/ai/types'
import { AssistantMessageEventStream } from '../upstream/ai/events'
import { ModelServiceError, type ModelReply } from './providers'
import type { ModelClient } from './contracts'
import type { ModelConfig, TranscriptItem, ChatAttachment } from './types'
type HostFields = {
  attachmentIds?: string[]
  anthropicContent?: Record<string, unknown>[]
  cateaCheckpoint?: string
  cateaDelivery?: { mode: string; chunks: number; firstDeltaMs?: number; totalMs: number }
}
export type RuntimeMessage = (
  UserMessage | ToolResultMessage<unknown> | (Omit<AssistantMessage, 'usage'> & { usage?: Usage })
) &
  HostFields
export const emptyUsage = () => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
})
export function fromTranscript(t: TranscriptItem): RuntimeMessage {
  const base = { timestamp: Date.now() }
  if (t.role === 'user')
    return { ...base, role: 'user', content: t.content, attachmentIds: t.attachmentIds }
  if (t.role === 'tool')
    return {
      ...base,
      role: 'toolResult',
      toolCallId: t.callId,
      toolName: t.name,
      content: [{ type: 'text' as const, text: t.content }],
      isError: t.content.startsWith('Tool error:'),
    }
  return {
    ...base,
    role: 'assistant',
    api: 'catea',
    provider: 'catea',
    model: '',
    usage: undefined,
    stopReason: t.calls?.length ? 'toolUse' : 'stop',
    content: [
      ...(t.content ? [{ type: 'text' as const, text: t.content }] : []),
      ...(t.calls || []).map((c) => ({
        type: 'toolCall' as const,
        id: c.id,
        name: c.name,
        arguments: c.args,
      })),
    ],
    ...(t.anthropicContent ? { anthropicContent: t.anthropicContent } : {}),
  }
}
export function toTranscript(m: RuntimeMessage): TranscriptItem {
  const text =
    typeof m.content === 'string'
      ? m.content
      : m.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('')
  if (m.role === 'toolResult')
    return { role: 'tool', callId: m.toolCallId, name: m.toolName, content: text }
  if (m.role === 'assistant')
    return {
      role: 'assistant',
      content: text,
      calls: m.content
        .filter((b) => b.type === 'toolCall')
        .map((b) => ({ id: b.id, name: b.name, args: b.arguments })),
      ...(m.anthropicContent ? { anthropicContent: m.anthropicContent } : {}),
    }
  return { role: 'user', content: text, attachmentIds: m.attachmentIds }
}
export function providerStream(
  config: ModelConfig,
  attachments: () => ReadonlyMap<string, ChatAttachment>,
  client: ModelClient,
) {
  return (_model: Model<Api>, context: Context, options: StreamOptions = {}) => {
    const stream = new AssistantMessageEventStream()
    const message: AssistantMessage & HostFields = {
      role: 'assistant',
      api: _model.api,
      provider: _model.provider,
      model: _model.id,
      timestamp: Date.now(),
      content: [{ type: 'text' as const, text: '' }],
      usage: emptyUsage(),
      stopReason: 'stop',
    }
    void (async () => {
      let emitted = false
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const started = Date.now()
          let firstDeltaMs: number | undefined,
            chunks = 0
          let delivery = 'unknown'
          let result: ModelReply | undefined
          for await (const event of client.stream(
            {
              model: config,
              transcript: context.messages.map(toTranscript),
              system: context.systemPrompt || '',
              tools: (context.tools || []).map((t) => ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              })),
              attachments: attachments(),
              maxTokens: options.maxTokens,
            },
            options.signal ?? new AbortController().signal,
          )) {
            if (event.type === 'transport') {
              delivery = event.mode
              continue
            }
            if (event.type === 'done') {
              result = event.reply
              continue
            }
            chunks++
            firstDeltaMs ??= Date.now() - started
            if (!emitted) {
              stream.push({ type: 'start', partial: message })
              emitted = true
            }
            if (event.type === 'reasoning') {
              let index = message.content.findIndex((block) => block.type === 'thinking')
              if (index < 0) {
                index = message.content.length
                message.content.push({ type: 'thinking', thinking: '' })
                stream.push({ type: 'thinking_start', contentIndex: index, partial: message })
              }
              const block = message.content[index]
              if (block.type === 'thinking') block.thinking += event.text
              stream.push({
                type: 'thinking_delta',
                contentIndex: index,
                delta: event.text,
                partial: message,
              })
              continue
            }
            const first = message.content[0]
            if (first.type === 'text') first.text += event.text
            stream.push({
              type: 'text_delta',
              contentIndex: 0,
              delta: event.text,
              partial: message,
            })
          }
          if (!result) throw new Error('Model stream ended without a final response')
          message.content = [
            { type: 'text' as const, text: result.text },
            ...message.content.filter((block) => block.type === 'thinking'),
            ...result.calls.map((c) => ({
              type: 'toolCall' as const,
              id: c.id,
              name: c.name,
              arguments: c.args,
            })),
          ]
          message.cateaDelivery = {
            mode: delivery,
            chunks,
            firstDeltaMs,
            totalMs: Date.now() - started,
          }
          message.anthropicContent = result.anthropicContent
          if (result.usage) {
            const cacheRead = result.usage.cachedInputTokens || 0
            const cacheWrite = result.usage.cacheWriteInputTokens || 0
            message.usage = {
              ...emptyUsage(),
              input: result.usage.inputTokens,
              output: result.usage.outputTokens,
              cacheRead,
              cacheWrite,
              // The old folded input already carried both cache buckets, so this sum
              // keeps the compaction threshold firing at the same context size.
              totalTokens:
                result.usage.inputTokens + result.usage.outputTokens + cacheRead + cacheWrite,
            }
          }
          message.stopReason =
            result.stopReason === 'length' ? 'length' : result.calls.length ? 'toolUse' : 'stop'
          stream.push({ type: 'done', reason: message.stopReason, message })
          stream.end(message)
          return
        } catch (e: unknown) {
          const transient =
            !emitted &&
            !options.signal?.aborted &&
            (!(e instanceof ModelServiceError) ||
              [408, 429, 500, 502, 503, 504].includes(e.status || 0))
          if (transient && attempt < 2) {
            await new Promise<void>((resolve, reject) => {
              const abort = () => {
                window.clearTimeout(timer)
                reject(new Error('Aborted'))
              }
              const timer = window.setTimeout(
                () => {
                  options.signal?.removeEventListener('abort', abort)
                  resolve()
                },
                500 * 2 ** attempt,
              )
              options.signal?.addEventListener('abort', abort, { once: true })
            }).catch(() => {})
            if (!options.signal?.aborted) continue
          }
          message.stopReason = options.signal?.aborted ? 'aborted' : 'error'
          message.errorMessage =
            e instanceof ModelServiceError && e.reason === 'context'
              ? 'context_length_exceeded: Context window exceeded; original history is preserved.'
              : e instanceof Error
                ? e.message
                : String(e)
          stream.push({ type: 'error', reason: message.stopReason, error: message })
          stream.end(message)
          return
        }
      }
    })()
    return stream
  }
}
// Mandatory host injection prevents accidentally selecting CatUI's built-in providers or credentials.
export function streamSimple(
  _model: Model<Api>,
  _context: Context,
  _options?: SimpleStreamOptions,
): AssistantMessageEventStream {
  throw new Error('Catea provider adapter required')
}
