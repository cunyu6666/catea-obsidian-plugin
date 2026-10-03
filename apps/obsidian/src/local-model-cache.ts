/**
 * [WHO]: Provides LOCAL_MODEL_ASSET, LocalModelCache
 * [FROM]: Depends on node:fs, node:fs/promises, node:crypto, ../../../packages/integrations/src/storage
 * [TO]: Consumed by apps/obsidian/src/local-model.ts
 * [HERE]: apps/obsidian/src/local-model-cache.ts - fixed-version model downloads with streamed writes, SHA-256 verification and atomic publication in machine-local storage
 */
import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { errnoCode, within } from '../../../packages/integrations/src/storage'

export const LOCAL_MODEL_ASSET = {
  name: 'Catea Lite',
  file: 'catea-0.6b-q4-v1.gguf',
  bytes: 484220320,
  sha256: '9acfc1e001311f34b4252001b626f2e466d592a42065f66571bff3790d4e1b14',
  url: 'https://huggingface.co/bartowski/Qwen_Qwen3-0.6B-GGUF/resolve/60b85c0e3d8fe0f6474f406922a26d12aca4550d/Qwen_Qwen3-0.6B-Q4_K_M.gguf',
} as const

export class LocalModelCache {
  constructor(
    private directory: string,
    private asset: { file: string; bytes: number; sha256: string; url: string } = LOCAL_MODEL_ASSET,
    // Electron's trusted network stack streams public weights and honors OS proxy settings.
    // requestUrl would buffer the entire 462 MB response before writing anything to disk.
    private fetcher: typeof fetch = async (input, init) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Optional desktop host bridge.
      const remote = require('@electron/remote') as {
        require(name: string): { net?: { fetch: typeof fetch } }
        getGlobal(name: string): typeof AbortController
      }
      const net = remote.require('electron').net
      if (!net?.fetch) throw new Error('Local model download transport unavailable')
      // A renderer AbortSignal cannot cross the remote bridge as a native instance.
      const MainAbort = remote.getGlobal('AbortController')
      const mainAbort = new MainAbort()
      const signal = AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(30 * 60 * 1000),
      ])
      signal.throwIfAborted()
      const abort = () => mainAbort.abort()
      signal.addEventListener('abort', abort, { once: true })
      const cleanup = () => signal.removeEventListener('abort', abort)
      try {
        const response = await net.fetch(input, { ...init, signal: mainAbort.signal })
        const headers = new Headers()
        for (const key of ['content-length', 'content-type']) {
          const value = response.headers.get(key)
          if (value) headers.set(key, value)
        }
        const reader = response.body?.getReader()
        if (!reader) {
          cleanup()
          return new Response(null, { status: response.status, headers })
        }
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const { done, value } = await reader.read()
              if (done) {
                cleanup()
                reader.releaseLock()
                controller.close()
              } else controller.enqueue(new Uint8Array(value))
            } catch {
              cleanup()
              controller.error(new Error('Local model download interrupted'))
            }
          },
          async cancel() {
            cleanup()
            mainAbort.abort()
            await reader.cancel().catch(() => {})
            reader.releaseLock()
          },
        })
        return new Response(body, { status: response.status, headers })
      } catch {
        cleanup()
        signal.throwIfAborted()
        throw new Error('Local model download failed')
      }
    },
  ) {}
  private async path(file = this.asset.file) {
    await mkdir(this.directory, { recursive: true })
    return within(this.directory, file)
  }
  async available(signal?: AbortSignal): Promise<boolean> {
    const path = await this.path()
    try {
      if ((await stat(path)).size !== this.asset.bytes) return false
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(path)) {
        signal?.throwIfAborted()
        hash.update(chunk)
      }
      signal?.throwIfAborted()
      return hash.digest('hex') === this.asset.sha256
    } catch (error) {
      if (errnoCode(error) === 'ENOENT') return false
      throw error
    }
  }
  async download(progress: (loaded: number, total: number) => void, signal: AbortSignal) {
    if (await this.available(signal)) return
    signal.throwIfAborted()
    const temp = await this.path(`${this.asset.file}.${crypto.randomUUID()}.tmp`)
    const file = await open(temp, 'wx')
    let complete = false
    try {
      const response = await this.fetcher(this.asset.url, {
        signal,
        credentials: 'omit',
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
      })
      if (!response.ok || !response.body) {
        await response.body?.cancel().catch(() => {})
        throw new Error('Local model download failed')
      }
      const size = response.headers.get('content-length')
      if (size && Number(size) !== this.asset.bytes) {
        await response.body.cancel().catch(() => {})
        throw new Error('Invalid model size')
      }
      const reader = response.body.getReader()
      const hash = createHash('sha256')
      let loaded = 0
      try {
        while (true) {
          signal.throwIfAborted()
          const { done, value } = await reader.read()
          if (done) break
          loaded += value.byteLength
          if (loaded > this.asset.bytes) throw new Error('Invalid model size')
          hash.update(value)
          await file.writeFile(value)
          progress(loaded, this.asset.bytes)
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
      signal.throwIfAborted()
      if (loaded !== this.asset.bytes || hash.digest('hex') !== this.asset.sha256)
        throw new Error('Invalid model checksum')
      await file.close()
      signal.throwIfAborted()
      await rename(temp, await this.path())
      complete = true
    } finally {
      await file.close().catch(() => {})
      if (!complete) await rm(temp, { force: true })
    }
  }
  async blob(): Promise<Blob> {
    const data = await readFile(await this.path())
    if (!(data.buffer instanceof ArrayBuffer)) throw new Error('Invalid model buffer')
    return new Blob([new Uint8Array(data.buffer, data.byteOffset, data.byteLength)])
  }
  async remove() {
    await rm(await this.path(), { force: true })
  }
}
