import { build } from 'esbuild'
import { test } from 'node:test'
import assert from 'node:assert/strict'

async function runtime() {
  const result = await build({
    entryPoints: ['packages/agent-core/src/compaction.ts', 'packages/agent-core/src/context.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    outdir: '/tmp/catea-compaction-test',
    plugins: [
      {
        name: 'model-stub',
        setup(b) {
          b.onResolve({ filter: /^\.\/providers$/ }, () => ({
            path: 'providers',
            namespace: 'stub',
          }))
          b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'export class ModelServiceError extends Error {}',
          }))
        },
      },
    ],
  })
  return Promise.all(
    result.outputFiles.map(
      (file) =>
        import(`data:text/javascript;base64,${Buffer.from(file.contents).toString('base64')}`),
    ),
  )
}
const user = (content: string) => ({ role: 'user', content, timestamp: Date.now() })
const assistant = (content: string, calls: Array<{ id: string }> = []) => ({
  role: 'assistant',
  content: [
    { type: 'text', text: content },
    ...calls.map((call) => ({ type: 'toolCall', id: call.id, name: 'read', arguments: {} })),
  ],
  stopReason: calls.length ? 'toolUse' : 'stop',
  timestamp: Date.now(),
})
const row = (id: string, message: unknown) => ({
  id,
  timestamp: new Date().toISOString(),
  type: 'message',
  message,
})

test('complete user turns are cut without splitting tool calls and results', async () => {
  const [{ planCompaction }] = await runtime()
  const rows = [
    row('u1', user('old')),
    row('a1', assistant('', [{ id: 'call' }])),
    row('r1', {
      role: 'toolResult',
      toolCallId: 'call',
      content: [{ type: 'text', text: 'result' }],
    }),
    row('u2', user('latest')),
    row('a2', assistant('reply')),
  ]
  const plan = planCompaction(rows, 1)
  assert.equal(plan.firstKeptEntryId, 'u2')
  assert.deepEqual(
    plan.messages.map((m: { role: string }) => m.role),
    ['user', 'assistant', 'toolResult'],
  )
  assert.equal(rows.length, 5)
})

test('an unanswered tool call remains in the retained window', async () => {
  const [{ planCompaction }] = await runtime()
  const rows = [
    row('u1', user('old')),
    row('a1', assistant('', [{ id: 'pending' }])),
    row('u2', user('later')),
  ]
  assert.equal(planCompaction(rows, 1), undefined)
})

test('a long single user turn can compact completed tool cycles', async () => {
  const [{ planCompaction }] = await runtime()
  const rows = [
    row('u1', user('fetch the wiki')),
    row('a1', assistant('', [{ id: 'first' }])),
    row('r1', {
      role: 'toolResult',
      toolCallId: 'first',
      content: [{ type: 'text', text: 'old result' }],
    }),
    row('a2', assistant('', [{ id: 'second' }])),
    row('r2', {
      role: 'toolResult',
      toolCallId: 'second',
      content: [{ type: 'text', text: 'new result' }],
    }),
    row('a3', assistant('working')),
  ]
  const plan = planCompaction(rows, 1)
  assert.equal(plan.firstKeptEntryId, 'a3')
  assert.deepEqual(
    plan.messages.map((message: { role: string }) => message.role),
    ['user', 'assistant', 'toolResult', 'assistant', 'toolResult'],
  )
})

test('parallel tool calls must all finish before a single-turn cut', async () => {
  const [{ planCompaction }] = await runtime()
  const rows = [
    row('u1', user('inspect files')),
    row('a1', assistant('', [{ id: 'first' }, { id: 'second' }])),
    row('r1', {
      role: 'toolResult',
      toolCallId: 'first',
      content: [{ type: 'text', text: 'one' }],
    }),
    row('a2', assistant('still waiting')),
  ]
  assert.equal(planCompaction(rows, 1), undefined)
  rows.splice(
    3,
    0,
    row('r2', {
      role: 'toolResult',
      toolCallId: 'second',
      content: [{ type: 'text', text: 'two' }],
    }),
  )
  assert.equal(planCompaction(rows, 1)?.firstKeptEntryId, 'a2')
})

