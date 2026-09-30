/**
 * [WHO]: Provides the vendored asset digest gate
 * [FROM]: Depends on node:fs, node:crypto, node:path, node:test, node:assert/strict for reads and hashing, and on ./dip-contract.ts for REPO_ROOT and listRepoFiles
 * [TO]: Consumed by npm test
 * [HERE]: tests/vendor-assets.test.ts - proves that a vendored, generated asset in apps/ is byte-for-byte the artifact a human approved, and that its manifest entry matches the P2 map
 */

import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { REPO_ROOT, gitTrackedFiles, ASSET_MANIFESTS, VENDORED_ASSETS } from './dip-contract.ts'

function manifestEntries(
  manifestRel: string,
): Record<string, { sha256: string; bytes: number; importedBy?: string[] }> {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, manifestRel), 'utf8')).assets ?? {}
}

const MANIFESTS = ASSET_MANIFESTS.map((rel) => ({ rel, assets: manifestEntries(rel) }))
const ALL_ASSETS = new Map(
  MANIFESTS.flatMap(({ rel, assets }) =>
    Object.entries(assets).map(([path, entry]) => [path, { entry, manifestRel: rel }] as const),
  ),
)

test('VENDOR | every excluded asset is declared by a manifest and the reverse', () => {
  assert.ok(MANIFESTS.length > 0, 'no asset manifests are registered')
  for (const { rel, assets } of MANIFESTS) {
    assert.ok(existsSync(resolve(REPO_ROOT, rel)), `asset manifest is missing: ${rel}`)
    for (const path of Object.keys(assets)) {
      assert.ok(VENDORED_ASSETS.has(path), `${path} is in ${rel} but not excluded from DIP`)
    }
  }
  for (const path of VENDORED_ASSETS) {
    assert.ok(ALL_ASSETS.has(path), `${path} is excluded from DIP with no manifest entry`)
  }
})

test('VENDOR | manifest exists and every listed asset is tracked', () => {
  const tracked = new Set(gitTrackedFiles())
  assert.ok(ALL_ASSETS.size > 0, 'manifests list no assets')
  for (const rel of ALL_ASSETS.keys()) {
    assert.ok(tracked.has(rel), `manifest points at an untracked file: ${rel}`)
  }
})

test('VENDOR | digests match the files on disk', () => {
  for (const [rel, { entry }] of ALL_ASSETS) {
    const buf = readFileSync(resolve(REPO_ROOT, rel))
    const digest = createHash('sha256').update(buf).digest('hex')
    assert.equal(
      digest,
      entry.sha256,
      `${rel} no longer matches its approved digest (${entry.sha256}); got ${digest}. ` +
        `Vendored assets are never hand-edited — regenerate from upstream, then update the manifest.`,
    )
    assert.equal(buf.length, entry.bytes, `${rel} byte count drifted from the manifest`)
  }
})

test('VENDOR | declared importers really import the asset', () => {
  for (const [rel, { entry }] of ALL_ASSETS) {
    const base = rel.split('/').pop() as string
    const dir = rel.slice(0, rel.length - base.length - 1)
    for (const importer of entry.importedBy ?? []) {
      const text = readFileSync(resolve(REPO_ROOT, importer), 'utf8')
      assert.ok(
        text.includes(base) || text.includes(`./${base}`),
        `${importer} is recorded as an importer of ${rel} but does not reference it`,
      )
      assert.ok(importer.startsWith(`${dir}/`), `${importer} is not a sibling of ${rel}`)
    }
  }
})

test('VENDOR | P2 map and P1 charter both disclose the asset', () => {
  const p1 = readFileSync(resolve(REPO_ROOT, 'AGENTS.md'), 'utf8')
  assert.match(p1, /deliberate exclusions/i, 'P1 lost its exclusions section')
  assert.ok(
    /vendored, generated assets/i.test(p1),
    'P1 must document vendored assets under apps/ as a deliberate DIP exclusion',
  )
  for (const rel of ALL_ASSETS.keys()) {
    const base = rel.split('/').pop() as string
    const p2Path = `${rel.slice(0, rel.length - base.length - 1)}/AGENTS.md`
    const p2 = readFileSync(resolve(REPO_ROOT, p2Path), 'utf8')
    assert.ok(
      p2.includes(base),
      `${p2Path} must list ${base}, since the member-list gate already requires it`,
    )
    assert.ok(p1.includes(base), `P1 must name ${base} in its exclusion note`)
  }
})
