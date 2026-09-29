import { build } from 'esbuild'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REPO_ROOT } from './dip-contract.ts'
import { agentLoopPatchPlugin } from '../scripts/agent-loop-patch.mjs'

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
}
const model = {
  id: 'test',
  name: 'test',
  api: 'openai-completions',
  provider: 'test',
  contextWindow: 4096,
  maxTokens: 100,
  cost: usage.cost,
}

async function loopRuntime(): Promise<{
  agentLoop: Function
  AssistantMessageEventStream: new () => { push(event: unknown): void; end(message: unknown): void }
}> {
  const bundle = await build({
    stdin: {
      contents:
        'export {agentLoop} from "./packages/agent-core/upstream/loop/agent-loop.ts"; export {AssistantMessageEventStream} from "./packages/agent-core/upstream/ai/events.ts"',
      resolveDir: REPO_ROOT,
      sourcefile: 'loop-test-entry.ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    alias: { '@catui/ai': resolve(REPO_ROOT, 'packages/agent-core/upstream/ai') },
    plugins: [
      agentLoopPatchPlugin(REPO_ROOT),
      {
        name: 'test-stream',
        setup(build) {
          build.onResolve({ filter: /^@catui\/ai\/stream$/ }, () => ({
            path: 'stream',
            namespace: 'test',
          }))
          build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
            contents: 'export function streamSimple(){throw new Error("test stream required")}',
          }))
        },
      },
    ],
  })
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
  return import(url) as Promise<{
    agentLoop: Function
    AssistantMessageEventStream: new () => {
      push(event: unknown): void
      end(message: unknown): void
    }
  }>
}

function assistant(calls: Array<{ id: string; args: Record<string, unknown> }>) {
  return {
    role: 'assistant',
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage,
    stopReason: calls.length ? 'toolUse' : 'stop',
    timestamp: Date.now(),
    content: calls.map((call) => ({
      type: 'toolCall',
      id: call.id,
      name: 'read',
      arguments: call.args,
    })),
  }
}

const readTool = (execute: (id: string) => Promise<unknown>) => ({
  name: 'read',
  label: 'read',
  description: 'read',
  parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
  isConcurrencySafe: true,
  execute,
})

test('host approval pauses before another safe tool runs', async () => {
  const { agentLoop, AssistantMessageEventStream } = await loopRuntime()
  const executed: string[] = []
  const streamFn = () => {
    const stream = new AssistantMessageEventStream()
    const message = assistant([
      { id: 'one', args: { key: 'one' } },
      { id: 'two', args: { key: 'two' } },
    ])
    stream.push({ type: 'done', reason: 'toolUse', message })
    stream.end(message)
    return stream
  }
  const events: unknown[] = []
  for await (const event of agentLoop(
    [{ role: 'user', content: 'go', timestamp: Date.now() }],
    {
      systemPrompt: '',
      messages: [],
      tools: [
        readTool(async (id) => {
          executed.push(id)
          return { content: [{ type: 'text', text: id }] }
        }),
      ],
    },
    {
      model,
      convertToLlm: (messages: unknown) => messages,
      canUseTool: ({ toolCallId }: { toolCallId: string }) =>
        toolCallId === 'one'
          ? { decision: 'pause', reason: 'confirm', checkpointId: 'checkpoint' }
          : { decision: 'allow' },
    },
    undefined,
    streamFn,
  ))
    events.push(event)
  assert.deepEqual(executed, [])
  assert.equal(
    (
      events.find(
        (event) =>
          typeof event === 'object' &&
          event !== null &&
          (event as { type?: string }).type === 'agent_result',
      ) as { stopReason: string }
    ).stopReason,
    'approval_required',
  )
})

test('livelock records every result from an already completed safe batch', async () => {
  const { agentLoop, AssistantMessageEventStream } = await loopRuntime()
  let turn = 0
  const streamFn = () => {
    const stream = new AssistantMessageEventStream()
    const message = assistant(
      ++turn === 1
        ? [{ id: 'first', args: { key: 'same' } }]
        : [
            { id: 'repeat', args: { key: 'same' } },
            { id: 'other', args: { key: 'other' } },
          ],
    )
    stream.push({ type: 'done', reason: 'toolUse', message })
    stream.end(message)
    return stream
  }
  const events: unknown[] = []
  for await (const event of agentLoop(
    [{ role: 'user', content: 'go', timestamp: Date.now() }],
    {
      systemPrompt: '',
      messages: [],
      tools: [
        readTool(async (_id: string, args: { key: string }) => ({
          content: [{ type: 'text', text: args.key }],
        })),
      ],
    },
    {
      model,
      convertToLlm: (messages: unknown) => messages,
      loopProgress: { repetitionThreshold: 2 },
    },
    undefined,
    streamFn,
  ))
    events.push(event)
  const end = events.find(
    (event) =>
      typeof event === 'object' &&
      event !== null &&
      (event as { type?: string }).type === 'agent_end',
  ) as { messages: Array<{ role: string; toolCallId?: string }> }
  assert.deepEqual(
    end.messages
      .filter((message) => message.role === 'toolResult')
      .map((message) => message.toolCallId),
    ['first', 'repeat', 'other'],
  )
})

test('context overflow recovery retries once and then ends on a second error', async () => {
  const { agentLoop, AssistantMessageEventStream } = await loopRuntime()
  let requests = 0,
    recoveries = 0
  const streamFn = () => {
    const stream = new AssistantMessageEventStream()
    requests++
    const message = {
      ...assistant([]),
      stopReason: 'error',
      errorMessage: 'context_length_exceeded',
    }
    stream.push({ type: 'error', reason: 'error', error: message })
    stream.end(message)
    return stream
  }
  const events: unknown[] = []
  for await (const event of agentLoop(
    [{ role: 'user', content: 'go', timestamp: Date.now() }],
    { systemPrompt: '', messages: [], tools: [] },
    {
      model,
      convertToLlm: (messages: unknown) => messages,
      maxModelErrorRecoveryAttempts: 1,
      recoverModelError: async ({ messages }: { messages: unknown[] }) => {
        recoveries++
        return { action: 'retry', messages }
      },
    },
    undefined,
    streamFn,
  ))
    events.push(event)
  assert.equal(requests, 2)
  assert.equal(recoveries, 1)
  assert.equal(
    (
      events.find(
        (event) =>
          typeof event === 'object' &&
          event !== null &&
          (event as { type?: string }).type === 'agent_result',
      ) as { stopReason: string }
    ).stopReason,
    'error',
  )
})