test('no eligible earlier turn skips compaction without a failure notice', async () => {
  const [{ CompactionCoordinator }] = await runtime()
  const rows = [row('u1', user('a'.repeat(24000)))]
  const events: unknown[] = []
  let attempts = 0
  const context = {
    journal: () => rows,
    messages: () => rows.map((r) => r.message),
    checkpoint: async () => {
      throw new Error('unexpected checkpoint')
    },
  }
  const coordinator = new CompactionCoordinator(
    context,
    {
      summarize: async () => {
        attempts++
        return 'summary'
      },
    },
    4096,
    'system',
    [],
    (event: unknown) => events.push(event),
    new AbortController().signal,
  )
  assert.equal(
    await coordinator.check(
      'threshold',
      rows.map((r) => r.message),
    ),
    undefined,
  )
  assert.equal(
    await coordinator.check(
      'threshold',
      rows.map((r) => r.message),
    ),
    undefined,
  )
  assert.equal(
    await coordinator.check(
      'overflow',
      rows.map((r) => r.message),
    ),
    undefined,
  )
  assert.equal(attempts, 0)
  assert.deepEqual(events, [])
})

test('a later compaction can summarize turns retained by the previous checkpoint', async () => {
  const [{ planCompaction }] = await runtime()
  const rows = [
    row('u1', user('old')),
    row('a1', assistant('done')),
    row('u2', user('retained')),
    row('a2', assistant('done')),
    {
      type: 'compaction',
      id: 'cp',
      timestamp: new Date().toISOString(),
      summary: 'earlier goals',
      firstKeptEntryId: 'u2',
      tokensBefore: 100,
      details: {},
    },
    row('u3', user('latest')),
  ]
  const plan = planCompaction(rows, 1)
  assert.equal(plan.firstKeptEntryId, 'u3')
  assert.equal(plan.previousSummary, 'earlier goals')
  assert.equal(plan.messages[0].content, 'retained')
})

test('threshold uses local estimate without provider usage and commits once', async () => {
  const [{ CompactionCoordinator }] = await runtime()
  const rows = [
    row('u1', user('a'.repeat(8000))),
    row('a1', assistant('b'.repeat(8000))),
    row('u2', user('current request')),
  ]
  let saved = 0
  const context = {
    journal: () => rows,
    messages: () => [{ role: 'user', content: 'summary' }, rows[2].message],
    checkpoint: async (summary: string, first: string) => {
      rows.push({
        type: 'compaction',
        id: 'checkpoint',
        timestamp: new Date().toISOString(),
        summary,
        firstKeptEntryId: first,
        tokensBefore: 0,
        details: {},
      })
      saved++
    },
  }
  const events: unknown[] = []
  const coordinator = new CompactionCoordinator(
    context,
    { summarize: async () => 'goals and constraints' },
    4096,
    'system',
    [],
    (e: unknown) => events.push(e),
    new AbortController().signal,
  )
  await coordinator.check(
    'threshold',
    rows.map((r) => r.message),
  )
  assert.equal(saved, 1)
  assert.deepEqual(
    events.map((e: { type: string }) => e.type),
    ['start', 'complete'],
  )
})

test('summary failure preserves journal and suppresses repeat attempt on identical context', async () => {
  const [{ CompactionCoordinator }] = await runtime()
  const rows = [row('u1', user('old')), row('a1', assistant('reply')), row('u2', user('new'))]
  let attempts = 0
  const context = {
    journal: () => rows,
    messages: () => rows.map((r) => r.message),
    checkpoint: async () => {
      throw new Error('unexpected checkpoint')
    },
  }
  const coordinator = new CompactionCoordinator(
    context,
    {
      summarize: async () => {
        attempts++
        throw new Error('unavailable')
      },
    },
    4096,
    '',
    [],
    () => {},
    new AbortController().signal,
  )
  await coordinator.check(
    'overflow',
    rows.map((r) => r.message),
  )
  await coordinator.check(
    'overflow',
    rows.map((r) => r.message),
  )
  assert.equal(attempts, 1)
  assert.equal(rows.length, 3)
})

