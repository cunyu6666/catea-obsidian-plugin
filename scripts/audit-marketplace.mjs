// Reproduce source lint findings without excluding the vendored snapshots.
// This is a diagnostic audit, not a substitute for the marketplace release scan.
import { ESLint } from 'eslint'
import obsidianmd from 'eslint-plugin-obsidianmd'
import { writeFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    ...obsidianmd.configs.recommended,
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        parserOptions: { project: './tsconfig.marketplace.json', tsconfigRootDir: root },
      },
    },
    { ignores: ['**/__tests__/**'] },
  ],
})
const results = await eslint.lintFiles([
  'typings/**/*.d.ts',
  'apps/*/src/**/*.{ts,tsx}',
  'packages/*/src/**/*.{ts,tsx}',
  'packages/*/upstream/**/*.{ts,tsx}',
  'packages/design-system/components/src/**/*.{ts,tsx}',
])
const groups = {},
  rules = {}
const files = results
  .filter((r) => r.messages.length)
  .map((r) => {
    const path = relative(root, r.filePath)
    const group = path.includes('/upstream/') ? path.split('/upstream/')[0] : 'owned'
    groups[group] = (groups[group] || 0) + r.messages.length
    for (const message of r.messages)
      rules[message.ruleId || 'parser'] = (rules[message.ruleId || 'parser'] || 0) + 1
    return { path, messages: r.messages }
  })
const report = { groups, rules, files }
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(report, null, 2))
console.log(JSON.stringify({ groups, rules }, null, 2))
if (files.length) process.exitCode = 1
