// Runtime regression checks for the hand-written adapters. Hosts and network
// transports are injected; no live vault, credentials or model calls are used.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function load(entry, mocks = {}, globals = {}) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    loader: { '.md': 'text' },
    plugins: [
      {
        name: 'test-host',
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'mock' } : undefined,
          )
          b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
            contents: mocks[args.path],
            loader: 'js',
          }))
        },
      },
    ],
  })
  const module = { exports: {} }
  runInNewContext(
    result.outputFiles[0].text,
    {
      module,
      exports: module.exports,
      require: createRequire(import.meta.url),
      URL,
      URLSearchParams,
      Headers,
      Response,
      Request,
      ReadableStream,
      TextDecoder,
      TextEncoder,
      AbortController,
      AbortSignal,
      DOMException,
      crypto,
      Buffer,
      console,
      process,
      setTimeout,
      clearTimeout,
      window: { setTimeout, clearTimeout },
      ...globals,
    },
    { filename: resolve(entry) },
  )
  return module.exports
}
const model = {
  id: 'fixture',
  name: 'Fixture',
  model: 'fixture',
  apiKey: 'test-key',
  baseUrl: 'https://example.invalid/v1',
  protocol: 'openai',
}

test('Support prompt is due on first use and at most once per local calendar month', async () => {
  const { supportPromptDue, supportPromptMonth } = await load('apps/obsidian/src/support-prompt.ts')
  const january = new Date(2026, 0, 31, 23, 59)
  const february = new Date(2026, 1, 1, 0, 1)
  assert.equal(supportPromptMonth(january), '2026-01')
  assert.equal(supportPromptDue(undefined, january), true)
  assert.equal(supportPromptDue('2026-01', january), false)
  assert.equal(supportPromptDue('2026-01', february), true)
})

test('Conversation titles use a bounded fixed-format model request and reject malformed output', async () => {
  const { generateConversationTitle } = await load('packages/agent-core/src/conversation-title.ts')
  let request
  const client = {
    async *stream(value) {
      request = value
      yield { type: 'done', reply: { text: '{"title":"快照清理方案"}', calls: [] } }
    },
  }
  const title = await generateConversationTitle(
    client,
    model,
    '为什么会产生大量快照？',
    '每条消息都会复制整个 vault。',
    new AbortController().signal,
  )
  assert.equal(title, '快照清理方案')
  assert.equal(request.tools.length, 0)
  assert.equal(request.maxTokens, 64)
  assert.match(request.system, /exactly one JSON object/)

  const malformed = {
    async *stream() {
      yield { type: 'done', reply: { text: '快照清理方案', calls: [] } }
    },
  }
  assert.equal(
    await generateConversationTitle(
      malformed,
      model,
      'question',
      'answer',
      new AbortController().signal,
    ),
    null,
  )
})

test('Drafts stay with their session and failed sends restore only their own content', async () => {
  const { SessionDraftStore } = await load('apps/obsidian/src/session-drafts.ts')
  const drafts = new SessionDraftStore()
  const attachment = { id: 'file-a', path: 'a.png', size: 10, mimeType: 'image/png' }
  drafts.update('a', (current) => ({
    ...current,
    text: 'First',
    attachments: [attachment],
    quotes: [{ id: 'q', path: 'note.md', text: 'quoted' }],
    skills: ['figma-framelink'],
  }))
  const sent = drafts.get('a')
  drafts.clear('a')
  assert.equal(drafts.get('a').skills.length, 0, 'clear must reset skill tags')
  drafts.update('a', (current) => ({ ...current, skills: ['deepwiki'] }))
  drafts.update('b', (current) => ({ ...current, text: 'Second' }))
  drafts.restore('a', sent)
  assert.equal(drafts.get('a').text, 'First')
  assert.equal(drafts.get('a').attachments[0].id, 'file-a')
  assert.equal(drafts.get('a').quotes[0].text, 'quoted')
  assert.equal(
    drafts.get('a').skills.join(','),
    'figma-framelink,deepwiki',
    'restore must union sent and freshly tagged skills',
  )
  assert.equal(drafts.get('b').text, 'Second')
  assert.equal(drafts.get('b').skills.length, 0)
})

test('Slash skill picker parses token-bounded queries and filters by id or description', async () => {
  const { parseSlashQuery, filterSkillItems } = await load(
    'packages/design-system/components/src/SkillPicker.tsx',
  )
  const leading = parseSlashQuery('/fig')
  assert.equal(leading.query, 'fig')
  assert.equal(leading.start, 0)
  const afterSpace = parseSlashQuery('help me /deep')
  assert.equal(afterSpace.query, 'deep')
  assert.equal(afterSpace.start, 8)
  const bare = parseSlashQuery('done /')
  assert.equal(bare.query, '')
  assert.equal(bare.start, 5)
  assert.equal(parseSlashQuery('see notes/todo'), null, 'paths must not open the picker')
  assert.equal(parseSlashQuery('a/b'), null)
  assert.equal(parseSlashQuery('no slash here'), null)
  assert.equal(parseSlashQuery('stale /ok then more'), null, 'only a trailing token counts')

  const items = [
    { id: 'figma-framelink', description: 'Read Figma designs', enabled: true },
    { id: 'deepwiki', description: 'Ask about repositories', enabled: false },
  ]
  assert.equal(filterSkillItems(items, '').length, 2)
  const byId = filterSkillItems(items, 'FIG')
  assert.equal(byId.length, 1)
  assert.equal(byId[0].id, 'figma-framelink')
  const byDesc = filterSkillItems(items, 'repositories')
  assert.equal(byDesc.length, 1)
  assert.equal(byDesc[0].id, 'deepwiki')
  assert.equal(filterSkillItems(items, 'zzz').length, 0)
})

test('Model capabilities centralize known exceptions and explicit overrides', async () => {
  const { modelCapabilities, unsupportedAttachment } = await load(
    'packages/agent-core/src/model-capabilities.ts',
  )
  const image = { id: 'image', path: 'photo.png', mimeType: 'image/png', size: 10 }
  const m2 = { ...model, model: 'MiniMax-M2.7' }
  assert.equal(modelCapabilities(m2).vision, false)
  assert.equal(unsupportedAttachment(m2, [image]).id, 'image')
  assert.equal(unsupportedAttachment({ ...m2, capabilities: { vision: true } }, [image]), undefined)
})

