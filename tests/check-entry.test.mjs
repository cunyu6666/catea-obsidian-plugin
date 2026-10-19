import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('clean-check entry builds before every artifact-dependent gate', () => {
  const { scripts } = JSON.parse(read('package.json'))
  assert.deepEqual(scripts.check.split(' && '), [
    'npm run build',
    'npm test',
    'npm run format:check',
    'npm run typecheck',
    'npm run lint',
    'npm run check:marketplace',
    'npm run test:behavior',
  ])
})

test('CI and both release paths use the same clean-check entry', () => {
  for (const workflow of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
    assert.match(read(workflow), /^[ \t]+run: npm run check[ \t]*$/m)
  }
  assert.match(read('scripts/release.mjs'), /run\('npm', \['run', 'check'\]\)/)
})
