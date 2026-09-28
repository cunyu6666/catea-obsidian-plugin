/**
 * [WHO]: Provides ModelReply, ModelServiceError, ToolDefinition, streamModel
 * [FROM]: Depends on ./types, ./i18n, ./transport, ./attachments, ./model-capabilities
 * [TO]: Consumed by apps/obsidian/src/obsidian-tools.ts, packages/agent-core/src/index.ts,
 *   packages/agent-core/src/upstream-stream.ts, packages/integrations/src/mcp.ts,
 *   packages/integrations/src/tools.ts, packages/integrations/src/web.ts,
 *   packages/memory/src/index.ts, packages/memory/src/tools.ts
 * [HERE]: packages/agent-core/src/providers.ts - streamModel maps transcripts to OpenAI or Anthropic requests and parses answer and provider reasoning streams; retries once without usage on 400/422
 */
import type { ChatAttachment, ModelConfig, TokenUsage, ToolCall, TranscriptItem } from './types'
import { t } from './i18n'
import { serviceFetch } from './transport'
import { attachmentIsText, attachmentText } from './attachments'
import {modelCapabilities,unsupportedAttachment} from './model-capabilities'

export interface ToolDefinition { name: string; description: string; parameters: Record<string, unknown> }
export interface ModelReply { text: string; calls: ToolCall[]; usage?: TokenUsage; stopReason?: 'stop'|'length'; anthropicContent?: Record<string, unknown>[] }

// Provider payloads are untrusted JSON; narrow fields before using them.
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map((item:unknown)=>record(item)) : []
}
function string(value: unknown): string { return typeof value === 'string' ? value : '' }

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function anthropicInputTokens(value: unknown): number | undefined {
  const data=record(value)
  const input = tokenCount(data.input_tokens)
  const cacheCreation = tokenCount(data.cache_creation_input_tokens)
  const cacheRead = tokenCount(record(value).cache_read_input_tokens)
  if (input === undefined && cacheCreation === undefined && cacheRead === undefined) return undefined
  return (input || 0) + (cacheCreation || 0) + (cacheRead || 0)
}

function anthropicUsage(value: unknown): TokenUsage | undefined {
  const input = anthropicInputTokens(value)
  const output = tokenCount(record(value).output_tokens)
  if (input === undefined || output === undefined) return undefined
  const cached = tokenCount(record(value).cache_read_input_tokens)
  return { inputTokens: input, outputTokens: output, ...(cached === undefined ? {} : { cachedInputTokens: cached }) }
}

function openAiUsage(value: unknown): TokenUsage | undefined {
  const input = tokenCount(record(value).prompt_tokens ?? record(value).input_tokens)
  const output = tokenCount(record(value).completion_tokens ?? record(value).output_tokens)
  if (input === undefined || output === undefined) return undefined
  const cached = tokenCount(record(record(value).prompt_tokens_details).cached_tokens ?? record(record(value).input_tokens_details).cached_tokens)
  return { inputTokens: input, outputTokens: output, ...(cached === undefined ? {} : { cachedInputTokens: cached }) }
}

export class ModelServiceError extends Error {
  readonly reason: 'context' | 'tools' | 'other'
  readonly status?: number

  constructor(detail: string, status?: number) {
    const reason = /context[_ ]length|too many tokens|maximum context|prompt is too long|input too long/i.test(detail)
      ? 'context'
      : /\btools?\b|tool_choice|function.call|tool.use/i.test(detail) ? 'tools' : 'other'
    super(status === undefined ? t('modelStreamFailed') : t('modelRequestFailed', { status, detail: t('modelErrorDetailHidden') }))
    this.name = 'ModelServiceError'
    this.reason = reason
    this.status = status
  }
}

function endpoint(base: string, suffix: string): string {
  const url = new URL(base.trim())
  const path = url.pathname.replace(/\/+$/, '')
  const canonical = path.endsWith(suffix) ? path : `${path}${path.endsWith('/v1') ? '' : '/v1'}${suffix}`
  url.pathname = canonical.replace(/\/v1\/v1\//, '/v1/')
  return url.toString()
}

async function* sse(response: Response, signal: AbortSignal): AsyncGenerator<{ event: string; data: string }> {
  if (!response.body) throw new Error(t('modelStreamMissing'))
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        let event = 'message'
        const data: string[] = []
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
        }
        if (data.length) yield { event, data: data.join('\n') }
      }
      signal.throwIfAborted()
    }
    if (buffer.trim()) {
      let event = 'message'
      const data: string[] = []
      for (const line of buffer.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (data.length) yield { event, data: data.join('\n') }
    }
  } finally { reader.releaseLock() }
}

