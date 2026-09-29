import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { contractTest } from '../../../../tests/dip-contract.ts'
import { GlobalByokStore, mergeByokProfiles } from '../global-byok.ts'
import type { ModelConfig } from '../../../../packages/agent-core/src/types.ts'

contractTest('apps/obsidian/src/global-byok.ts')

const model = (id: string): ModelConfig => ({
  id,
  name: id,
  protocol: 'openai',
  baseUrl: 'https://example.com/v1',
  apiKey: `key-${id}`,
  model: 'example',
})
const cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value).reverse(),
  decryptString: (value: Buffer) => Buffer.from(value).reverse().toString(),
}

test('global BYOK file stores ciphertext and round-trips models', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catea-byok-'))
  try {
    const path = join(dir, 'shared', 'byok.enc'),
      store = new GlobalByokStore(path, cipher)
    const profile = { models: [model('one')], deletedIds: ['removed'] }
    assert.equal(await store.load(), null)
    await store.save(profile)
    assert.deepEqual(await store.load(), profile)
    assert.equal((await readFile(path, 'utf8')).includes('key-one'), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('migration keeps shared model and does not revive removed IDs', () => {
  const merged = mergeByokProfiles({ models: [model('shared')], deletedIds: ['removed'] }, [
    model('shared'),
    model('new'),
    model('removed'),
  ])
  assert.deepEqual(
    merged.models.map((item) => item.id),
    ['shared', 'new'],
  )
})

test('migration can restore a missing shared key from a vault secret', () => {
  const missing = { ...model('same'), apiKey: '' }
  const merged = mergeByokProfiles({ models: [missing], deletedIds: [] }, [model('same')])
  assert.equal(merged.models[0].apiKey, 'key-same')
})

test('damaged global BYOK data is rejected instead of overwritten on load', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catea-byok-'))
  try {
    const path = join(dir, 'shared', 'byok.enc')
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '{"version":1,"ciphertext":"bad"}')
    await assert.rejects(() => new GlobalByokStore(path, cipher).load())
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('stale vault cannot overwrite a newer shared profile', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catea-byok-'))
  try {
    const path = join(dir, 'shared', 'byok.enc')
    const first = new GlobalByokStore(path, cipher),
      second = new GlobalByokStore(path, cipher)
    await first.load()
    await second.load()
    await first.save({ models: [model('first')], deletedIds: [] })
    await assert.rejects(() => second.save({ models: [model('second')], deletedIds: [] }))
    assert.deepEqual(
      (await first.load())?.models.map((item) => item.id),
      ['first'],
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
