import type { ChatAttachment, ModelConfig, TokenUsage, ToolCall, TranscriptItem } from './types'
import { t } from './i18n'
import { serviceFetch } from './transport'
import { attachmentIsText, attachmentText } from './attachments'

export interface ToolDefinition { name: string; description: string; parameters: Record<string, unknown> }
export interface ModelReply { text: string; calls: ToolCall[]; usage?: TokenUsage; stopReason?: 'stop'|'length'; anthropicContent?: Record<string, unknown>[] }

function tokenCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function anthropicInputTokens(value: any): number | undefined {
  const input = tokenCount(value?.input_tokens)
  const cacheCreation = tokenCount(value?.cache_creation_input_tokens)
  const cacheRead = tokenCount(value?.cache_read_input_tokens)
  if (input === undefined && cacheCreation === undefined && cacheRead === undefined) return undefined
  return (input || 0) + (cacheCreation || 0) + (cacheRead || 0)
}

function anthropicUsage(value: any): TokenUsage | undefined {
  const input = anthropicInputTokens(value)
  const output = tokenCount(value?.output_tokens)
  if (input === undefined || output === undefined) return undefined
  const cached = tokenCount(value?.cache_read_input_tokens)
  return { inputTokens: input, outputTokens: output, ...(cached === undefined ? {} : { cachedInputTokens: cached }) }
}

