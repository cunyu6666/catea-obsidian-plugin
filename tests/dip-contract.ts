/**
 * [WHO]: Provides contractTest(), extractP3(), extractExports(), extractImports(), listRepoFiles(), gitTrackedFiles(), trackedButIgnoredFiles(), gitIgnoredPaths(), inScopeDIPFiles(), consumersOf(), REPO_ROOT, VENDORED_ASSETS, ASSET_MANIFESTS
 * [FROM]: Depends on node:fs, node:child_process, node:path, node:url, node:test, node:assert/strict for file access, git index reads, path handling and test registration
 * [TO]: Consumed by every __tests__/*.test.ts contract test, by tests/dip-verify.test.ts and by tests/vendor-assets.test.ts
 * [HERE]: tests/dip-contract.ts - shared DIP contract parser; turns a P3 header plus the actual source into verifiable assertions, so documentation drift fails the suite
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative, sep } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..')

// Files intentionally excluded from DIP. scripts/build.mjs is deferred because a
// concurrent process is editing it for the Obsidian marketplace submission.
const DEFERRED = new Set(['scripts/build.mjs'])
// Vendored, generated assets that ship inside a source directory. They are not
// hand-written code, so a P3 header would be theatre; their integrity is guarded
// by a digest instead. See apps/obsidian/src/VENDOR_MANIFEST.json.
const ASSET_MANIFESTS = ['apps/obsidian/src/VENDOR_MANIFEST.json']
export { ASSET_MANIFESTS }
export const VENDORED_ASSETS: ReadonlySet<string> = new Set<string>(
  ASSET_MANIFESTS.flatMap((manifestRel) => {
    const manifest = JSON.parse(readSource(manifestRel))
    return Object.keys(manifest.assets ?? {})
  }),
)
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.catea', '.catea-dev', '.worktrees'])
const SOURCE_EXT = ['.ts', '.tsx', '.mjs', '.js', '.cjs']

export function toRepoPath(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join('/')
}

export function readSource(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8')
}

// ---------- repository file index ----------

let fileIndexCache: string[] | null = null

export function listRepoFiles(): string[] {
  if (fileIndexCache) return fileIndexCache
  const out: string[] = []
  const walk = (abs: string) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue
      const child = join(abs, entry.name)
      if (entry.isDirectory()) walk(child)
      else if (entry.isFile()) out.push(toRepoPath(child))
    }
  }
  walk(REPO_ROOT)
  fileIndexCache = out.sort()
  return fileIndexCache
}

// listRepoFiles() walks the disk and honours SKIP_DIRS, so it cannot tell what is
// committed. This reads the git index, which is what "tracked" actually means.
let gitIndexCache: string[] | null = null

export function gitTrackedFiles(): string[] {
  if (gitIndexCache) return gitIndexCache
  const run = spawnSync('git', ['ls-files', '-z'], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.equal(run.status, 0, `git ls-files failed: ${run.stderr?.trim()}`)
  gitIndexCache = run.stdout.split('\0').filter(Boolean).sort()
  return gitIndexCache
}

// Tracked files that .gitignore also covers: force-added artifacts, or files that
// were committed before someone added the ignore rule.
export function trackedButIgnoredFiles(): string[] {
  const run = spawnSync('git', ['ls-files', '-i', '-c', '--exclude-standard', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  assert.equal(run.status, 0, `git ls-files -i failed: ${run.stderr?.trim()}`)
  return run.stdout.split('\0').filter(Boolean).sort()
}

// Which of the given paths git actually ignores. `git ls-files -i` only reports
// tracked ones, so probing rules directly needs check-ignore.
export function gitIgnoredPaths(candidates: string[]): Set<string> {
  if (candidates.length === 0) return new Set()
  const run = spawnSync('git', ['check-ignore', '-z', '--stdin', '--'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input: candidates.join('\0') + '\0',
  })
  // check-ignore exits 1 when nothing matches, which is a valid answer, not a failure.
  if (run.status !== 0 && run.status !== 1) {
    assert.fail(`git check-ignore failed: ${run.stderr?.trim()}`)
  }
  return new Set(run.stdout.split('\0').filter(Boolean))
}

export function isDIPSource(rel: string): boolean {
  if (rel.includes('/upstream/')) return false
  // Test files are out of scope: a contract test for a contract test is circular.
  if (rel.includes('/__tests__/')) return false
  if (rel.endsWith('.d.ts')) return false
  if (DEFERRED.has(rel)) return false
  if (VENDORED_ASSETS.has(rel)) return false
  return /^(?:apps\/[^/]+\/src|packages\/[^/]+\/src)\/.+\.(?:ts|tsx)$/.test(rel)
}

export function inScopeDIPFiles(): string[] {
  return listRepoFiles().filter(isDIPSource)
}

// ---------- P3 header parsing ----------

export interface P3 {
  found: boolean
  who: string[]
  from: string[]
  to: string[]
  here: string
}

const P3_FIELDS = ['WHO', 'FROM', 'TO', 'HERE']

function firstBlockComment(text: string): string {
  const start = text.indexOf('/**')
  if (start < 0) return ''
  const end = text.indexOf('*/', start + 3)
  return end < 0 ? '' : text.slice(start, end + 2)
}

