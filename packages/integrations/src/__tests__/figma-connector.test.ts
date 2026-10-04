import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractTest } from '../../../../tests/dip-contract.ts'
import { buildFigmaIrScript, parseFigmaTarget } from '../figma-connector.ts'

contractTest('packages/integrations/src/figma-connector.ts')

test('figma connector | parses file and node ids from Figma URLs', () => {
  assert.deepEqual(
    parseFigmaTarget({
      target: { url: 'https://www.figma.com/design/fileKey123/Name?node-id=42-99' },
    }),
    { fileKey: 'fileKey123', nodeId: '42:99' },
  )
})

test('figma connector | compiles bounded IR into use_figma plugin code', () => {
  const code = buildFigmaIrScript(
    {
      kind: 'figma_document',
      version: 1,
      nodes: [
        {
          type: 'frame',
          name: 'Card',
          layout: { mode: 'vertical', gap: 8, padding: 16 },
          children: [{ type: 'text', name: 'Title', text: 'Catea' }],
        },
      ],
    },
    'create',
    { fileKey: 'fileKey123' },
  )
  assert.match(code, /await figma\.loadFontAsync/)
  assert.match(code, /figma\.createText/)
  assert.match(code, /createdNodeIds/)
  assert.doesNotMatch(code, /figma\.closePlugin/)
})
