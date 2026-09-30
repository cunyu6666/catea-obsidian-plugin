// Reproduce the scorecard's missing-Node-types failure without changing node_modules.
// Keep all five unsafe-value rules enabled, including for vendored runtime source.
import './verify-node-contracts.mjs'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative } from 'node:path'
import ts from 'typescript'
import { ESLint } from 'eslint'
import obsidianmd from 'eslint-plugin-obsidianmd'
import postcss from 'postcss'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = resolve(directory, entry.name)
        return entry.isDirectory() ? files(path) : [path]
      }),
    )
  ).flat()
}
const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile)
assert.equal(config.error, undefined)
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
assert.equal(parsed.errors.length, 0)
// A scanner may supply its own automatic type roots. Declarations must also
// enter through the source import graph, not only our tsconfig typeRoots.
parsed.options.typeRoots = [resolve(root, 'node_modules/@types')]
parsed.options.types = []
const host = ts.createCompilerHost(parsed.options)
for (const method of ['fileExists', 'readFile', 'directoryExists']) {
  const original = host[method].bind(host)
  host[method] = (path, ...args) =>
    /node_modules\/(?:@types\/node|undici-types)(?:\/|$)/.test(path.replaceAll('\\', '/'))
      ? method === 'readFile'
        ? undefined
        : false
      : original(path, ...args)
}
const program = ts.createProgram(
  parsed.fileNames.filter((file) => !file.includes('/__tests__/')),
  parsed.options,
  host,
)
assert.ok(
  program
    .getSourceFiles()
    .some((file) => file.fileName === resolve(root, 'typings/node-runtime.d.ts')),
  'The dependency-poor scan must load checked-in Node runtime contracts',
)
assert.ok(
  !program
    .getSourceFiles()
    .some((file) => /node_modules\/(?:@types\/node|undici-types)\//.test(file.fileName)),
  'Installed Node declarations must not leak into this regression check',
)
const diagnostics = ts.getPreEmitDiagnostics(program)
assert.equal(
  diagnostics.length,
  0,
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (name) => name,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n',
  }),
)
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    ...obsidianmd.configs.recommended,
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: { parserOptions: { programs: [program] } },
    },
  ],
})
const sourceFiles = parsed.fileNames.filter(
  (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts') && !/\/__tests__\//.test(file),
)
const results = await eslint.lintFiles([
  ...sourceFiles,
  ...(await files(resolve(root, 'typings'))).filter((file) => file.endsWith('.d.ts')),
])
const findings = results.flatMap((result) =>
  result.messages.map(
    (message) =>
      `${relative(root, result.filePath)}:${message.line} ${message.ruleId}: ${message.message}`,
  ),
)
assert.deepEqual(findings, [], findings.join('\n'))

// CSS files are browser styles; Tailwind's compile-only configuration belongs in build.mjs.
const directives = []
for (const file of await files(resolve(root, 'packages/design-system'))) {
  if (!file.endsWith('.css') || file.includes('/dist/')) continue
  postcss.parse(await readFile(file, 'utf8'), { from: file }).walkAtRules((rule) => {
    if (['source', 'theme'].includes(rule.name))
      directives.push(`${relative(root, file)}:${rule.source.start.line} @${rule.name}`)
  })
}
assert.deepEqual(
  directives,
  [],
  'Compile-only Tailwind directives must not leak into browser CSS sources',
)
console.log(
  `marketplace regression: ${sourceFiles.length} source files, 0 unsafe-type findings without installed Node types; Node runtime contracts and CSS checks passed`,
)
