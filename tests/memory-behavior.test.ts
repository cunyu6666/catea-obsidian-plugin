import { build } from 'esbuild'
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const bundle = await build({
  stdin: {
    contents: `export * from './packages/memory/src/index'; export * from './packages/memory/src/store'; export * from './packages/memory/src/engine'; export * from './packages/memory/src/extraction'; export * from './packages/memory/src/tools'; export * from './packages/memory/src/model';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  metafile: true,
})
const {
  MemoryStore,
  MemoryEngine,
  MemoryService,
  extractWritingMemories,
  memoryTools,
  validateMemoryInput,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)
Object.assign(globalThis, { window: globalThis })
const now = new Date().toISOString()
const input = (extra = {}) => ({
  type: 'writing-preference',
  name: '中文短句',
  summary: '用户喜欢中文短句',
  detail: '优先短句，保留必要论据。',
  sources: [{ kind: 'user', stance: 'endorsed', excerpt: '喜欢中文短句' }],
  ...extra,
})
const legacy = (extra = {}) => ({
  id: 'old',
  type: 'preference',
  name: '中文短句',
  summary: '用户喜欢中文短句',
  detail: '优先短句，保留必要论据。',
  content: '优先短句，保留必要论据。',
  project: 'vault',
  created: now,
  importance: 6,
  accessCount: 0,
  tags: ['writing'],
  ...extra,
})
const semantic = (extra = {}) => ({
  id: 'semantic:old',
  kind: 'semantic',
  semanticType: 'preference',
  name: '中文短句',
  summary: '用户喜欢中文短句',
  detail: '优先短句，保留必要论据。',
  scope: { project: 'vault' },
  createdAt: now,
  updatedAt: now,
  importance: 6,
  accessCount: 2,
  confidence: 0.8,
  retention: 'core',
  stability: 'stable',
  tags: ['writing'],
  ...extra,
})
const job = (extra = {}) => ({
  id: 'turn-1',
  sessionId: 'session-1',
  persona: 'aria',
  modelId: 'model',
  user: '我喜欢中文短句。',
  assistant: '好的。',
  tools: [],
  ...extra,
})
async function fixture(t: TestContext) {
  const vault = await mkdtemp(join(tmpdir(), 'catea-memory-'))
  t.after(() => rm(vault, { recursive: true, force: true }))
  const root = join(vault, '.catea/memory/aria')
  const put = async (path: string, value: unknown) => {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), JSON.stringify(value, null, 2))
  }
  const store = new MemoryStore(vault, 'aria')
  return { vault, root, put, store, engine: new MemoryEngine(store) }
}
function client(memories: unknown) {
  return {
    async *stream() {
      yield {
        type: 'done',
        reply: { text: '', calls: [{ name: 'submit_memories', args: { memories } }] },
      }
    },
  }
}
const model = {
  id: 'model',
  model: 'test',
  provider: 'openai',
  endpoint: 'https://example.com',
  key: 'test',
}

test('memory runtime has one tool surface and does not bundle the old engine or extension', () => {
  const paths = Object.keys(bundle.metafile!.inputs)
  assert.ok(!paths.some((p) => /memory\/upstream\/(engine|extension|store|store-v2)\.ts$/.test(p)))
  assert.ok(memoryTools.every((tool: { name: string }) => tool.name.startsWith('memory_')))
  assert.throws(() => validateMemoryInput(input({ type: 'unknown-type' })))
  for (const type of [
    'fact',
    'preference',
    'lesson',
    'decision',
    'pattern',
    'struggle',
    'event',
    'entity',
    'work',
    'episode',
    'facet',
    'procedural',
    'state',
    'writing-preference',
    'writing-project',
    'concept',
    'material',
    'knowledge-method',
    'editorial-decision',
  ])
    validateMemoryInput(input({ type }))
})

test('imports both formats once, backs up exact source bytes and resolves old IDs to one record', async (t) => {
  const { root, put, store, engine, vault } = await fixture(t)
  await put('preferences.json', [legacy()])
  await put('v2/semantic.json', [semantic()])
  const original = await readFile(join(root, 'preferences.json'), 'utf8')
  const data = await store.read()
  assert.equal(data.records.length, 1)
  assert.equal(data.records[0].id, 'semantic:old')
  assert.deepEqual(data.records[0].aliases, ['old'])
  const backup = JSON.parse(await readFile(join(root, data.migration.backup), 'utf8'))
  assert.equal(backup.files['preferences.json'], original)
  await engine.edit('old', { summary: '新的中文写作偏好' })
  assert.equal((await engine.recall('semantic:old')).summary, '新的中文写作偏好')
  assert.equal(await readFile(join(root, 'preferences.json'), 'utf8'), original)
  await writeFile(join(root, 'v2/semantic.json'), '{broken old file')
  const reopened = new MemoryEngine(new MemoryStore(vault, 'aria'))
  assert.equal((await reopened.recall('old')).summary, '新的中文写作偏好')
  await reopened.forget('old')
  assert.deepEqual(await reopened.search(''), [])
  assert.equal((await reopened.search('', { includeArchived: true })).length, 1)
  await reopened.restore('old')
  assert.equal((await reopened.search('中文')).length, 1)
})

test('migration preserves distinct details, archive state, procedures, episodes, state and links', async (t) => {
  const { put, store, engine } = await fixture(t)
  await put('knowledge.json', [legacy({ id: 'fact', type: 'fact', detail: 'different detail' })])
  await put('v2/semantic.json', [
    semantic({ id: 'a', semanticType: 'fact' }),
    semantic({ id: 'retired', name: 'retired', summary: 'retired', detail: 'retired' }),
  ])
  await put('_archive/preferences.json', [
    legacy({
      id: 'old-retired',
      name: 'retired',
      summary: 'retired',
      detail: 'retired',
      archivedAt: now,
    }),
  ])
  await put('work.json', [
    { id: 'work', goal: '写一篇散文', summary: '完成提纲', detail: '正文待写', created: now },
  ])
  await put('v2/procedural.json', [
    {
      id: 'method',
      kind: 'procedural',
      name: '阅读方法',
      summary: '先概括后质疑',
      steps: [{ id: 's1', text: '标出论点' }],
      createdAt: now,
    },
  ])
  await put('v2/episodes.json', [
    {
      id: 'episode',
      kind: 'episode',
      title: '修订文章',
      summary: '修改了开头',
      sessionId: 's1',
      filesModified: ['draft.md'],
      createdAt: now,
    },
  ])
  await put('v2/facets.json', [
    { id: 'facet', kind: 'facet', searchText: '开头太长', episodeId: 'episode', createdAt: now },
  ])
  await put('v2/state.json', [
    { id: 'state', kind: 'state', summary: '本周集中修改论文', stateType: 'focus', createdAt: now },
  ])
  await put('v2/links.json', [{ fromId: 'a', toId: 'method', type: 'supports' }])
  const data = await store.read()
  assert.equal(data.records.length, 8)
  assert.ok((await engine.recall('retired')).archivedAt)
  assert.equal((await engine.recall('old-retired')).id, 'retired')
  assert.deepEqual((await engine.recall('method')).attributes.steps, ['标出论点'])
  assert.ok((await engine.recall('a')).links.some((l: { id: string }) => l.id === 'method'))
  assert.ok((await engine.recall('episode')).detail.includes('draft.md'))
  assert.equal((await engine.recall('work')).type, 'work')
  assert.equal((await engine.recall('state')).type, 'state')
})

test('legacy-only episodes, content-only records and long details remain readable and editable', async (t) => {
  const { put, store, engine } = await fixture(t)
  await put('knowledge.json', [
    { id: 'old', type: 'fact', content: 'x'.repeat(20000), created: now },
  ])
  await put('episodes/session.json', {
    sessionId: 'session',
    project: 'vault',
    summary: '一次阅读讨论',
    date: now,
    keyObservations: ['读完第一章'],
  })
  const data = await store.read()
  assert.equal(data.records.length, 2)
  assert.ok(data.records.some((r: { type: string }) => r.type === 'episode'))
  assert.equal((await engine.recall('old')).detail.length, 20000)
  await engine.edit('old', { summary: 'Updated cue' })
  assert.equal((await engine.recall('old')).detail.length, 20000)
})

test('invalid old data aborts migration without publishing a partial store', async (t) => {
  const { put, root, store } = await fixture(t)
  await put('preferences.json', [legacy()])
  await put('v2/semantic.json', { not: 'an array' })
  await assert.rejects(store.read(), /Invalid legacy/)
  await assert.rejects(readFile(join(root, 'memories.json')), { code: 'ENOENT' })
  assert.equal(JSON.parse(await readFile(join(root, 'preferences.json'), 'utf8'))[0].id, 'old')
  await put('v2/semantic.json', [])
  assert.equal((await store.read()).records.length, 1)
})

test('existing null, corrupted or future canonical stores never fall back to old files', async (t) => {
  const { put, store, root } = await fixture(t)
  await put('preferences.json', [legacy()])
  for (const content of [
    'null',
    '{invalid',
    JSON.stringify({ schemaVersion: 999, records: [], processedTurns: [] }),
  ]) {
    await writeFile(join(root, 'memories.json'), content)
    await assert.rejects(store.read())
    assert.equal(await readFile(join(root, 'memories.json'), 'utf8'), content)
  }
})

test('migration resumes from an existing exact backup and rejects a changed backup', async (t) => {
  const { put, root, store } = await fixture(t)
  await put('preferences.json', [legacy()])
  const first = await store.read()
  await rm(join(root, 'memories.json'))
  const second = await store.read()
  assert.equal(second.migration.backup, first.migration.backup)
  assert.equal(second.records.length, 1)
  await rm(join(root, 'memories.json'))
  await writeFile(join(root, first.migration.backup), 'damaged backup')
  await assert.rejects(store.read(), /backup does not match/)
})

test('symlinked legacy files and canonical files are rejected', async (t) => {
  const { vault, root, store } = await fixture(t)
  await mkdir(root, { recursive: true })
  const target = join(vault, 'other.json')
  await writeFile(target, JSON.stringify([legacy()]))
  await symlink(target, join(root, 'preferences.json'))
  await assert.rejects(store.read(), /符号链接/)
  await rm(join(root, 'preferences.json'))
  await symlink(target, join(root, 'memories.json'))
  await assert.rejects(store.read(), /符号链接/)
})

test('all CRUD and conflict tools modify only the canonical store', async (t) => {
  const { vault, root } = await fixture(t)
  const service = new MemoryService(
    vault,
    () => model,
    () => {},
    client([]),
  )
  const run = async (name: string, args = {}) =>
    JSON.parse(await service.run(name, args, 'aria', 'model'))
  const first = await run('memory_remember', input())
  const second = await run(
    'memory_remember',
    input({ name: '另一个偏好', summary: '短句也要有节奏', detail: '长短结合' }),
  )
  await run('memory_edit', { id: first.id, attributes: { negativeExamples: ['空泛结语'] } })
  assert.equal((await run('memory_recall', { id: first.id })).detail, input().detail)
  await run('memory_resolve', { aId: first.id, bId: second.id, action: 'merge' })
  assert.equal((await run('memory_search', { query: '' })).length, 1)
  await run('memory_forget', { id: first.id })
  assert.equal((await run('memory_stats')).active, 0)
  await run('memory_restore', { id: first.id })
  assert.equal((await run('memory_review')).active, 1)
  await run('memory_dream')
  assert.deepEqual((await readdir(root)).sort(), ['memories.json'])
  await assert.rejects(service.run('nanomem_search', {}, 'aria', 'model'), /Unknown memory tool/)
})

test('concurrent writes are serialized without losing records', async (t) => {
  const { engine, store } = await fixture(t)
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      engine.remember(input({ name: `偏好 ${i}`, summary: `偏好 ${i}` })),
    ),
  )
  assert.equal((await store.read()).records.length, 20)
})

test('search filters project and note without mixing scoped records; Chinese partial queries work', async (t) => {
  const { engine } = await fixture(t)
  await engine.remember(input({ name: '甲项目', project: '甲', note: '甲.md' }))
  await engine.remember(input({ name: '乙项目', project: '乙', note: '乙.md' }))
  await engine.remember(input({ name: '通用偏好' }))
  const result = await engine.search('中文', { project: '甲', note: '甲.md' })
  assert.deepEqual(
    new Set(result.map((r: { name: string }) => r.name)),
    new Set(['甲项目', '通用偏好']),
  )
  const other = await engine.remember(
    input({
      type: 'material',
      name: '引用',
      sources: [{ kind: 'document', stance: 'quoted', path: '文献.md' }],
    }),
  )
  const injection = await engine.injection('引用')
  assert.ok(injection.includes('quoted'))
  assert.ok(injection.includes('not an endorsed user belief'))
  assert.ok(injection.includes(other.id))
})

test('global recall is shared but personas remain isolated', async (t) => {
  const { vault } = await fixture(t)
  const service = new MemoryService(
    vault,
    () => model,
    () => {},
    client([]),
  )
  await service.run('memory_remember', input({ name: 'shared', scope: 'global' }), 'aria', 'model')
  await service.run('memory_remember', input({ name: 'aria-only' }), 'aria', 'model')
  await service.run('memory_remember', input({ name: 'vex-only' }), 'vex', 'model')
  const recall = await service.injection('aria', '中文', 'model')
  assert.ok(recall.includes('shared') && recall.includes('aria-only'))
  assert.ok(!recall.includes('vex-only'))
})

test('expired and stale ambient memories archive; core memories survive; restore renews TTL', async (t) => {
  const { engine, store } = await fixture(t)
  const expired = await engine.remember(
    input({ name: 'expires', ttlDays: 2, retention: 'ambient' }),
  )
  const core = await engine.remember(input({ name: 'core', retention: 'core' }))
  await store.transaction((data: { records: Array<{ updatedAt: string }> }) => {
    for (const record of data.records) record.updatedAt = '2020-01-01T00:00:00.000Z'
  })
  assert.ok(!(await engine.search('')).some((r: { id: string }) => r.id === expired.id))
  const result = await engine.consolidate()
  assert.equal(result.archived, 1)
  assert.equal((await engine.recall(core.id)).archivedAt, undefined)
  await engine.restore(expired.id)
  assert.ok((await engine.search('')).some((r: { id: string }) => r.id === expired.id))
})

test('queued turn receipt and records are atomic and survive replay after restart', async (t) => {
  const { engine, vault, store } = await fixture(t)
  await engine.recordTurn('turn-1', [input()], new AbortController().signal)
  await writeFile(
    join(vault, '.catea/memory/pending-turns.json'),
    JSON.stringify([{ ...job(), attempts: 0, nextAttempt: 0, stage: 2 }]),
  )
  let calls = 0
  const service = new MemoryService(
    vault,
    () => undefined,
    () => {},
    {
      async *stream() {
        calls++
        throw new Error('must not extract twice')
      },
    },
  )
  await service.process()
  assert.equal(calls, 0)
  assert.equal((await store.read()).records.length, 1)
  assert.deepEqual(
    JSON.parse(await readFile(join(vault, '.catea/memory/pending-turns.json'), 'utf8')),
    [],
  )
  await engine.recordTurn('turn-1', [input({ name: 'duplicate' })], new AbortController().signal)
  assert.equal((await store.read()).records.length, 1)
})

test('invalid extraction is retained for retry and succeeds with a replacement service', async (t) => {
  const { vault, store } = await fixture(t)
  const notices: string[] = []
  const service = new MemoryService(
    vault,
    () => model,
    (text: string) => notices.push(text),
    client([input({ type: 'unknown-type' })]),
  )
  await service.enqueue(job())
  await service.process()
  const path = join(vault, '.catea/memory/pending-turns.json')
  const pending = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(pending.length, 1)
  assert.equal(pending[0].attempts, 1)
  assert.ok(pending[0].nextAttempt > Date.now())
  assert.ok(notices.some((text) => text.includes('待重试')))
  assert.equal((await store.read()).records.length, 0)
  pending[0].nextAttempt = 0
  await writeFile(path, JSON.stringify(pending))
  const replacement = new MemoryService(
    vault,
    () => model,
    () => {},
    client([input()]),
  )
  await replacement.process()
  assert.equal((await store.read()).records.length, 1)
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), [])
})

test('extraction preserves quotations and downgrades unsupported claims of user endorsement', async () => {
  const items = await extractWritingMemories(
    job(),
    model,
    client([
      input({
        name: 'invented',
        retention: 'core',
        sources: [{ kind: 'user', stance: 'endorsed', excerpt: 'never said this' }],
      }),
      input({
        name: 'proposal',
        retention: 'core',
        sources: [{ kind: 'assistant', stance: 'endorsed' }],
      }),
      input({
        name: 'quotation',
        sources: [{ kind: 'document', stance: 'endorsed', path: 'fabricated.md' }],
      }),
      input({ name: 'supported', retention: 'core' }),
    ]),
    new AbortController().signal,
  )
  assert.equal(items[0].sources[0].kind, 'inferred')
  assert.equal(items[0].retention, 'ambient')
  assert.equal(items[1].sources[0].stance, 'proposed')
  assert.equal(items[2].sources[0].stance, 'quoted')
  assert.equal(items[2].sources[0].path, undefined)
  assert.equal(items[3].retention, 'core')
  assert.ok(
    items.every((i: { sources: Array<{ turnId: string }> }) =>
      i.sources.every((s) => s.turnId === 'turn-1'),
    ),
  )
})

test('disabling memory cancels pending extraction before commit and preserves its queue entry', async (t) => {
  const { vault, store } = await fixture(t)
  let entered!: () => void
  const started = new Promise<void>((resolve) => {
    entered = resolve
  })
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  const slow = {
    async *stream() {
      entered()
      await waiting
      yield {
        type: 'done',
        reply: { text: '', calls: [{ name: 'submit_memories', args: { memories: [input()] } }] },
      }
    },
  }
  const service = new MemoryService(
    vault,
    () => model,
    () => {},
    slow,
  )
  await service.enqueue(job())
  await started
  service.setEnabled(false)
  release()
  await service.process()
  assert.equal((await store.read()).records.length, 0)
  assert.equal(
    JSON.parse(await readFile(join(vault, '.catea/memory/pending-turns.json'), 'utf8')).length,
    1,
  )
  assert.equal(await service.injection('aria', '中文', 'model'), '')
})

test('repeated turns accumulate provenance without creating duplicate memories', async (t) => {
  const { engine, store } = await fixture(t)
  for (let i = 0; i < 4; i++) {
    await engine.recordTurn(
      `turn-${i}`,
      [
        input({
          sources: [
            { kind: 'user', stance: 'endorsed', turnId: `turn-${i}`, excerpt: '喜欢中文短句' },
          ],
        }),
      ],
      new AbortController().signal,
    )
  }
  const data = await store.read()
  assert.equal(data.records.length, 1)
  assert.equal(data.records[0].sources.length, 4)
  assert.equal(data.processedTurns.length, 4)
})

test('cancellation while waiting for a store transaction prevents the tool write', async (t) => {
  const { engine, store } = await fixture(t)
  await store.read()
  const controller = new AbortController()
  const first = engine.remember(input({ name: 'first' }))
  const canceled = engine.remember(input({ name: 'canceled' }), controller.signal)
  controller.abort()
  await assert.rejects(canceled, /abort/i)
  await first
  assert.deepEqual(
    (await store.read()).records.map((r: { name: string }) => r.name),
    ['first'],
  )
})

test('automatic recall restricts project and note decisions before ranking', async (t) => {
  const { engine } = await fixture(t)
  const general = await engine.remember(input())
  const project = await engine.remember(
    input({ type: 'editorial-decision', name: 'Art decision', project: 'Art' }),
  )
  const note = await engine.remember(
    input({
      type: 'editorial-decision',
      name: 'Note decision',
      project: 'Art',
      note: '草稿/开篇.md',
    }),
  )
  // Other highly relevant records must not crowd the applicable project out of the top 30.
  for (let i = 0; i < 32; i++) {
    await engine.remember(input({ name: `other-${i}`, project: 'Other', importance: 10 }))
  }
  const generic = await engine.injection('帮我修改中文短句')
  assert.ok(generic.includes(general.id))
  assert.ok(!generic.includes(project.id) && !generic.includes(note.id))
  assert.ok(!generic.includes('other-'))
  assert.ok(!(await engine.injection('Article 中文短句')).includes(project.id))
  const scoped = await engine.injection('Art 中文短句')
  assert.ok(scoped.includes(project.id))
  assert.ok(!scoped.includes(note.id))
  assert.ok((await engine.injection('修改 [[草稿/开篇.md]] 的中文短句')).includes(note.id))
  assert.ok(!(await engine.injection('归档/草稿/开篇.md.bak 中文短句')).includes(note.id))
  assert.ok(!(await engine.injection('归档/草稿/开篇.md 中文短句')).includes(note.id))
  // Explicit searches remain able to discover records even when the current prompt has no scope.
  assert.ok(
    (await engine.search('中文', { project: 'Art', note: '草稿/开篇.md' })).some(
      (r: { id: string }) => r.id === note.id,
    ),
  )
})

test('automatic extraction cannot recreate an explicitly forgotten duplicate', async (t) => {
  const { engine, store } = await fixture(t)
  const original = await engine.remember(input())
  await engine.forget(original.id)
  await engine.recordTurn(
    'after-forgetting',
    [
      input({
        sources: [
          { kind: 'user', stance: 'endorsed', turnId: 'new-turn', excerpt: '喜欢中文短句' },
        ],
      }),
    ],
    new AbortController().signal,
  )
  const data = await store.read()
  assert.equal(data.records.length, 1)
  assert.ok(data.processedTurns.includes('after-forgetting'))
  assert.equal((await engine.search('中文')).length, 0)
  await engine.restore(original.id)
  assert.equal((await engine.search('中文'))[0].id, original.id)
})

test('legacy general categories survive import without becoming writing categories', async (t) => {
  const { put, engine } = await fixture(t)
  const types = [
    'fact',
    'preference',
    'lesson',
    'decision',
    'pattern',
    'struggle',
    'event',
    'entity',
  ]
  await put(
    'v2/semantic.json',
    types.map((type) => semantic({ id: type, semanticType: type, name: type })),
  )
  for (const type of types) assert.equal((await engine.recall(type)).type, type)
})

test('general preferences and writing extensions both extract, persist and recall', async (t) => {
  const { engine } = await fixture(t)
  const memories = [
    input({
      type: 'preference',
      name: '饮食偏好',
      summary: '用户不吃辣',
      detail: '不吃辣',
      retention: 'core',
      sources: [{ kind: 'user', stance: 'endorsed', excerpt: '我不吃辣' }],
    }),
    input({ type: 'writing-preference', name: '写作风格' }),
    input({ type: 'decision', name: '出行决定', summary: '周末坐火车', detail: '周末坐火车' }),
  ]
  const extracted = await extractWritingMemories(
    job({ user: '我不吃辣。我喜欢中文短句。周末坐火车。' }),
    model,
    client(memories),
    new AbortController().signal,
  )
  assert.equal(extracted[0].type, 'preference')
  assert.equal(extracted[0].retention, 'core')
  await engine.recordTurn('general-and-writing', extracted, new AbortController().signal)
  const injection = await engine.injection('你好')
  assert.ok(injection.includes('饮食偏好'))
  assert.ok(injection.includes('写作风格'))
  const review = await engine.review()
  assert.equal(review.byType.preference, 1)
  assert.equal(review.byType['writing-preference'], 1)
  assert.equal(review.byType.decision, 1)
})

test('extraction repairs invalid fields once and keeps source attribution checks', async () => {
  const requests: Array<{ transcript: Array<{ content: string }> }> = []
  const repairing = {
    async *stream(request: { transcript: Array<{ content: string }> }) {
      requests.push(request)
      yield {
        type: 'done',
        reply: {
          text: '',
          calls: [
            {
              name: 'submit_memories',
              args: {
                memories: [
                  input({
                    confidence: requests.length === 1 ? 10 : 0.8,
                    sources: [
                      { kind: 'user', stance: 'endorsed', excerpt: 'fabricated endorsement' },
                    ],
                  }),
                ],
              },
            },
          ],
        },
      }
    },
  }
  const result = await extractWritingMemories(job(), model, repairing, new AbortController().signal)
  assert.equal(requests.length, 2)
  assert.match(requests[1].transcript[1].content, /\/memories\/0\/confidence/)
  assert.equal(result[0].confidence, 0.8)
  assert.equal(result[0].sources[0].kind, 'inferred')
})

test('extraction repairs malformed JSON and accepts fenced empty results', async () => {
  let calls = 0
  const repairing = {
    async *stream() {
      calls++
      yield {
        type: 'done',
        reply: { calls: [], text: calls === 1 ? '{broken' : '  ```json\n{"memories":[]}\n```  ' },
      }
    },
  }
  assert.deepEqual(
    await extractWritingMemories(job(), model, repairing, new AbortController().signal),
    [],
  )
  assert.equal(calls, 2)
})

test('failed repair is bounded, persists field diagnostics and does not commit a partial batch', async (t) => {
  const { vault, store } = await fixture(t)
  let calls = 0
  const invalid = {
    async *stream() {
      calls++
      yield {
        type: 'done',
        reply: {
          text: '',
          calls: [
            {
              name: 'submit_memories',
              args: {
                memories: [input(), input({ confidence: 42, detail: 'private note text' })],
              },
            },
          ],
        },
      }
    },
  }
  const service = new MemoryService(
    vault,
    () => model,
    () => {},
    invalid,
  )
  await service.enqueue(job())
  await service.process()
  assert.equal(calls, 2)
  const pending = JSON.parse(
    await readFile(join(vault, '.catea/memory/pending-turns.json'), 'utf8'),
  )
  assert.equal(pending[0].attempts, 1)
  assert.match(pending[0].error, /\/memories\/1\/confidence/)
  assert.doesNotMatch(pending[0].error, /private note text/)
  assert.equal((await store.read()).records.length, 0)
  service.close()
})

test('transport errors and cancellation do not trigger an extraction repair request', async () => {
  for (const cancel of [false, true]) {
    const abort = new AbortController()
    let calls = 0
    const failing = {
      async *stream() {
        calls++
        if (cancel) abort.abort()
        throw new Error('transport unavailable')
        yield { type: 'done', reply: { text: '', calls: [] } }
      },
    }
    await assert.rejects(extractWritingMemories(job(), model, failing, abort.signal))
    assert.equal(calls, 1)
  }
})

// ---- MemoryEngine.list(): the sidebar browser's listing primitive -------------
//
// search() cannot back a type folder: it caps at 30 hits, so a fuller folder
// silently loses records, and it ranks by relevance where a browser wants
// most-recently-updated first.

function listed(name: string, extra: Record<string, unknown> = {}) {
  return {
    type: 'preference',
    name,
    summary: `summary of ${name}`,
    detail: `detail of ${name}`,
    ...extra,
  }
}

// remember() stamps updatedAt from the clock, so a deterministic order needs a gap.
const tick = () => new Promise((resolve) => setTimeout(resolve, 6))

test('memory list | returns active records newest first', async (t) => {
  const { engine } = await fixture(t)
  await engine.remember(listed('older'))
  await tick()
  await engine.remember(listed('newer'))
  assert.deepEqual(
    (await engine.list()).map((row) => row.name),
    ['newer', 'older'],
  )
})

test('memory list | filters by type', async (t) => {
  const { engine } = await fixture(t)
  await engine.remember(listed('a preference'))
  await engine.remember(listed('a concept', { type: 'concept' }))
  assert.deepEqual(
    (await engine.list({ type: 'preference' })).map((row) => row.name),
    ['a preference'],
  )
  assert.equal((await engine.list({ type: 'concept' })).length, 1)
})

test('memory list | archived records leave the folder and appear in the archive', async (t) => {
  const { engine } = await fixture(t)
  const kept = await engine.remember(listed('kept'))
  const dropped = await engine.remember(listed('dropped'))
  await engine.forget(dropped.id)
  assert.deepEqual(
    (await engine.list()).map((row) => row.id),
    [kept.id],
    'a forgotten memory must not keep showing up in its type folder',
  )
  const archived = await engine.list({ state: 'archived' })
  assert.deepEqual(
    archived.map((row) => row.id),
    [dropped.id],
  )
  assert.ok(archived[0].archivedAt, 'the archive view needs the timestamp to explain itself')
})

test('memory list | restore puts a record back', async (t) => {
  const { engine } = await fixture(t)
  const record = await engine.remember(listed('restorable'))
  await engine.forget(record.id)
  await engine.restore(record.id)
  assert.deepEqual(
    (await engine.list()).map((row) => row.id),
    [record.id],
  )
  assert.equal((await engine.list({ state: 'archived' })).length, 0)
})

test('memory list | truncates long summaries so a folder stays a bounded payload', async (t) => {
  const { engine } = await fixture(t)
  await engine.remember(listed('verbose', { summary: 'x'.repeat(2000) }))
  const [row] = await engine.list()
  assert.ok(row.summary.length <= 161, `summary was ${row.summary.length} chars`)
  assert.match(row.summary, /…$/)
})

test('memory list | honours the limit and never empties on a zero limit', async (t) => {
  const { engine } = await fixture(t)
  for (const name of ['one', 'two', 'three']) await engine.remember(listed(name))
  assert.equal((await engine.list({ limit: 2 })).length, 2)
  assert.equal((await engine.list({ limit: 0 })).length, 3)
  assert.equal((await engine.list({ limit: 999999 })).length, 3)
})

test('memory list | projection omits the heavy record fields', async (t) => {
  const { engine } = await fixture(t)
  await engine.remember(listed('projected', { project: 'novel', tags: ['style'] }))
  const [row] = await engine.list()
  assert.deepEqual(Object.keys(row).sort(), [
    'id',
    'importance',
    'name',
    'project',
    'summary',
    'tags',
    'type',
    'updatedAt',
  ])
  assert.equal(row.project, 'novel')
  assert.deepEqual(row.tags, ['style'])
})
