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
  assert.equal(request.maxTokens, 2048)
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

test('Title generation tolerates fenced JSON and never uses reasoning as a title', async () => {
  const { generateConversationTitle } = await load('packages/agent-core/src/conversation-title.ts')
  const client = {
    async *stream(request, signal) {
      assert.ok(request.maxTokens >= 2048, 'reserve tokens for reasoning before the answer')
      assert.equal(signal.aborted, false)
      yield { type: 'reasoning', text: 'Private reasoning is not the conversation title.' }
      yield { type: 'delta', text: '```json\n{"title":"修复会话标题"}\n```' }
      yield { type: 'done', reply: { text: '', calls: [] } }
    },
  }
  assert.equal(
    await generateConversationTitle(
      client,
      model,
      'question',
      'answer',
      new AbortController().signal,
    ),
    '修复会话标题',
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

test('Vendor presets resolve to their documented endpoints and only need an API key', async () => {
  const { vendorPresets, createVendorModel, matchVendorPreset } = await load(
    'packages/agent-core/src/vendor-presets.ts',
  )
  const ids = vendorPresets.map((preset) => preset.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(ids.length, 21)
  for (const preset of vendorPresets) {
    assert.ok(preset.baseUrl.startsWith('https://'), preset.id)
    assert.equal(preset.baseUrl.includes('?'), false, `${preset.id} baseUrl carries a query`)
    assert.equal(preset.keyUrl.includes('aff='), false, `${preset.id} keyUrl keeps an affiliate`)
    assert.equal(preset.keyUrl.includes('utm_'), false, `${preset.id} keyUrl keeps a utm tag`)
    assert.equal(preset.keyUrl.includes('?ic='), false, `${preset.id} keyUrl keeps an invite code`)
    assert.ok(
      preset.contextWindow >= 4096 && preset.contextWindow <= 2000000,
      `${preset.id} contextWindow out of range`,
    )
  }

  const deepseek = vendorPresets.find((preset) => preset.id === 'deepseek')
  const model = createVendorModel(deepseek, { id: 'm1', apiKey: ' sk-test ' })
  assert.equal(model.name, 'DeepSeek · deepseek-flash')
  assert.equal(model.apiKey, 'sk-test')
  assert.equal(model.protocol, 'openai')
  assert.equal(model.contextWindow, 1048576)
  assert.throws(() => createVendorModel(deepseek, { id: 'm2', apiKey: '  ' }), /API Key/)
  const renamed = createVendorModel(deepseek, {
    id: 'm3',
    apiKey: 'k',
    model: 'deepseek-v4-pro',
    name: '求索 Pro',
  })
  assert.equal(renamed.name, '求索 Pro')
  assert.equal(renamed.model, 'deepseek-v4-pro')

  assert.equal(matchVendorPreset(model)?.id, 'deepseek')
  assert.equal(matchVendorPreset({ ...model, baseUrl: `${model.baseUrl}/` })?.id, 'deepseek')
  assert.equal(
    matchVendorPreset({ protocol: 'openai', baseUrl: 'https://example.invalid/v1' }),
    undefined,
  )
  assert.equal(
    matchVendorPreset({ protocol: 'openai', baseUrl: 'https://openrouter.ai/api/v1' }),
    undefined,
    'OpenRouter keeps its dedicated quick row',
  )

  const expected = {
    openai: 'https://api.openai.com/v1/chat/completions',
    anthropic: 'https://api.anthropic.com/v1/messages',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    deepseek: 'https://api.deepseek.com/v1/chat/completions',
    kimi: 'https://api.moonshot.cn/v1/chat/completions',
    'kimi-global': 'https://api.moonshot.ai/v1/chat/completions',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    qianfan: 'https://qianfan.baidubce.com/v2/chat/completions',
    minimax: 'https://api.minimax.io/v1/chat/completions',
    doubao: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    xai: 'https://api.x.ai/v1/chat/completions',
    mistral: 'https://api.mistral.ai/v1/chat/completions',
    groq: 'https://api.groq.com/openai/v1/chat/completions',
    nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
    siliconflow: 'https://api.siliconflow.cn/v1/chat/completions',
    modelscope: 'https://api-inference.modelscope.cn/v1/chat/completions',
    stepfun: 'https://api.stepfun.com/v1/chat/completions',
    longcat: 'https://api.longcat.chat/openai/v1/chat/completions',
    mimo: 'https://api.xiaomimimo.com/v1/chat/completions',
    hunyuan: 'https://tokenhub.tencentmaas.com/v1/chat/completions',
  }
  let requested
  const { streamModel } = await load(
    'packages/agent-core/src/providers.ts',
    { './transport': 'export const serviceFetch=globalThis.testFetch' },
    {
      testFetch: async (url, options) => {
        requested = { url, options }
        return url.endsWith('/messages')
          ? Response.json({ content: [{ type: 'text', text: 'ok' }] })
          : Response.json({ choices: [{ message: { content: 'ok' } }] })
      },
    },
  )
  for (const preset of vendorPresets) {
    const configured = createVendorModel(preset, { id: `id-${preset.id}`, apiKey: 'key-test' })
    await streamModel(
      configured,
      [{ role: 'user', content: 'hi' }],
      '',
      [],
      new Map(),
      () => {},
      new AbortController().signal,
    )
    assert.equal(requested.url, expected[preset.id], `final endpoint for ${preset.id}`)
    if (preset.protocol === 'anthropic') {
      assert.equal(requested.options.headers['x-api-key'], 'key-test')
      assert.ok(requested.options.headers['anthropic-version'])
    } else {
      assert.equal(requested.options.headers.Authorization, 'Bearer key-test')
    }
    assert.equal(JSON.parse(requested.options.body).model, preset.model)
  }
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
 export const requestUrl = (...args) => globalThis.billingRequest(...args)
`
async function settingsFixture() {
  const { CateaSettings } = await load('apps/obsidian/src/settings.ts', {
    obsidian: hostMock,
    '../../../packages/integrations/src/skills':
      'export const listSkills=async()=>[];export const describeSkills=async()=>[]',
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
  assert.ok(names.includes('添加厂商（预设）'))
  assert.ok(names.includes('添加其他模型'))
})

test('Vendor icons stay pure data URLs and every preset resolves an icon or monogram', async () => {
  const { vendorIcons, vendorIconDataUrl, vendorMonogram } = await load(
    'apps/obsidian/src/vendor-icons.ts',
  )
  const { vendorPresets } = await load('packages/agent-core/src/vendor-presets.ts')
  for (const preset of vendorPresets) {
    const svg = vendorIcons[preset.id]
    if (preset.id === 'groq') {
      assert.equal(svg, undefined, 'Groq intentionally falls back to the monogram')
      continue
    }
    assert.ok(svg, `missing icon for ${preset.id}`)
    const url = vendorIconDataUrl(svg, '#121212')
    assert.ok(url.startsWith('data:image/svg+xml,%3Csvg'), preset.id)
    assert.equal(decodeURIComponent(url.slice(23)).includes('currentColor'), false, preset.id)
  }
  const mono = vendorMonogram('G', '#F55036')
  assert.ok(mono.includes('<rect') && mono.includes('>G<') && mono.includes('#F55036'))
  assert.ok(
    vendorMonogram('<script>', '#000').includes('&lt;'),
    'monogram letters must be XML-escaped',
  )
  const kept = vendorIconDataUrl('<svg fill="currentColor"></svg>', '')
  assert.ok(
    decodeURIComponent(kept.slice(23)).includes('currentColor'),
    'an empty color must leave the SVG untouched',
  )
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
        'export const loadSkills=async()=>[];export const readSkillResource=()=>{};export const listSkills=async()=>[];export const describeSkills=async()=>[];export const createSkill=async()=>({id:"x",path:"p",resources:[],replaced:false});export const presetSkillIds=[]',
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

test('User quotes and skill tags survive send, queued steering, persistence and reopening', async () => {
  const { Agent } = await load(
    'packages/agent-core/src/index.ts',
    {
      './transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../agent-core/src/transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../integrations/src/mcp': 'export class McpPool {async connect(){return []}}',
      '../../integrations/src/skills':
        'export const loadSkills=async()=>[];export const readSkillResource=()=>{};export const listSkills=async()=>[];export const describeSkills=async()=>[];export const createSkill=async()=>({id:"x",path:"p",resources:[],replaced:false});export const presetSkillIds=[]',
      '../upstream/loop/agent-loop': `export const agentLoop=async function*(){
        const answer={role:'assistant',content:[{type:'text',text:'Completed response.'}],stopReason:'stop',timestamp:Date.now()};
        yield {type:'message_update',message:answer};yield {type:'message_end',message:answer};
        yield {type:'agent_end'};
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
  let saved
  const agent = new Agent(
    '/unused',
    () => config,
    {
      change: () => {},
      notice: () => {},
      approve: async () => true,
      ask: async () => ({}),
    },
    {
      conversations: {
        save: async (session) => {
          saved = structuredClone(session)
        },
        list: async () => [],
        load: async () => structuredClone(saved),
      },
      memory: { close: () => {} },
      modelClient: {
        async *stream() {
          yield { type: 'done', reply: { text: '{"title":"Quote discussion"}', calls: [] } }
        },
      },
    },
  )
  const quotes = [
    {
      id: 'q1',
      path: 'note.md',
      text: 'Original selection\nSecond line',
      comment: 'Please revise this',
    },
  ]
  const queued = [{ id: 'q2', path: 'other.md', text: 'Queued selection' }]
  const selectedSkills = ['writer', 'writer']
  const queuedSkills = ['reviewer']
  const context = JSON.stringify({ selectedQuotes: quotes })
  await agent.send(
    'Explain this',
    async () => {
      agent.steer(
        'Also consider this',
        JSON.stringify({ selectedQuotes: queued }),
        [],
        queuedSkills,
        queued,
      )
      selectedSkills.length = 0
      queuedSkills.length = 0
      quotes[0].text = 'Draft changed after sending'
      queued.length = 0
      return context
    },
    [],
    selectedSkills,
    quotes,
  )
  const users = saved.messages.filter((message) => message.role === 'user')
  assert.equal(users[0].text, 'Explain this')
  assert.equal(users[0].skills.join(','), 'writer')
  assert.equal(users[1].skills.join(','), 'reviewer')
  assert.equal(users[0].quotes[0].text, 'Original selection\nSecond line')
  assert.equal(users[0].quotes[0].comment, 'Please revise this')
  assert.equal(users[1].quotes[0].text, 'Queued selection')
  assert.ok(
    saved.transcript.some(
      (entry) => typeof entry.content === 'string' && entry.content.includes('Original selection'),
    ),
  )
  await agent.open(saved.id)
  assert.equal(agent.session.messages[0].quotes[0].path, 'note.md')
  assert.equal(agent.session.messages[0].skills.join(','), 'writer')
  // A legacy message retains only the exact model context, not the display metadata.
  delete saved.messages[0].quotes
  saved.transcript[0].content =
    'Explain this\n\n<current-note-context>\n' +
    JSON.stringify({
      currentNote: { content: 'Automatically attached private note' },
      selectedQuotes: [
        { path: 'note.md', text: 'Original selection\nSecond line', comment: 'Please revise this' },
      ],
    }) +
    '\n</current-note-context>'
  await agent.open(saved.id)
  assert.equal(agent.session.messages[0].quotes[0].text, 'Original selection\nSecond line')
  assert.equal(agent.session.messages[0].quotes[0].comment, 'Please revise this')
  assert.doesNotMatch(JSON.stringify(agent.session.messages[0].quotes), /private note/)
  const branch = await agent.branchAt(users[0].id)
  assert.equal(branch.quotes[0].text, 'Original selection\nSecond line')
  assert.equal(branch.skills.join(','), 'writer')
  await agent.steer(
    'Idle steering',
    '{}',
    [],
    ['editor'],
    [{ id: 'q3', path: 'last.md', text: 'Idle selection' }],
  )
  assert.equal(
    saved.messages
      .filter((message) => message.role === 'user')
      .at(-1)
      .skills.join(','),
    'editor',
  )
  assert.equal(
    saved.messages.filter((message) => message.role === 'user').at(-1).quotes[0].text,
    'Idle selection',
  )
})

test('Sent quotes render source, original text and annotations without interpreting HTML', async () => {
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { createElement } = await import('react')
  const { MessageQuotes } = await load('apps/obsidian/src/MessageQuotes.tsx')
  const html = renderToStaticMarkup(
    createElement(MessageQuotes, {
      quotes: [
        {
          id: 'q',
          path: 'notes/source.md',
          text: '<script>alert(1)</script>\nQuoted text',
          comment: 'My annotation',
        },
      ],
    }),
  )
  assert.match(html, /notes\/source.md/)
  assert.match(html, /<blockquote>/)
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.match(html, /Quoted text/)
  assert.match(html, /My annotation/)
  assert.doesNotMatch(html, /<script>/)
  assert.equal(renderToStaticMarkup(createElement(MessageQuotes, {})), '')
})

test('Failed conversation titles retry after reopening, persist, and notify the UI', async () => {
  const { Agent } = await load(
    'packages/agent-core/src/index.ts',
    {
      './transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../agent-core/src/transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../integrations/src/mcp': 'export class McpPool {async connect(){return []}}',
      '../../integrations/src/skills':
        'export const loadSkills=async()=>[];export const readSkillResource=()=>{};export const listSkills=async()=>[];export const describeSkills=async()=>[];export const createSkill=async()=>({id:"x",path:"p",resources:[],replaced:false});export const presetSkillIds=[]',
      '../upstream/loop/agent-loop': `export const agentLoop=async function*(){
        const answer={role:'assistant',content:[{type:'text',text:'Completed response.'}],stopReason:'stop',timestamp:Date.now()};
        yield {type:'message_update',message:answer};yield {type:'message_end',message:answer};
        yield {type:'agent_end'};
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
  let saved,
    requests = 0
  const seenTitles = []
  const ports = {
    conversations: {
      save: async (session) => {
        saved = structuredClone(session)
      },
      list: async () => (saved ? [{ id: saved.id, title: saved.title }] : []),
      load: async () => structuredClone(saved),
    },
    memory: { close: () => {} },
    modelClient: {
      async *stream(request) {
        requests++
        assert.match(request.transcript[0].content, /Original question/)
        yield {
          type: 'done',
          reply: {
            text: requests === 1 ? '{"title":' : '{"title":"Generated conversation"}',
            calls: [],
          },
        }
      },
    },
  }
  const create = () => {
    const agent = new Agent(
      '/unused',
      () => config,
      {
        change: () => seenTitles.push(agent.session.title),
        notice: () => {},
        approve: async () => true,
        ask: async () => ({}),
      },
      ports,
    )
    return agent
  }
  const first = create()
  await first.send('Original question', '')
  assert.equal(saved.title, 'Original question')
  assert.equal(saved.messages[1].status, 'complete')
  assert.equal(saved.titleAttempts, 1)
  const reopened = create()
  await reopened.open(saved.id)
  await reopened.send('Follow up', '')
  assert.equal(saved.title, 'Generated conversation')
  assert.equal(saved.titleGenerated, true)
  assert.ok(seenTitles.includes('Generated conversation'))
  assert.equal((await reopened.list())[0].title, 'Generated conversation')
  await reopened.send('Another follow up', '')
  assert.equal(requests, 2, 'a generated title is not overwritten on subsequent turns')

  // Older sessions have no title metadata and should also recover on their next turn.
  saved.title = 'Original question'
  delete saved.titleGenerated
  delete saved.titleAttempts
  const legacy = create()
  await legacy.open(saved.id)
  await legacy.send('Repair legacy title', '')
  assert.equal(saved.title, 'Generated conversation')
  assert.equal(requests, 3)

  saved.title = 'Manually named session'
  delete saved.titleGenerated
  const renamed = create()
  await renamed.open(saved.id)
  await renamed.send('Keep my title', '')
  assert.equal(saved.title, 'Manually named session')
  assert.equal(requests, 3)

  saved.title = 'Original question'
  saved.titleAttempts = 3
  const exhausted = create()
  await exhausted.open(saved.id)
  await exhausted.send('No more metadata requests', '')
  assert.equal(requests, 3, 'failed metadata requests have a persisted retry limit')
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
        'export const loadSkills=async(_vault,enabled)=>{globalThis.recordSkills(enabled.slice());return []};export const readSkillResource=()=>{};export const listSkills=async()=>["alpha","beta"];export const describeSkills=async()=>[{id:"alpha",description:"alpha",source:"vault",enabled:false},{id:"beta",description:"beta",source:"vault",enabled:false}];export const createSkill=async()=>({id:"x",path:"p",resources:[],replaced:false});export const presetSkillIds=[]',
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
        'export const loadSkills=async()=>[];export const readSkillResource=()=>{};export const listSkills=async()=>[];export const describeSkills=async()=>[];export const createSkill=async()=>({id:"x",path:"p",resources:[],replaced:false});export const presetSkillIds=[]',
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
        'export const loadSkills=async()=>[];export const readSkillResource=()=>{};export const listSkills=async()=>[];export const describeSkills=async()=>[];export const createSkill=async()=>({id:"x",path:"p",resources:[],replaced:false});export const presetSkillIds=[]',
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

test('Sidebar restoration removes ghost duplicates and concurrent opens create only one leaf', async () => {
  const { SidebarViews } = await load('apps/obsidian/src/sidebar-views.ts')
  const leaves = []
  let created = 0
  let revealed = 0
  const makeLeaf = (saved, actual = saved) => {
    const leaf = {
      view: { getViewType: () => actual },
      getViewState: () => ({ type: saved }),
      async setViewState(state) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        saved = actual = state.type
      },
      detach() {
        leaves.splice(leaves.indexOf(leaf), 1)
      },
    }
    leaves.push(leaf)
    return leaf
  }
  const workspace = {
    iterateAllLeaves(fn) {
      ;[...leaves].forEach(fn)
    },
    getRightLeaf() {
      created++
      return makeLeaf('empty')
    },
    async revealLeaf() {
      revealed++
    },
  }
  const sidebar = new SidebarViews(workspace)
  makeLeaf('catea-git-history', 'empty')
  makeLeaf('catea-git-history', 'empty')
  const valid = makeLeaf('catea-git-history')
  const unrelated = makeLeaf('other-plugin')
  await sidebar.sync('catea-git-history', () => true)
  assert.deepEqual(leaves, [valid, unrelated])
  assert.equal(created, 0)
  await sidebar.sync('catea-git-history', () => false)
  const ghost = makeLeaf('catea-git-history', 'empty')
  await sidebar.sync('catea-git-history', () => true)
  assert.equal(ghost.view.getViewType(), 'catea-git-history')
  assert.equal(created, 0)
  await sidebar.sync('catea-git-history', () => false)
  await Promise.all(
    Array.from({ length: 3 }, () => sidebar.sync('catea-git-history', () => true, true)),
  )
  assert.equal(created, 1)
  assert.equal(revealed, 3)
  assert.equal(leaves.length, 2)
  await sidebar.sync('catea-git-history', () => false)
  let enabled = true
  const opening = sidebar.sync('catea-git-history', () => enabled)
  await new Promise((resolve) => setTimeout(resolve, 1))
  enabled = false
  await opening
  assert.deepEqual(leaves, [unrelated])
  sidebar.dispose()
  await sidebar.sync('catea-git-history', () => true)
  assert.deepEqual(leaves, [unrelated])
})

test('Bundled skill presets resolve without a vault copy and report their source', async () => {
  const { mkdir, rm, writeFile } = await import('node:fs/promises')
  const { loadSkills, listSkills, describeSkills, presetSkillIds } = await load(
    'packages/integrations/src/skills.ts',
  )
  const vault = await mkdtemp(join(tmpdir(), 'catea-skills-'))
  try {
    assert.deepEqual([...presetSkillIds], ['find-skill', 'skill-creator'])
    assert.deepEqual([...(await listSkills(vault))], ['find-skill', 'skill-creator'])

    // An empty vault still resolves both presets, and each carries its own frontmatter.
    const loaded = await loadSkills(vault, ['skill-creator', 'find-skill'])
    assert.equal(loaded.length, 2)
    for (const skill of loaded) {
      assert.ok(skill.content.startsWith('---\nname: ' + skill.id), `${skill.id} frontmatter`)
      assert.notEqual(skill.description, skill.id, `${skill.id} must declare a description`)
      assert.ok(skill.content.length < 48000)
    }

    const listed = await describeSkills(vault, ['find-skill'])
    assert.deepEqual(
      [...listed].map((s) => [s.id, s.source, s.enabled]),
      [
        ['find-skill', 'preset', true],
        ['skill-creator', 'preset', false],
      ],
    )

    // A vault directory shadows the preset of the same id.
    await mkdir(join(vault, '.catea/skills/skill-creator'), { recursive: true })
    await writeFile(
      join(vault, '.catea/skills/skill-creator/SKILL.md'),
      '---\nname: skill-creator\ndescription: 本地覆盖版\n---\nbody\n',
      'utf8',
    )
    const [shadowed] = await loadSkills(vault, ['skill-creator'])
    assert.equal(shadowed.description, '本地覆盖版')
    const afterShadow = await describeSkills(vault, [])
    assert.deepEqual(
      [...afterShadow].map((s) => [s.id, s.source]),
      [
        ['find-skill', 'preset'],
        ['skill-creator', 'vault'],
      ],
    )
    // A preset has no files on disk, so its resources are unreachable.
    const { readSkillResource } = await load('packages/integrations/src/skills.ts')
    await assert.rejects(
      readSkillResource(vault, ['skill-creator'], 'skill-creator', 'references/schemas.md'),
      /ENOENT|不存在|没有 such file|no such file/i,
      'preset resources must not resolve to anything',
    )
    await assert.rejects(
      readSkillResource(vault, [], 'skill-creator', 'SKILL.md'),
      /未启用/,
      'reading requires the skill to be enabled for this turn',
    )
  } finally {
    await rm(vault, { recursive: true, force: true })
  }
})

test('createSkill validates before writing and never leaves a half-written package', async () => {
  const { mkdir, readFile, readdir, rm, writeFile } = await import('node:fs/promises')
  const { createSkill, loadSkills } = await load('packages/integrations/src/skills.ts')
  const vault = await mkdtemp(join(tmpdir(), 'catea-skill-create-'))
  const body = (name) => `---\nname: ${name}\ndescription: 用于回归测试\n---\n# 正文\n`
  try {
    await assert.rejects(
      createSkill(vault, { id: 'bad id', content: body('bad id') }),
      /字母、数字/,
      'ids must stay filesystem safe',
    )
    await assert.rejects(
      createSkill(vault, { id: 'skill-creator', content: body('skill-creator') }),
      /不可覆盖/,
      'bundled presets must not be writable',
    )
    await assert.rejects(
      createSkill(vault, { id: 'draft', content: '# 没有 frontmatter\n' }),
      /frontmatter/,
      'frontmatter is required',
    )
    await assert.rejects(
      createSkill(vault, { id: 'draft', content: body('other') }),
      /与 id 一致/,
      'name must equal the id',
    )
    await assert.rejects(
      createSkill(vault, { id: 'draft', content: '---\nname: draft\ndescription:\n---\nx\n' }),
      /非空的 description/,
      'description drives triggering, so it cannot be empty',
    )

    // A rejected resource must not leave the entry file behind.
    await assert.rejects(
      createSkill(vault, {
        id: 'escaped',
        content: body('escaped'),
        resources: [{ path: '../outside.md', content: 'x' }],
      }),
      /无效 Skill 资源路径/,
    )
    assert.equal((await readdir(join(vault, '.catea/skills')).catch(() => [])).length, 0)

    const created = await createSkill(vault, {
      id: 'notes',
      content: body('notes'),
      resources: [{ path: 'references/detail.md', content: '# 细节\n' }],
    })
    assert.equal(created.path, '.catea/skills/notes/SKILL.md')
    assert.deepEqual([...created.resources], ['references/detail.md'])
    assert.equal(created.replaced, false)
    assert.match(await readFile(join(vault, '.catea/skills/notes/SKILL.md'), 'utf8'), /回归测试/)
    const [skill] = await loadSkills(vault, ['notes'])
    assert.equal(skill.description, '用于回归测试')

    await assert.rejects(
      createSkill(vault, { id: 'notes', content: body('notes') }),
      /已存在/,
      'an existing package needs an explicit overwrite',
    )
    const again = await createSkill(vault, {
      id: 'notes',
      content: body('notes'),
      overwrite: true,
    })
    assert.equal(again.replaced, true)
  } finally {
    await rm(vault, { recursive: true, force: true })
  }
})

test('Image generation supports DashScope and OpenAI, saves locally and never forwards keys to downloads', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'catea-image-'))
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  )
  const requests = []
  let mode = 'dashscope'
  const { generateImage } = await load(
    'packages/integrations/src/image-generation.ts',
    {
      '../../agent-core/src/transport':
        'export const serviceFetch=(...args)=>globalThis.imageFetch(...args)',
    },
    {
      imageFetch: async (url, init) => {
        requests.push({ url, init })
        if (url === 'https://images.example.invalid/result') return new Response(png)
        if (mode === 'error') return new Response('DO NOT LEAK test-secret', { status: 401 })
        if (mode === 'invalid')
          return Response.json({ data: [{ b64_json: Buffer.from('<svg/>').toString('base64') }] })
        if (mode === 'large')
          return new Response('', { headers: { 'content-length': '999999999' } })
        if (mode === 'cancel') {
          init.signal.throwIfAborted()
          throw new Error('Unexpected request')
        }
        if (mode === 'openai')
          return Response.json({ data: [{ b64_json: png.toString('base64') }] })
        return Response.json({
          output: {
            choices: [
              { message: { content: [{ image: 'https://images.example.invalid/result' }] } },
            ],
          },
        })
      },
    },
  )
  const config = {
    enabled: true,
    protocol: 'dashscope',
    baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic',
    model: 'qwen-image-3.0-pro',
    apiKey: 'test-secret',
  }
  const signal = new AbortController().signal
  try {
    const first = await generateImage(vault, config, { prompt: 'A cat', size: '1024x1024' }, signal)
    assert.deepEqual(await readFile(join(vault, first.path)), png)
    assert.match(first.path, /^Attachments\/Catea\/.+\.png$/)
    assert.equal(
      requests[0].url,
      'https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    )
    assert.equal(JSON.parse(requests[0].init.body).parameters.size, '1024*1024')
    assert.equal(JSON.parse(requests[0].init.body).input.messages[0].content[0].text, 'A cat')
    assert.equal(requests[1].init.headers, undefined)
    assert.doesNotMatch(JSON.stringify(first), /test-secret|images.example/)
    mode = 'openai'
    const second = await generateImage(
      vault,
      { ...config, protocol: 'openai', baseUrl: 'https://api.example.invalid/v1' },
      { prompt: 'A cat' },
      signal,
    )
    assert.notEqual(first.path, second.path)
    assert.equal(requests.at(-1).url, 'https://api.example.invalid/v1/images/generations')
    assert.equal(JSON.parse(requests.at(-1).init.body).prompt, 'A cat')
    assert.deepEqual(await readFile(join(vault, second.path)), png)
    mode = 'error'
    await assert.rejects(
      generateImage(vault, config, { prompt: 'A cat' }, signal),
      (error) => /HTTP 401/.test(error.message) && !/test-secret|DO NOT LEAK/.test(error.message),
    )
    mode = 'invalid'
    await assert.rejects(
      generateImage(vault, { ...config, protocol: 'openai' }, { prompt: 'A cat' }, signal),
      /unsupported image/,
    )
    mode = 'large'
    await assert.rejects(generateImage(vault, config, { prompt: 'A cat' }, signal), /oversized/)
    const before = requests.length
    await assert.rejects(
      generateImage(vault, { ...config, enabled: false }, { prompt: 'A cat' }, signal),
      /enable/,
    )
    await assert.rejects(generateImage(vault, config, { prompt: '' }, signal), /prompt/)
    await assert.rejects(
      generateImage(vault, config, { prompt: 'A cat' }, AbortSignal.abort()),
      /abort/i,
    )
    assert.equal(requests.length, before)
  } finally {
    await rm(vault, { recursive: true, force: true })
  }
})

test('Image settings are separate from chat models and keep keys in the secure store', async () => {
  const { plugin, tab, secrets } = await settingsFixture()
  const settingsRows = rows(tab)
  assert.equal(plugin.agentSettings.imageGeneration.enabled, false)
  let change
  const input = {
    inputEl: {},
    setValue() {
      return this
    },
    onChange(fn) {
      change = fn
      return this
    },
  }
  settingsRows
    .find((row) => row.name === '生图 API Key')
    .render({
      addText(fn) {
        fn(input)
        return this
      },
    })
  assert.equal(input.inputEl.type, 'password')
  await change('image-secret')
  assert.equal(JSON.stringify(tab.getSettingDefinitions()).includes('image-secret'), false)
  assert.equal(plugin.agentSettings.imageGeneration.apiKey, 'image-secret')
  assert.equal(secrets().at(-1)[0], 'image-generation')
  assert.equal(secrets().at(-1)[1], 'image-secret')
  assert.equal(plugin.agentSettings.models.length, 0)
})

test('Agent exposes the configured image tool, gates writes and persists generated image paths', async () => {
  let registered = false,
    calls = 0,
    approvals = 0,
    saved
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
    imageGeneration: {
      enabled: true,
      baseUrl: 'https://example.invalid/v1',
      model: 'image-model',
      apiKey: 'image-secret',
    },
  }
  const { Agent } = await load(
    'packages/agent-core/src/index.ts',
    {
      './transport': 'export const serviceFetch=async()=>{throw new Error("Unexpected network")}',
      '../../agent-core/src/transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network")}',
      '../../integrations/src/mcp': 'export class McpPool {async connect(){return []}}',
      '../../integrations/src/skills':
        'export const loadSkills=async()=>[];export const readSkillResource=()=>{};export const listSkills=async()=>[];export const describeSkills=async()=>[];export const createSkill=async()=>({})',
      '../../integrations/src/image-generation': `export const imageGenerationReady=c=>!!(c?.enabled && c.apiKey && c.model && c.baseUrl);export const imageGenerationTool={name:'generate_image',description:'Draw',parameters:{type:'object',properties:{prompt:{type:'string'}},required:['prompt']}};export const generateImage=async()=>{globalThis.generated();return {path:'Attachments/Catea/test.png',markdown:'[Image](Attachments/Catea/test.png)'}}`,
      '../upstream/loop/agent-loop': `export const agentLoop=async function*(_,context){
      const tool=context.tools.find(t=>t.name==='generate_image');globalThis.registered(!!tool);
      if(tool){if(tool.isConcurrencySafe)throw new Error('Image tool must not run concurrently');await tool.execute('image-call',{prompt:'A cat'});}
      const answer={role:'assistant',content:[{type:'text',text:'Done'}],stopReason:'stop',timestamp:Date.now()};yield {type:'message_end',message:answer};yield {type:'agent_end'};
    }`,
    },
    {
      structuredClone,
      TransformStream,
      registered: (value) => {
        registered = value
      },
      generated: () => {
        calls++
      },
    },
  )
  const agent = new Agent(
    '/unused',
    () => config,
    {
      change() {},
      notice() {},
      approve: async () => {
        approvals++
        return true
      },
      ask: async () => ({}),
    },
    {
      conversations: {
        save: async (value) => {
          saved = structuredClone(value)
        },
        list: async () => [],
        load: async () => structuredClone(saved),
      },
      memory: { close() {} },
      modelClient: {
        async *stream() {
          yield { type: 'done', reply: { text: '{"title":"Image test"}', calls: [] } }
        },
      },
    },
  )
  await agent.send('Draw a cat', '')
  assert.equal(registered, true)
  assert.equal(calls, 1)
  assert.equal(approvals, 1)
  assert.equal(saved.messages[1].generatedImages[0], 'Attachments/Catea/test.png')
  await agent.open(saved.id)
  assert.equal(agent.session.messages[1].generatedImages[0], 'Attachments/Catea/test.png')
  config.imageGeneration.enabled = false
  await agent.send('Do something else', '')
  assert.equal(registered, false)
  assert.equal(calls, 1)
  config.imageGeneration.enabled = true
  config.imageGeneration.apiKey = ''
  await agent.send('Unconfigured image generation', '')
  assert.equal(registered, false)
})

test('Video tasks poll, persist progress and resume without submitting; audio uses binary MP3', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'catea-media-'))
  const mp4 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0])
  const mp3 = Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0, 255, 251, 144, 0])
  const requests = [],
    progress = []
  let polls = 0,
    status = 'SUCCEEDED',
    badAudio = false
  const config = {
    enabled: true,
    baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic',
    model: 'video-model',
    apiKey: 'media-secret',
    voice: 'voice-a',
  }
  const { generateVideo, generateAudio } = await load(
    'packages/integrations/src/media-generation.ts',
    {
      '../../agent-core/src/transport':
        'export const serviceFetch=(...args)=>globalThis.mediaFetch(...args)',
    },
    {
      window: { setTimeout: (fn) => setTimeout(fn, 0), clearTimeout },
      mediaFetch: async (url, init) => {
        requests.push({ url, init })
        if (url.includes('video-synthesis')) return Response.json({ output: { task_id: 'task-1' } })
        if (url.includes('/tasks/'))
          return Response.json({
            output: {
              task_status: polls++ === 0 ? 'RUNNING' : status,
              video_url: 'https://cdn.example.invalid/video',
            },
          })
        if (url.includes('SpeechSynthesizer'))
          return badAudio
            ? new Response('provider-error media-secret')
            : Response.json({
                output: { audio: { url: 'http://result.oss-cn-beijing.aliyuncs.com/audio' } },
              })
        if (url === 'https://result.oss-cn-beijing.aliyuncs.com/audio') return new Response(mp3)
        if (url === 'https://cdn.example.invalid/video') return new Response(mp4)
        throw new Error('Unexpected URL')
      },
    },
  )
  const signal = new AbortController().signal
  try {
    const result = await generateVideo(
      vault,
      config,
      { prompt: 'Cat blinking' },
      signal,
      async (id, state) => {
        progress.push({ id, state })
      },
    )
    assert.deepEqual(await readFile(join(vault, result.path)), mp4)
    assert.equal(result.task_id, 'task-1')
    assert.equal(progress.map((item) => item.state).join(','), 'SUBMITTED,RUNNING,SUCCEEDED')
    assert.equal(requests[0].init.headers['X-DashScope-Async'], 'enable')
    assert.equal(JSON.parse(requests[0].init.body).parameters.duration, 5)
    assert.equal(requests.at(-1).init.headers, undefined)
    const countPosts = () => requests.filter((item) => item.init.method === 'POST').length
    const posts = countPosts()
    await generateVideo(vault, config, { task_id: 'task-1' }, signal)
    assert.equal(countPosts(), posts)
    status = 'FAILED'
    await assert.rejects(
      generateVideo(vault, config, { task_id: 'task-1' }, signal),
      /FAILED.*task-1/,
    )
    const before = requests.length
    await assert.rejects(generateVideo(vault, config, { task_id: '../outside' }, signal), /task ID/)
    await assert.rejects(
      generateVideo(vault, config, { prompt: 'test', duration: 500 }, signal),
      /duration/,
    )
    await assert.rejects(
      generateVideo(vault, config, { prompt: 'test' }, AbortSignal.abort()),
      /abort/i,
    )
    assert.equal(requests.length, before)
    const audio = await generateAudio(vault, config, { text: 'Hello Catea' }, signal)
    assert.deepEqual(await readFile(join(vault, audio.path)), mp3)
    assert.equal(JSON.parse(requests.at(-2).init.body).input.voice, 'voice-a')
    assert.equal(JSON.parse(requests.at(-2).init.body).input.format, 'mp3')
    assert.equal(requests.at(-1).init.headers, undefined)
    assert.doesNotMatch(JSON.stringify(audio), /media-secret/)
    badAudio = true
    await assert.rejects(
      generateAudio(vault, config, { text: 'Hello' }, signal),
      (error) => /valid MP3/.test(error.message) && !/media-secret/.test(error.message),
    )
    await assert.rejects(
      generateAudio(vault, { ...config, voice: '' }, { text: 'Hello' }, signal),
      /voice/,
    )
    await assert.rejects(generateAudio(vault, config, { text: 'x'.repeat(6001) }, signal), /6000/)
  } finally {
    await rm(vault, { recursive: true, force: true })
  }
})

