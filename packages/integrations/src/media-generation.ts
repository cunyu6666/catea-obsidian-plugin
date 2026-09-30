/**
 * [WHO]: MediaGenerationConfig, mediaGenerationReady, videoGenerationTool, audioGenerationTool, generateVideo, generateAudio
 * [FROM]: node:fs/promises, ./storage, ../../agent-core/src/transport, ../../agent-core/src/providers
 * [TO]: packages/agent-core/src/index.ts
 * [HERE]: packages/integrations/src/media-generation.ts - DashScope video task polling and speech synthesis with bounded vault-local media
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { within } from './storage'
import { serviceFetch } from '../../agent-core/src/transport'
import type { ToolDefinition } from '../../agent-core/src/providers'

export interface MediaGenerationConfig {
  enabled: boolean
  baseUrl: string
  model: string
  apiKey: string
  voice?: string
}

export function mediaGenerationReady(config?: MediaGenerationConfig): boolean {
  return !!(config?.enabled && config.baseUrl.trim() && config.model.trim() && config.apiKey.trim())
}

export const videoGenerationTool: ToolDefinition = {
  name: 'generate_video',
  description:
    'Create one short video when the user requests it. Uses the separately configured DashScope video model, polls the task and saves an MP4 in the vault. To resume a previously submitted task after interruption, pass its task_id and do not submit a new prompt. Stopping local polling does not cancel the remote job. Return the saved Markdown link.',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'Required for a new video: describe the scene, motion and style.',
      },
      task_id: {
        type: 'string',
        description: 'Existing task ID to resume without paying for a second generation.',
      },
      duration: {
        type: 'integer',
        minimum: 1,
        maximum: 15,
        description: 'Seconds; default 5. Must be supported by the configured model.',
      },
      resolution: {
        type: 'string',
        enum: ['480P', '720P', '1080P'],
        description: 'Default 720P; must be supported by the configured model.',
      },
      ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'], description: 'Default 16:9.' },
    },
    required: [],
  },
}

export const audioGenerationTool: ToolDefinition = {
  name: 'generate_audio',
  description:
    'Synthesize speech from text when the user requests an audio reading or voiceover. Uses the separately configured DashScope speech model and voice, saves an MP3 in the vault and displays an audio player. Does not generate music or clone voices. Return the saved Markdown link.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The exact text to speak, up to 6000 characters.' },
    },
    required: ['text'],
  },
}

const VIDEO_ROUTE = '/api/v1/services/aigc/video-generation/video-synthesis'
const AUDIO_ROUTE = '/api/v1/services/audio/tts/SpeechSynthesizer'
function endpoint(base: string, route: string): string {
  const url = new URL(base.trim())
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw new Error('Use an HTTPS media API URL (HTTP is allowed only on localhost)')
  url.pathname = route
  return url.toString()
}

async function request(
  url: string,
  signal: AbortSignal,
  config?: MediaGenerationConfig,
  body?: unknown,
  asyncTask = false,
): Promise<Response> {
  signal.throwIfAborted()
  let response: Response
  try {
    response = await serviceFetch(url, {
      signal,
      method: body === undefined ? 'GET' : 'POST',
      headers: config
        ? {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            ...(asyncTask ? { 'X-DashScope-Async': 'enable' } : {}),
          }
        : undefined,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    signal.throwIfAborted()
    throw new Error('Media API connection failed; check the API URL and network')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(
      `Media API request failed (HTTP ${response.status}); check credentials, model and quota`,
    )
  }
  return response
}

async function bytes(response: Response, limit: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel()
    throw new Error('Media response exceeds the size limit')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty media response')
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new Error('Media response exceeds the size limit')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

interface VideoTask {
  output?: { task_id?: string; task_status?: string; video_url?: string }
}
async function task(response: Response): Promise<VideoTask> {
  try {
    return JSON.parse(new TextDecoder().decode(await bytes(response, 1024 * 1024))) as VideoTask
  } catch {
    throw new Error('Invalid or oversized video task response')
  }
}

function delay(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 10000)
    signal.addEventListener('abort', abort, { once: true })
  })
}

function downloadUrl(value: string): string {
  const url = new URL(value)
  // DashScope may return signed OSS links using HTTP; OSS also serves them over TLS.
  if (url.protocol === 'http:' && url.hostname.endsWith('.aliyuncs.com')) url.protocol = 'https:'
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new Error('Invalid media download URL')
  return url.toString()
}

async function save(
  vault: string,
  data: Uint8Array,
  kind: 'video' | 'audio',
  signal: AbortSignal,
): Promise<{ path: string; markdown: string }> {
  const isMp4 = data.length >= 12 && Buffer.from(data.slice(4, 8)).toString('utf8') === 'ftyp'
  const isMp3 =
    data.length >= 4 &&
    (Buffer.from(data.slice(0, 3)).toString('utf8') === 'ID3' ||
      (data[0] === 255 && (data[1] & 0xe0) === 0xe0))
  if (kind === 'video' ? !isMp4 : !isMp3)
    throw new Error(`Media API did not return a valid ${kind === 'video' ? 'MP4' : 'MP3'} file`)
  signal.throwIfAborted()
  const directory = 'Attachments/Catea'
  await mkdir(await within(vault, directory), { recursive: true })
  const path = `${directory}/${Date.now()}-${crypto.randomUUID()}.${kind === 'video' ? 'mp4' : 'mp3'}`
  await writeFile(await within(vault, path), data, { flag: 'wx' })
  return { path, markdown: `[Generated ${kind}](${path})` }
}

export async function generateVideo(
  vault: string,
  config: MediaGenerationConfig,
  args: Record<string, unknown>,
  signal: AbortSignal,
  progress: (taskId: string, status: string) => Promise<void> = async () => {},
): Promise<{ path: string; markdown: string; task_id: string }> {
  if (!mediaGenerationReady(config)) throw new Error('Configure and enable video generation first')
  const existing = args.task_id
  if (
    existing !== undefined &&
    (typeof existing !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(existing))
  )
    throw new Error('Invalid video task ID')
  if (
    !existing &&
    (typeof args.prompt !== 'string' || !args.prompt.trim() || args.prompt.length > 16000)
  )
    throw new Error('Video prompt must contain 1–16000 characters')
  const duration = args.duration ?? 5,
    resolution = args.resolution ?? '720P',
    ratio = args.ratio ?? '16:9'
  if (
    !Number.isInteger(duration) ||
    Number(duration) < 1 ||
    Number(duration) > 15 ||
    typeof resolution !== 'string' ||
    !['480P', '720P', '1080P'].includes(resolution) ||
    typeof ratio !== 'string' ||
    !['16:9', '9:16', '1:1'].includes(ratio)
  )
    throw new Error('Invalid video duration, resolution or ratio')
  signal = AbortSignal.any([signal, AbortSignal.timeout(15 * 60 * 1000)])
  signal.throwIfAborted()
  await within(vault, 'Attachments/Catea')
  let taskId = typeof existing === 'string' ? existing : ''
  if (!taskId) {
    const submitted = await task(
      await request(
        endpoint(config.baseUrl, VIDEO_ROUTE),
        signal,
        config,
        {
          model: config.model.trim(),
          input: { prompt: args.prompt },
          parameters: { duration, resolution, ratio },
        },
        true,
      ),
    )
    taskId = submitted?.output?.task_id || ''
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(taskId))
      throw new Error('Video API returned no valid task ID')
  }
  // Persist the ID before waiting so an interrupted task can be resumed without resubmission.
  try {
    await progress(taskId, 'SUBMITTED')
    let previous = ''
    for (;;) {
      signal.throwIfAborted()
      const result = await task(
        await request(endpoint(config.baseUrl, `/api/v1/tasks/${taskId}`), signal, config),
      )
      const status = result?.output?.task_status
      if (
        !status ||
        !['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN'].includes(status)
      )
        throw new Error(`Invalid video task status; resume with task_id ${taskId}`)
      if (status !== previous) {
        await progress(taskId, status)
        previous = status
      }
      if (status === 'SUCCEEDED') {
        let url: string
        try {
          url = downloadUrl(result.output?.video_url || '')
        } catch {
          throw new Error('Video task returned no valid download URL')
        }
        const data = await bytes(await request(url, signal), 100 * 1024 * 1024)
        return { ...(await save(vault, data, 'video', signal)), task_id: taskId }
      }
      if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN')
        throw new Error(`Video task ${status}; task_id ${taskId}`)
      await delay(signal)
    }
  } catch (error) {
    if (signal.aborted)
      throw new DOMException(`Video polling aborted; resume with task_id ${taskId}`, 'AbortError')
    throw error
  }
}

export async function generateAudio(
  vault: string,
  config: MediaGenerationConfig,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<{ path: string; markdown: string }> {
  if (!mediaGenerationReady(config) || !config.voice?.trim())
    throw new Error('Configure and enable speech generation, including a voice, first')
  if (typeof args.text !== 'string' || !args.text.trim() || args.text.length > 6000)
    throw new Error('Speech text must contain 1–6000 characters')
  signal = AbortSignal.any([signal, AbortSignal.timeout(180000)])
  signal.throwIfAborted()
  await within(vault, 'Attachments/Catea')
  const response = await request(endpoint(config.baseUrl, AUDIO_ROUTE), signal, config, {
    model: config.model.trim(),
    input: { text: args.text, voice: config.voice.trim(), format: 'mp3', sample_rate: 24000 },
  })
  let data = await bytes(
    response,
    response.headers.get('content-type')?.includes('json') ? 1024 * 1024 : 30 * 1024 * 1024,
  )
  if (response.headers.get('content-type')?.includes('json') || data[0] === 123) {
    let url: string
    try {
      const payload = JSON.parse(new TextDecoder().decode(data)) as {
        output?: { audio?: { url?: string } }
      }
      url = downloadUrl(payload?.output?.audio?.url || '')
    } catch {
      throw new Error('Speech API returned no valid audio URL')
    }
    data = await bytes(await request(url, signal), 30 * 1024 * 1024)
  }
  return save(vault, data, 'audio', signal)
}