test('Provider rejects unsupported attachments before network and honors tool declarations', async () => {
  let calls = 0,
    body
  const { streamModel } = await load(
    'packages/agent-core/src/providers.ts',
    { './transport': 'export const serviceFetch=globalThis.testFetch' },
    {
      testFetch: async (_url, options) => {
        calls++
        body = JSON.parse(options.body)
        return Response.json({ choices: [{ message: { content: 'ok' } }] })
      },
    },
  )
  const image = {
    id: 'image',
    path: 'photo.png',
    mimeType: 'image/png',
    size: 10,
    dataUrl: 'data:image/png;base64,YQ==',
  }
  const transcript = [{ role: 'user', content: 'inspect', attachmentIds: ['image'] }]
  const signal = new AbortController().signal
  await assert.rejects(
    () =>
      streamModel(
        { ...model, model: 'MiniMax-M2.7' },
        transcript,
        '',
        [],
        new Map([['image', image]]),
        () => {},
        signal,
      ),
    /cannot read attachment/,
  )
  assert.equal(calls, 0)
  await streamModel(
    { ...model, capabilities: { tools: false, streaming: false } },
    [{ role: 'user', content: 'hello' }],
    'system',
    [{ name: 'read', description: 'read', parameters: { type: 'object' } }],
    new Map(),
    () => {},
    signal,
  )
  assert.equal(body.stream, false)
  assert.equal(body.tools, undefined)
  assert.equal(body.stream_options, undefined)
})

test('Permission policy makes assist, full and disabled decisions consistently', async () => {
  const { PermissionPolicy, requirePermission } = await load(
    'packages/agent-core/src/permission-policy.ts',
  )
  const request = { mode: 'assist', capability: 'vault', operation: 'write' }
  assert.equal(PermissionPolicy.evaluate(request), 'ask')
  assert.equal(PermissionPolicy.evaluate({ ...request, mode: 'full' }), 'allow')
  assert.equal(PermissionPolicy.evaluate({ ...request, operation: 'read' }), 'allow')
  assert.equal(PermissionPolicy.evaluate({ ...request, disabled: true }), 'deny')
  let asked = 0
  const approve = async () => {
    asked++
    return true
  }
  const signal = new AbortController().signal
  await requirePermission({ ...request, mode: 'full' }, approve, 'write', 'detail', signal)
  assert.equal(asked, 0)
  await requirePermission(request, approve, 'write', 'detail', signal)
  assert.equal(asked, 1)
  await assert.rejects(
    () => requirePermission({ ...request, disabled: true }, approve, 'write', 'detail', signal),
    /disabled/,
  )
})