function cleanFieldValue(raw: string): string {
  return raw
    .replace(/\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitItems(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

const FIELD_PREFIX: Record<string, RegExp> = {
  WHO: /^Provides\s+/i,
  FROM: /^Depends\s+on\s+/i,
  TO: /^Consumed\s+by\s+/i,
}

export function extractP3(text: string): P3 {
  const block = firstBlockComment(text)
  if (!block || !block.includes('[WHO]:')) {
    return { found: false, who: [], from: [], to: [], here: '' }
  }
  const parts = block.split(new RegExp('\\[(' + P3_FIELDS.join('|') + ')\\]\\:'))
  const fields: Record<string, string> = {}
  for (let i = 1; i < parts.length; i += 2) fields[parts[i]] = parts[i + 1]
  // The field values accept the prose form used by the oh-my-dev template
  // ("Provides X", "Depends on Y", "Consumed by Z") as well as bare lists.
  const strip = (key: string, raw: string) => {
    const value = cleanFieldValue(raw)
    const prefix = FIELD_PREFIX[key]
    return prefix ? value.replace(prefix, '') : value
  }
  return {
    found: true,
    who: splitItems(strip('WHO', fields.WHO || '')),
    from: splitItems(strip('FROM', fields.FROM || '')),
    to: splitItems(strip('TO', fields.TO || '')),
    here: cleanFieldValue(fields.HERE || ''),
  }
}

// ---------- exports ----------

export interface ExportInfo {
  names: Set<string>
  hasDefault: boolean
  reexports: Set<string>
}

export function extractExports(text: string): ExportInfo {
  const names = new Set<string>()
  const reexports = new Set<string>()
  let hasDefault = false

  // export (default) (async) (abstract) function|class|interface|type|enum NAME
  const named =
    /^[ \t]*export[ \t]+(?:default[ \t]+)?(?:async[ \t]+)?(?:abstract[ \t]+)?(function|class|interface|type|enum)[ \t]*\*?[ \t]*([A-Za-z_$][\w$]*)/gm
  for (const m of text.matchAll(named)) names.add(m[2])

  // export const|let|var NAME[, NAME2...]
  const declared = /^[ \t]*export[ \t]+(?:const|let|var)[ \t]+([^\n=]+?)[ \t]*(?:=|$)/gm
  for (const m of text.matchAll(declared)) {
    for (const candidate of m[1].split(',')) {
      const name = candidate.trim().replace(/[^\w$].*$/, '')
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
    }
  }

  // export {A, B as C} / export type {A}
  const listed = /^[ \t]*export[ \t]+(?:type[ \t]+)?\{([^}]*)\}/gm
  for (const m of text.matchAll(listed)) {
    for (const entry of m[1].split(',')) {
      const parts = entry.trim().split(/\s+as\s+/)
      const name = (parts[1] || parts[0] || '').trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
    }
  }

  if (/^[ \t]*export[ \t]+default\b/m.test(text)) hasDefault = true

  const star = /^[ \t]*export[ \t]+\*[ \t]+from[ \t]*['"]([^'"]+)['"]/gm
  for (const m of text.matchAll(star)) reexports.add(m[1])

  return { names, hasDefault, reexports }
}

// ---------- imports ----------

// Block comments are removed before import/export scanning: the P3 header itself
// contains prose such as "consumers import the submodules", and a scanner that
// reads it as code will swallow following statements.
function stripBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ')
}

export function extractImports(text: string): Set<string> {
  const specs = new Set<string>()
  const source = stripBlockComments(text)
  let buffer = ''
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (!buffer) {
      if (!/^(?:import|export)\b/.test(line)) continue
      buffer = line
    } else {
      buffer = `${buffer} ${line}`
    }
    const fromMatch = buffer.match(/^(?:import|export)\b[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/)
    if (fromMatch) {
      specs.add(fromMatch[1])
      buffer = ''
      continue
    }
    const sideEffect = buffer.match(/^import\s*['"]([^'"]+)['"]/)
    if (sideEffect) {
      specs.add(sideEffect[1])
      buffer = ''
      continue
    }
    // Guard against an unterminated statement swallowing the rest of the file.
    if (buffer.length > 600) buffer = ''
  }
  for (const m of source.matchAll(/(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    specs.add(m[1])
  return specs
}

// ---------- specifier resolution ----------

const RESOLVE_SUFFIXES = ['', ...SOURCE_EXT, ...SOURCE_EXT.map((ext) => `/index${ext}`)]

export function resolveSpecifier(fromRel: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(REPO_ROOT, dirname(fromRel), spec)
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return toRepoPath(candidate)
    } catch {
      /* unreadable candidate: treat as unresolved */
    }
  }
  return null
}

let consumerIndexCache: Map<string, string[]> | null = null

function consumerIndex(): Map<string, string[]> {
  if (consumerIndexCache) return consumerIndexCache
  const map = new Map<string, string[]>()
  for (const file of listRepoFiles()) {
    if (!/\.(ts|tsx|mjs|js|cjs)$/.test(file)) continue
    let text: string
    try {
      text = readSource(file)
    } catch {
      continue
    }
    for (const spec of extractImports(text)) {
      const target = resolveSpecifier(file, spec)
      if (!target) continue
      const list = map.get(target) || []
      list.push(file)
      map.set(target, list)
    }
  }
  consumerIndexCache = map
  return map
}

export function consumersOf(targetRel: string): string[] {
  return (consumerIndex().get(targetRel) || []).slice().sort()
}

// ---------- contract test registration ----------

export function contractTest(targetRel: string): void {
  const source = readSource(targetRel)
  const p3 = extractP3(source)
  const exports = extractExports(source)
  const imports = extractImports(source)
  const consumers = consumersOf(targetRel)

  test(`${targetRel} | P3 header present`, () => {
    assert.ok(
      p3.found,
      `no [WHO]: P3 header found in ${targetRel}. Every in-scope source file must carry a P3 contract header.`,
    )
  })

  test(`${targetRel} | [WHO] exports exist`, () => {
    assert.ok(p3.who.length > 0, `[WHO] is empty in ${targetRel}`)
    for (const name of p3.who) {
      const present = exports.names.has(name) || (name === 'default' && exports.hasDefault)
      assert.ok(
        present,
        `[WHO] claims "${name}" but ${targetRel} does not export it. Actual exports: ${[...exports.names].sort().join(', ') || '(none)'}`,
      )
    }
  })

  test(`${targetRel} | [FROM] imports present`, () => {
    assert.ok(
      p3.from.length > 0,
      `[FROM] is empty in ${targetRel}; use "(none)" when the file has no imports`,
    )
    for (const dep of p3.from) {
      if (dep === '(none)') {
        assert.equal(
          imports.size,
          0,
          `[FROM] declares "(none)" but ${targetRel} imports: ${[...imports].sort().join(', ')}`,
        )
        continue
      }
      assert.ok(
        imports.has(dep),
        `[FROM] claims "${dep}" but ${targetRel} has no such import. Actual imports: ${[...imports].sort().join(', ') || '(none)'}`,
      )
    }
  })

  test(`${targetRel} | [TO] consumers resolve`, () => {
    assert.ok(
      p3.to.length > 0,
      `[TO] is empty in ${targetRel}; use "(entry)" when nothing imports this file`,
    )
    for (const entry of p3.to) {
      if (entry === '(entry)') {
        assert.equal(
          consumers.length,
          0,
          `[TO] declares "(entry)" but these files import ${targetRel}: ${consumers.join(', ')}`,
        )
        continue
      }
      assert.ok(
        existsSync(resolve(REPO_ROOT, entry)),
        `[TO] claims consumer "${entry}" but that file does not exist`,
      )
      assert.ok(
        consumers.includes(entry),
        `[TO] claims consumer "${entry}" but it does not import ${targetRel}. Actual consumers: ${consumers.join(', ') || '(none)'}`,
      )
    }
  })

  test(`${targetRel} | [HERE] path matches`, () => {
    assert.ok(
      p3.here.startsWith(targetRel),
      `[HERE] must begin with the repo-relative path "${targetRel}", got "${p3.here}"`,
    )
  })
}
