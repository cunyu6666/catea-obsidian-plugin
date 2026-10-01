/**
 * [WHO]: Provides the compile-time data-directory gate
 * [FROM]: Depends on ./dip-contract.ts for REPO_ROOT, ../packages/integrations/src/data-dir.ts for DATA_DIR and dataPath, esbuild, node:test, node:child_process, node:fs/promises, node:os and node:path
 * [TO]: Consumed by `npm test`; (entry) otherwise
 * [HERE]: tests/data-dir.test.ts - proves the data root falls back to .catea without a build-time define and becomes .catea-dev with one, so a dev bundle cannot reach the released plugin's state
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { REPO_ROOT } from './dip-contract.ts'
import { DATA_DIR, dataPath } from '../packages/integrations/src/data-dir.ts'

const SOURCE_DIR = resolve(REPO_ROOT, 'packages/integrations/src')

/** Bundle data-dir.ts the way build.mjs does and return what it logs at runtime. */
async function bundledDataDir(define?: Record<string, string>): Promise<string> {
  const result = await build({
    stdin: {
      contents: `import { DATA_DIR } from './data-dir'\nprocess.stdout.write(DATA_DIR)`,
      resolveDir: SOURCE_DIR,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    define,
  })
  const directory = await mkdtemp(join(tmpdir(), 'catea-data-dir-'))
  try {
    const file = join(directory, 'probe.cjs')
    await writeFile(file, result.outputFiles[0].text)
    return execFileSync(process.execPath, [file], { encoding: 'utf8' })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('data-dir | the unbuilt default is the released directory', () => {
  // Every existing behavior test asserts literal .catea/... paths and runs without
  // a define, so this fallback is what keeps them correct.
  assert.equal(DATA_DIR, '.catea')
})

test('data-dir | dataPath joins under the data root', () => {
  assert.equal(dataPath('memory', 'global'), `${DATA_DIR}/memory/global`)
  assert.equal(dataPath('sessions', 'index.json'), `${DATA_DIR}/sessions/index.json`)
  assert.equal(dataPath(), DATA_DIR)
})

test('data-dir | a dev define swaps the root in the emitted bundle', async () => {
  assert.equal(await bundledDataDir({ CATEA_DATA_DIR: '".catea-dev"' }), '.catea-dev')
})

test('data-dir | a production define keeps the released root', async () => {
  assert.equal(await bundledDataDir({ CATEA_DATA_DIR: '".catea"' }), '.catea')
})

test('data-dir | no define at all falls back instead of throwing', async () => {
  // A missing define must degrade to the released directory, not a ReferenceError
  // that would surface only inside Obsidian.
  assert.equal(await bundledDataDir(), '.catea')
})