test('Vault writes obey the shared permission policy and retain reviewable file changes', async () => {
  const { VaultTools } = await load('packages/integrations/src/tools.ts')
  const root = await mkdtemp(join(tmpdir(), 'catea-policy-'))
  try {
    let approvals = 0
    const approve = async () => {
      approvals++
      return false
    }
    const signal = new AbortController().signal
    const assist = new VaultTools(
      root,
      approve,
      async () => '',
      () => 'assist',
    )
    await assert.rejects(
      () => assist.run('write', { path: 'note.md', content: 'text' }, signal),
      /Permission denied/,
    )
    assert.equal(approvals, 1)
    const changes = []
    const full = new VaultTools(
      root,
      approve,
      async () => '',
      () => 'full',
      (change) => changes.push(change),
    )
    await full.run('write', { path: 'note.md', content: 'text' }, signal)
    await full.run('edit', { path: 'note.md', oldText: 'text', newText: 'updated' }, signal)
    assert.equal(await readFile(join(root, 'note.md'), 'utf8'), 'updated')
    assert.equal(
      JSON.stringify(changes),
      JSON.stringify([
        { filePath: 'note.md', toolType: 'Write', original: null, modified: 'text' },
        { filePath: 'note.md', toolType: 'Edit', original: 'text', modified: 'updated' },
      ]),
    )
    assert.equal(approvals, 1)
    await assert.rejects(
      () => full.run('write', { path: 'raw/source.md', content: 'no' }, signal),
      /raw/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Tool presenters keep known labels and safely show unknown tools', async () => {
  const { createToolPresenters } = await load('apps/obsidian/src/tool-presenters.ts')
  const registry = createToolPresenters()
  const translate = (text) => `translated:${text}`
  assert.equal(
    registry.title({ id: 'a', name: 'web_search', args: {} }, translate),
    'translated:网络搜索',
  )
  const unknown = { id: 'b', name: 'custom_tool', args: {}, result: 'completed' }
  assert.equal(registry.title(unknown, translate), 'custom_tool')
  assert.equal(registry.summary(unknown), 'completed')
  assert.match(registry.details(unknown), /custom_tool/)
})

test('OpenRouter quick configuration selects Free or a model slug and uses the compatible endpoint', async () => {
  const { createOpenRouterModel, isOpenRouterModel } = await load('packages/agent-core/src/byok.ts')
  const free = createOpenRouterModel('free-id', ' test-key ', 'openrouter/free')
  assert.equal(free.model, 'openrouter/free')
  assert.equal(free.baseUrl, 'https://openrouter.ai/api/v1')
  assert.equal(free.apiKey, 'test-key')
  assert.equal(isOpenRouterModel(free), true)
  const custom = createOpenRouterModel('custom-id', 'test-key', 'anthropic/claude-sonnet-4')
  assert.equal(custom.model, 'anthropic/claude-sonnet-4')
  assert.throws(() => createOpenRouterModel('bad', 'test-key', 'free'), /provider\/model/)
  let requested
  const { streamModel } = await load(
    'packages/agent-core/src/providers.ts',
    { './transport': 'export const serviceFetch=globalThis.testFetch' },
    {
      testFetch: async (url, options) => {
        requested = { url, options }
        return Response.json({ choices: [{ message: { content: 'ready' } }] })
      },
    },
  )
  const reply = await streamModel(
    free,
    [{ role: 'user', content: 'hello' }],
    '',
    [],
    new Map(),
    () => {},
    new AbortController().signal,
  )
  assert.equal(reply.text, 'ready')
  assert.equal(requested.url, 'https://openrouter.ai/api/v1/chat/completions')
  assert.equal(requested.options.headers.Authorization, 'Bearer test-key')
  assert.equal(JSON.parse(requested.options.body).model, 'openrouter/free')
})
const stream = (frames) =>
  new Response(
    frames
      .map((frame) => `data: ${typeof frame === 'string' ? frame : JSON.stringify(frame)}\n\n`)
      .join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  )
const parse = async (protocol, response) => {
  const { streamModel } = await load(
    'packages/agent-core/src/providers.ts',
    { './transport': 'export const serviceFetch=globalThis.testFetch' },
    { testFetch: async () => response },
  )
  const deltas = [],
    reasoning = []
  const reply = await streamModel(
    { ...model, protocol },
    [{ role: 'user', content: 'Hello' }],
    '',
    [],
    new Map(),
    (text) => deltas.push(text),
    new AbortController().signal,
    { onReasoning: (text) => reasoning.push(text) },
  )
  return { reply, deltas, reasoning }
}

test('OpenAI SSE joins tool fragments and reports usage', async () => {
  const { reply, deltas } = await parse(
    'openai',
    stream([
      {
        choices: [
          {
            delta: {
              content: 'Hi',
              tool_calls: [
                { index: 0, id: 'call', function: { name: 'read', arguments: '{"path":' } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: { tool_calls: [{ index: 0, function: { arguments: '"note.md"}' } }] },
            finish_reason: 'tool_calls',
          },
        ],
      },
      { choices: [], usage: { prompt_tokens: 20, completion_tokens: 8 } },
      '[DONE]',
    ]),
  )
  assert.equal(deltas.join(''), 'Hi')
  assert.equal(reply.calls[0].name, 'read')
  assert.equal(reply.calls[0].args.path, 'note.md')
  assert.equal(reply.usage.inputTokens, 20)
  assert.equal(reply.usage.outputTokens, 8)
})
test('Anthropic SSE retains signed blocks and complete initial tool input', async () => {
  const { reply, reasoning } = await parse(
    'anthropic',
    stream([
      {
        type: 'message_start',
        message: { usage: { input_tokens: 10, cache_read_input_tokens: 2, output_tokens: 0 } },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'reason' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'signature_delta', signature: 'signed' },
      },
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'call', name: 'read', input: { path: 'note.md' } },
      },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } },
    ]),
  )
  assert.equal(reply.anthropicContent[0].thinking, 'reason')
  assert.equal(reply.anthropicContent[0].signature, 'signed')
  assert.equal(reasoning.join(''), 'reason')
  assert.equal(reply.calls[0].args.path, 'note.md')
  assert.equal(reply.usage.inputTokens, 10)
})
test('usage keeps the four cache buckets orthogonal, as CatUI defines them', async () => {
  const { reply } = await parse(
    'anthropic',
    stream([
      {
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 10,
            cache_read_input_tokens: 200,
            cache_creation_input_tokens: 30,
            output_tokens: 0,
          },
        },
      },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 5 } },
    ]),
  )
  // input_tokens is already the uncached remainder; cache buckets never fold into it.
  assert.equal(reply.usage.inputTokens, 10)
  assert.equal(reply.usage.cachedInputTokens, 200)
  assert.equal(reply.usage.cacheWriteInputTokens, 30)
  assert.equal(reply.usage.outputTokens, 5)
})
test('OpenAI usage nets cached tokens out of input', async () => {
  const { reply } = await parse(
    'openai',
    stream([
      { choices: [{ delta: { content: 'Hi' } }] },
      {
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 8,
          prompt_tokens_details: { cached_tokens: 60 },
          completion_tokens_details: { reasoning_tokens: 4 },
        },
      },
      '[DONE]',
    ]),
  )
  assert.equal(reply.usage.inputTokens, 40)
  assert.equal(reply.usage.cachedInputTokens, 60)
  // reasoning_tokens is a breakdown *inside* completion_tokens, so it is not added:
  // CatUI sums the two and double-counts reasoning here.
  assert.equal(reply.usage.outputTokens, 8)
})
test('OpenAI compatible reasoning streams separately from answer text', async () => {
  const { reply, deltas, reasoning } = await parse(
    'openai',
    stream([
      { choices: [{ delta: { reasoning_content: 'Checking the note.' } }] },
      { choices: [{ delta: { content: 'Here is the answer.' } }] },
      '[DONE]',
    ]),
  )
  assert.equal(reasoning.join(''), 'Checking the note.')
  assert.equal(deltas.join(''), 'Here is the answer.')
  assert.equal(reply.text, 'Here is the answer.')
})
test('Agent stream forwards provider reasoning before the answer', async () => {
  const { providerStream } = await load('packages/agent-core/src/upstream-stream.ts', {
    './providers': 'export class ModelServiceError extends Error { status=0 }',
  })
  const client = {
    async *stream() {
      yield { type: 'reasoning', text: 'Check the note.' }
      yield { type: 'delta', text: 'Done.' }
      yield { type: 'done', reply: { text: 'Done.', calls: [] } }
    },
  }
  const events = []
  const modelInfo = { id: model.model, api: 'openai-completions', provider: 'catea' }
  for await (const event of providerStream(
    model,
    () => new Map(),
    client,
  )(modelInfo, { messages: [], systemPrompt: '', tools: [] }))
    events.push(event)
  assert.equal(events.find((event) => event.type === 'thinking_delta')?.delta, 'Check the note.')
  assert.equal(events.find((event) => event.type === 'text_delta')?.delta, 'Done.')
  assert.equal(
    events
      .find((event) => event.type === 'done')
      ?.message.content.find((block) => block.type === 'thinking')?.thinking,
    'Check the note.',
  )
})
test('Malformed optional JSON fields cannot become executable tool arguments', async () => {
  const { reply } = await parse(
    'anthropic',
    Response.json({
      content: [null, { type: 'tool_use', id: 'x', name: 'read', input: ['bad'] }],
      usage: null,
    }),
  )
  assert.equal(reply.calls.length, 1)
  assert.equal(JSON.stringify(reply.calls[0].args), '{}')
  const { reply: openai } = await parse(
    'openai',
    Response.json({
      choices: [{ message: { content: { unexpected: true }, tool_calls: { unexpected: true } } }],
    }),
  )
  assert.equal(openai.text, '')
  assert.equal(openai.calls.length, 0)
})
test('Provider errors never disclose response bodies', async () => {
  await assert.rejects(
    () => parse('openai', new Response('private note and secret key', { status: 503 })),
    (error) => {
      assert.equal(error.message.includes('private note'), false)
      assert.equal(error.message.includes('secret key'), false)
      return true
    },
  )
})
test('Buffered OpenAI and Anthropic responses preserve tool calls', async () => {
  const { reply } = await parse(
    'openai',
    Response.json({
      choices: [
        {
          finish_reason: 'length',
          message: {
            content: 'result',
            tool_calls: [{ id: 'c', function: { name: 'read', arguments: '{"path":"a.md"}' } }],
          },
        },
      ],
    }),
  )
  assert.equal(reply.text, 'result')
  assert.equal(reply.calls[0].args.path, 'a.md')
  assert.equal(reply.stopReason, 'length')
  const { reply: anthropic } = await parse(
    'anthropic',
    Response.json({
      content: [
        { type: 'text', text: 'done' },
        { type: 'tool_use', id: 'b', name: 'read', input: { path: 'b.md' } },
      ],
      usage: { input_tokens: 3, output_tokens: 4 },
    }),
  )
  assert.equal(anthropic.text, 'done')
  assert.equal(anthropic.calls[0].args.path, 'b.md')
})
test('Context history and notes remain usable across a saved handoff', async () => {
  const { WorkingContext } = await load('packages/agent-core/src/context.ts', {
    './providers':
      'export const streamModel=()=>{};export class ModelServiceError extends Error {}',
  })
  const transcript = []
  for (let i = 0; i < 16; i++) {
    transcript.push({ role: 'user', content: `Old request ${i} ` + 'a'.repeat(2000) })
    transcript.push({ role: 'assistant', content: 'b'.repeat(2000) })
  }
  transcript.push({ role: 'user', content: 'Continue the current task' })
  const session = { id: 'fixture-session', transcript, messages: [] }
  let saved = 0
  const context = new WorkingContext(session, 4096, 0, async () => {
    saved++
  })
  const signal = new AbortController().signal
  await context.run(
    'working_notes',
    { action: 'write', name: 'plan', content: 'Keep the original constraints' },
    signal,
  )
  assert.match(
    await context.run('working_notes', { action: 'read', name: 'plan' }, signal),
    /original constraints/,
  )
  const count = session.journal.length
  await context.run(
    'new_context',
    { handoff: 'Continue the current task; old requests are complete.' },
    signal,
  )
  const prepared = await context.prepare(context.messages(), 'system', [])
  assert.ok(saved > 0)
  assert.ok(session.journal.length >= count)
  assert.ok(session.journal.some((entry) => entry.type === 'compaction'))
  assert.ok(
    prepared.some((message) => String(message.content).includes('Continue the current task')),
  )
  assert.match(
    await context.run('session_history', { action: 'search', query: 'Old request 0' }, signal),
    /Old request 0/,
  )
})
const hostMock = `
 export class PluginSettingTab {constructor(app,plugin){this.app=app;this.plugin=plugin;this.containerEl={empty(){},createDiv(){return {}}}}}
 export class Setting {constructor(){} setName(){return this} setDesc(){return this} setHeading(){return this}}
 export class Modal {} export class App {} export class Notice {}
`
async function settingsFixture() {
  const { CateaSettings } = await load('apps/obsidian/src/settings.ts', {
    obsidian: hostMock,
    '../../../packages/integrations/src/skills': 'export const listSkills=async()=>[]',
  })
  let saves = 0,
    stops = 0,
    refreshes = 0
  const secrets = []
  const plugin = {
    app: {},
    settings: { enabled: true },
    t: (text) => text,
    vaultPath: '/unused',
    saveSecret(id, value) {
      secrets.push([id, value])
    },
    agentSettings: {
      language: 'zh',
      enabled: true,
      web: true,
      memory: true,
      shell: true,
      models: [],
      skills: [],
      mcp: [],
      modelId: '',
    },
    agent: { memory: { setEnabled() {} } },
    stopAgents() {
      stops++
    },
    async saveAgentSettings() {
      saves++
    },
    refreshPaperLanguage() {},
    refreshThumbnails() {},
    async saveData() {},
    apply() {},
  }
  const tab = new CateaSettings(plugin.app, plugin)
  return {
    tab,
    plugin,
    secrets: () => secrets,
    stats: () => ({ saves, stops, refreshes }),
    enableModern: () => {
      tab.update = () => {
        refreshes++
      }
    },
  }
}
function rows(tab) {
  return tab.getSettingDefinitions().flatMap((group) => group.items)
}
test('Settings definitions expose searchable names and persist toggles', async () => {
  const { tab, plugin, stats } = await settingsFixture()
  const row = rows(tab).find((item) => item.name === '网络搜索与网页读取')
  assert.ok(row)
  let change
  row.render({
    addToggle(fn) {
      fn({
        setValue() {
          return this
        },
        onChange(fn) {
          change = fn
          return this
        },
      })
      return this
    },
  })
  await change(false)
  assert.equal(plugin.agentSettings.web, false)
  assert.equal(stats().saves, 1)
  assert.equal(stats().stops, 1)
})
test('Settings offer a dedicated OpenRouter quick entry alongside advanced models', async () => {
  const { tab } = await settingsFixture()
  const names = rows(tab).map((item) => item.name)
  assert.ok(names.includes('添加 OpenRouter'))
  assert.ok(names.includes('添加其他模型'))
})
test('Settings refresh uses the modern API when present and keeps a legacy fallback', async () => {
  const fixture = await settingsFixture()
  fixture.enableModern()
  fixture.tab.refresh()
  assert.equal(fixture.stats().refreshes, 1)
  delete fixture.tab.update
  let rendered = 0
  fixture.tab.renderLegacy = () => {
    rendered++
  }
  fixture.tab.refresh()
  assert.equal(rendered, 1)
})
test('Settings search metadata never contains API keys or MCP tokens', async () => {
  const { tab, plugin } = await settingsFixture()
  plugin.agentSettings.models = [{ ...model, apiKey: 'SECRET_MODEL_KEY' }]
  plugin.agentSettings.mcp = [
    {
      id: 'server',
      transport: 'http',
      enabled: true,
      url: 'https://example.invalid',
      token: 'SECRET_MCP_TOKEN',
    },
  ]
  const metadata = JSON.stringify(tab.getSettingDefinitions())
  assert.equal(metadata.includes('SECRET_MODEL_KEY'), false)
  assert.equal(metadata.includes('SECRET_MCP_TOKEN'), false)
})