function parseArgs(value: string): Record<string, unknown> {
  try { const parsed:unknown = JSON.parse(value || '{}'); return record(parsed) }
  catch { return {} }
}

function attachedFiles(item: Extract<TranscriptItem, { role: 'user' }>, attachments: ReadonlyMap<string, ChatAttachment>): ChatAttachment[] {
  return (item.attachmentIds || []).map(id => {
    const file = attachments.get(id)
    if (!file) throw new Error(t('attachmentUnavailable'))
    return file
  })
}

function encodedData(file: ChatAttachment): string {
  if (!file.dataUrl) throw new Error(t('attachmentUnavailable'))
  return file.dataUrl.split(',', 2)[1] || ''
}

function dataUrl(file: ChatAttachment): string {
  if (!file.dataUrl) throw new Error(t('attachmentUnavailable'))
  return file.dataUrl
}

function folderReference(file: ChatAttachment): string {
  return `[Vault folder reference: ${file.path}]\nThe folder contents were not attached. Inspect only what this request needs: use obsidian_search with folder=${JSON.stringify(file.path)} for notes, or ls/find/read for other vault files.`
}

function openAiMessages(transcript: TranscriptItem[], system: string, attachments: ReadonlyMap<string, ChatAttachment>) {
  return [{ role: 'system', content: system }, ...transcript.map(item => {
    if (item.role === 'tool') return { role: 'tool', tool_call_id: item.callId, content: item.content }
    if (item.role === 'assistant') return {
      role: 'assistant', content: item.content || null,
      ...(item.calls?.length ? { tool_calls: item.calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) } : {}),
    }
    const files = attachedFiles(item, attachments)
    if (!files.length) return { role: 'user', content: item.content }
    const content: unknown[] = item.content ? [{ type: 'text', text: item.content }] : []
    for (const file of files) {
      if (file.kind==='folder') content.push({type:'text',text:folderReference(file)})
      else if (attachmentIsText(file)) content.push({ type: 'text', text: `[Attached file: ${file.path}]\n${attachmentText(file)}` })
      else if ((file.mimeType || '').startsWith('image/')) {
        content.push({ type: 'text', text: `[Attached image: ${file.path}]` })
        content.push({ type: 'image_url', image_url: { url: dataUrl(file) } })
      } else content.push({ type: 'file', file: { filename: file.path, file_data: dataUrl(file) } })
    }
    return { role: 'user', content }
  })]
}

function anthropicMessages(transcript: TranscriptItem[], attachments: ReadonlyMap<string, ChatAttachment>) {
  const messages: Array<{ role: 'user' | 'assistant'; content: unknown[] }> = []
  for (const item of transcript) {
    if (item.role === 'tool') {
      const last = messages[messages.length - 1]
      const block = { type: 'tool_result', tool_use_id: item.callId, content: item.content }
      if (last?.role === 'user') last.content.push(block)
      else messages.push({ role: 'user', content: [block] })
    } else if (item.role === 'assistant') {
      messages.push({ role: 'assistant', content: item.anthropicContent || [
        ...(item.content ? [{ type: 'text', text: item.content }] : []),
        ...(item.calls || []).map(call => ({ type: 'tool_use', id: call.id, name: call.name, input: call.args })),
      ] })
    } else {
      const content: unknown[] = item.content ? [{ type: 'text', text: item.content }] : []
      for (const file of attachedFiles(item, attachments)) {
        if (file.kind==='folder') content.push({type:'text',text:folderReference(file)})
        else if (attachmentIsText(file)) content.push({ type: 'text', text: `[Attached file: ${file.path}]\n${attachmentText(file)}` })
        else if ((file.mimeType || '').startsWith('image/')) {
          content.push({ type: 'text', text: `[Attached image: ${file.path}]` })
          content.push({ type: 'image', source: { type: 'base64', media_type: file.mimeType, data: encodedData(file) } })
        } else content.push({ type: 'document', source: { type: 'base64', media_type: file.mimeType || 'application/octet-stream', data: encodedData(file) }, title: file.path })
      }
      messages.push({ role: 'user', content })
    }
  }
  return messages
}

