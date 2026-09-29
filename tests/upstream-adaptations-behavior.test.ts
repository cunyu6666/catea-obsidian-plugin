import { build } from 'esbuild'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
test('adapted validation checks and coerces tool arguments without modifying the original call', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'catea-validation-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const outfile = join(dir, 'validation.cjs')
  await build({
    entryPoints: ['packages/agent-core/upstream/ai/utils/validation.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
  })
  const { validateToolArguments } = require(outfile)
  const tool = {
    name: 'count',
    parameters: {
      type: 'object',
      properties: { count: { type: 'integer', minimum: 1 } },
      required: ['count'],
      additionalProperties: false,
    },
  }
  const call = { type: 'toolCall', id: '1', name: 'count', arguments: { count: '2' } }
  assert.deepEqual(validateToolArguments(tool, call), { count: 2 })
  assert.deepEqual(call.arguments, { count: '2' })
  for (const args of [null, {}, { count: 0 }, { count: {} }, { count: 1, extra: true }]) {
    assert.throws(
      () => validateToolArguments(tool, { ...call, arguments: args }),
      /Validation failed/,
    )
  }
})

test('stream rejection reasons become Error objects and abort remains distinguishable', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'catea-stream-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const outfile = join(dir, 'stream.cjs')
  await build({
    entryPoints: ['packages/agent-core/upstream/loop/agent-loop-stream-events.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
  })
  const { waitForAbortableOperation } = require(outfile)
  await assert.rejects(
    waitForAbortableOperation(Promise.reject('offline')),
    (error: Error & { cause?: unknown }) => error instanceof Error && error.cause === 'offline',
  )
  const abort = new AbortController()
  abort.abort()
  assert.deepEqual(await waitForAbortableOperation(Promise.resolve('done'), abort.signal), {
    type: 'aborted',
  })
})

test('legacy content reads and writes preserve old records and reject non-text payloads', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'catea-legacy-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const outfile = join(dir, 'compat.cjs')
  await build({
    stdin: {
      contents:
        "export * from './packages/memory/upstream/compat'; export * from './packages/memory/upstream/store'",
      resolveDir: process.cwd(),
    },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
  })
  const { readLegacyContent, syncLegacyContent, loadEntries, saveEntries, writeJson } = require(
    outfile,
  )
  assert.equal(readLegacyContent({ content: '旧内容' }), '旧内容')
  for (const value of [null, 1, {}, { content: {} }, { content: 42 }])
    assert.equal(readLegacyContent(value), undefined)
  const path = join(dir, 'knowledge.json')
  await writeJson(path, [
    {
      id: 'old',
      type: 'fact',
      content: '旧内容',
      tags: [],
      project: 'vault',
      importance: 5,
      created: '2026-09-29',
      accessCount: 0,
    },
  ])
  const records = await loadEntries(path)
  assert.equal(records[0].detail, '旧内容')
  records[0].detail = '新内容'
  syncLegacyContent(records[0])
  assert.equal(readLegacyContent(records[0]), '新内容')
  await saveEntries(path, records, 10, () => 1)
  assert.equal((await loadEntries(path))[0].detail, '新内容')
  assert.equal(readLegacyContent((await loadEntries(path))[0]), '新内容')
})

test('portable memory bus isolates Node state and supports explicit shared hosts', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'catea-host-global-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const outfile = join(dir, 'compat.cjs')
  await build({
    entryPoints: ['packages/memory/upstream/compat.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
  })
  const { memoryHostGlobal, configureMemoryHost } = require(outfile)
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  try {
    Reflect.deleteProperty(globalThis, 'window')
    const nodeHost = memoryHostGlobal()
    assert.notEqual(nodeHost, globalThis)
    assert.equal(memoryHostGlobal(), nodeHost)
    const shared = {}
    configureMemoryHost(shared)
    assert.equal(memoryHostGlobal(), shared)
    configureMemoryHost(undefined)
    const popout = {}
    Object.defineProperty(globalThis, 'window', { value: popout, configurable: true })
    assert.equal(memoryHostGlobal(), popout)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('historical CLI preserves help output and error exit status through standard streams', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'catea-memory-cli-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const outfile = join(dir, 'cli.cjs')
  await build({
    entryPoints: ['packages/memory/upstream/cli.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
  })
  const options = { encoding: 'utf8' as const, env: { ...process.env, NANOMEM_MEMORY_DIR: dir } }
  const help = spawnSync(process.execPath, [outfile, 'help'], options)
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /Usage:/)
  assert.match(help.stdout, /nanomem search/)
  assert.equal(help.stderr, '')
  const invalid = spawnSync(process.execPath, [outfile, 'unknown-command'], options)
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /Unknown command/)
  assert.equal(invalid.stdout, '')
})