test('MCP preset registry is credential-free and factories copy preset data', async () => {
  const { mcpPresets, createPresetServer, matchPreset, injectSecretEnv } = await load(
    'packages/integrations/src/mcp-presets.ts',
  )
  const ids = mcpPresets.map((preset) => preset.id)
  // Cross-realm array: compare by value, deepStrictEqual would check prototypes.
  assert.equal(ids.join(','), 'figma-framelink,github,context7,deepwiki')
  for (const preset of mcpPresets) {
    if (preset.transport === 'http') {
      assert.ok(preset.url.startsWith('https://'), preset.id)
      assert.equal(preset.command, undefined)
      assert.equal(preset.envSecret, undefined)
    } else {
      assert.equal(preset.command, 'npx')
      assert.ok(preset.args.includes('figma-developer-mcp'))
      assert.equal(preset.envSecret, 'FIGMA_API_KEY')
      assert.equal(preset.needsNode, true)
    }
  }
  const serialized = JSON.stringify(mcpPresets)
  assert.equal(serialized.includes('"token"'), false)
  assert.equal(serialized.includes('"env"'), false)

  const figma = mcpPresets.find((preset) => preset.id === 'figma-framelink')
  const server = createPresetServer(figma)
  assert.equal(server.enabled, false)
  assert.ok(server.id !== createPresetServer(figma).id)
  assert.equal('token' in server, false)
  assert.equal(server.env, undefined)
  assert.deepEqual(server.args, figma.args)
  assert.notEqual(server.args, figma.args, 'args must be copied, never aliased')

  const github = mcpPresets.find((preset) => preset.id === 'github')
  const remote = createPresetServer(github)
  assert.equal(remote.url, 'https://api.githubcopilot.com/mcp/')
  assert.equal('envSecret' in remote, false)
  assert.equal(matchPreset(remote)?.id, 'github')
  assert.equal(matchPreset(server)?.id, 'figma-framelink')
  assert.equal(matchPreset({ ...server, args: [...server.args, '--extra'] }), undefined)
  assert.equal(matchPreset({ ...remote, url: 'https://example.invalid/mcp' }), undefined)

  injectSecretEnv(remote)
  assert.equal(remote.env, undefined, 'http servers must not materialize env')
  server.token = 'FIGMA_PAT'
  injectSecretEnv(server)
  assert.equal(server.env.FIGMA_API_KEY, 'FIGMA_PAT')
  server.env = { ...server.env, KEEP: '1' }
  server.token = ''
  injectSecretEnv(server)
  assert.equal(server.env.FIGMA_API_KEY, undefined)
  assert.equal(server.env.KEEP, '1')
})

