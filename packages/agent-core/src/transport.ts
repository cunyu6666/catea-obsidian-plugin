/**
 * [WHO]: Provides serviceFetch
 * [FROM]: Depends on obsidian, node:https, node:http, electron, @electron/remote
 * [TO]: Consumed by packages/integrations/src/media-generation.ts, packages/agent-core/src/providers.ts, packages/integrations/src/web.ts, packages/integrations/src/image-generation.ts
 * [HERE]: packages/agent-core/src/transport.ts - streams over Node http/https with a 120 s timeout and rejects redirects; falls back to Electron net only on X.509 chain errors, then to buffered requestUrl
 */
import { requestUrl } from 'obsidian'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest, type RequestOptions } from 'node:http'

interface RequestPolicy {
  lookup: NonNullable<RequestOptions['lookup']>
  maxBytes: number
}

// Direct Node transport preserves streaming in Obsidian without a proxy or CORS workaround.
function nodeFetch(
  input: string,
  init: Omit<RequestInit, 'body'> & { body?: string } = {},
  policy?: RequestPolicy,
): Promise<Response> {
  const url = new URL(input)
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('仅支持 HTTP(S) 模型接口')
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
      url,
      {
        method: init.method || 'GET',
        headers: Object.fromEntries(new Headers(init.headers)),
        signal: init.signal || undefined,
        ...(policy ? { lookup: policy.lookup, agent: false } : {}),
      },
      (response) => {
        if ((response.statusCode || 0) >= 300 && (response.statusCode || 0) < 400) {
          response.resume()
          reject(new Error('接口发生重定向，请在设置中填写最终 API 地址'))
          return
        }
        const headers = new Headers()
        for (const [key, value] of Object.entries(response.headers))
          if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            let received = 0
            response.on('data', (chunk: Buffer) => {
              received += chunk.byteLength
              if (policy && received > policy.maxBytes) {
                response.destroy(new Error('公开网页响应超过大小限制'))
                return
              }
              controller.enqueue(new Uint8Array(chunk))
            })
            response.on('end', () => controller.close())
            response.on('error', (error) => controller.error(error))
          },
          cancel() {
            response.destroy()
          },
        })
        resolve(new Response(body, { status: response.statusCode || 500, headers }))
      },
    )
    request.on('error', reject)
    request.setTimeout(120_000, () => request.destroy(new Error('模型连接超时')))
    if (init.body) request.write(init.body)
    request.end()
  })
}

// Obsidian's host transport uses the app's trusted network stack. Fall back only
// on certificate-chain failures; never disable TLS verification during the fallback.
export async function serviceFetch(
  input: string,
  init: Omit<RequestInit, 'body'> & { body?: string } = {},
  policy?: RequestPolicy,
): Promise<Response> {
  try {
    return await nodeFetch(input, init, policy)
  } catch (error) {
    if (policy) throw error
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? (error as { code?: unknown }).code
        : undefined
    if (
      typeof code !== 'string' ||
      ![
        'SELF_SIGNED_CERT_IN_CHAIN',
        'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      ].includes(code)
    )
      throw error
    init.signal?.throwIfAborted()
    // Electron net uses macOS trust and preserves SSE; no TLS override or fabricated streaming.
    for (const load of [() => import('electron'), () => import('@electron/remote')]) {
      let host: unknown
      try {
        host = await load()
      } catch {
        continue
      }
      if (!host || typeof host !== 'object') continue
      const module = host as { net?: unknown; default?: { net?: unknown } }
      const candidate = module.net ?? module.default?.net
      if (
        candidate &&
        typeof candidate === 'object' &&
        'fetch' in candidate &&
        typeof candidate.fetch === 'function'
      ) {
        const net = candidate as { fetch: typeof fetch }
        return net.fetch(input, { ...init, redirect: 'error' })
      }
    }
    // requestUrl buffers the response, so ask the same provider for a JSON reply.
    const payload: unknown = init.body ? JSON.parse(init.body) : undefined
    const body = payload
      ? JSON.stringify(
          typeof payload === 'object' && 'model' in payload
            ? { ...payload, stream: false }
            : payload,
        )
      : undefined
    const pending = requestUrl({
      url: input,
      method: init.method || 'GET',
      headers: Object.fromEntries(new Headers(init.headers)),
      body,
      throw: false,
    })
    let abort: (() => void) | undefined
    let timer: number | undefined
    try {
      const result = await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          abort = () => reject(new DOMException('Aborted', 'AbortError'))
          init.signal?.addEventListener('abort', abort, { once: true })
          timer = window.setTimeout(() => reject(new Error('模型连接超时')), 120000)
        }),
      ])
      init.signal?.throwIfAborted()
      return new Response(result.arrayBuffer, { status: result.status, headers: result.headers })
    } finally {
      if (abort) init.signal?.removeEventListener('abort', abort)
      if (timer) window.clearTimeout(timer)
    }
  }
}
