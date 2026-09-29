import { contractTest } from '../../../../tests/dip-contract.ts'

contractTest('apps/obsidian/src/turn-review.ts')

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectFileChanges, showStandaloneFileReview } from '../turn-review.ts'

test('file review keeps the original content across repeated writes', () => {
  const changes = collectFileChanges([
    {
      id: 'write',
      name: 'write',
      args: {},
      result: 'ok',
      fileChange: {
        filePath: 'note.md',
        toolType: 'Write',
        original: 'before',
        modified: 'middle',
      },
    },
    {
      id: 'edit',
      name: 'edit',
      args: {},
      result: 'ok',
      fileChange: { filePath: 'note.md', toolType: 'Edit', original: 'middle', modified: 'after' },
    },
  ])
  assert.deepEqual(changes, [
    { filePath: 'note.md', toolType: 'Edit', original: 'before', modified: 'after' },
  ])
})

test('failed or empty-text turns retain a standalone file-review action', () => {
  const changes = [
    { filePath: 'note.md', toolType: 'Write' as const, original: null, modified: 'saved' },
  ]
  assert.equal(showStandaloneFileReview('', 'error', changes), true)
  assert.equal(showStandaloneFileReview('', 'stopped', changes), true)
  assert.equal(showStandaloneFileReview('', 'streaming', changes), false)
  assert.equal(showStandaloneFileReview('answer', 'complete', changes), false)
})