test('Stopping video polling retains the submitted task and makes no further requests', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'catea-media-stop-'))
  const controller = new AbortController()
  let calls = 0,
    taskId
  const { generateVideo } = await load(
    'packages/integrations/src/media-generation.ts',
    {
      '../../agent-core/src/transport':
        'export const serviceFetch=(...args)=>globalThis.mediaFetch(...args)',
    },
    {
      mediaFetch: async () => {
        calls++
        return Response.json({ output: { task_id: 'resume-me' } })
      },
    },
  )
  try {
    await assert.rejects(
      generateVideo(
        vault,
        { enabled: true, baseUrl: 'https://example.invalid', model: 'video', apiKey: 'key' },
        { prompt: 'test' },
        controller.signal,
        async (id) => {
          taskId = id
          controller.abort()
        },
      ),
      /abort/i,
    )
    assert.equal(taskId, 'resume-me')
    assert.equal(calls, 1)
  } finally {
    await rm(vault, { recursive: true, force: true })
  }
})

test('Video and speech settings use separate masked credentials and preserve the chat model', async () => {
  const { tab, plugin, secrets } = await settingsFixture()
  const allRows = rows(tab)
  for (const [kind, name] of [
    ['video', '视频 API Key'],
    ['audio', '音频 API Key'],
  ]) {
    let change
    const input = {
      inputEl: {},
      setValue() {
        return this
      },
      onChange(fn) {
        change = fn
        return this
      },
    }
    allRows
      .find((row) => row.name === name)
      .render({
        addText(fn) {
          fn(input)
          return this
        },
      })
    assert.equal(input.inputEl.type, 'password')
    await change(`${kind}-secret`)
    assert.equal(secrets().at(-1)[0], `${kind}-generation`)
  }
  assert.equal(plugin.agentSettings.videoGeneration.enabled, false)
  assert.equal(plugin.agentSettings.audioGeneration.voice, 'longanhuan_v3.6')
  assert.equal(plugin.agentSettings.models.length, 0)
  assert.doesNotMatch(JSON.stringify(tab.getSettingDefinitions()), /video-secret|audio-secret/)
})

