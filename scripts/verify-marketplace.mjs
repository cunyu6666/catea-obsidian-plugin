// Reproduce the scorecard's missing-Node-types failure without changing node_modules.
// Keep all five unsafe-value rules enabled, including for vendored runtime source.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative } from 'node:path'
import ts from 'typescript'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
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
for (const [snapshot, installed] of [
  ['node', '@types/node'],
  ['undici-types', 'undici-types'],
]) {
  const target = resolve(root, 'typings', snapshot)
  const source = resolve(root, 'node_modules', installed)
  const paths = (await files(source)).map((path) => relative(source, path)).sort()
  assert.deepEqual(
    (await files(target)).map((path) => relative(target, path)).sort(),
    paths,
    `typings/${snapshot} must contain the complete installed declaration package`,
  )
  for (const path of paths)
    assert.deepEqual(
      await readFile(resolve(target, path)),
      await readFile(resolve(source, path)),
      `typings/${snapshot}/${path} must match the lockfile-installed package byte-for-byte`,
    )
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
const program = ts.createProgram(parsed.fileNames, parsed.options, host)
assert.ok(
  program
    .getSourceFiles()
    .some((file) => file.fileName === resolve(root, 'typings/node/index.d.ts')),
  'The dependency-poor scan must load checked-in official Node declarations',
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
const rules = Object.fromEntries(
  ['call', 'member-access', 'assignment', 'argument', 'return'].map((name) => [
    `@typescript-eslint/no-unsafe-${name}`,
    'error',
  ]),
)
const eslint = new ESLint({
  cwd: root,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.{ts,tsx}'],
      linterOptions: { reportUnusedDisableDirectives: 'off' },
      languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program] } },
      plugins: { '@typescript-eslint': tseslint.plugin },
      rules,
    },
  ],
})
const sourceFiles = parsed.fileNames.filter(
  (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts') && !/\/__tests__\//.test(file),
)
const results = await eslint.lintFiles(sourceFiles)
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
  `marketplace regression: ${sourceFiles.length} source files, 0 unsafe-type findings without installed Node types; declaration provenance and CSS checks passed`,
)
