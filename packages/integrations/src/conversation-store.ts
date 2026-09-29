/**
 * [WHO]: Provides VaultConversationStore
 * [FROM]: Depends on ../../agent-core/src/contracts, ./storage, node:fs/promises
 * [TO]: Consumed by apps/obsidian/src/composition.ts
 * [HERE]: packages/integrations/src/conversation-store.ts - vault-backed session persistence with serialized writes, bounded retention and index rollback
 */
import { readdir, unlink } from 'node:fs/promises'
import type { ConversationStore, Session, SessionSummary } from '../../agent-core/src/contracts'
import { Serial, errnoCode, readJson, writeJson, within } from './storage'

export class VaultConversationStore implements ConversationStore {
  private writes = new Serial()
  constructor(private vault: string) {}
  private id(value: string) {
    if (!/^[\w-]+$/.test(value) || value === 'index') throw new Error('无效会话')
    return value
  }
  private sessionPath(id: string) {
    return within(this.vault, `.catea/sessions/${this.id(id)}.json`)
  }
  private indexPath() {
    return within(this.vault, '.catea/sessions/index.json')
  }
  async list(): Promise<SessionSummary[]> {
    return readJson(await this.indexPath(), [])
  }
  async load(id: string): Promise<Session | null> {
    return readJson(await this.sessionPath(id), null)
  }
  async save(session: Readonly<Session>): Promise<void> {
    const snapshot = structuredClone(session)
    await this.writes.run(async () => {
      await writeJson(await this.sessionPath(snapshot.id), snapshot)
      const path = await this.indexPath(),
        index = await readJson<SessionSummary[]>(path, [])
      const retained = [
        { id: snapshot.id, title: snapshot.title },
        ...index.filter((row) => row.id !== snapshot.id),
      ].slice(0, 500)
      await writeJson(path, retained)
      const retainedIds = new Set(retained.map((row) => row.id))
      const directory = await within(this.vault, '.catea/sessions')
      for (const name of await readdir(directory)) {
        if (name === 'index.json' || !/^[\w-]+\.json$/.test(name)) continue
        const id = name.slice(0, -5)
        if (retainedIds.has(id)) continue
        try {
          await unlink(await this.sessionPath(id))
        } catch (error: unknown) {
          if (errnoCode(error) !== 'ENOENT') throw error
        }
      }
    })
  }
  async delete(id: string): Promise<void> {
    const safeId = this.id(id)
    await this.writes.run(async () => {
      const path = await this.indexPath(),
        index = await readJson<SessionSummary[]>(path, [])
      if (!index.some((row) => row.id === safeId)) return
      const file = await this.sessionPath(safeId)
      await writeJson(
        path,
        index.filter((row) => row.id !== safeId),
      )
      try {
        await unlink(file)
      } catch (error: unknown) {
        if (errnoCode(error) !== 'ENOENT') {
          await writeJson(path, index)
          throw error
        }
      }
    })
  }
}