test('Agent registers video and audio independently and persists playback paths plus video task IDs', async () => {
  let saved,
    registered = [],
    calls = [],
    approvals = 0
  const media = {
    enabled: true,
    baseUrl: 'https://example.invalid',
    model: 'media',
    apiKey: 'secret',
    voice: 'voice',
  }
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
    videoGeneration: { ...media },
    audioGeneration: { ...media },
  }
  const { Agent } = await load(
    'packages/agent-core/src/index.ts',
    {
      './transport': 'export const serviceFetch=async()=>{throw new Error("Unexpected network")}',
      '../../agent-core/src/transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network")}',
      '../../integrations/src/mcp': 'export class McpPool {async connect(){return []}}',
      '../../integrations/src/skills':
        'export const loadSkills=async()=>[];export const readSkillResource=()=>{};export const listSkills=async()=>[];export const describeSkills=async()=>[];export const createSkill=async()=>({})',
      '../../integrations/src/media-generation': `export const mediaGenerationReady=c=>!!(c?.enabled&&c.apiKey&&c.model&&c.baseUrl);
      export const videoGenerationTool={name:'generate_video',parameters:{type:'object'}};
      export const audioGenerationTool={name:'generate_audio',parameters:{type:'object'}};
      export const generateVideo=async(v,c,a,s,progress)=>{globalThis.called('video');await progress('task-persisted','RUNNING');return {path:'Attachments/Catea/movie.mp4'}};
      export const generateAudio=async()=>{globalThis.called('audio');return {path:'Attachments/Catea/speech.mp3'}};`,
      '../upstream/loop/agent-loop': `export const agentLoop=async function*(_,context){
      const tools=context.tools.filter(t=>['generate_video','generate_audio'].includes(t.name));globalThis.registered(tools.map(t=>t.name));
      for(const tool of tools){
        if(tool.isConcurrencySafe)throw new Error('Media must not run concurrently');
        yield {type:'tool_execution_start',toolCallId:tool.name,toolName:tool.name,args:{prompt:'Cat',text:'Hello'}};
        const result=await tool.execute(tool.name,{prompt:'Cat',text:'Hello'});
        yield {type:'tool_execution_end',toolCallId:tool.name,result,isError:false};
      }
      const answer={role:'assistant',content:[{type:'text',text:'Done'}],stopReason:'stop',timestamp:Date.now()};yield {type:'message_end',message:answer};yield {type:'agent_end'};
    }`,
    },
    {
      structuredClone,
      TransformStream,
      called: (value) => calls.push(value),
      registered: (value) => {
        registered = value
      },
    },
  )
  const agent = new Agent(
    '/unused',
    () => config,
    {
      change() {},
      notice() {},
      approve: async () => {
        approvals++
        return true
      },
      ask: async () => ({}),
    },
    {
      conversations: {
        save: async (value) => {
          saved = structuredClone(value)
        },
        list: async () => [],
        load: async () => structuredClone(saved),
      },
      memory: { close() {} },
      modelClient: {
        async *stream() {
          yield { type: 'done', reply: { text: '{"title":"Media test"}', calls: [] } }
        },
      },
    },
  )
  await agent.send('Make video and speech', '')
  assert.equal(registered.join(','), 'generate_video,generate_audio')
  assert.equal(calls.join(','), 'video,audio')
  assert.equal(approvals, 2)
  assert.equal(saved.messages[1].generatedMedia.map((item) => item.kind).join(','), 'video,audio')
  assert.equal(saved.messages[1].tools[0].mediaTask.id, 'task-persisted')
  await agent.open(saved.id)
  assert.equal(agent.session.messages[1].generatedMedia[1].path, 'Attachments/Catea/speech.mp3')
  config.videoGeneration.enabled = false
  config.audioGeneration.voice = ''
  await agent.send('No media', '')
  assert.equal(registered.length, 0)
  assert.equal(calls.length, 2)
})