test('MCP preset rows add a disabled server, route the key into env and clear secrets on removal', async () => {
  const fixture = await settingsFixture()
  fixture.enableModern()
  const { tab, plugin, secrets } = fixture
  const names = rows(tab).map((item) => item.name)
  for (const label of ['Figma · Framelink', 'GitHub', 'Context7', 'DeepWiki'])
    assert.ok(names.includes(label), `preset row missing: ${label}`)

  const button = (row) => {
    let click,
      disabled = false,
      label = ''
    row.render({
      addButton(fn) {
        fn({
          setButtonText(text) {
            label = text
            return this
          },
          setCta() {
            return this
          },
          setDisabled(value) {
            disabled = value
            return this
          },
          onClick(handler) {
            click = handler
            return this
          },
        })
        return this
      },
    })
    return {
      click: async () => click && click(),
      disabled: () => disabled,
      label: () => label,
    }
  }
  const rowsNamed = (name) => rows(tab).filter((item) => item.name === name)

  // Server rows render before preset rows, so the quick-add row is the last match.
  const add = button(rowsNamed('Figma · Framelink').at(-1))
  assert.equal(add.label(), '添加')
  await add.click()
  assert.equal(plugin.agentSettings.mcp.length, 1)
  const server = plugin.agentSettings.mcp[0]
  assert.equal(server.enabled, false)
  assert.equal(server.transport, 'stdio')
  assert.equal(server.command, 'npx')
  assert.equal(server.envSecret, 'FIGMA_API_KEY')
  assert.equal('token' in server, false)
  assert.ok(rowsNamed('Figma · Framelink').length >= 2, 'server row uses the friendly label')

  const dup = button(rowsNamed('Figma · Framelink').at(-1))
  assert.equal(dup.disabled(), true)
  assert.equal(dup.label(), '已添加')

  const tokenRow = rows(tab).find((item) => item.name === 'FIGMA_API_KEY')
  assert.ok(tokenRow, 'stdio preset must expose a key row named after its env variable')
  let change
  tokenRow.render({
    addText(fn) {
      fn({
        inputEl: {},
        setValue() {
          return this
        },
        onChange(handler) {
          change = handler
          return this
        },
      })
      return this
    },
  })
  change('FIGMA_PAT_VALUE')
  assert.equal(server.token, 'FIGMA_PAT_VALUE')
  assert.equal(server.env.FIGMA_API_KEY, 'FIGMA_PAT_VALUE')
  assert.deepEqual(secrets().at(-1), [`mcp-${server.id}`, 'FIGMA_PAT_VALUE'])
  assert.equal(JSON.stringify(tab.getSettingDefinitions()).includes('FIGMA_PAT_VALUE'), false)

  const remove = button(rowsNamed('移除 MCP').at(-1))
  await remove.click()
  assert.equal(plugin.agentSettings.mcp.length, 0)
  assert.deepEqual(secrets().at(-1), [`mcp-${server.id}`, ''])
})

test('Certificate fallback lazily loads the host transport without relaxing TLS', async () => {
  let called = false
  const { serviceFetch } = await load(
    'packages/agent-core/src/transport.ts',
    {
      'node:https': `export const request=()=>({on(name,fn){if(name==='error')Promise.resolve().then(()=>fn(Object.assign(new Error('chain'),{code:'SELF_SIGNED_CERT_IN_CHAIN'})));return this},setTimeout(){},write(){},end(){}})`,
      electron: 'export const net={fetch:globalThis.hostFetch}',
      '@electron/remote': 'export const net=undefined',
      obsidian: `export const requestUrl=()=>{throw new Error('Unexpected buffered fallback')}`,
    },
    {
      hostFetch: async (input, options) => {
        called = true
        assert.equal(options.redirect, 'error')
        assert.equal(options.rejectUnauthorized, undefined)
        return new Response('host stream')
      },
    },
  )
  const response = await serviceFetch('https://example.invalid', { method: 'POST', body: '{}' })
  assert.equal(called, true)
  assert.equal(await response.text(), 'host stream')
})
test('Plugin and bundled design-system styles avoid the reported CSS patterns', async () => {
  const { readFile, readdir } = await import('node:fs/promises')
  const { default: postcss } = await import('postcss')
  const dir = 'packages/design-system/components/src'
  const files = [
    'apps/obsidian/paper.css',
    ...(await readdir(dir)).filter((name) => name.endsWith('.css')).map((name) => `${dir}/${name}`),
  ]
  for (const file of files) {
    const root = postcss.parse(await readFile(file, 'utf8'))
    root.walkDecls((decl) => assert.equal(!!decl.important, false, `${file}: ${decl.prop}`))
    root.walkRules((rule) =>
      assert.equal(rule.selector.includes(':has('), false, `${file}: ${rule.selector}`),
    )
  }
})

