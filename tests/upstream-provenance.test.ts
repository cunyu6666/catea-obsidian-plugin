import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REPO_ROOT } from './dip-contract.ts'
import { applyAgentLoopPatch } from '../scripts/agent-loop-patch.mjs'

interface SourceHashes {
  commit: string
  files: Record<string, string>
}
interface LocalPatches {
  sourceCommit: string
  files: Record<string, { upstreamSha256: string; localSha256: string; reason: string }>
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8')) as T
}

test('agent-core upstream matches source hashes or documented local patches', () => {
  const source = readJson<SourceHashes>('packages/agent-core/upstream/SOURCE_HASHES.json')
  const patches = readJson<LocalPatches>('packages/agent-core/LOCAL_PATCHES.json')
  assert.equal(patches.sourceCommit, source.commit)
  for (const [path, patch] of Object.entries(patches.files)) {
    assert.equal(
      patch.upstreamSha256,
      source.files[path],
      `${path} has no matching original digest`,
    )
    assert.ok(patch.reason.trim(), `${path} needs a reason`)
  }
  for (const [path, sourceHash] of Object.entries(source.files)) {
    const data = readFileSync(resolve(REPO_ROOT, 'packages/agent-core/upstream', path))
    const actual = createHash('sha256').update(data).digest('hex')
    assert.equal(actual, sourceHash, `${path} differs from the original upstream snapshot`)
    const patch = patches.files[path]
    if (patch) {
      const patched = createHash('sha256')
        .update(applyAgentLoopPatch(data.toString('utf8')))
        .digest('hex')
      assert.equal(patched, patch.localSha256, `${path} patch differs from its reviewed digest`)
    }
  }
})