function openAiUsage(value: any): TokenUsage | undefined {
  const input = tokenCount(value?.prompt_tokens ?? value?.input_tokens)
  const output = tokenCount(value?.completion_tokens ?? value?.output_tokens)
  if (input === undefined || output === undefined) return undefined
  const cached = tokenCount(value?.prompt_tokens_details?.cached_tokens ?? value?.input_tokens_details?.cached_tokens)
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
      if (signal.aborted) throw signal.reason
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
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {} }
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
      if (attachmentIsText(file)) content.push({ type: 'text', text: `[Attached file: ${file.path}]\n${attachmentText(file)}` })
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
        if (attachmentIsText(file)) content.push({ type: 'text', text: `[Attached file: ${file.path}]\n${attachmentText(file)}` })
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
  options: {maxTokens?:number;onTransport?:(mode:'sse'|'buffered')=>void} = {},
): Promise<ModelReply> {
  if (config.protocol === 'anthropic') {
    const url = endpoint(config.baseUrl, '/messages')
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
    if (new URL(url).hostname === 'api.anthropic.com') headers['anthropic-dangerous-direct-browser-access'] = 'true'
    const response = await serviceFetch(url, {
      method: 'POST', signal,
      headers,
      body: JSON.stringify({ model: config.model, max_tokens: options.maxTokens||4096, stream: true, system, messages: anthropicMessages(transcript, attachments), ...(tools.length ? { tools: tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })) } : {}) }),
    })
    if (!response.ok) throw await responseError(response)
    options.onTransport?.(response.headers.get('content-type')?.includes('text/event-stream')?'sse':'buffered')
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      const data = await response.json() as any
      const content = Array.isArray(data.content) ? data.content : []
      const text = content.filter((item: any) => item.type === 'text').map((item: any) => String(item.text || '')).join('')
      const calls = content.filter((item: any) => item.type === 'tool_use').map((item: any) => ({ id: String(item.id || crypto.randomUUID()), name: String(item.name), args: item.input || {} }))
      if (text) onDelta(text)
      return { text, calls, stopReason:data.stop_reason==='max_tokens'?'length':'stop',usage: anthropicUsage(data.usage), anthropicContent: content }
    }
    let text = ''
    let stopReason:'stop'|'length'='stop'
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    let cachedInputTokens: number | undefined
    const blocks = new Map<number, { id: string; name: string; input: string }>()
    const content = new Map<number, Record<string, any>>()
    for await (const frame of sse(response, signal)) {
      if (frame.data === '[DONE]') break
      let data: any
      try { data = JSON.parse(frame.data) } catch { continue }
      if (frame.event === 'error' || data.type === 'error') throw new ModelServiceError(String(data.error?.message || ''))
      if (data.type === 'message_start') {
        inputTokens = anthropicInputTokens(data.message?.usage) ?? inputTokens
        outputTokens = tokenCount(data.message?.usage?.output_tokens) ?? outputTokens
        cachedInputTokens = tokenCount(data.message?.usage?.cache_read_input_tokens) ?? cachedInputTokens
      }
      if (data.type === 'message_delta') {
        if(data.delta?.stop_reason==='max_tokens')stopReason='length'
        inputTokens = anthropicInputTokens(data.usage) ?? inputTokens
        outputTokens = tokenCount(data.usage?.output_tokens) ?? outputTokens
        cachedInputTokens = tokenCount(data.usage?.cache_read_input_tokens) ?? cachedInputTokens
      }
      if (data.type === 'content_block_start') content.set(data.index, {...data.content_block})
      if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') blocks.set(data.index, { id: data.content_block.id, name: data.content_block.name, input: '' })
      if (data.type === 'content_block_delta') {
        const raw = content.get(data.index)
        if(raw){
          if(data.delta?.type==='text_delta') raw.text=(raw.text||'')+data.delta.text
          if(data.delta?.type==='thinking_delta') raw.thinking=(raw.thinking||'')+data.delta.thinking
          if(data.delta?.type==='signature_delta') raw.signature=(raw.signature||'')+data.delta.signature
        }
        if (data.delta?.type === 'text_delta') { text += data.delta.text; onDelta(data.delta.text) }
        if (data.delta?.type === 'input_json_delta') { const block = blocks.get(data.index); if (block) block.input += data.delta.partial_json }
      }
    }
    for(const [index,block] of blocks){const raw=content.get(index);if(raw)raw.input=block.input?parseArgs(block.input):raw.input||{}}
    return { text, stopReason,anthropicContent: [...content.values()], calls: [...blocks.values()].map(block => ({ id: block.id, name: block.name, args: parseArgs(block.input) })), usage: inputTokens === undefined || outputTokens === undefined ? undefined : { inputTokens, outputTokens, ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }) } }
  }

  const request = { model: config.model, stream: true,...(options.maxTokens?{max_tokens:options.maxTokens}:{}), messages: openAiMessages(transcript, system, attachments), ...(tools.length ? { tools: tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } })), tool_choice: 'auto' } : {}) }
  const fetchCompletion = (includeUsage: boolean) => serviceFetch(endpoint(config.baseUrl, '/chat/completions'), {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ ...request, ...(includeUsage ? { stream_options: { include_usage: true } } : {}) }),
  })
  let response = await fetchCompletion(true)
  if (response.status === 400 || response.status === 422) response = await fetchCompletion(false)
  if (!response.ok) throw await responseError(response)
  options.onTransport?.(response.headers.get('content-type')?.includes('text/event-stream')?'sse':'buffered')
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = await response.json() as any
    const message = data.choices?.[0]?.message || {}
    const text = typeof message.content === 'string' ? message.content : ''
    const calls = (message.tool_calls || []).map((item: any) => ({ id: String(item.id || crypto.randomUUID()), name: String(item.function?.name || ''), args: parseArgs(item.function?.arguments || '{}') }))
    if (text) onDelta(text)
    return { text, calls, stopReason:data.choices?.[0]?.finish_reason==='length'?'length':'stop',usage: openAiUsage(data.usage) }
  }
  let text = ''
  let stopReason:'stop'|'length'='stop'
  let usage: TokenUsage | undefined
  const calls = new Map<number, { id: string; name: string; args: string }>()
  for await (const frame of sse(response, signal)) {
    if (frame.data === '[DONE]') break
    let data: any
    try { data = JSON.parse(frame.data) } catch { continue }
    if (data.error) throw new ModelServiceError(String(data.error.message || ''))
    if (data.usage) usage = openAiUsage(data.usage)
    if(data.choices?.[0]?.finish_reason==='length')stopReason='length'
    const delta = data.choices?.[0]?.delta
    if (typeof delta?.content === 'string') { text += delta.content; onDelta(delta.content) }
    for (const part of delta?.tool_calls || []) {
      const current = calls.get(part.index) || { id: '', name: '', args: '' }
      current.id += part.id || ''
      current.name += part.function?.name || ''
      current.args += part.function?.arguments || ''
      calls.set(part.index, current)
    }
  }
  return { text, stopReason,calls: [...calls.values()].map(call => ({ id: call.id || crypto.randomUUID(), name: call.name, args: parseArgs(call.args) })), usage }
}
