import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { REPO_ROOT } from './dip-contract.ts'
import type { Session } from '../packages/agent-core/src/contracts.ts'

async function storeClass() {
  const bundle = await build({
    entryPoints: [resolve(REPO_ROOT, 'packages/integrations/src/conversation-store.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  })
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
  return (await import(url)) as {
    VaultConversationStore: new (vault: string) => {
      save(session: Session): Promise<void>
      load(id: string): Promise<Session | null>
      list(): Promise<Array<{ id: string }>>
      delete(id: string): Promise<void>
    }
  }
}

function session(id: string, title: string): Session {
  return { id, title, personaId: 'aria', messages: [], transcript: [], updated: Date.now() }
}

test('conversation storage owns session files and keeps its index consistent', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'catea-conversations-'))
  try {
    const { VaultConversationStore } = await storeClass()
    const store = new VaultConversationStore(vault)
    await Promise.all([
      store.save(session('first', 'First')),
      store.save(session('second', 'Second')),
    ])
    assert.deepEqual(
      (await store.list()).map((row) => row.id),
      ['second', 'first'],
    )
    assert.equal((await store.load('first'))?.title, 'First')
    await store.delete('first')
    assert.equal(await store.load('first'), null)
    assert.deepEqual(
      (await store.list()).map((row) => row.id),
      ['second'],
    )
    await assert.rejects(store.load('../outside'), /无效会话/)
  } finally {
    await rm(vault, { recursive: true, force: true })
  }
})

test('conversation retention removes session files evicted from the 500-row index', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'catea-conversation-retention-'))
  try {
    const { VaultConversationStore } = await storeClass()
    const store = new VaultConversationStore(vault)
    await mkdir(join(vault, '.catea', 'sessions'), { recursive: true })
    await writeFile(join(vault, '.catea', 'sessions', 'manual.backup.json'), '{}')
    for (let index = 0; index < 501; index++)
      await store.save(session(`session-${index}`, `Session ${index}`))
    const rows = await store.list()
    assert.equal(rows.length, 500)
    assert.equal(rows[0].id, 'session-500')
    assert.equal(rows.at(-1)?.id, 'session-1')
    assert.equal(await store.load('session-0'), null)
    const names = await readdir(join(vault, '.catea', 'sessions'))
    assert.equal(names.includes('manual.backup.json'), true)
    const files = names.filter((name) => /^session-\d+\.json$/.test(name))
    assert.equal(files.length, 500)
  } finally {
    await rm(vault, { recursive: true, force: true })
  }
})
