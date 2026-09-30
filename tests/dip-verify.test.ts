/**
 * [WHO]: Provides the repo-wide DIP isomorphism gate — P3 presence, P2 member completeness, P1 tree accuracy
 * [FROM]: Depends on tests/dip-contract.ts for the repository index and P3 parser, node:fs/path for reads, node:test for assertions
 * [TO]: Consumed by `npm test`; (entry) otherwise
 * [HERE]: tests/dip-verify.test.ts - automation of the oh-my-dev /verify procedure; fails on any documentation-to-code drift
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  REPO_ROOT,
  extractP3,
  gitIgnoredPaths,
  gitTrackedFiles,
  inScopeDIPFiles,
  isDIPSource,
  listRepoFiles,
  toRepoPath,
  trackedButIgnoredFiles,
} from './dip-contract.ts'

const P1 = 'AGENTS.md'

const P2_DIRS = [
  'apps/obsidian/src',
  'packages/agent-core/src',
  'packages/integrations/src',
  'packages/memory/src',
  'packages/personas/src',
]

const REQUIRED_TOP_LEVEL = ['apps/', 'packages/', 'docs/', 'scripts/', 'tests/']

const MEMBER_LINE = /^\s*[-*]?\s*([\w.\-]+\.(?:ts|tsx|mjs|js|cjs|md|css|json))\s*:\s*\S/

function directFiles(dir: string): string[] {
  return (
    readdirSync(resolve(REPO_ROOT, dir), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      // The module map is not a member of the module it maps.
      .filter((name) => name !== 'AGENTS.md')
      .sort()
  )
}

function section(text: string, heading: string): string {
  const start = text.indexOf(heading)
  if (start < 0) return ''
  const rest = text.slice(start + heading.length)
  const end = rest.search(/\n##\s/)
  return end < 0 ? rest : rest.slice(0, end)
}

function memberList(p2: string): string[] {
  const body = section(p2, '## Member List')
  const members: string[] = []
  for (const line of body.split('\n')) {
    const m = line.match(MEMBER_LINE)
    if (m) members.push(m[1])
  }
  return members.sort()
}

// Directory Structure entries are machine-readable by construction: the first
// fenced block under the heading lists one directory per line as `path/  # note`.
function directoryEntries(p1: string): string[] {
  const body = section(p1, '## Directory Structure')
  const fenced = body.match(/```[a-z]*\n([\s\S]*?)```/)
  if (!fenced) return []
  const entries: string[] = []
  for (const line of fenced[1].split('\n')) {
    const m = line.match(/^([A-Za-z0-9_./-]+)\/\s*(?:#.*)?$/)
    if (m) entries.push(m[1] + '/')
  }
  return entries
}

test('DIP | P1 root charter exists', () => {
  assert.ok(
    existsSync(resolve(REPO_ROOT, P1)),
    `${P1} is missing; the DIP navigation root must exist`,
  )
})

test('DIP | every in-scope source file carries a P3 header', () => {
  const missing: string[] = []
  for (const rel of inScopeDIPFiles()) {
    const p3 = extractP3(readFileSync(resolve(REPO_ROOT, rel), 'utf8'))
    if (!p3.found) missing.push(rel)
  }
  assert.deepEqual(missing, [], `files without a [WHO] P3 header: ${missing.join(', ')}`)
})

test('DIP | every in-scope file is claimed by exactly one P3 contract test', () => {
  const claimed = new Set<string>()
  for (const rel of listRepoFiles()) {
    if (!/\/__tests__\/.*\.test\.ts$/.test(rel)) continue
    const text = readFileSync(resolve(REPO_ROOT, rel), 'utf8')
    for (const m of text.matchAll(/contractTest\(\s*['"]([^'"]+)['"]\s*\)/g)) claimed.add(m[1])
  }
  const uncovered = inScopeDIPFiles().filter((rel) => !claimed.has(rel))
  assert.deepEqual(uncovered, [], `in-scope files with no contract test: ${uncovered.join(', ')}`)
})

test('DIP | no contract test targets a file outside DIP scope', () => {
  const claimed = new Set<string>()
  for (const rel of listRepoFiles()) {
    if (!/\/__tests__\/.*\.test\.ts$/.test(rel)) continue
    const text = readFileSync(resolve(REPO_ROOT, rel), 'utf8')
    for (const m of text.matchAll(/contractTest\(\s*['"]([^'"]+)['"]\s*\)/g)) claimed.add(m[1])
  }
  const strays = [...claimed].filter((rel) => !isDIPSource(rel))
  assert.deepEqual(strays, [], `contract tests targeting excluded files: ${strays.join(', ')}`)
})

test('DIP | every module directory has a P2 map whose member list matches the filesystem', () => {
  const problems: string[] = []
  for (const dir of P2_DIRS) {
    const p2Path = `${dir}/AGENTS.md`
    const abs = resolve(REPO_ROOT, p2Path)
    if (!existsSync(abs)) {
      problems.push(`${p2Path} is missing`)
      continue
    }
    const text = readFileSync(abs, 'utf8')
    const listed = memberList(text)
    const actual = directFiles(dir)
    const missing = actual.filter((name) => !listed.includes(name))
    const ghosts = listed.filter((name) => !actual.includes(name))
    if (missing.length) problems.push(`${p2Path} omits: ${missing.join(', ')}`)
    if (ghosts.length) problems.push(`${p2Path} lists non-existent: ${ghosts.join(', ')}`)
  }
  assert.deepEqual(problems, [], problems.join(' | '))
})

test('DIP | P2 parent links resolve', () => {
  const problems: string[] = []
  for (const dir of P2_DIRS) {
    const abs = resolve(REPO_ROOT, `${dir}/AGENTS.md`)
    if (!existsSync(abs)) continue
    const text = readFileSync(abs, 'utf8')
    const m = text.match(/Parent:\s*`?([^`\n|]+?)`?\s*(?:\||$)/m)
    if (!m) {
      problems.push(`${dir}/AGENTS.md has no "Parent:" link`)
      continue
    }
    const target = resolve(REPO_ROOT, dirname(`${dir}/AGENTS.md`), m[1].trim())
    if (!existsSync(target))
      problems.push(`${dir}/AGENTS.md parent "${m[1].trim()}" does not resolve`)
  }
  assert.deepEqual(problems, [], problems.join(' | '))
})

test('DIP | P1 directory structure matches the filesystem', () => {
  const p1 = readFileSync(resolve(REPO_ROOT, P1), 'utf8')
  const entries = directoryEntries(p1)
  assert.ok(entries.length > 0, 'P1 has no parseable Directory Structure fenced block')

  const phantoms = entries.filter((entry) => !existsSync(resolve(REPO_ROOT, entry)))
  assert.deepEqual(phantoms, [], `P1 lists directories that do not exist: ${phantoms.join(', ')}`)

  for (const required of REQUIRED_TOP_LEVEL) {
    assert.ok(entries.includes(required), `P1 Directory Structure does not list ${required}`)
  }
})

test('DIP | P1 links to every P2 map', () => {
  const p1 = readFileSync(resolve(REPO_ROOT, P1), 'utf8')
  const missing = P2_DIRS.filter((dir) => !p1.includes(`${dir}/AGENTS.md`))
  assert.deepEqual(missing, [], `P1 does not link these P2 maps: ${missing.join(', ')}`)
})

test('DIP | vendored upstream is excluded and documented', () => {
  const vendored = listRepoFiles().filter((rel) => rel.includes('/upstream/'))
  assert.ok(vendored.length > 0, 'expected vendored upstream files to exist')
  const wronglyInScope = vendored.filter(isDIPSource)
  assert.deepEqual(
    wronglyInScope,
    [],
    `vendored files must not be in DIP scope: ${wronglyInScope.join(', ')}`,
  )

  const p1 = readFileSync(resolve(REPO_ROOT, P1), 'utf8')
  assert.ok(
    /upstream/i.test(p1) && /vendored|excluded/i.test(p1),
    'P1 must document that vendored upstream directories are excluded from DIP',
  )
})

test('DIP | no generated or runtime artifacts are tracked', () => {
  // Read the git index, not the disk: dist/, node_modules/ and .catea/ are skipped
  // by the disk walk, so filtering that list by prefix can never report anything.
  const tracked = gitTrackedFiles()
  const forbidden = tracked.filter(
    (rel) =>
      rel.startsWith('node_modules/') ||
      rel.startsWith('dist/') ||
      rel.startsWith('.catea/') ||
      rel.startsWith('.obsidian/') ||
      rel.startsWith('.catui/') ||
      rel === 'preview-ui/app.js' ||
      rel.endsWith('.tmp') ||
      rel.endsWith('.log') ||
      rel === '.DS_Store',
  )
  assert.deepEqual(forbidden, [], `must never be tracked: ${forbidden.join(', ')}`)
  // A force-added file satisfies .gitignore's absence from the rule list but still
  // sits in the index; nothing but this check catches that.
  const ignored = trackedButIgnoredFiles()
  assert.deepEqual(ignored, [], `tracked but git-ignored: ${ignored.join(', ')}`)
})

test('DIP | the artifact guard itself is not vacuous', () => {
  // A guard that can match nothing proves nothing. The rules above assume these
  // paths are generated and ignored; if an ignore line is ever deleted, the guard
  // silently stops being the thing that keeps them out of a commit.
  const artifacts = [
    'dist/catea-paper/main.js',
    'preview-ui/app.js',
    '.obsidian/plugins/catea-paper/main.js',
    'node_modules/typescript/package.json',
  ]
  const unguarded = artifacts.filter((rel) => !gitIgnoredPaths(artifacts).has(rel))
  assert.deepEqual(
    unguarded,
    [],
    `no longer ignored by git, so a stray add would commit them: ${unguarded.join(', ')}`,
  )
})

test('DIP | P2 maps are listed in the repository index at the expected paths', () => {
  const expected = P2_DIRS.map((dir) => toRepoPath(resolve(REPO_ROOT, `${dir}/AGENTS.md`)))
  const present = new Set(listRepoFiles())
  const absent = expected.filter((path) => !present.has(path))
  assert.deepEqual(absent, [], `missing P2 maps: ${absent.join(', ')}`)
})
