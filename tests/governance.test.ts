/**
 * [WHO]: Provides the release-metadata governance gate
 * [FROM]: Depends on ../packages/agent-core/src/version.ts for PLUGIN_VERSION, ./dip-contract.ts for the repo index, node:fs and node:test
 * [TO]: Consumed by `npm test`; (entry) otherwise
 * [HERE]: tests/governance.test.ts - enforces directory-safe metadata and one version across release inputs, so a release cannot be cut from a drifted tree
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { REPO_ROOT, inScopeDIPFiles, readSource } from './dip-contract.ts'
import { PLUGIN_VERSION } from '../packages/agent-core/src/version.ts'

function json(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, rel), 'utf8'))
}

const manifest = json('manifest.json')
const manifestVersion = String(manifest.version)
const manifestMinApp = String(manifest.minAppVersion)

test('governance | manifest.json is a valid plugin manifest', () => {
  assert.equal(
    manifest.id,
    'catea-paper',
    'manifest id must stay catea-paper; Obsidian keys updates off it',
  )
  assert.equal(
    manifest.isDesktopOnly,
    true,
    'the plugin uses Node fs/child_process, so it must stay desktop-only',
  )
  assert.match(
    manifestVersion,
    /^\d+\.\d+\.\d+$/,
    'manifest version must be a bare semver with no v prefix',
  )
  assert.match(manifestMinApp, /^\d+\.\d+\.\d+$/, 'minAppVersion must be a bare semver')
  assert.equal(
    manifest.description,
    'Paper workspace with a native Catea Agent.',
    'manifest description must match the Obsidian directory entry exactly or the mirror will remove the plugin',
  )
})

test('governance | the runtime constant equals manifest.json', () => {
  assert.equal(
    PLUGIN_VERSION,
    manifestVersion,
    `packages/agent-core/src/version.ts says ${PLUGIN_VERSION} but manifest.json says ${manifestVersion}`,
  )
})

test('governance | every package.json agrees with manifest.json', () => {
  for (const rel of ['package.json', 'apps/obsidian/package.json']) {
    const version = String(json(rel).version)
    assert.equal(
      version,
      manifestVersion,
      `${rel} says ${version} but manifest.json says ${manifestVersion}`,
    )
  }
})

test('governance | versions.json maps the released version to minAppVersion', () => {
  const versions = json('versions.json')
  assert.equal(
    versions[manifestVersion],
    manifestMinApp,
    `versions.json must map "${manifestVersion}" to the manifest minAppVersion "${manifestMinApp}" so older Obsidian builds can still resolve a compatible release`,
  )
  for (const [pluginVersion, minApp] of Object.entries(versions)) {
    assert.match(
      pluginVersion,
      /^\d+\.\d+\.\d+$/,
      `versions.json key "${pluginVersion}" is not a bare semver`,
    )
    assert.match(
      String(minApp),
      /^\d+\.\d+\.\d+$/,
      `versions.json value for ${pluginVersion} is not a bare semver`,
    )
  }
})

test('governance | only version.ts hardcodes a version string', () => {
  const offenders: string[] = []
  for (const rel of inScopeDIPFiles()) {
    if (rel === 'packages/agent-core/src/version.ts') continue
    // A client/plugin identity literal such as version:'0.3.0' is the drift this guards.
    if (/version\s*:\s*['"`]\d+\.\d+\.\d+['"`]/.test(readSource(rel))) offenders.push(rel)
  }
  assert.deepEqual(
    offenders,
    [],
    `these files hardcode a version instead of importing PLUGIN_VERSION: ${offenders.join(', ')}`,
  )
})

test('governance | a present build output was built from the current version', () => {
  const built = resolve(REPO_ROOT, 'dist/catea-paper/manifest.json')
  if (!existsSync(built)) return
  const builtVersion = String(JSON.parse(readFileSync(built, 'utf8')).version)
  assert.equal(
    builtVersion,
    manifestVersion,
    `dist/catea-paper/manifest.json says ${builtVersion}; rebuild before releasing`,
  )
})

test('governance | the release-blocking asset files exist for a release', () => {
  // Obsidian needs these three attached to the GitHub release; missing ones cannot be detected after publish.
  const built = resolve(REPO_ROOT, 'dist/catea-paper')
  if (!existsSync(built)) return
  for (const asset of ['main.js', 'manifest.json', 'styles.css']) {
    assert.ok(
      existsSync(resolve(built, asset)),
      `build output is missing the release asset ${asset}`,
    )
  }
})
