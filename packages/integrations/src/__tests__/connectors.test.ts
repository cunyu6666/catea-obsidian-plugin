import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractTest } from '../../../../tests/dip-contract.ts'
import {
  builtInConnectorManifests,
  connectorCapabilities,
  connectorList,
  connectorTools,
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
      manifest.tools.some((tool) =>
        ['write', 'draft', 'canvas_write'].includes(tool.capability),
      ),
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