test('overflow recovery is bounded to one successful compaction', async () => {
  const [{ CompactionCoordinator }] = await runtime()
  const rows = [row('u1', user('old')), row('a1', assistant('reply')), row('u2', user('new'))]
  const context = {
    journal: () => rows,
    messages: () => [user('summary'), rows[2].message],
    checkpoint: async () => {
      rows.push({
        type: 'compaction',
        id: 'checkpoint',
        timestamp: new Date().toISOString(),
        summary: 'summary',
        firstKeptEntryId: 'u2',
        tokensBefore: 1,
        details: {},
      })
    },
  }
  const coordinator = new CompactionCoordinator(
    context,
    { summarize: async () => 'summary' },
    4096,
    '',
    [],
    () => {},
    new AbortController().signal,
  )
  assert.ok(
    await coordinator.check(
      'overflow',
      rows.map((r) => r.message),
    ),
  )
  assert.equal(
    await coordinator.check(
      'overflow',
      rows.map((r) => r.message),
    ),
    undefined,
  )
})

test('saved checkpoint rebuilds window while original journal stays complete', async () => {
  const [, { WorkingContext }] = await runtime()
  const session = {
    id: 's',
    transcript: [
      { role: 'user', content: 'old' },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'latest' },
    ],
    messages: [],
  }
  const context = new WorkingContext(session, 4096, 0, async () => {})
  const first = session.journal[2].id
  await context.checkpoint('goal and next step', first, 100)
  const restored = new WorkingContext(structuredClone(session), 4096, 0, async () => {})
  assert.equal(restored.messages().length, 2)
  assert.match(restored.messages()[0].content, /goal and next step/)
  assert.equal(session.journal.length, 4)
})

test('a checkpoint inside one user turn resumes with its later tool calls', async () => {
  const [, { WorkingContext }] = await runtime()
  const rows = [
    row('u1', user('fetch the wiki')),
    row('a1', assistant('', [{ id: 'old' }])),
    row('r1', {
      role: 'toolResult',
      toolCallId: 'old',
      content: [{ type: 'text', text: 'old result' }],
    }),
    row('a2', assistant('', [{ id: 'recent' }])),
    row('r2', {
      role: 'toolResult',
      toolCallId: 'recent',
      content: [{ type: 'text', text: 'recent result' }],
    }),
  ]
  const session = { id: 's', journal: rows, transcript: [], messages: [] }
  const context = new WorkingContext(session, 4096, 0, async () => {})
  await context.checkpoint(
    'Fetch the wiki; old result reviewed. Continue with recent call.',
    rows[3].id,
    100,
  )
  const resumed = new WorkingContext(structuredClone(session), 4096, 0, async () => {})
  assert.deepEqual(
    resumed.messages().map((message: { role: string }) => message.role),
    ['user', 'assistant', 'toolResult'],
  )
  assert.equal(resumed.messages()[1].content[1].id, 'recent')
})

test('resuming skips aborted, failed, and empty assistant records without erasing the journal', async () => {
  const [, { WorkingContext }] = await runtime()
  const rows = [
    row('u1', user('original request')),
    row('a1', { ...assistant('', [{ id: 'interrupted-call' }]), stopReason: 'aborted' }),
    row('r1', {
      role: 'toolResult',
      toolCallId: 'interrupted-call',
      content: [{ type: 'text', text: 'interrupted' }],
    }),
    row('u2', user('continue')),
    row('a2', { ...assistant(''), stopReason: 'error' }),
    row('a3', assistant('')),
    row('u3', user('are you there?')),
  ]
  const session = { id: 's', journal: rows, transcript: [], messages: [] }
  const context = new WorkingContext(session, 4096, 0, async () => {})
  assert.deepEqual(
    context.messages().map((message: { role: string }) => message.role),
    ['user', 'user', 'user'],
  )
  assert.equal(session.journal.length, rows.length)
  const legacy = {
    id: 'old',
    transcript: [
      { role: 'user', content: 'continue' },
      { role: 'assistant', content: '' },
      { role: 'user', content: 'are you there?' },
    ],
    messages: [],
  }
  assert.deepEqual(
    new WorkingContext(legacy, 4096, 0, async () => {})
      .messages()
      .map((message: { role: string }) => message.role),
    ['user', 'user'],
  )
})

test('checkpoint save failure rolls back the in-memory entry', async () => {
  const [, { WorkingContext }] = await runtime()
  const session = {
    id: 's',
    transcript: [
      { role: 'user', content: 'old' },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'latest' },
    ],
    messages: [],
  }
  const context = new WorkingContext(session, 4096, 0, async () => {
    throw new Error('disk full')
  })
  const count = session.journal.length
  await assert.rejects(() => context.checkpoint('summary', session.journal[2].id, 100), /disk full/)
  assert.equal(session.journal.length, count)
})
