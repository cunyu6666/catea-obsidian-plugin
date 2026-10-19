import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, readdir, utimes, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fork } from 'node:child_process'
import { on, once } from 'node:events'
import { GlobalByokStore } from '../apps/obsidian/src/global-byok.ts'

const cipher = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(value).reverse(),
  decryptString: (value) => Buffer.from(value).reverse().toString(),
}
const profile = (id) => ({
  models: [{ id, apiKey: `fixture-key-${id}` }],
  deletedIds: ['fixture-deleted'],
})

test('bundled BYOK locking licenses survive three-asset plugin installation', async () => {
  const notice = await readFile(new URL('../BYOK-LOCK-LICENSE.txt', import.meta.url), 'utf8')
  const bundle = await readFile(new URL('../dist/catea-paper/main.js', import.meta.url), 'utf8')
  const copied = await readFile(
    new URL('../dist/catea-paper/BYOK-LOCK-LICENSE.txt', import.meta.url),
    'utf8',
  )
  assert.ok(bundle.includes(notice.trim()))
  assert.equal(copied, notice)
})

function startWriter(path, id, pause) {
  const child = fork(new URL('./fixtures/byok-writer.mjs', import.meta.url), [path, id, pause], {
    silent: true,
  })
  const messages = on(child, 'message', { signal: AbortSignal.timeout(15000) })
  const exit = once(child, 'exit')
  let diagnostics = ''
  child.stderr.on('data', (chunk) => {
    diagnostics += chunk
  })
  return {
    child,
    async next(types) {
      while (true) {
        const { value, done } = await messages.next()
        if (done) throw new Error(`Worker exited before ${types.join('/')}: ${diagnostics}`)
        if (types.includes(value[0].type)) return value[0]
      }
    },
    async stop() {
      await messages.return()
      child.kill('SIGKILL')
      await exit
    },
  }
}

test('two processes cannot both commit from one revision, even when the first write is paused', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catea-byok-process-'))
  const path = join(dir, 'byok.enc')
  const initial = new GlobalByokStore(path, cipher)
  await initial.save({ models: [], deletedIds: [] })
  const first = startWriter(path, 'first', 'pause'),
    second = startWriter(path, 'second', 'continue')
  try {
    await Promise.all([first.next(['ready']), second.next(['ready'])])
    first.child.send({ type: 'save' })
    await first.next(['before-write'])
    second.child.send({ type: 'save' })
    await second.next(['lock-attempt', 'read'])
    first.child.send({ type: 'resume' })
    const results = await Promise.all([first.next(['result']), second.next(['result'])])
    assert.equal(results.filter((result) => result.saved).length, 1)
    assert.match(results.find((result) => !result.saved).message, /另一知识库/)
    assert.deepEqual(
      (await initial.load())?.models.map((value) => value.id),
      ['first'],
    )
    assert.deepEqual((await initial.load())?.deletedIds, ['fixture-deleted'])
    assert.equal((await readFile(path, 'utf8')).includes('fixture-key'), false)
  } finally {
    await Promise.all([first.stop(), second.stop()])
    await rm(dir, { recursive: true, force: true })
  }
})

test('same-instance saves capture their original revision and first-create instances conflict', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catea-byok-instance-'))
  try {
    for (const mode of ['shared', 'separate']) {
      const path = join(dir, mode, 'byok.enc')
      const first = new GlobalByokStore(path, cipher)
      const second = mode === 'shared' ? first : new GlobalByokStore(path, cipher)
      const results = await Promise.allSettled([
        first.save(profile('first')),
        second.save(profile('second')),
      ])
      assert.equal(results.filter((value) => value.status === 'fulfilled').length, 1)
      const loser = results.find((value) => value.status === 'rejected')
      assert.match(loser.reason.message, /另一知识库/)
      assert.deepEqual(await readdir(join(dir, mode)), ['byok.enc'])
      if (process.platform !== 'win32') {
        assert.equal((await stat(path)).mode & 0o777, 0o600)
        assert.equal((await stat(join(dir, mode))).mode & 0o777, 0o700)
      }
      await first.load()
      await first.save(profile('after-reload'))
      assert.deepEqual(
        (await first.load()).models.map((value) => value.id),
        ['after-reload'],
      )
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('a killed writer leaves a bounded busy failure and its stale lock can be recovered', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'catea-byok-crash-'))
  const path = join(dir, 'byok.enc')
  const store = new GlobalByokStore(path, cipher)
  await store.save(profile('original'))
  const before = await readFile(path, 'utf8')
  const writer = startWriter(path, 'crashed', 'pause')
  try {
    await writer.next(['ready'])
    writer.child.send({ type: 'save' })
    await writer.next(['before-write'])
    await writer.stop()
    const start = Date.now()
    await assert.rejects(store.save(profile('contender')), /其他知识库更新/)
    assert.ok(Date.now() - start < 5000, 'Busy lock must not wait indefinitely')
    assert.equal(await readFile(path, 'utf8'), before)
    const stale = new Date(Date.now() - 61_000)
    await utimes(`${path}.lock`, stale, stale)
    await store.save(profile('recovered'))
    assert.deepEqual(
      (await store.load()).models.map((value) => value.id),
      ['recovered'],
    )
    assert.deepEqual(await readdir(dir), ['byok.enc'])
  } finally {
    await writer.stop()
    await rm(dir, { recursive: true, force: true })
  }
})
