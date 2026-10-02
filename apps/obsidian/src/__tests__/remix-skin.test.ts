import { contractTest } from '../../../../tests/dip-contract.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { LUCIDE_TO_REMIX, REMIX_ICON_BODIES } from '../../remix-skin/generated.ts'

const root = resolve(import.meta.dirname, '../../../..')

contractTest('apps/obsidian/src/remix-skin.ts')

const map = JSON.parse(
  await readFile(resolve(root, 'apps/obsidian/remix-skin/map.json'), 'utf8'),
) as {
  source: string
  resolved: Record<string, string>
  tier: Record<string, string>
}

test('remix-skin | every mapping resolves to a shipped body', () => {
  for (const [lucide, remix] of Object.entries(map.resolved))
    assert.ok(REMIX_ICON_BODIES[remix], `${lucide} -> ${remix} has no body`)
})

test('remix-skin | the generated table matches the checked-in map', () => {
  assert.deepEqual(LUCIDE_TO_REMIX, map.resolved)
})

test('remix-skin | no shipped icon is unreachable', async () => {
  const used = new Set(Object.values(map.resolved))
  const files = (await readdir(resolve(root, 'apps/obsidian/remix-skin/icons'))).map((n) =>
    n.replace(/\.svg$/, ''),
  )
  const orphans = files.filter((f) => !used.has(f))
  assert.deepEqual(orphans, [], `icons with no mapping: ${orphans.join(', ')}`)
})

test('remix-skin | every tier label is a known provenance class', () => {
  const known = new Set(['curated', 'identity', 'tabler-fallback'])
  for (const [lucide, tier] of Object.entries(map.tier)) {
    assert.ok(known.has(tier), `${lucide} has tier ${tier}`)
    assert.ok(lucide in map.resolved, `${lucide} has a tier but no mapping`)
  }
})

test('remix-skin | bodies are 24x24 fill-currentColor path markup', () => {
  for (const [name, body] of Object.entries(REMIX_ICON_BODIES)) {
    assert.match(body, /^<path /, `${name} does not start with a path`)
    assert.ok(!body.includes('<svg'), `${name} embeds a nested svg root`)
  }
})

test('remix-skin | sidebar tabs and vault switcher have semantic Remix glyphs', () => {
  const expected = {
    folder: 'folder',
    search: 'search',
    bookmark: 'bookmark',
    list: 'list-unordered',
    brain: 'brain',
    'messages-square': 'chat-3',
    'chevrons-up-down': 'expand-up-down',
  }
  for (const [native, remix] of Object.entries(expected)) {
    assert.equal(LUCIDE_TO_REMIX[native], remix)
    assert.ok(REMIX_ICON_BODIES[remix])
  }
})
