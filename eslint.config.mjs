import obsidianmd from 'eslint-plugin-obsidianmd'

export default [
  // Byte-verified upstream is updated separately; scan all hand-written code,
  // including the design system now shipped in this repository.
  {ignores:['**/upstream/**','**/dist/**','**/__tests__/**','**/*.cjs']},
  ...obsidianmd.configs.recommended,
  {files:['apps/*/src/**/*.{ts,tsx}','packages/*/src/**/*.{ts,tsx}','packages/design-system/components/src/**/*.{ts,tsx}'],languageOptions:{parserOptions:{projectService:true}}},
]
