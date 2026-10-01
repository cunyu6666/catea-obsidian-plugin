/**
 * [WHO]: Provides the dev-build identity gate
 * [FROM]: Depends on ../scripts/dev-target.mjs for DEV_ID, DEV_NAME, devDataDir, devManifest and relocatePromptPaths, ./dip-contract.ts for REPO_ROOT and readSource, node:fs and node:test
 * [TO]: Consumed by `npm test`; (entry) otherwise
 * [HERE]: tests/dev-target.test.ts - pins the development-build plugin identity so a dev bundle can be installed beside the released plugin without either one claiming the other's id or data directory
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEV_ID,
  DEV_NAME,
  devDataDir,
  devManifest,
  relocatePromptPaths,
} from '../scripts/dev-target.mjs'
import { REPO_ROOT } from './dip-contract.ts'

// A fresh object per test: if devManifest mutated its argument, comparing against
// a shared constant would compare the mutation to itself and always pass.
function releasedManifest() {
  return {
    id: 'catea-paper',
    name: 'Catea',
    version: '0.3.22',
    minAppVersion: '1.8.0',
    description: 'Paper workspace with a native Catea Agent.',
    author: 'Cunyu',
    isDesktopOnly: true,
  }
}

test('dev-target | the development identity differs from the released one', () => {
  assert.equal(DEV_ID, 'catea-paper-dev')
  assert.equal(DEV_NAME, 'Catea (Dev)')
  assert.notEqual(
    DEV_ID,
    releasedManifest().id,
    'a shared id makes Obsidian treat both copies as one plugin',
  )
})

test('dev-target | devDataDir maps the development id to an isolated directory', () => {
  assert.equal(devDataDir(DEV_ID), '.catea-dev')
  assert.equal(devDataDir('catea-paper'), '.catea')
  assert.notEqual(
    devDataDir(DEV_ID),
    devDataDir('catea-paper'),
    'the dev build must never share .catea with the released plugin: memory migration is in-place and one-way',
  )
})

test('dev-target | devManifest rewrites only id and name', () => {
  const built = devManifest(releasedManifest())
  assert.equal(built.id, DEV_ID)
  assert.equal(built.name, DEV_NAME)
  assert.equal(built.version, '0.3.22', 'version must stay a bare semver Obsidian accepts')
  assert.equal(built.minAppVersion, '1.8.0')
  assert.equal(built.description, 'Paper workspace with a native Catea Agent.')
  assert.equal(built.author, 'Cunyu')
  assert.equal(built.isDesktopOnly, true)
})

test('dev-target | devManifest does not mutate its argument', () => {
  const input = releasedManifest()
  const built = devManifest(input)
  assert.deepEqual(input, releasedManifest())
  assert.notEqual(built, input, 'build.mjs reads manifest.json once and reuses the object')
})

test('dev-target | relocatePromptPaths moves data paths to the dev root', () => {
  assert.equal(
    relocatePromptPaths('write to .catea/skills/<id>/SKILL.md and .catea/memory', '.catea-dev'),
    'write to .catea-dev/skills/<id>/SKILL.md and .catea-dev/memory',
  )
  assert.equal(relocatePromptPaths('`.catea/` is hidden', '.catea-dev'), '`.catea-dev/` is hidden')
})

test('dev-target | relocatePromptPaths leaves class names and prose alone', () => {
  // Only the directory form carries a slash; `.catea-ui` is a CSS class and
  // "Catea" in prose must survive untouched.
  const text = 'the .catea-ui panel of Catea renders .catea/sessions'
  assert.equal(
    relocatePromptPaths(text, '.catea-dev'),
    'the .catea-ui panel of Catea renders .catea-dev/sessions',
  )
})

test('dev-target | relocatePromptPaths is the identity for the released root', () => {
  const text = 'skills live in .catea/skills/<id>/SKILL.md'
  assert.equal(relocatePromptPaths(text, '.catea'), text)
})

test('dev-target | every bundled prompt file is fully relocated in a dev build', () => {
  // These are injected into the system prompt, so a stale .catea/ path would send
  // the dev build's model to the released plugin's real data.
  const bundled = [
    'apps/obsidian/src/skills/obsidian.md',
    'packages/integrations/src/skill-creator.md',
    'packages/integrations/src/find-skill.md',
    'packages/personas/src/vex.md',
    'packages/personas/src/aria.md',
    'packages/personas/src/pencil.md',
    'packages/personas/src/dazai.md',
  ]
  for (const rel of bundled) {
    const text = readFileSync(resolve(REPO_ROOT, rel), 'utf8')
    assert.ok(
      !relocatePromptPaths(text, '.catea-dev').includes('.catea/'),
      `${rel} still names the released data directory after relocation`,
    )
  }
})
