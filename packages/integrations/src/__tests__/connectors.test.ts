import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractTest } from '../../../../tests/dip-contract.ts'
import {
  builtInConnectorManifests,
  connectorCapabilities,
  connectorConfig,
  connectorList,
  connectorTools,
  normalizeConnectorConfigs,
  runConnectorTool,
} from '../connectors.ts'

contractTest('packages/integrations/src/connectors.ts')

test('connectors | built-in apps include communication, design and reading targets', () => {
  assert.deepEqual(
    builtInConnectorManifests.map((connector) => connector.id),
    ['email', 'figma', 'wechat', 'weread'],
  )
})

test('connectors | MVP manifests declare both read and write capability', () => {
  for (const manifest of builtInConnectorManifests) {
    assert.equal(manifest.capabilities.read, true)
    assert.equal(manifest.capabilities.write, true)
    assert.ok(manifest.tools.some((tool) => tool.capability === 'read'))
    assert.ok(
      manifest.tools.some((tool) => ['write', 'draft', 'canvas_write'].includes(tool.capability)),
    )
  }
})

test('connectors | email is draft-first and Figma writes native canvas', () => {
  const email = connectorCapabilities('email')
  const figma = connectorCapabilities('figma')
  assert.equal(email.capabilities.draft, true)
  assert.equal(email.tools.find((tool) => tool.name === 'create_draft')?.approval, 'required')
  assert.equal(figma.capabilities.canvas_write, true)
  assert.equal(figma.tools.find((tool) => tool.name === 'write_canvas')?.approval, 'required')
})

test('connectors | WeChat and WeRead model the requested read/write workflows separately', () => {
  const wechat = connectorCapabilities('wechat')
  const weread = connectorCapabilities('weread')
  assert.equal(wechat.category, 'communication')
  assert.equal(
    wechat.adapters.find((adapter) => adapter.id === 'wechat_pushplus')?.status,
    'recommended',
  )
  assert.equal(
    wechat.adapters.find((adapter) => adapter.id === 'wechat_desktop_bridge')?.type,
    'local_bridge',
  )
  assert.equal(
    wechat.tools.find((tool) => tool.name === 'share_note_to_self')?.approval,
    'required',
  )
  assert.equal(
    wechat.tools.find((tool) => tool.name === 'create_official_article_draft')?.capability,
    'draft',
  )
  assert.equal(weread.category, 'reading')
  assert.equal(weread.tools.find((tool) => tool.name === 'list_shelf')?.capability, 'read')
  assert.equal(
    weread.tools.find((tool) => tool.name === 'send_document_to_weread')?.approval,
    'required',
  )
})

test('connectors | executable WeChat share routes to PushPlus with stored secrets', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const output = JSON.parse(
    await runConnectorTool(
      'connector_share',
      {
        connector: 'wechat',
        title: 'Catea note',
        content_markdown: '# Shared',
      },
      {
        configs: [{ id: 'wechat', enabled: true, adapter: 'wechat_pushplus', keys: {} }],
        getSecret: (id) => (id === 'connector-wechat-PUSHPLUS_TOKEN' ? 'push-token' : undefined),
        wechatHttpCall: async (url, init) => {
          calls.push({ url, init })
          return { code: 200, msg: 'ok' }
        },
      },
    ),
  )
  assert.equal(output.adapter, 'wechat_pushplus')
  assert.equal(calls[0]?.url, 'https://www.pushplus.plus/send')
  assert.equal(JSON.parse(String(calls[0]?.init.body)).token, 'push-token')
})

test('connectors | discovery tools expose summaries and full manifests', async () => {
  assert.deepEqual(
    connectorTools.map((tool) => tool.name),
    [
      'connector_list',
      'connector_capabilities',
      'connector_read',
      'connector_create',
      'connector_update',
      'connector_share',
    ],
  )
  const list = JSON.parse(await runConnectorTool('connector_list', {}))
  assert.deepEqual(
    list.map((connector: { id: string }) => connector.id),
    connectorList().map((connector) => connector.id),
  )
  const figma = JSON.parse(await runConnectorTool('connector_capabilities', { connector: 'figma' }))
  assert.equal(figma.id, 'figma')
  assert.equal(figma.capabilities.canvas_write, true)
})

test('connectors | config normalization keeps only manifest-backed settings', () => {
  const configs = normalizeConnectorConfigs([
    {
      id: 'email',
      enabled: true,
      adapter: 'missing-adapter',
      keys: { EMAIL_ACCESS_TOKEN: true, random: true },
    },
    { id: 'unknown', enabled: true },
  ])
  assert.deepEqual(
    configs.map((config) => config.id),
    ['email', 'figma', 'wechat', 'weread'],
  )
  assert.equal(connectorConfig(configs, 'email').enabled, true)
  assert.equal(connectorConfig(configs, 'email').adapter, 'smtp_mailto')
  assert.deepEqual(connectorConfig(configs, 'email').keys, {
    EMAIL_ACCESS_TOKEN: true,
    EMAIL_REFRESH_TOKEN: false,
  })
})

test('connectors | discovery tools include configured enablement status', async () => {
  const configs = [{ id: 'figma', enabled: true, adapter: 'figma_official_mcp', keys: {} }]
  const list = JSON.parse(await runConnectorTool('connector_list', {}, configs))
  const figma = list.find((connector: { id: string }) => connector.id === 'figma')
  assert.equal(figma.status.enabled, true)
  assert.equal(figma.status.adapter, 'figma_official_mcp')

  const manifest = JSON.parse(
    await runConnectorTool('connector_capabilities', { connector: 'figma' }, configs),
  )
  assert.equal(manifest.status.enabled, true)
})

test('connectors | executable Figma create routes to use_figma', async () => {
  const calls: { tool: string; args: Record<string, unknown> }[] = []
  const output = JSON.parse(
    await runConnectorTool(
      'connector_create',
      {
        connector: 'figma',
        target: { file_url: 'https://www.figma.com/design/abc123/Catea?node-id=1-2' },
        document: {
          kind: 'figma_document',
          version: 1,
          nodes: [{ type: 'text', name: 'Title', text: 'Hello Figma' }],
        },
      },
      {
        configs: [{ id: 'figma', enabled: true, adapter: 'figma_official_mcp', keys: {} }],
        figmaCall: async (tool, args) => {
          calls.push({ tool, args })
          return { ok: true, tool, args }
        },
      },
    ),
  )
  assert.equal(output.ok, true)
  assert.equal(calls[0]?.tool, 'use_figma')
  assert.equal(calls[0]?.args.fileKey, 'abc123')
  assert.equal(calls[0]?.args.nodeId, '1:2')
  assert.equal(calls[0]?.args.skillNames, 'figma-use')
  assert.match(String(calls[0]?.args.code), /figma\.createText/)
})
