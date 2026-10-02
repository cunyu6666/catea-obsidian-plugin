import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contractTest } from '../../../../tests/dip-contract.ts'
import { MEMORY_ICONS, memoryIconUrl } from '../memory-icons.ts'
import { memoryTypes } from '../../../../packages/memory/src/model.ts'

contractTest('apps/obsidian/src/memory-icons.ts')

test('memory-icons | every memory type has a glyph', () => {
  const missing = memoryTypes.filter((type) => !MEMORY_ICONS[type])
  assert.deepEqual(missing, [], `memory types with no icon: ${missing.join(', ')}`)
})

test('memory-icons | no glyph is defined for a type that does not exist', () => {
  const stale = Object.keys(MEMORY_ICONS).filter(
    (key) => !(memoryTypes as readonly string[]).includes(key),
  )
  assert.deepEqual(stale, [], `icons for unknown memory types: ${stale.join(', ')}`)
})

test('memory-icons | every glyph is a complete 24x24 svg', () => {
  for (const [type, svg] of Object.entries(MEMORY_ICONS)) {
    assert.ok(svg.startsWith('<svg'), `${type} does not start with <svg>`)
    assert.ok(svg.endsWith('</svg>'), `${type} is truncated`)
    assert.match(svg, /viewBox="0 0 24 24"/, `${type} is not on the 24x24 grid`)
    assert.match(svg, /fill="currentColor"/, `${type} cannot follow the theme colour`)
    assert.ok(!svg.includes('`') && !svg.includes('${'), `${type} would break its template literal`)
  }
})

test('memory-icons | memoryIconUrl emits a CSS-ready data URL', () => {
  const url = memoryIconUrl('fact')
  assert.ok(url.startsWith('url("data:image/svg+xml,%3Csvg'), url.slice(0, 48))
  assert.ok(url.endsWith('")'))
  assert.equal(memoryIconUrl('not-a-real-type'), '', 'an unknown type must not emit a broken url')
})