test('Git history is local, paged and scoped to nested vaults, including worktrees and merges', async () => {
  const { execFileSync } = await import('node:child_process')
  const { mkdir, writeFile } = await import('node:fs/promises')
  const root = await mkdtemp(join(tmpdir(), 'catea-git-history-'))
  const run = (cwd, ...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  const { readGitHistory, readGitCommit } = await load('apps/obsidian/src/git-history.ts')
  try {
    await assert.rejects(readGitHistory(root), /not-repository/)
    run(root, 'init', '-b', 'main')
    run(root, 'config', 'user.name', 'Fixture')
    run(root, 'config', 'user.email', 'fixture@example.invalid')
    assert.equal((await readGitHistory(root)).entries.length, 0)
    const vault = join(root, 'notes')
    await mkdir(vault)
    await writeFile(join(vault, 'first.md'), 'first\n')
    run(root, 'add', 'notes')
    run(root, 'commit', '-m', '第一条, with tabs\tand commas')
    await writeFile(join(root, 'outside.md'), 'outside\n')
    run(root, 'add', 'outside.md')
    run(root, 'commit', '-m', 'Outside vault')
    run(root, 'checkout', '-b', 'branch')
    await writeFile(join(vault, 'branch.md'), 'branch\n')
    run(root, 'add', 'notes')
    run(root, 'commit', '-m', 'Branch note')
    run(root, 'checkout', 'main')
    await writeFile(join(vault, 'main.md'), 'main\n')
    run(root, 'add', 'notes')
    run(root, 'commit', '-m', 'Main note')
    run(root, 'merge', '--no-ff', 'branch', '-m', 'Merge notes')
    const before = run(root, 'status', '--porcelain=v1')
    const history = await readGitHistory(vault, 100)
    assert.equal(history.branch, 'main')
    assert(history.entries.some((e) => e.parents.length === 2))
    assert(!history.entries.some((e) => e.message === 'Outside vault'))
    assert(history.entries.some((e) => e.message.includes('第一条, with tabs\tand commas')))
    const page = await readGitHistory(vault, 2)
    assert.equal(page.entries.length, 2)
    assert.equal(page.hasMore, true)
    const outside = run(root, 'rev-list', '--all', '--', 'outside.md')
    const detail = await readGitCommit(vault, outside)
    assert(!detail.includes('outside.md'))
    await assert.rejects(readGitCommit(vault, '--output=bad'), /git-failed/)
    const worktree = join(root, 'linked')
    run(root, 'worktree', 'add', '--detach', worktree, 'HEAD')
    assert((await readGitHistory(join(worktree, 'notes'))).entries.length > 0)
    assert.equal(run(root, 'status', '--porcelain=v1'), before + '?? linked/')
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(readGitHistory(vault, 100, controller.signal))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Git history is disabled by default and settings open or detach the sidebar explicitly', async () => {
  const { tab, plugin } = await settingsFixture()
  let current, change
  const opened = []
  plugin.syncGitHistory = async (reveal) => opened.push(reveal)
  const render = () =>
    rows(tab)
      .find((item) => item.name === 'Git 历史')
      .render({
        addToggle(fn) {
          fn({
            setValue(value) {
              current = value
              return this
            },
            onChange(fn) {
              change = fn
              return this
            },
          })
          return this
        },
      })
  render()
  assert.equal(current, false)
  await change(true)
  assert.equal(plugin.agentSettings.gitHistory, true)
  assert.deepEqual(opened, [true])
  await change(false)
  assert.equal(plugin.agentSettings.gitHistory, false)
  assert.deepEqual(opened, [true, false])
})

test('A provider-aborted stream retries once without repeating completed tools', async () => {
  let recoveryAction = ''
  const { Agent } = await load(
    'packages/agent-core/src/index.ts',
    {
      './transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../agent-core/src/transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../integrations/src/mcp': 'export class McpPool {async connect(){return []}}',
      '../../integrations/src/skills':
        'export const loadSkills=async()=>[];export const readSkillResource=()=>{};export const listSkills=async()=>[]',
      '../upstream/loop/agent-loop': `export const agentLoop=async function*(_prompts,_context,options){
      const failed={role:'assistant',content:[{type:'text',text:''}],stopReason:'error',errorMessage:'aborted',timestamp:Date.now()};
      yield {type:'message_end',message:failed};
      const recovery=await options.recoverModelError({message:failed,messages:[failed],errorSubtype:'model_error',attempt:1});
      globalThis.recordRecovery(recovery.action);
      if(recovery.action==='retry'){
        const answer={role:'assistant',content:[{type:'text',text:'Finished after retry.'}],stopReason:'stop',timestamp:Date.now()};
        yield {type:'message_update',message:answer};yield {type:'message_end',message:answer};
      }
      yield {type:'agent_end'};
    }`,
    },
    {
      structuredClone,
      TransformStream,
      recordRecovery: (action) => {
        recoveryAction = action
      },
    },
  )
  const config = {
    enabled: true,
    models: [model],
    modelId: model.id,
    personaId: 'aria',
    skills: [],
    mcp: [],
    memory: false,
    web: false,
    shell: false,
  }
  const agent = new Agent(
    '/unused',
    () => config,
    { change: () => {}, notice: () => {}, approve: async () => true, ask: async () => ({}) },
    {
      conversations: { save: async () => {}, list: async () => [], load: async () => undefined },
      memory: { close: () => {} },
      modelClient: {},
    },
  )
  await agent.send('Continue the task', '')
  assert.equal(recoveryAction, 'retry')
  assert.equal(agent.session.messages[1].status, 'complete')
  assert.equal(agent.session.messages[1].text, 'Finished after retry.')
  assert.equal(agent.session.messages[1].error, undefined)
})

test('Per-message skill tags override the enabled set for exactly one turn', async () => {
  const loadSkillsCalls = []
  const { Agent } = await load(
    'packages/agent-core/src/index.ts',
    {
      './transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../agent-core/src/transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../integrations/src/mcp': 'export class McpPool {async connect(){return []}}',
      '../../integrations/src/skills':
        'export const loadSkills=async(_vault,enabled)=>{globalThis.recordSkills(enabled.slice());return []};export const readSkillResource=()=>{};export const listSkills=async()=>["alpha","beta"]',
      '../upstream/loop/agent-loop': `export const agentLoop=async function*(){
        const answer={role:'assistant',content:[{type:'text',text:'ok'}],stopReason:'stop',timestamp:Date.now()};
        yield {type:'message_update',message:answer};yield {type:'message_end',message:answer};
        yield {type:'agent_end'};
      }`,
    },
    {
      structuredClone,
      TransformStream,
      recordSkills: (ids) => loadSkillsCalls.push(ids.join(',')),
    },
  )
  const config = {
    enabled: true,
    models: [model],
    modelId: model.id,
    personaId: 'aria',
    skills: ['alpha'],
    mcp: [],
    memory: false,
    web: false,
    shell: false,
  }
  const agent = new Agent(
    '/unused',
    () => config,
    { change: () => {}, notice: () => {}, approve: async () => true, ask: async () => ({}) },
    {
      conversations: { save: async () => {}, list: async () => [], load: async () => undefined },
      memory: { close: () => {} },
      modelClient: {},
    },
  )
  await agent.send('tagged turn', '', [], ['beta'])
  await agent.send('plain turn', '')
  assert.equal(loadSkillsCalls[0], 'beta', 'tags must replace the enabled set for that turn')
  assert.equal(loadSkillsCalls[1], 'alpha', 'the next untagged turn falls back to settings')

  const installed = await agent.installedSkills()
  assert.equal(installed.length, 2)
  assert.equal(installed[0].id, 'alpha')
  assert.equal(installed[0].description, 'alpha', 'missing SKILL.md falls back to the id')
})

test('Branching retains only attachments referenced before the branch point', async () => {
  const { Agent } = await load(
    'packages/agent-core/src/index.ts',
    {
      './transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../agent-core/src/transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../integrations/src/mcp': 'export class McpPool {async connect(){return []}}',
      '../../integrations/src/skills':
        'export const loadSkills=async()=>[];export const readSkillResource=()=>{};export const listSkills=async()=>[]',
      '../upstream/loop/agent-loop': 'export const agentLoop=async function*(){}',
    },
    { structuredClone, TransformStream },
  )
  const config = {
    enabled: true,
    models: [model],
    modelId: model.id,
    personaId: 'aria',
    skills: [],
    mcp: [],
    memory: false,
    web: false,
    shell: false,
  }
  const saved = []
  const agent = new Agent(
    '/unused',
    () => config,
    { change: () => {}, notice: () => {}, approve: async () => true, ask: async () => ({}) },
    {
      conversations: {
        save: async (session) => saved.push(structuredClone(session)),
        list: async () => [],
        load: async () => undefined,
      },
      memory: { close: () => {} },
      modelClient: {},
    },
  )
  const attachment = (id) => ({ id, path: `${id}.md`, size: 1, mimeType: 'text/markdown' })
  agent.session = {
    id: 'source',
    title: 'Source',
    personaId: 'aria',
    updated: 1,
    attachments: [attachment('before'), attachment('target'), attachment('future')],
    messages: [
      {
        id: 'u1',
        role: 'user',
        text: 'before',
        attachmentIds: ['before'],
        tools: [],
        status: 'complete',
      },
      { id: 'a1', role: 'assistant', text: 'done', tools: [], status: 'complete' },
      {
        id: 'u2',
        role: 'user',
        text: 'branch here',
        attachmentIds: ['target'],
        tools: [],
        status: 'complete',
      },
      { id: 'a2', role: 'assistant', text: 'future', tools: [], status: 'complete' },
      {
        id: 'u3',
        role: 'user',
        text: 'later',
        attachmentIds: ['future'],
        tools: [],
        status: 'complete',
      },
    ],
    transcript: [
      { role: 'user', content: 'before', attachmentIds: ['before'] },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'branch here', attachmentIds: ['target'] },
      { role: 'assistant', content: 'future' },
      { role: 'user', content: 'later', attachmentIds: ['future'] },
    ],
  }
  const result = await agent.branchAt('u2')
  const branch = saved.at(-1)
  assert.deepEqual(
    branch.attachments.map((file) => file.id),
    ['before'],
  )
  assert.deepEqual(
    result.attachments.map((file) => file.id),
    ['target'],
  )
  assert.equal(
    branch.messages.some((message) => message.id === 'u2'),
    false,
  )
})

test('Thinking steps stay in event order around tool calls and persist separately', async () => {
  const { Agent } = await load(
    'packages/agent-core/src/index.ts',
    {
      './transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../agent-core/src/transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../integrations/src/mcp': 'export class McpPool {async connect(){return []}}',
      '../../integrations/src/skills':
        'export const loadSkills=async()=>[];export const readSkillResource=()=>{};export const listSkills=async()=>[]',
      '../upstream/loop/agent-loop': `export const agentLoop=async function*(){
      const first={role:'assistant',content:[{type:'thinking',thinking:'Find the note.'}],stopReason:'toolUse',timestamp:Date.now()};
      yield {type:'message_update',message:first};yield {type:'message_end',message:first};
      yield {type:'tool_execution_start',toolCallId:'read-1',toolName:'read',args:{path:'note.md'}};
      yield {type:'tool_execution_end',toolCallId:'read-1',isError:false,result:{content:[{text:'Found it'}]}};
      const second={role:'assistant',content:[{type:'thinking',thinking:'Summarize the note.'},{type:'text',text:'Done.'}],stopReason:'stop',timestamp:Date.now()};
      yield {type:'message_update',message:second};yield {type:'message_end',message:second};yield {type:'agent_end'};
    }`,
    },
    { structuredClone, TransformStream },
  )
  const config = {
    enabled: true,
    models: [model],
    modelId: model.id,
    personaId: 'aria',
    skills: [],
    mcp: [],
    memory: false,
    web: false,
    shell: false,
  }
  let persisted
  const agent = new Agent(
    '/unused',
    () => config,
    { change: () => {}, notice: () => {}, approve: async () => true, ask: async () => ({}) },
    {
      conversations: {
        save: async (session) => {
          persisted = structuredClone(session)
        },
        list: async () => [],
        load: async () => undefined,
      },
      memory: { close: () => {} },
      modelClient: {},
    },
  )
  await agent.send('Read the note', '')
  const activities = agent.session.messages[1].activities
  assert.equal(activities.map((item) => item.type).join(','), 'thinking,tool,thinking')
  assert.equal(
    activities
      .filter((item) => item.type === 'thinking')
      .map((item) => item.content)
      .join('|'),
    'Find the note.|Summarize the note.',
  )
  assert.equal(activities[1].toolId, 'read-1')
  assert.equal(JSON.stringify(persisted.messages[1].activities), JSON.stringify(activities))
})

test('Themes follow each window system preference, honor overrides and clean up listeners', async () => {
  const { ThemeController } = await load('apps/obsidian/src/theme.ts')
  const fixture = (matches, previous) => {
    const listeners = new Set()
    const media = {
      matches,
      addEventListener(_name, fn) {
        listeners.add(fn)
      },
      removeEventListener(_name, fn) {
        listeners.delete(fn)
      },
    }
    const doc = {
      body: { dataset: previous ? { cateaTheme: previous } : {} },
      defaultView: { matchMedia: () => media },
    }
    return {
      doc,
      listeners,
      change(value) {
        media.matches = value
        for (const fn of listeners) fn()
      },
    }
  }
  const light = fixture(false),
    dark = fixture(true, 'light'),
    controller = new ThemeController()
  controller.attach(light.doc)
  controller.attach(dark.doc)
  controller.attach(light.doc)
  assert.equal(light.listeners.size, 1)
  assert.equal(light.doc.body.dataset.cateaTheme, 'light')
  assert.equal(dark.doc.body.dataset.cateaTheme, 'dark')
  controller.setMode('light')
  dark.change(false)
  dark.change(true)
  assert.equal(dark.doc.body.dataset.cateaTheme, 'light')
  controller.setMode('dark')
  light.change(false)
  assert.equal(light.doc.body.dataset.cateaTheme, 'dark')
  controller.setMode('system')
  light.change(true)
  assert.equal(light.doc.body.dataset.cateaTheme, 'dark')
  controller.setMode('invalid')
  light.change(false)
  assert.equal(light.doc.body.dataset.cateaTheme, 'light')
  controller.dispose()
  assert.equal(light.listeners.size, 0)
  assert.equal(dark.listeners.size, 0)
  assert.equal(light.doc.body.dataset.cateaTheme, undefined)
  assert.equal(dark.doc.body.dataset.cateaTheme, 'light')
})
test('Theme setting offers three modes, defaults to system and persists each choice', async () => {
  const { tab, plugin, stats } = await settingsFixture()
  const row = rows(tab).find((item) => item.name === '主题')
  const options = []
  let initial,
    change,
    applied = 0
  plugin.applyTheme = () => applied++
  row.render({
    addDropdown(fn) {
      fn({
        addOption(value) {
          options.push(value)
          return this
        },
        setValue(value) {
          initial = value
          return this
        },
        onChange(fn) {
          change = fn
          return this
        },
      })
    },
  })
  assert.deepEqual(options, ['light', 'dark', 'system'])
  assert.equal(initial, 'system')
  for (const mode of options) {
    await change(mode)
    assert.equal(plugin.agentSettings.theme, mode)
  }
  assert.equal(applied, 3)
  assert.equal(stats().saves, 3)
})

async function updateFixture(preferences = {}, releaseChanges = {}, manifestChanges = {}) {
  let requests = 0,
    saves = 0,
    changes = 0,
    fail = false,
    gate
  const release = {
    tag_name: '0.10.0',
    draft: false,
    prerelease: false,
    assets: ['main.js', 'styles.css', 'manifest.json'].map((name) => ({
      name,
      state: 'uploaded',
      size: 100,
    })),
    ...releaseChanges,
  }
  const manifest = {
    id: 'catea-paper',
    version: '0.10.0',
    minAppVersion: '1.8.0',
    ...manifestChanges,
  }
  const { UpdateChecker } = await load(
    'apps/obsidian/src/updates.ts',
    {
      obsidian:
        'export const requestUrl=globalThis.updateRequest;export const requireApiVersion=globalThis.compatible',
    },
    {
      compatible: (value) => value === '1.8.0',
      updateRequest: async (options) => {
        requests++
        assert.equal(options.headers.Authorization, undefined)
        if (gate) await gate
        if (fail) throw new Error('offline')
        const isRelease =
          options.url ===
          'https://api.github.com/repos/cunyu6666/catea-obsidian-plugin/releases/latest'
        if (!isRelease)
          assert.equal(
            options.url,
            `https://github.com/cunyu6666/catea-obsidian-plugin/releases/download/${release.tag_name}/manifest.json`,
          )
        return { status: 200, text: JSON.stringify(isRelease ? release : manifest) }
      },
    },
  )
  const checker = new UpdateChecker(
    preferences,
    '0.9.0',
    'catea-paper',
    async () => {
      saves++
    },
    () => {
      changes++
    },
  )
  return {
    checker,
    preferences,
    release,
    manifest,
    stats: () => ({ requests, saves, changes }),
    offline: () => {
      fail = true
    },
    block: () => {
      let unblock
      gate = new Promise((resolve) => {
        unblock = resolve
      })
      return unblock
    },
  }
}
test('Updates compare numeric versions, cache across reloads, and dismiss only the selected version', async () => {
  const f = await updateFixture()
  assert.equal(await f.checker.check(), 'available')
  assert.equal(f.checker.bannerVersion, '0.10.0')
  await f.checker.check()
  assert.equal(f.stats().requests, 2)
  await f.checker.dismiss()
  assert.equal(f.checker.bannerVersion, undefined)
  assert.equal(f.checker.available, '0.10.0')
  const reloaded = await updateFixture(f.preferences)
  await reloaded.checker.check()
  assert.equal(reloaded.stats().requests, 0)
  assert.equal(reloaded.checker.bannerVersion, undefined)
  f.release.tag_name = '0.11.0'
  f.manifest.version = '0.11.0'
  f.preferences.updateLastChecked = Date.now() - 25 * 60 * 60 * 1000
  await f.checker.check()
  assert.equal(f.checker.bannerVersion, '0.11.0')
})
test('Updates reject prereleases, incomplete assets, mismatched manifests and incompatible hosts', async () => {
  for (const [release, manifest, expected] of [
    [{ prerelease: true }, {}, 'failed'],
    [{ draft: true }, {}, 'failed'],
    [{ tag_name: 'v0.10.0' }, {}, 'failed'],
    [{ assets: [] }, {}, 'failed'],
    [{}, { id: 'other-plugin' }, 'failed'],
    [{}, { version: '0.11.0' }, 'failed'],
    [{}, { minAppVersion: '99.0.0' }, 'current'],
    [{ tag_name: '0.8.0' }, {}, 'current'],
    [{ tag_name: '0.9.0' }, {}, 'current'],
  ]) {
    const f = await updateFixture({}, release, manifest)
    assert.equal(await f.checker.check(), expected)
    assert.equal(f.checker.bannerVersion, undefined)
  }
})
test('Disabled update checks make no requests; manual checks remain available', async () => {
  const f = await updateFixture({ autoCheckUpdates: false })
  assert.equal(await f.checker.check(), 'disabled')
  assert.equal(f.stats().requests, 0)
  assert.equal(await f.checker.check(true), 'available')
  assert.equal(f.checker.available, '0.10.0')
  assert.equal(f.checker.bannerVersion, undefined)
  await f.checker.setEnabled(true)
  assert.equal(f.checker.bannerVersion, '0.10.0')
})
test('Offline update checks retain verified metadata, throttle retries, and deduplicate concurrent requests', async () => {
  const f = await updateFixture()
  const first = f.checker.check(),
    second = f.checker.check()
  assert.equal(first, second)
  await first
  assert.equal(f.stats().requests, 2)
  f.offline()
  assert.equal(await f.checker.check(true), 'failed')
  assert.equal(f.checker.bannerVersion, '0.10.0')
  await f.checker.check()
  assert.equal(f.stats().requests, 3)
})
test('Disabling or unloading while checking prevents late results from publishing', async () => {
  for (const dispose of [true, false]) {
    const f = await updateFixture(),
      unblock = f.block(),
      pending = f.checker.check()
    if (dispose) f.checker.dispose()
    else await f.checker.setEnabled(false)
    const saves = f.stats().saves,
      changes = f.stats().changes
    unblock()
    assert.equal(await pending, 'disabled')
    assert.equal(f.checker.available, undefined)
    assert.equal(f.stats().saves, saves)
    assert.equal(f.stats().changes, changes)
  }
})

test('Background memory diagnostics never use conversation notices', async () => {
  const warnings = []
  const notices = []
  const { createAgentFactory } = await load(
    'apps/obsidian/src/composition.ts',
    {
      '../../../packages/agent-core/src':
        'export class Agent { constructor(_vault, _settings, hooks, ports) { this.hooks = hooks; this.memory = ports.memory } }',
      '../../../packages/agent-core/src/model-client': 'export class DirectModelClient {}',
      '../../../packages/integrations/src/conversation-store':
        'export class VaultConversationStore {}',
      '../../../packages/memory/src':
        'export class MemoryService { constructor(_vault, _model, report) { this.report = report } }',
    },
    { console: { warn: (...args) => warnings.push(args) } },
  )
  const create = createAgentFactory('/unused', () => ({ models: [] }))
  const agent = create({ notice: (text) => notices.push(text) })
  for (const error of ['recall failed', 'extraction retry pending', 'queue unavailable'])
    agent.memory.report(error)
  assert.equal(warnings.length, 3)
  assert.equal(notices.length, 0)
})