async function responseError(response: Response): Promise<Error> {
  // Provider error bodies can echo request fields, including the model ID or prompt.
  // Classify the detail for retries, but never put the raw body in chat or storage.
  const body = (await response.text()).slice(0, 2_000)
  return new ModelServiceError(body, response.status)
}

export async function streamModel(
  config: ModelConfig,
  transcript: TranscriptItem[],
  system: string,
  tools: ToolDefinition[],
  attachments: ReadonlyMap<string, ChatAttachment>,
  onDelta: (text: string) => void,
  signal: AbortSignal,
  options: {maxTokens?:number;onTransport?:(mode:'sse'|'buffered')=>void;onReasoning?:(text:string)=>void} = {},
): Promise<ModelReply> {
  const capabilities=modelCapabilities(config)
  const usedIds=new Set(transcript.flatMap(item=>item.role==='user'?item.attachmentIds||[]:[]))
  const unsupported=unsupportedAttachment(config,[...attachments].filter(([id])=>usedIds.has(id)).map(([,file])=>file))
  if(unsupported)throw new Error(`Model ${config.name} cannot read attachment ${unsupported.path}`)
  const availableTools=capabilities.tools===false?[]:tools
  const streaming=capabilities.streaming!==false
  if (config.protocol === 'anthropic') {
    const url = endpoint(config.baseUrl, '/messages')
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
    if (new URL(url).hostname === 'api.anthropic.com') headers['anthropic-dangerous-direct-browser-access'] = 'true'
    const response = await serviceFetch(url, {
      method: 'POST', signal,
      headers,
      body: JSON.stringify({ model: config.model, max_tokens: options.maxTokens||4096, stream: streaming, system, messages: anthropicMessages(transcript, attachments), ...(availableTools.length ? { tools: availableTools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })) } : {}) }),
    })
    if (!response.ok) throw await responseError(response)
    options.onTransport?.(response.headers.get('content-type')?.includes('text/event-stream')?'sse':'buffered')
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      const data = record(await response.json())
      const content = records(data.content)
      const text = content.filter((item) => item.type === 'text').map((item) => string(item.text)).join('')
      for(const item of content)if(item.type==='thinking'&&typeof item.thinking==='string')options.onReasoning?.(item.thinking)
      const calls = content.filter((item) => item.type === 'tool_use').map((item) => ({ id: string(item.id)||crypto.randomUUID(), name: string(item.name), args: record(item.input) }))
      if (text) onDelta(text)
      return { text, calls, stopReason:data.stop_reason==='max_tokens'?'length':'stop',usage: anthropicUsage(data.usage), anthropicContent: content }
    }
    let text = ''
    let stopReason:'stop'|'length'='stop'
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    let cachedInputTokens: number | undefined
    const blocks = new Map<number, { id: string; name: string; input: string }>()
    const content = new Map<number, Record<string, unknown>>()
    for await (const frame of sse(response, signal)) {
      if (frame.data === '[DONE]') break
      let data: Record<string,unknown>
      try { data = record(JSON.parse(frame.data)) } catch { continue }
      if (frame.event === 'error' || data.type === 'error') throw new ModelServiceError(string(record(data.error).message))
      if (data.type === 'message_start') {
        inputTokens = anthropicInputTokens(record(data.message).usage) ?? inputTokens
        outputTokens = tokenCount(record(record(data.message).usage).output_tokens) ?? outputTokens
        cachedInputTokens = tokenCount(record(record(data.message).usage).cache_read_input_tokens) ?? cachedInputTokens
      }
      if (data.type === 'message_delta') {
        if(record(data.delta).stop_reason==='max_tokens')stopReason='length'
        inputTokens = anthropicInputTokens(data.usage) ?? inputTokens
        outputTokens = tokenCount(record(data.usage).output_tokens) ?? outputTokens
        cachedInputTokens = tokenCount(record(data.usage).cache_read_input_tokens) ?? cachedInputTokens
      }
      const index=typeof data.index==='number'&&Number.isInteger(data.index)&&data.index>=0?data.index:undefined
      if(index===undefined)continue
      const block=record(data.content_block),delta=record(data.delta)
      if (data.type === 'content_block_start') content.set(index, {...block})
      if (data.type === 'content_block_start' && block.type === 'tool_use') blocks.set(index, { id: string(block.id), name: string(block.name), input: '' })
      if (data.type === 'content_block_delta') {
        const raw = content.get(index)
        if(raw){
          if(delta.type==='text_delta') raw.text=string(raw.text)+string(delta.text)
          if(delta.type==='thinking_delta') raw.thinking=string(raw.thinking)+string(delta.thinking)
          if(delta.type==='signature_delta') raw.signature=string(raw.signature)+string(delta.signature)
        }
        if (delta.type === 'text_delta' && typeof delta.text==='string') { text += delta.text; onDelta(delta.text) }
        if (delta.type === 'thinking_delta' && typeof delta.thinking==='string') options.onReasoning?.(delta.thinking)
        if (delta.type === 'input_json_delta') { const tool = blocks.get(index); if (tool) tool.input += string(delta.partial_json) }
      }
    }
    for(const [index,block] of blocks){const raw=content.get(index);if(raw)raw.input=block.input?parseArgs(block.input):raw.input||{}}
    return { text, stopReason,anthropicContent: [...content.values()], calls: [...blocks.entries()].map(([index,block]) => ({ id: block.id, name: block.name, args: block.input?parseArgs(block.input):record(content.get(index)?.input) })), usage: inputTokens === undefined || outputTokens === undefined ? undefined : { inputTokens, outputTokens, ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }) } }
  }

  const request = { model: config.model, stream: streaming,...(options.maxTokens?{max_tokens:options.maxTokens}:{}), messages: openAiMessages(transcript, system, attachments), ...(availableTools.length ? { tools: availableTools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })), tool_choice: 'auto',...(capabilities.parallelTools===false?{parallel_tool_calls:false}:{}) } : {}) }
  const fetchCompletion = (includeUsage: boolean) => serviceFetch(endpoint(config.baseUrl, '/chat/completions'), {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ ...request, ...(includeUsage&&streaming ? { stream_options: { include_usage: true } } : {}) }),
  })
  let response = await fetchCompletion(true)
  if (response.status === 400 || response.status === 422) response = await fetchCompletion(false)
  if (!response.ok) throw await responseError(response)
  options.onTransport?.(response.headers.get('content-type')?.includes('text/event-stream')?'sse':'buffered')
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = record(await response.json())
    const choice=records(data.choices)[0]||{}
    const message = record(choice.message)
    const text = typeof message.content === 'string' ? message.content : ''
    if(typeof message.reasoning_content==='string')options.onReasoning?.(message.reasoning_content)
    const calls = records(message.tool_calls).map((item) => ({ id: string(item.id)||crypto.randomUUID(), name: string(record(item.function).name), args: parseArgs(string(record(item.function).arguments)) }))
    if (text) onDelta(text)
    return { text, calls, stopReason:records(data.choices)[0]?.finish_reason==='length'?'length':'stop',usage: openAiUsage(data.usage) }
  }
  let text = ''
  let stopReason:'stop'|'length'='stop'
  let usage: TokenUsage | undefined
  const calls = new Map<number, { id: string; name: string; args: string }>()
  for await (const frame of sse(response, signal)) {
    if (frame.data === '[DONE]') break
    let data:Record<string,unknown>
    try { data = record(JSON.parse(frame.data)) } catch { continue }
    if (data.error) throw new ModelServiceError(string(record(data.error).message))
    if (data.usage) usage = openAiUsage(data.usage)
    if(records(data.choices)[0]?.finish_reason==='length')stopReason='length'
    const delta = record(records(data.choices)[0]?.delta)
    if(typeof delta.reasoning_content==='string')options.onReasoning?.(delta.reasoning_content)
    if (typeof delta?.content === 'string') { text += delta.content; onDelta(delta.content) }
    for (const part of records(delta.tool_calls)) {
      if(typeof part.index!=='number'||!Number.isInteger(part.index)||part.index<0)continue
      const current = calls.get(part.index) || { id: '', name: '', args: '' }
      current.id += string(part.id)
      current.name += string(record(part.function).name)
      current.args += string(record(part.function).arguments)
      calls.set(part.index, current)
    }
  }
  return { text, stopReason,calls: [...calls.values()].map(call => ({ id: call.id || crypto.randomUUID(), name: call.name, args: parseArgs(call.args) })), usage }
}