test('Host transport fallback preserves binary audio and video bytes', async () => {
  const binary = new Uint8Array([255, 251, 144, 0, 128, 254])
  const { serviceFetch } = await load(
    'packages/agent-core/src/transport.ts',
    {
      'node:https': `export const request=()=>({on(name,fn){if(name==='error')Promise.resolve().then(()=>fn({code:'SELF_SIGNED_CERT_IN_CHAIN'}));return this},setTimeout(){return this},end(){},write(){}})`,
      'node:http': 'export const request=()=>{throw new Error("Unexpected HTTP")}',
      electron: 'export const net=undefined',
      '@electron/remote': 'export const net=undefined',
      obsidian: 'export const requestUrl=async()=>globalThis.hostResponse',
    },
    {
      hostResponse: {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
        text: 'corrupted text',
        arrayBuffer: binary.buffer,
      },
    },
  )
  const response = await serviceFetch('https://cdn.example.invalid/audio')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), binary)
})

test('Skill creation rejects symlink entries, reserved aliases and concurrent overwrite races', async () => {
  const { mkdir, writeFile, symlink, readdir } = await import('node:fs/promises')
  const { createSkill, loadSkill } = await load('packages/integrations/src/skills.ts')
  const vault = await mkdtemp(join(tmpdir(), 'catea-skill-review-'))
  const outside = await mkdtemp(join(tmpdir(), 'catea-skill-outside-'))
  const body = (id) => `---\nname: ${id}\ndescription: Test package\n---\nSafe content\n`
  try {
    await mkdir(join(vault, '.catea/skills/linked'), { recursive: true })
    await writeFile(join(outside, 'private.md'), 'unchanged')
    await symlink(join(outside, 'private.md'), join(vault, '.catea/skills/linked/SKILL.md'))
    await assert.rejects(
      createSkill(vault, { id: 'linked', content: body('linked'), overwrite: true }),
      /边界|符号链接/,
    )
    assert.equal(await readFile(join(outside, 'private.md'), 'utf8'), 'unchanged')
    for (const resources of [
      [{ path: 'skill.md', content: 'bypass frontmatter' }],
      [
        { path: 'refs/a.md', content: 'one' },
        { path: 'REFS/A.md', content: 'two' },
      ],
      [
        { path: 'refs', content: 'file' },
        { path: 'refs/a.md', content: 'nested' },
      ],
    ])
      await assert.rejects(
        createSkill(vault, { id: 'invalid', content: body('invalid'), resources }),
        /正文|重复/,
      )
    const results = await Promise.allSettled(
      [1, 2].map(() => createSkill(vault, { id: 'parallel', content: body('parallel') })),
    )
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1)
    assert.equal(results.filter((item) => item.status === 'rejected').length, 1)
    await createSkill(vault, {
      id: 'parallel',
      content: body('parallel') + 'Updated',
      overwrite: true,
      resources: [{ path: 'refs/a.md', content: 'new' }],
    })
    assert.match((await loadSkill(vault, 'parallel')).content, /Updated/)
    assert.equal(
      (await readdir(join(vault, '.catea/skills'))).some(
        (name) => name.startsWith('.stage-') || name.startsWith('.backup-'),
      ),
      false,
    )
    await assert.rejects(loadSkill(vault, 'toString'), /未找到/)
  } finally {
    await rm(vault, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})

async function mcpFixture(globals = {}) {
  return load(
    'packages/integrations/src/mcp.ts',
    {
      '@modelcontextprotocol/sdk/client/index.js': `export class Client {
      async connect(transport, options) {
        this.id = transport.command;
        if (this.id === 'missing') throw Object.assign(new Error('secret arguments'), {code:'ENOENT'});
        if (this.id === 'hang') return new Promise((resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(options.signal.reason), {once:true});
          globalThis.started?.();
        });
      }
      async listTools(params) {
        if (this.id === 'partial' && params.cursor) throw new Error('secret response');
        return {tools:[{name:this.id, inputSchema:{type:'object'}}],
          nextCursor:this.id === 'partial' ? 'next' : undefined};
      }
      async callTool() { return {content:[{type:'text',text:this.id}]}; }
      async close() { globalThis.closed?.(this.id); }
    }`,
      '@modelcontextprotocol/sdk/client/stdio.js':
        'export class StdioClientTransport {constructor(options){Object.assign(this, options)}}',
      '@modelcontextprotocol/sdk/client/streamableHttp.js':
        'export class StreamableHTTPClientTransport {}',
    },
    globals,
  )
}

const mcpServer = (id) => ({ id, enabled: true, transport: 'stdio', command: id })

test('MCP missing executable and incomplete catalogs preserve healthy tools before and after failures', async () => {
  const closed = [],
    notices = []
  const { McpPool } = await mcpFixture({ closed: (id) => closed.push(id) })
  const pool = new McpPool(),
    signal = new AbortController().signal
  const tools = await pool.connect(
    ['healthy', 'missing', 'partial', 'last'].map(mcpServer),
    '/vault',
    signal,
    (...args) => notices.push(args),
  )
  assert.deepEqual(
    Array.from(tools, (t) => t.description),
    ['[healthy] healthy', '[last] last'],
  )
  assert.deepEqual(notices, [
    ['missing', 'missing-command'],
    ['partial', 'connection'],
  ])
  assert.ok(closed.includes('missing') && closed.includes('partial'))
  assert.match(await pool.call(tools[1].name, {}, signal), /last/)
  await assert.rejects(pool.call('mcp_2_1_partial', {}, signal), /MCP/)
  await pool.close()
})

test('MCP deadline skips a hung server and continues discovery', async () => {
  const notices = []
  const { McpPool } = await mcpFixture({
    window: { setTimeout: (callback) => setTimeout(callback, 10), clearTimeout },
  })
  const pool = new McpPool()
  const tools = await pool.connect(
    ['hang', 'healthy'].map(mcpServer),
    '/vault',
    new AbortController().signal,
    (...args) => notices.push(args),
  )
  assert.equal(tools.length, 1)
  assert.deepEqual(notices, [['hang', 'timeout']])
  await pool.close()
})

test('MCP cancellation propagates instead of being treated as a server failure', async () => {
  const controller = new AbortController(),
    notices = [],
    closed = []
  const { McpPool } = await mcpFixture({
    started: () => controller.abort(),
    closed: (id) => closed.push(id),
  })
  const pool = new McpPool()
  await assert.rejects(
    pool.connect(
      ['healthy', 'hang', 'last'].map(mcpServer),
      '/vault',
      controller.signal,
      (...args) => notices.push(args),
    ),
    { name: 'AbortError' },
  )
  assert.deepEqual(notices, [])
  assert.ok(closed.includes('healthy') && closed.includes('hang'))
  await assert.rejects(pool.call('mcp_0_0_healthy', {}, new AbortController().signal), /MCP/)
})

test('MCP startup diagnostics explain recovery in both UI languages', async () => {
  const { humanizeError } = await load('apps/obsidian/src/locale.ts')
  const raw = 'MCP_UNAVAILABLE ' + JSON.stringify({ id: 'Figma', reason: 'missing-command' })
  assert.match(humanizeError(raw, 'zh'), /Figma.*Node.js.*绝对路径.*普通聊天仍可继续/)
  assert.match(humanizeError(raw, 'en'), /Figma.*Node.js.*absolute.*Chat remains available/)
})

test('Agent continues after MCP startup failure and retries discovery on the next message', async () => {
  let recoveryAction = ''
  let connections = 0
  const notices = []
  const { Agent } = await load(
    'packages/agent-core/src/index.ts',
    {
      './transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../agent-core/src/transport':
        'export const serviceFetch=async()=>{throw new Error("Unexpected network request")}',
      '../../integrations/src/mcp':
        'export class McpPool {async connect(_config,_vault,_signal,unavailable){globalThis.connected();unavailable("Figma","missing-command");return []}}',
      '../../integrations/src/skills':
        'export const loadSkills=async()=>[];export const readSkillResource=()=>{};export const listSkills=async()=>[];export const describeSkills=async()=>[];export const createSkill=async()=>({id:"x",path:"p",resources:[],replaced:false});export const presetSkillIds=[]',
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
      connected: () => connections++,
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
    {
      change: () => {},
      notice: (text) => notices.push(text),
      approve: async () => true,
      ask: async () => ({}),
    },
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
  await agent.send('Try again', '')
  assert.equal(connections, 2)
  assert.equal(notices.filter((text) => text.startsWith('MCP_UNAVAILABLE ')).length, 2)
  assert.equal(agent.session.messages[3].status, 'complete')
})

test('Note thumbnails repaint recycled rows, removed images and theme changes', async () => {
  const observers = [],
    frames = [],
    fills = [],
    cleanups = [],
    hooks = new Map()
  let intersect,
    dark = false,
    img,
    makeFile
  const classes = new Set()
  const row = {
    dataset: { path: 'one.md' },
    isConnected: true,
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    querySelector: () => img,
    createEl: () => ({
      setAttribute() {},
      remove() {
        img = undefined
      },
    }),
    prepend: (image) => {
      img = image
    },
  }
  const { installNoteThumbnails } = await load(
    'apps/obsidian/src/note-thumbnails.ts',
    {
      obsidian:
        'export class TFile {constructor(path){this.path=path;this.basename=path;this.extension="md";this.stat={mtime:1,size:10}}}; globalThis.registerFileFactory((path)=>new TFile(path));',
    },
    {
      document: { body: {}, querySelectorAll: () => [row] },
      window: {
        requestAnimationFrame: (cb) => {
          frames.push(cb)
          return frames.length
        },
        cancelAnimationFrame() {},
        getComputedStyle: () => ({
          getPropertyValue: (key) =>
            key === '--background-primary' ? (dark ? '#222' : '#fff') : '#888',
        }),
      },
      IntersectionObserver: class {
        constructor(cb) {
          intersect = cb
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
      MutationObserver: class {
        constructor(cb) {
          observers.push(cb)
        }
        observe() {}
        disconnect() {}
      },
      createEl: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: '',
          fillRect() {
            fills.push(this.fillStyle)
          },
          measureText: () => ({ width: 5 }),
          fillText() {},
        }),
        toDataURL: () => `data:image/png;${fills.length}`,
      }),
      registerFileFactory: (factory) => {
        makeFile = factory
      },
    },
  )
  const files = new Map(['one.md', 'two.md'].map((path) => [path, makeFile(path)]))
  const on = (event, callback) => {
    hooks.set(event, callback)
    return {}
  }
  const refresh = installNoteThumbnails({
    agentSettings: { noteThumbnails: true },
    app: {
      vault: {
        getAbstractFileByPath: (path) => files.get(path),
        cachedRead: async (file) => `# ${file.basename}`,
        on,
      },
      metadataCache: { getFileCache: () => ({}) },
      workspace: { on },
    },
    registerEvent() {},
    register: (callback) => cleanups.push(callback),
  })
  const flush = async () => {
    while (frames.length) frames.shift()()
    await new Promise((resolve) => setImmediate(resolve))
  }
  await flush()
  intersect([{ target: row, isIntersecting: true }])
  await flush()
  assert.ok(img)
  assert.equal(fills.at(-1), '#fff')
  const first = img.src
  row.dataset.path = 'two.md'
  observers[0]()
  await flush()
  assert.ok(img)
  assert.notEqual(img.src, first)
  img.remove()
  observers[0]()
  await flush()
  assert.ok(img, 'a removed thumbnail is restored even when the row remains observed')
  const configFile = makeFile('.catea/config.json')
  configFile.extension = 'json'
  const beforeConfigWrite = img
  hooks.get('modify')(configFile)
  await flush()
  assert.equal(img, beforeConfigWrite, 'background config writes must not clear thumbnails')
  dark = true
  observers[1]()
  await flush()
  assert.equal(fills.at(-1), '#222')
  assert.ok(img)
  refresh()
  await flush()
  assert.ok(img)
  cleanups.forEach((callback) => callback())
  assert.equal(img, undefined)
  assert.equal(classes.has('catea-has-thumbnail'), false)
})

test('Billing credentials never reach vault config, including legacy status copies', async () => {
  const source = await readFile('apps/obsidian/src/main.tsx', 'utf8')
  const method = source.slice(
    source.indexOf('  async saveAgentSettings()'),
    source.indexOf('  async saveModels('),
  )
  const { transform } = await import('esbuild')
  const { code } = await transform(`({${method}})`, { loader: 'ts' })
  let persisted
  const host = runInNewContext(code, {
    structuredClone,
    within: async (_vault, path) => path,
    dataPath: (path) => `.catea/${path}`,
    writeJson: async (_path, value) => {
      persisted = value
    },
  })
  for (const globalByok of [null, {}]) {
    const owner = {
      agentSettings: {
        models: [{ ...model, apiKey: 'hosted-secret' }],
        mcp: [],
        billingStatus: { pro: true, license_key: 'hosted-secret', email: 'test@example.invalid' },
      },
      globalByok,
      vaultPath: '/unused',
      configWrites: { run: (fn) => fn() },
      emit() {},
    }
    await host.saveAgentSettings.call(owner)
    assert.equal(JSON.stringify(persisted).includes('hosted-secret'), false)
    assert.equal(Object.hasOwn(persisted.billingStatus, 'license_key'), false)
    assert.equal(persisted.billingStatus.email, 'test@example.invalid')
    assert.equal(owner.agentSettings.models[0].apiKey, 'hosted-secret')
  }
})

test('Pro startup and refresh preserve model selection and restore securely loaded credentials', async () => {
  let response = { pro: true, license_key: 'renewed-secret', email: 'test@example.invalid' }
  let requests = 0
  const { syncSavedBillingStatus } = await load(
    'apps/obsidian/src/settings.ts',
    {
      obsidian: hostMock,
      '../../../packages/integrations/src/skills':
        'export const listSkills=async()=>[];export const describeSkills=async()=>[]',
    },
    {
      billingRequest: async () => {
        requests++
        return { status: 200, text: JSON.stringify(response) }
      },
    },
  )
  for (const selection of ['fixture', '', 'catea-pro-hosted']) {
    const secrets = []
    const owner = {
      agentSettings: {
        models: [
          { ...model },
          { ...model, id: 'catea-pro-hosted', apiKey: 'securely-loaded-secret' },
        ],
        modelId: selection,
        billingEmail: 'test@example.invalid',
        billingStatus: { pro: true },
      },
      async saveModels() {},
      async saveAgentSettings() {},
      async addMiniMaxModels() {},
      saveSecret: (id, key) => secrets.push([id, key]),
      emit() {},
    }
    const before = requests
    await syncSavedBillingStatus(owner, { refresh: false })
    assert.equal(requests, before)
    assert.equal(owner.agentSettings.modelId, selection)
    assert.equal(
      owner.agentSettings.models.find((m) => m.id === 'catea-pro-hosted').apiKey,
      'securely-loaded-secret',
    )
    await syncSavedBillingStatus(owner)
    assert.equal(owner.agentSettings.modelId, selection)
    assert.equal(owner.agentSettings.models.filter((m) => m.id === 'catea-pro-hosted').length, 1)
    assert.equal(secrets.at(-1)[1], 'renewed-secret')
    response = { pro: false }
    await syncSavedBillingStatus(owner)
    assert.equal(owner.agentSettings.modelId, selection === 'catea-pro-hosted' ? '' : selection)
    assert.equal(
      owner.agentSettings.models.some((m) => m.id === 'catea-pro-hosted'),
      false,
    )
    response = { pro: true, license_key: 'renewed-secret', email: 'test@example.invalid' }
  }
  const owner = {
    agentSettings: {
      models: [{ ...model }],
      modelId: 'fixture',
      billingStatus: { pro: true, license_key: 'legacy-secret' },
    },
    async saveModels() {},
    async saveAgentSettings() {},
    async addMiniMaxModels() {},
    saveSecret(_id, value) {
      this.savedKey = value
    },
    emit() {},
  }
  await syncSavedBillingStatus(owner, { refresh: false })
  assert.equal(owner.savedKey, 'legacy-secret')
  assert.equal(owner.agentSettings.modelId, 'fixture')
})
