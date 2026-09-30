/**
 * [WHO]: ImageGenerationConfig, imageGenerationTool, generateImage, imageGenerationReady
 * [FROM]: node:fs/promises, ./storage, ../../agent-core/src/transport, ../../agent-core/src/providers
 * [TO]: packages/agent-core/src/index.ts
 * [HERE]: packages/integrations/src/image-generation.ts - bounded OpenAI-compatible image generation and vault-local output
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { within } from './storage'
import { serviceFetch } from '../../agent-core/src/transport'
import type { ToolDefinition } from '../../agent-core/src/providers'

export interface ImageGenerationConfig {
  protocol?: 'openai' | 'dashscope'
  enabled: boolean
  baseUrl: string
  model: string
  apiKey: string
}

export function imageGenerationReady(config?: ImageGenerationConfig): boolean {
  return !!(config?.enabled && config.baseUrl.trim() && config.model.trim() && config.apiKey.trim())
}

export const imageGenerationTool: ToolDefinition = {
  name: 'generate_image',
  description:
    'Generate one image from a text prompt with the separately configured image model. Saves a new image in the vault and displays it in chat. Use only when the user requests image creation. Return the saved Markdown link; never invent an image URL. This tool does not edit existing images.',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Describe the requested image, composition and style.',
      },
      size: {
        type: 'string',
        description: 'Optional provider-supported size, e.g. 1024x1024. Omit for provider default.',
      },
    },
    required: ['prompt'],
  },
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
async function boundedBody(response: Response, limit: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel()
    throw new Error('Image response exceeds the size limit')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty image response')
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) throw new Error('Image response exceeds the size limit')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function endpoint(base: string, protocol: ImageGenerationConfig['protocol']): string {
  const url = new URL(base.trim())
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw new Error('Use an HTTPS image API URL (HTTP is allowed only on localhost)')
  url.pathname = url.pathname.replace(/\/$/, '')
  if (protocol === 'dashscope') {
    const suffix = '/api/v1/services/aigc/multimodal-generation/generation'
    if (!url.pathname.endsWith(suffix)) url.pathname = suffix
  } else if (!url.pathname.endsWith('/images/generations')) url.pathname += '/images/generations'
  return url.toString()
}

function imageExtension(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes.slice(0, 12)).toString('hex')
  if (hex.startsWith('89504e470d0a1a0a')) return 'png'
  if (hex.startsWith('ffd8ff')) return 'jpg'
  if (hex.startsWith('52494646') && hex.slice(16) === '57454250') return 'webp'
  throw new Error('Image API returned an unsupported image (expected PNG, JPEG or WebP)')
}

export async function generateImage(
  vault: string,
  config: ImageGenerationConfig,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ path: string; markdown: string }> {
  if (!imageGenerationReady(config))
    throw new Error('Configure and enable image generation in Catea settings first')
  if (typeof args.prompt !== 'string' || !args.prompt.trim() || args.prompt.length > 16000)
    throw new Error('Image prompt must contain 1–16000 characters')
  if (
    args.size !== undefined &&
    (typeof args.size !== 'string' || !/^(auto|\d{3,4}x\d{3,4})$/.test(args.size))
  )
    throw new Error('Invalid image size; use widthxheight or auto')
  const url = endpoint(config.baseUrl, config.protocol)
  signal = AbortSignal.any([signal, AbortSignal.timeout(180000)])
  signal.throwIfAborted()
  const directory = 'Attachments/Catea'
  await within(vault, directory)
  // Never return provider error bodies or signed download URLs to the model/logs.
  let response: Response
  try {
    response = await serviceFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(
        config.protocol === 'dashscope'
          ? {
              model: config.model.trim(),
              input: { messages: [{ role: 'user', content: [{ text: args.prompt.trim() }] }] },
              parameters: {
                n: 1,
                ...(args.size && args.size !== 'auto'
                  ? { size: String(args.size).replace('x', '*') }
                  : {}),
              },
            }
          : {
              model: config.model.trim(),
              prompt: args.prompt.trim(),
              n: 1,
              ...(args.size ? { size: args.size } : {}),
            },
      ),
      signal,
    })
  } catch {
    signal.throwIfAborted()
    throw new Error('Image API connection failed; check the API URL and network')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(
      `Image API request failed (HTTP ${response.status}); check credentials, model and quota`,
    )
  }
  let payload: {
    data?: Array<{ b64_json?: string; url?: string }>
    output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> }
  }
  try {
    payload = JSON.parse(
      new TextDecoder().decode(await boundedBody(response, MAX_IMAGE_BYTES * 1.5)),
    ) as typeof payload
  } catch {
    signal.throwIfAborted()
    throw new Error('Invalid or oversized image API response')
  }
  const item =
    config.protocol === 'dashscope'
      ? {
          url: payload?.output?.choices
            ?.flatMap((choice) => choice.message?.content || [])
            .find((part) => typeof part.image === 'string')?.image,
          b64_json: undefined,
        }
      : payload?.data?.[0]
  let bytes: Uint8Array
  if (typeof item?.b64_json === 'string') {
    bytes = Buffer.from(item.b64_json, 'base64')
  } else if (typeof item?.url === 'string') {
    let download: Response
    try {
      const imageUrl = new URL(item.url)
      if (imageUrl.protocol !== 'https:' || imageUrl.username || imageUrl.password)
        throw new Error('Invalid image URL')
      // Downloads never carry the API key, including when hosted on the API origin.
      download = await serviceFetch(imageUrl.toString(), { signal })
    } catch {
      signal.throwIfAborted()
      throw new Error('Could not download the generated image')
    }
    if (!download.ok) {
      await download.body?.cancel()
      throw new Error(`Image download failed (HTTP ${download.status})`)
    }
    bytes = await boundedBody(download, MAX_IMAGE_BYTES)
  } else {
    throw new Error('Image API returned no image')
  }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new Error('Image size must be between 1 byte and 20 MB')
  const extension = imageExtension(bytes)
  signal.throwIfAborted()
  await mkdir(await within(vault, directory), { recursive: true })
  const path = `${directory}/${Date.now()}-${crypto.randomUUID()}.${extension}`
  await writeFile(await within(vault, path), bytes, { flag: 'wx' })
  return { path, markdown: `[Generated image](${path})` }
}
