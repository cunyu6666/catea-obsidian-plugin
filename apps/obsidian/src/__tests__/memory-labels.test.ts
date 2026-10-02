import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractTest } from '../../../../tests/dip-contract.ts'
import { TYPE_LABELS, TYPE_DESCRIPTIONS, typeLabel, typeDescription } from '../memory-labels.ts'
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

test('memory-labels | every memory type has a description', () => {
  // The sidebar card grid renders one line beneath the name; a missing entry
  // leaves an empty gap and the type no longer reads as a category.
  const missing = memoryTypes.filter((type) => !TYPE_DESCRIPTIONS[type])
  assert.deepEqual(missing, [], `memory types with no description: ${missing.join(', ')}`)
})

test('memory-labels | no description is defined for a type that does not exist', () => {
  const stale = Object.keys(TYPE_DESCRIPTIONS).filter(
    (key) => !(memoryTypes as readonly string[]).includes(key),
  )
  assert.deepEqual(stale, [], `descriptions for unknown memory types: ${stale.join(', ')}`)
})

test('memory-labels | descriptions stay short enough for one card line', () => {
  // The card reserves one line for the description; longer text wraps to two
  // lines and pushes the next card off-screen. 24 Chinese characters is the
  // empirical ceiling at 11px in the 2-column grid.
  for (const [type, description] of Object.entries(TYPE_DESCRIPTIONS)) {
    assert.ok(
      description.length <= 24,
      `${type} description is ${description.length} chars, expected <= 24`,
    )
    assert.ok(description.length > 0, `${type} description is empty`)
  }
})

test('memory-labels | typeDescription falls back to empty string', () => {
  assert.equal(typeDescription('not-a-real-type'), '')
})
