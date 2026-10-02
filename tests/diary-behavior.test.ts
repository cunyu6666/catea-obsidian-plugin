import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import type { Session, ModelRequest, ModelClient } from '../packages/agent-core/src/contracts.ts'
import { REPO_ROOT } from './dip-contract.ts'

async function service(dev = false) {
  const result = await build({
    entryPoints: [resolve(REPO_ROOT, 'apps/obsidian/src/diary.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    define: dev ? { CATEA_DATA_DIR: JSON.stringify('.catea-dev') } : {},
  })
  return (await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`
  )) as typeof import('../apps/obsidian/src/diary.ts')
}
function session(id: string, personaId: string, when: Date): Session {
  return {
    id,
    title: id,
    personaId,
    transcript: [],
    updated: when.getTime(),
    messages: [
      { id: 'u', role: 'user', text: `Please help with ${id}`, status: 'complete', tools: [] },
      {
        id: 'a',
        role: 'assistant',
        text: `We worked on ${id}`,
        status: 'complete',
        startedAt: when.getTime(),
        tools: [],
        reasoning: 'PRIVATE REASONING',
      },
    ],
  }
}
async function fixture(dev = false) {
  const vault = await mkdtemp(join(tmpdir(), 'catea-diary-'))
  const { DiaryService, diaryDate } = await service(dev)
  let now = new Date(2026, 9, 1, 12)
  const sessions: Session[] = []
  const requests: ModelRequest[] = []
  let fail = false,
    idle = true,
    ready = true
  const client: ModelClient = {
    async *stream(request) {
      requests.push(request)
      if (fail) throw new Error('secret provider detail')
      yield {
        type: 'delta',
        text: JSON.stringify({
          title: 'A day together',
          body: 'I helped turn our ideas into a plan.\n\nTomorrow, we can continue.',
        }),
      }
    },
  }
  const options = {
    conversations: {
      list: async () => sessions.map((s) => ({ id: s.id, title: s.title })),
      load: async (id: string) => sessions.find((s) => s.id === id) || null,
      save: async () => {},
      delete: async () => {},
    },
    client,
    model: async () =>
      ready
        ? {
            id: 'test',
            name: 'Test',
            protocol: 'openai' as const,
            model: 'test',
            apiKey: 'test-key',
            baseUrl: 'https://example.invalid/v1',
            contextWindow: 4096,
          }
        : undefined,
    persona: (id: string) => ({ name: id, content: 'Be thoughtful.' }),
    language: () => 'en' as const,
    idle: () => idle,
    changed: () => {},
    now: () => now,
  }
  const diary = new DiaryService(vault, options)
  await diary.initialize()
  return {
    vault,
    diary,
    sessions,
    requests,
    options,
    DiaryService,
    diaryDate,
    setTime: (date: Date) => {
      now = date
    },
    fail: (value: boolean) => {
      fail = value
    },
    idle: (value: boolean) => {
      idle = value
    },
    ready: (value: boolean) => {
      ready = value
    },
    cleanup: async () => {
      diary.close()
      await rm(vault, { recursive: true, force: true })
    },
  }
}

test('diaries wait for the next local day and isolate personas and completed evidence', async () => {
  const f = await fixture()
  try {
    f.sessions.push(
      session('first', 'aria', new Date(2026, 9, 1, 23, 59)),
      session('second', 'vex', new Date(2026, 9, 1, 10)),
      session('old', 'aria', new Date(2026, 8, 30, 12)),
    )
    const failed = session('failed', 'aria', new Date(2026, 9, 1, 10))
    failed.messages[1].status = 'error'
    f.sessions.push(failed)
    await f.diary.process()
    assert.equal(f.requests.length, 0)
    f.setTime(new Date(2026, 9, 2, 0, 1))
    await Promise.all([f.diary.process(), f.diary.process()])
    const state = await f.diary.snapshot()
    assert.equal(state.entries.length, 2)
    assert.equal(state.nextDate, '2026-10-02')
    assert.equal(f.requests.length, 2)
    const prompt = JSON.stringify(f.requests[0].transcript)
    assert.match(prompt, /first/)
    assert.doesNotMatch(prompt, /second|old|failed|PRIVATE REASONING/)
    assert.match(f.requests[0].system, /first person as the companion, NOT as the user/)
    assert.equal(f.requests[0].tools.length, 0)
    assert.ok(f.requests[0].maxTokens! < 4096)
    const reopened = new f.DiaryService(f.vault, f.options)
    await reopened.process()
    assert.equal(f.requests.length, 2)
    reopened.close()
  } finally {
    await f.cleanup()
  }
})

test('unopened dates are never backfilled even with synced conversations; active dates survive restart', async () => {
  const f = await fixture()
  try {
    const legacy = session('legacy', 'aria', new Date(2026, 9, 1))
    delete legacy.messages[1].startedAt
    f.sessions.push(legacy)
    f.sessions.push(session('recent', 'aria', new Date(2026, 9, 9, 20)))
    f.setTime(new Date(2026, 9, 10, 12))
    f.diary.close()
    const reopened = new f.DiaryService(f.vault, f.options)
    await reopened.process()
    assert.equal((await reopened.snapshot()).nextDate, '2026-10-10')
    assert.equal(f.requests.length, 0)
    await reopened.process(true)
    assert.equal(f.requests.length, 0)
    f.sessions.push(session('today', 'aria', new Date(2026, 9, 10, 14)))
    f.setTime(new Date(2026, 9, 11, 12))
    await reopened.process()
    assert.deepEqual(
      (await reopened.snapshot()).entries.map((entry) => entry.date),
      ['2026-10-10'],
    )
    reopened.close()
    assert.equal(f.diaryDate(new Date(2026, 9, 1, 0, 1)), '2026-10-01')
  } finally {
    await f.cleanup()
  }
})

test('generation failures preserve the cursor and durable backoff, then recover without duplicates', async () => {
  const f = await fixture()
  try {
    f.sessions.push(session('first', 'aria', new Date(2026, 9, 1, 12)))
    f.setTime(new Date(2026, 9, 2, 12))
    f.fail(true)
    await f.diary.process()
    const state = await f.diary.snapshot()
    assert.equal(state.nextDate, '2026-10-01')
    assert.equal(state.error, 'generation')
    assert.equal(state.entries.length, 0)
    assert.doesNotMatch(JSON.stringify(state), /secret provider detail/)
    const reopened = new f.DiaryService(f.vault, f.options)
    await reopened.process()
    assert.equal(f.requests.length, 1)
    f.fail(false)
    await reopened.process(true)
    await reopened.process(true)
    assert.equal(f.requests.length, 2)
    assert.equal((await reopened.snapshot()).entries.length, 1)
    reopened.close()
  } finally {
    await f.cleanup()
  }
})

test('diaries respect disabled generation, active chats, unavailable models and profile validation', async () => {
  const f = await fixture()
  try {
    f.sessions.push(session('first', 'aria', new Date(2026, 9, 1, 12)))
    f.setTime(new Date(2026, 9, 2, 12))
    await f.diary.setEnabled(false)
    await f.diary.process(true)
    assert.equal(f.requests.length, 0)
    await f.diary.setEnabled(true)
    f.idle(false)
    await f.diary.process()
    assert.equal(f.requests.length, 0)
    f.idle(true)
    f.ready(false)
    await f.diary.process()
    assert.equal((await f.diary.snapshot()).error, 'model')
    await f.diary.setProfile('aria', { name: 'Mika', avatar: '' })
    await assert.rejects(
      f.diary.setProfile('aria', { name: 'Mika', avatar: 'https://tracker.invalid/image.png' }),
    )
    f.ready(true)
    await f.diary.process(true)
    assert.equal((await f.diary.snapshot()).entries[0].author, 'Mika')
    assert.match(f.requests[0].system, /You are Mika/)
  } finally {
    await f.cleanup()
  }
})

test('disabling during generation aborts the model and never persists a late result', async () => {
  const f = await fixture()
  try {
    f.sessions.push(session('first', 'aria', new Date(2026, 9, 1, 12)))
    f.setTime(new Date(2026, 9, 2, 12))
    let started!: () => void
    const begin = new Promise<void>((resolve) => {
      started = resolve
    })
    let finish!: () => void
    const end = new Promise<void>((resolve) => {
      finish = resolve
    })
    let signal!: AbortSignal
    f.options.client.stream = async function* (request, abort) {
      signal = abort
      started()
      await end
      yield { type: 'delta', text: '{"title":"Late","body":"Do not save"}' }
    }
    const task = f.diary.process()
    await begin
    await f.diary.setEnabled(false)
    assert.equal(signal.aborted, true)
    finish()
    await task
    assert.equal((await f.diary.snapshot()).entries.length, 0)
    assert.equal((await f.diary.snapshot()).nextDate, '2026-10-01')
  } finally {
    await f.cleanup()
  }
})

test('development diaries stay in the isolated data directory', async () => {
  const f = await fixture(true)
  try {
    assert.ok(await readFile(join(f.vault, '.catea-dev/diary/index.json'), 'utf8'))
    await assert.rejects(readFile(join(f.vault, '.catea/diary/index.json'), 'utf8'))
  } finally {
    await f.cleanup()
  }
})
