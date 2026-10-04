import { contractTest } from '../../../../tests/dip-contract.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPresetServer, matchPreset, mcpPresets } from '../mcp-presets.ts'

contractTest('packages/integrations/src/mcp-presets.ts')

test('mcp presets | official Figma MCP uses the PAT header required by Figma', () => {
  const preset = mcpPresets.find((item) => item.id === 'figma-official')
  assert.ok(preset)
  const server = createPresetServer(preset)
  assert.equal(server.url, 'https://mcp.figma.com/mcp')
  assert.equal(server.tokenHeader, 'X-Figma-Token')
  assert.equal(server.headers?.['X-Figma-Plugin-Bundle'], 'figma_prod@2_2_126')
  assert.equal(matchPreset(server)?.id, 'figma-official')
})
