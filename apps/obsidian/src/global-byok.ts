/**
 * [WHO]: Provides ByokProfile, GlobalByokStore, mergeByokProfiles
 * [FROM]: Depends on node:fs/promises, node:path, ../../../packages/agent-core/src/types
 * [TO]: Consumed by apps/obsidian/src/main.tsx
 * [HERE]: apps/obsidian/src/global-byok.ts - encrypted, machine-local BYOK model storage shared by Obsidian vaults
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ModelConfig } from '../../../packages/agent-core/src/types'

interface Cipher {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
  getSelectedStorageBackend?(): string
}
export interface ByokProfile {
  models: ModelConfig[]
  deletedIds: string[]
}

export function mergeByokProfiles(
  shared: ByokProfile | null,
  localModels: ModelConfig[],
): ByokProfile {
  const localById = new Map(localModels.map((model) => [model.id, model]))
  const models = (shared?.models || []).map((model) =>
    !model.apiKey && localById.get(model.id)?.apiKey
      ? { ...model, apiKey: localById.get(model.id)!.apiKey }
      : model,
  )
  const deletedIds = shared?.deletedIds || []
  const existing = new Set(models.map((model) => model.id))
  const deleted = new Set(deletedIds)
  return {
    models: [
      ...models,
      ...localModels.filter((model) => !existing.has(model.id) && !deleted.has(model.id)),
    ],
    deletedIds,
  }
}

export class GlobalByokStore {
  private path: string
  private cipher: Cipher
  private revision: string | null = null
  constructor(path: string, cipher: Cipher) {
    this.path = path
    this.cipher = cipher
  }

  static open(): GlobalByokStore | null {
    try {
      // Optional host bridge: avoid failing plugin load if Electron remote is unavailable.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron remote is optional at runtime.
      const remote = require('@electron/remote') as {
        app: { getPath(name: string): string }
        require(name: string): { safeStorage?: Cipher }
      }
      const cipher = remote.require('electron').safeStorage
      if (!cipher?.isEncryptionAvailable() || cipher.getSelectedStorageBackend?.() === 'basic_text')
        return null
      return new GlobalByokStore(join(remote.app.getPath('userData'), 'catea', 'byok.enc'), cipher)
    } catch {
      return null
    }
  }

  async load(): Promise<ByokProfile | null> {
    let raw: string
    try {
      raw = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.revision = null
        return null
      }
      throw error
    }
    const envelope = JSON.parse(raw) as { version?: number; ciphertext?: string }
    if (envelope.version !== 1 || typeof envelope.ciphertext !== 'string')
      throw new Error('Unsupported global BYOK data')
    const profile = JSON.parse(
      this.cipher.decryptString(Buffer.from(envelope.ciphertext, 'base64')),
    ) as ByokProfile
    if (!Array.isArray(profile.models) || !Array.isArray(profile.deletedIds))
      throw new Error('Invalid global BYOK data')
    this.revision = raw
    return profile
  }

  async save(profile: ByokProfile): Promise<void> {
    const encrypted = Buffer.from(this.cipher.encryptString(JSON.stringify(profile)))
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    let current: string | null
    try {
      current = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      current = null
    }
    if (current !== this.revision)
      throw new Error('另一知识库更新了本机 BYOK，请重新打开当前知识库后重试')
    const temp = `${this.path}.${crypto.randomUUID()}.tmp`
    const next = JSON.stringify({ version: 1, ciphertext: encrypted.toString('base64') })
    await writeFile(temp, next, { mode: 0o600 })
    await rename(temp, this.path)
    this.revision = next
  }
}
