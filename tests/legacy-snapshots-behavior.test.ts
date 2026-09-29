import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'
import { REPO_ROOT } from './dip-contract.ts'

async function cleanupFunction() {
  const bundle = await build({
    entryPoints: [resolve(REPO_ROOT, 'packages/integrations/src/legacy-snapshots.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  })
  const url = `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
  return (await import(url)).cleanupLegacySnapshots as (vault: string) => Promise<boolean>
}

test('legacy cleanup removes only the obsolete snapshot tree', async () => {
  const vault = await mkdtemp(join(tmpdir(), 'catea-legacy-snapshots-'))
  try {
    const cleanupLegacySnapshots = await cleanupFunction()
    await mkdir(join(vault, '.catea', 'snapshots', 'session', 'turn'), { recursive: true })
    await mkdir(join(vault, '.catea', 'sessions'), { recursive: true })
    await writeFile(join(vault, '.catea', 'snapshots', 'session', 'turn', 'note.md'), 'copy')
    await writeFile(join(vault, '.catea', 'sessions', 'keep.json'), '{}')
    assert.equal(await cleanupLegacySnapshots(vault), true)
    assert.equal(await cleanupLegacySnapshots(vault), false)
    assert.equal(await readFile(join(vault, '.catea', 'sessions', 'keep.json'), 'utf8'), '{}')
  } finally {
    await rm(vault, { recursive: true, force: true })
  }
})
