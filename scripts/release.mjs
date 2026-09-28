#!/usr/bin/env node
// Cuts an Obsidian plugin release.
//
// Obsidian's updater looks for a GitHub *Release* whose tag equals the version in
// manifest.json, exactly, with no `v` prefix, and with main.js, manifest.json and
// styles.css attached. A tag alone, or a release missing one of those assets,
// silently never reaches users.
//
// Default mode is a dry run: it validates everything and prints the plan without
// touching the network. Pass --publish to actually create the release (which also
// creates the tag). Requires GH_TOKEN or GITHUB_TOKEN with repo write access.
//
// It is the local counterpart of .github/workflows/release.yml: both validate the
// same gates, publish the same three assets, and refuse to re-release a version
// that users already have.

import {execFileSync} from 'node:child_process'
import {readFileSync, existsSync, statSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname, resolve} from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'dist/catea-paper')
const ASSETS = ['main.js', 'manifest.json', 'styles.css']
const RELEASE_BRANCH = 'main'
const publish = process.argv.includes('--publish')

const log = (message) => process.stdout.write(`${message}\n`)
const fail = (message) => {
  process.stderr.write(`\nrelease: ${message}\n`)
  process.exit(1)
}

// Policy problems are accumulated so one dry run reports everything that is
// wrong, rather than making the operator fix them one at a time.
const blockers = []
const block = (message) => {
  blockers.push(message)
}

function git(args) {
  return execFileSync('git', args, {cwd: ROOT, encoding: 'utf8'}).trim()
}

function run(command, args) {
  try {
    const out = execFileSync(command, args, {cwd: ROOT, encoding: 'utf8', stdio: 'pipe'})
    return {ok: true, out}
  } catch (error) {
    return {ok: false, out: `${error.stdout || ''}${error.stderr || ''}`}
  }
}

// ---- 1. version ------------------------------------------------------------

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8'))
const version = String(manifest.version)
const minAppVersion = String(manifest.minAppVersion)
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`manifest version "${version}" must be a bare semver with no v prefix`)
}
log(`version: ${version} (minAppVersion ${minAppVersion}, id ${manifest.id})`)

// ---- 2. gates --------------------------------------------------------------

for (const [label, argv] of [
  ['contracts and governance', ['test']],
  ['typecheck', ['run', 'typecheck']],
  ['official plugin lint', ['run', 'lint']],
  ['adapter regressions', ['run', 'test:behavior']],
]) {
  const result = run('npm', argv)
  if (!result.ok) fail(`${label} failed; fix it before releasing:\n${result.out}`)
  const summary = result.out
    .split('\n')
    .filter((line) => /^ℹ (tests|pass|fail)|^typecheck:/.test(line))
    .join(' | ')
  log(`${label}: ${summary || 'ok'}`)
}

// ---- 3. build output -------------------------------------------------------

if (!existsSync(OUT)) fail(`no build output at dist/catea-paper; run npm run build first`)
for (const asset of ASSETS) {
  const file = resolve(OUT, asset)
  if (!existsSync(file) || !statSync(file).isFile()) fail(`build output is missing the release asset ${asset}`)
}
const builtVersion = String(JSON.parse(readFileSync(resolve(OUT, 'manifest.json'), 'utf8')).version)
if (builtVersion !== version) {
  fail(`dist/catea-paper/manifest.json says ${builtVersion}; rebuild before releasing ${version}`)
}
log(`assets: ${ASSETS.map((asset) => `${asset} (${Math.round(statSync(resolve(OUT, asset)).size / 1024)} KB)`).join(', ')}`)

// ---- 4. repository state ---------------------------------------------------

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== RELEASE_BRANCH) block(`on branch ${branch}; release from ${RELEASE_BRANCH}`)
const dirty = git(['status', '--porcelain'])
if (dirty) block(`working tree is not clean:\n${dirty}`)

const origin = git(['remote', 'get-url', 'origin'])
const parsed = origin.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/)
if (!parsed) fail(`cannot derive a GitHub owner/repo from origin: ${origin}`)
const [, owner, repo] = parsed
const commit = git(['rev-parse', 'HEAD'])
log(`target: ${owner}/${repo} @ ${branch} ${commit.slice(0, 7)}`)

const existing = git(['ls-remote', '--tags', 'origin', `refs/tags/${version}`])
if (existing) {
  block(`tag ${version} already exists on origin; Obsidian ignores a re-released version, so bump the version instead`)
}

// ---- 5. release notes ------------------------------------------------------

function previousTag() {
  try {
    const tags = git(['tag', '--sort=-v:refname']).split('\n').filter(Boolean)
    return tags.find((tag) => tag !== version) || ''
  } catch {
    return ''
  }
}

const since = previousTag()
const range = since ? `${since}..HEAD` : 'HEAD'
const notes = git(['log', '--oneline', '--no-merges', range]).split('\n').filter(Boolean).slice(0, 50)
log(`notes: ${notes.length} commits since ${since || 'the beginning of history'}`)

// ---- 6. publish ------------------------------------------------------------

if (blockers.length) {
  process.stderr.write('\nrelease: blocked\n')
  for (const item of blockers) process.stderr.write(`  - ${item}\n`)
  process.stderr.write('\n')
  process.exit(1)
}

if (!publish) {
  log('\nready. nothing was published; re-run with --publish to create the release.')
  process.exit(0)
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
if (!token) fail('set GH_TOKEN (or GITHUB_TOKEN) with repo write access to publish')

const headers = {
  authorization: `Bearer ${token}`,
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'catea-release',
}

const created = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
  method: 'POST',
  headers: {...headers, 'content-type': 'application/json'},
  body: JSON.stringify({
    tag_name: version,
    target_commitish: commit,
    name: version,
    body: notes.length ? notes.map((line) => `- ${line}`).join('\n') : `Release ${version}`,
    draft: false,
    prerelease: false,
  }),
})
if (!created.ok) fail(`creating the release failed: ${created.status} ${await created.text()}`)
const release = await created.json()
log(`release created: ${release.html_url}`)

for (const asset of ASSETS) {
  const bytes = readFileSync(resolve(OUT, asset))
  const uploaded = await fetch(
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(asset)}`,
    {
      method: 'POST',
      headers: {...headers, 'content-type': 'application/octet-stream', 'content-length': String(bytes.length)},
      body: bytes,
    },
  )
  if (!uploaded.ok) fail(`uploading ${asset} failed: ${uploaded.status} ${await uploaded.text()}`)
  log(`uploaded ${asset}`)
}

log(`\ndone. Obsidian clients will offer ${version} once their plugin list refreshes.`)