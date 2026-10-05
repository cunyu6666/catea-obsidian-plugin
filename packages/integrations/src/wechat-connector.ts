/**
 * [WHO]: Provides WeChatConnectorCall, WeChatHttpCall, callWeChatConnector, markdownToWechatHtml
 * [FROM]: Depends on ./connectors.ts
 * [TO]: Consumed by packages/integrations/src/connectors.ts,
 *   packages/integrations/src/__tests__/wechat-connector.test.ts
 * [HERE]: packages/integrations/src/wechat-connector.ts - WeChat connector runtime adapter for executable push-notification and Official Account article-draft writes
 */
import type { ConnectorConfig } from './connectors.ts'

export type WeChatConnectorCall = 'read' | 'create' | 'update' | 'share'
export type WeChatHttpCall = (
  url: string,
  init: RequestInit,
  signal: AbortSignal,
) => Promise<unknown>

export interface WeChatSecrets {
  WECHAT_BRIDGE_TOKEN?: string
  PUSHPLUS_TOKEN?: string
  WECHAT_OFFICIAL_APP_ID?: string
  WECHAT_OFFICIAL_APP_SECRET?: string
  WECHAT_OFFICIAL_ACCESS_TOKEN?: string
  WECHAT_OFFICIAL_THUMB_MEDIA_ID?: string
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredSecret(value: string | undefined, name: string): string {
  if (!value) throw new Error(`WeChat connector requires secret: ${name}`)
  return value
}

function textFromArgs(args: Record<string, unknown>): string {
  const document = record(args.document)
  return (
    stringValue(args.content_markdown) ||
    stringValue(args.body_markdown) ||
    stringValue(document.content_markdown) ||
    stringValue(document.body_markdown) ||
    stringValue(document.content) ||
    ''
  )
}

function titleFromArgs(args: Record<string, unknown>, fallback = 'Catea Note'): string {
  const target = record(args.target)
  const document = record(args.document)
  return (
    stringValue(args.title) ||
    stringValue(target.title) ||
    stringValue(document.title) ||
    fallback
  ).slice(0, 80)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function markdownToWechatHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let inList = false
  const closeList = () => {
    if (inList) {
      html.push('</ul>')
      inList = false
    }
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      closeList()
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      closeList()
      const level = Math.min(heading[1].length, 3)
      html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`)
      continue
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      if (!inList) {
        html.push('<ul>')
        inList = true
      }
      html.push(`<li>${escapeHtml(bullet[1])}</li>`)
      continue
    }
    closeList()
    html.push(`<p>${escapeHtml(line)}</p>`)
  }
  closeList()
  return html.join('\n')
}

async function defaultHttpCall(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, { ...init, signal })
  const text = await response.text()
  let payload: unknown = text
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { text }
  }
  if (!response.ok) throw new Error(JSON.stringify(payload).slice(0, 1000))
  return payload
}

function apiError(payload: unknown): Error | undefined {
  const body = record(payload)
  const errcode = body.errcode
  if (typeof errcode === 'number' && errcode !== 0)
    return new Error(`WeChat API error ${errcode}: ${String(body.errmsg || 'unknown error')}`)
  return undefined
}

async function getOfficialAccessToken(
  secrets: WeChatSecrets,
  http: WeChatHttpCall,
  signal: AbortSignal,
): Promise<string> {
  if (secrets.WECHAT_OFFICIAL_ACCESS_TOKEN) return secrets.WECHAT_OFFICIAL_ACCESS_TOKEN
  const appId = requiredSecret(secrets.WECHAT_OFFICIAL_APP_ID, 'WECHAT_OFFICIAL_APP_ID')
  const appSecret = requiredSecret(secrets.WECHAT_OFFICIAL_APP_SECRET, 'WECHAT_OFFICIAL_APP_SECRET')
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', appId)
  url.searchParams.set('secret', appSecret)
  const payload = await http(url.toString(), { method: 'GET' }, signal)
  const error = apiError(payload)
  if (error) throw error
  const accessToken = stringValue(record(payload).access_token)
  if (!accessToken) throw new Error('WeChat API did not return access_token')
  return accessToken
}

async function callPushPlus(
  operation: WeChatConnectorCall,
  args: Record<string, unknown>,
  secrets: WeChatSecrets,
  http: WeChatHttpCall,
  signal: AbortSignal,
): Promise<unknown> {
  if (operation === 'read') throw new Error('PushPlus adapter does not support reads')
  const target = record(args.target)
  const token = requiredSecret(secrets.PUSHPLUS_TOKEN, 'PUSHPLUS_TOKEN')
  const content = textFromArgs(args)
  if (!content) throw new Error('WeChat PushPlus share requires content_markdown')
  const payload = {
    token,
    title: titleFromArgs(args),
    content,
    template: stringValue(target.template) || 'markdown',
    channel: stringValue(target.channel) || 'wechat',
    ...(stringValue(target.topic) ? { topic: stringValue(target.topic) } : {}),
    ...(stringValue(target.to) ? { to: stringValue(target.to) } : {}),
    ...(stringValue(target.option) ? { option: stringValue(target.option) } : {}),
  }
  const result = await http(
    'https://www.pushplus.plus/send',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    signal,
  )
  const code = record(result).code
  if (typeof code === 'number' && code !== 200)
    throw new Error(`PushPlus API error ${code}: ${String(record(result).msg || 'unknown error')}`)
  return {
    connector: 'wechat',
    adapter: 'wechat_pushplus',
    operation,
    provider: 'pushplus',
    result,
  }
}

async function callOfficialAccount(
  operation: WeChatConnectorCall,
  args: Record<string, unknown>,
  secrets: WeChatSecrets,
  http: WeChatHttpCall,
  signal: AbortSignal,
): Promise<unknown> {
  const accessToken = await getOfficialAccessToken(secrets, http, signal)
  const target = record(args.target)
  const mediaId = stringValue(target.media_id) || stringValue(args.media_id)
  if (operation === 'read') {
    if (!mediaId) throw new Error('Official Account read requires target.media_id')
    const result = await http(
      `https://api.weixin.qq.com/cgi-bin/draft/get?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: mediaId }),
      },
      signal,
    )
    const error = apiError(result)
    if (error) throw error
    return { connector: 'wechat', adapter: 'wechat_official_account_api', operation, result }
  }

  const title = titleFromArgs(args).slice(0, 64)
  const markdown = textFromArgs(args)
  if (!markdown) throw new Error('Official Account article draft requires content_markdown')
  const article = {
    article_type: 'news',
    title,
    author: stringValue(target.author)?.slice(0, 32) || '',
    digest: (stringValue(target.digest) || markdown.replace(/\s+/g, ' ').slice(0, 120)).slice(
      0,
      120,
    ),
    content: markdownToWechatHtml(markdown),
    content_source_url: stringValue(target.source_url) || '',
    thumb_media_id: requiredSecret(
      stringValue(target.thumb_media_id) || secrets.WECHAT_OFFICIAL_THUMB_MEDIA_ID,
      'WECHAT_OFFICIAL_THUMB_MEDIA_ID',
    ),
    need_open_comment: target.need_open_comment === true ? 1 : 0,
    only_fans_can_comment: target.only_fans_can_comment === true ? 1 : 0,
  }
  const body =
    operation === 'update' && mediaId
      ? { media_id: mediaId, index: Number(target.index || 0), articles: article }
      : { articles: [article] }
  const endpoint =
    operation === 'update' && mediaId
      ? 'https://api.weixin.qq.com/cgi-bin/draft/update'
      : 'https://api.weixin.qq.com/cgi-bin/draft/add'
  const result = await http(
    `${endpoint}?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    signal,
  )
  const error = apiError(result)
  if (error) throw error
  return {
    connector: 'wechat',
    adapter: 'wechat_official_account_api',
    operation,
    mode: operation === 'update' && mediaId ? 'draft_update' : 'draft_create',
    result,
  }
}

export async function callWeChatConnector(
  operation: WeChatConnectorCall,
  args: Record<string, unknown>,
  config: ConnectorConfig,
  secrets: WeChatSecrets,
  http: WeChatHttpCall = defaultHttpCall,
  signal: AbortSignal,
): Promise<unknown> {
  if (config.adapter === 'wechat_pushplus')
    return callPushPlus(operation, args, secrets, http, signal)
  if (config.adapter === 'wechat_official_account_api')
    return callOfficialAccount(operation, args, secrets, http, signal)
  throw new Error(`WeChat adapter is not executable yet: ${config.adapter || 'unknown'}`)
}
