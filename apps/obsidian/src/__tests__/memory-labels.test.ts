import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractTest } from '../../../../tests/dip-contract.ts'
import { TYPE_LABELS, typeLabel } from '../memory-labels.ts'
import { memoryTypes } from '../../../../packages/memory/src/model.ts'

contractTest('apps/obsidian/src/memory-labels.ts')

test('memory-labels | every memory type has a display label', () => {
  // Without this, adding a type to memoryTypes silently renders the raw slug in
  // the sidebar, because typeLabel falls back to the id.
  const missing = memoryTypes.filter((type) => !TYPE_LABELS[type])
  assert.deepEqual(missing, [], `memory types with no label: ${missing.join(', ')}`)
})

test('memory-labels | no label is defined for a type that does not exist', () => {
  // The reverse drift: a stale label keeps a removed type alive in the UI copy.
  const stale = Object.keys(TYPE_LABELS).filter(
    (key) => !(memoryTypes as readonly string[]).includes(key),
  )
  assert.deepEqual(stale, [], `labels for unknown memory types: ${stale.join(', ')}`)
})

test('memory-labels | typeLabel falls back to the slug', () => {
  assert.equal(typeLabel('writing-project'), '写作项目')
  assert.equal(typeLabel('not-a-real-type'), 'not-a-real-type')
})
