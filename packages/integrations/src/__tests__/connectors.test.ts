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

test('connectors | built-in MVP is email and Figma only', () => {
  assert.deepEqual(
    builtInConnectorManifests.map((connector) => connector.id),
    ['email', 'figma'],
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

test('connectors | discovery tools expose summaries and full manifests', () => {
  assert.deepEqual(
    connectorTools.map((tool) => tool.name),
    ['connector_list', 'connector_capabilities'],
  )
  const list = JSON.parse(runConnectorTool('connector_list', {}))
  assert.deepEqual(
    list.map((connector: { id: string }) => connector.id),
    connectorList().map((connector) => connector.id),
  )
  const figma = JSON.parse(runConnectorTool('connector_capabilities', { connector: 'figma' }))
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
    ['email', 'figma'],
  )
  assert.equal(connectorConfig(configs, 'email').enabled, true)
  assert.equal(connectorConfig(configs, 'email').adapter, 'smtp_mailto')
  assert.deepEqual(connectorConfig(configs, 'email').keys, {
    EMAIL_ACCESS_TOKEN: true,
    EMAIL_REFRESH_TOKEN: false,
  })
})

test('connectors | discovery tools include configured enablement status', () => {
  const configs = [{ id: 'figma', enabled: true, adapter: 'figma_official_mcp', keys: {} }]
  const list = JSON.parse(runConnectorTool('connector_list', {}, configs))
  const figma = list.find((connector: { id: string }) => connector.id === 'figma')
  assert.equal(figma.status.enabled, true)
  assert.equal(figma.status.adapter, 'figma_official_mcp')

  const manifest = JSON.parse(
    runConnectorTool('connector_capabilities', { connector: 'figma' }, configs),
  )
  assert.equal(manifest.status.enabled, true)
})
