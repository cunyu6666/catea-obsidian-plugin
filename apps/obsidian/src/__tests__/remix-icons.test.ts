import { contractTest } from '../../../../tests/dip-contract.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../..')

contractTest('apps/obsidian/src/remix-skin.ts')

const paperCss = await readFile(resolve(root, 'apps/obsidian/paper.css'), 'utf8')
const mainTsx = await readFile(resolve(root, 'apps/obsidian/src/main.tsx'), 'utf8')

test('remix icons | the explorer glyph layer is gated on the gp-tabler-on body class', () => {
  // paper.css paints the default folder/document glyphs only when that class is
  // present, because it is the class Paper's TablerSkin used to add. Retiring
  // Tabler means the host has to own the class. Selector-level check: the icon
  // variables are referenced from continuation lines, not from the selector.
  const ICON_VAR = /--gp-folder-icon|--gp-document-icon/
  let selector = ''
  const offenders: string[] = []
  for (const line of paperCss.split('\n')) {
    if (line.trimEnd().endsWith('{')) selector = line.trim()
    if (!ICON_VAR.test(line) || line.includes('{')) continue
    if (!selector.includes('gp-tabler-on')) offenders.push(`${selector} -> ${line.trim()}`)
  }
  assert.deepEqual(offenders, [], `icon rules not gated on gp-tabler-on:\n${offenders.join('\n')}`)
})

test('remix icons | the host re-asserts the class after Paper recomputes it', () => {
  // Paper's apply() recomputes gp-tabler-on from its own tablerIcons flag, which
  // loadData() pins to false, so it strips the class on layout-ready and on every
  // surface toggle. Only an apply() override that re-asserts it keeps the icons up.
  assert.match(mainTsx, /apply\(\): void \{\s*super\.apply\(\)/, 'Catea does not override apply()')
  assert.match(
    mainTsx,
    /apply\(\): void \{[\s\S]{0,240}?syncRemixIcons\(/,
    'the apply() override does not re-assert the icon layer',
  )
})

test('remix icons | TablerSkin is still prevented from starting', () => {
  assert.match(
    mainTsx,
    /tablerIcons: false/,
    'loadData() no longer pins tablerIcons, so Paper would start TablerSkin',
  )
})

test('remix icons | settings search never points at the retired Tabler flag', async () => {
  // The Paper surface toggles are indexed so users can search them. tablerIcons is
  // pinned false in loadData() and its Paper row is unreachable, so an index entry
  // for it would surface a control that does nothing.
  const settingsTs = await readFile(resolve(root, 'apps/obsidian/src/settings.ts'), 'utf8')
  const indexBlock = settingsTs.slice(
    settingsTs.indexOf("['enabled', '启用纸张界面']"),
    settingsTs.indexOf('] as const)', settingsTs.indexOf("['enabled', '启用纸张界面']")),
  )
  assert.ok(indexBlock.length > 0, 'surface search index not found')
  assert.ok(
    !indexBlock.includes('tablerIcons'),
    'the search index still offers the retired tablerIcons toggle',
  )
  assert.ok(settingsTs.includes("tr('开启 Remix')"), 'the Remix toggle is not in settings')
})

test('remix icons | the built bundle carries no Tabler table or settings row', async () => {
  // Both live in the vendored Paper base, so the build is the only place they can
  // be removed without breaking the on-disk digest.
  const plugin = await readFile(resolve(root, 'dist/catea-paper/main.js'), 'utf8')
  assert.ok(!plugin.includes('Tabler 图标'), 'the retired Tabler settings row is still bundled')
  assert.ok(!plugin.includes('"a-b-2"'), 'the Tabler glyph table is still bundled')
})
