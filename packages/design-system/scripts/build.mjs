import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import selectorParser from 'postcss-selector-parser'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
export async function buildStyles() {
  const from = root + 'components/src/styles.css'
  // Tailwind directives are compiler input, not browser CSS. Keep the public
  // stylesheet valid for standards-based CSS tools used by the marketplace.
  const directives = `@import "tailwindcss/theme.css";
@import "tailwindcss/utilities.css";
@source "./**/*.{ts,tsx}";
@theme inline {
${['background', 'surface', 'surface-muted', 'foreground', 'foreground-soft', 'accent', 'border', 'danger'].map((name) => `--color-${name}:var(--${name});`).join('\n')}
}
`
  const input = await readFile(from, 'utf8')
  const result = await postcss([tailwind({ base: root })]).process(directives + input, { from })
  result.root.walkAtRules('layer', (rule) => {
    if (rule.nodes) rule.replaceWith(...rule.nodes)
    else rule.remove()
  })
  result.root.walkRules((rule) => {
    let parent = rule.parent
    while (parent) {
      if (parent.type === 'rule' || (parent.type === 'atrule' && /keyframes$/.test(parent.name)))
        return
      parent = parent.parent
    }
    rule.selector = selectorParser((selectors) =>
      selectors.each((selector) => {
        const raw = selector.toString().trim()
        if (/^\.catea-ui\b/.test(raw)) return
        if (raw === ':root' || raw === ':host') {
          selector.replaceWith(selectorParser().astSync('.catea-ui').first)
          return
        }
        if (raw === 'html' || raw === 'body' || raw === '#root') {
          selector.replaceWith(selectorParser().astSync('.catea-ui.catea-panel').first)
          return
        }
        if (!/^\.catea-(panel|portal)\b/.test(raw))
          selector.prepend(selectorParser.combinator({ value: ' ' }))
        selector.prepend(selectorParser.className({ value: 'catea-ui' }))
      }),
    ).processSync(rule.selector)
  })
  await mkdir(root + 'dist', { recursive: true })
  const tokens = await readFile(root + 'tokens/src/tokens.css', 'utf8')
  const css = tokens + '\n' + result.root.toString()
  await writeFile(root + 'dist/styles.css', css)
  return css
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildStyles()
