/**
 * [WHO]: Provides MemoryStore
 * [FROM]: Depends on ../../integrations/src/storage, ./model, ./migration
 * [TO]: Consumed by packages/memory/src/engine.ts, packages/memory/src/index.ts
 * [HERE]: packages/memory/src/store.ts - confined atomic single-document storage with serialized transactions and one-time import
 */
import { Serial, readJson, writeJson, within } from '../../integrations/src/storage'
import { validateMemoryDocument, type MemoryDocument } from './model'
import { migrateMemory } from './migration'

export class MemoryStore {
  private serial = new Serial()
  constructor(
    private vault: string,
    private scope: string,
  ) {
    if (!['global', 'aria', 'vex', 'pencil'].includes(scope))
      throw new Error('Unknown memory scope')
  }
  private async load(): Promise<{ path: string; data: MemoryDocument }> {
    const directory = `.catea/memory/${this.scope}`
    const path = await within(this.vault, `${directory}/memories.json`)
    const existing: unknown = await readJson(path, undefined)
    // A malformed existing canonical store must never trigger re-import of stale data.
    const data = existing === undefined ? await migrateMemory(this.vault, directory) : existing
    validateMemoryDocument(data)
    if (existing === undefined) await writeJson(path, data)
    return { path, data }
  }
  read(): Promise<MemoryDocument> {
    return this.serial.run(async () => (await this.load()).data)
  }
  transaction<T>(mutate: (data: MemoryDocument) => T, signal?: AbortSignal): Promise<T> {
    return this.serial.run(async () => {
      signal?.throwIfAborted()
      const { path, data } = await this.load()
      signal?.throwIfAborted()
      const result = mutate(data)
      validateMemoryDocument(data)
      signal?.throwIfAborted()
      await writeJson(path, data)
      return result
    })
  }
}
