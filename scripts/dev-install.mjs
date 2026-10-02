#!/usr/bin/env node
// Installs the development build into a vault so it sits beside the released plugin.
//
// The dev bundle carries id `catea-paper-dev` and writes `.catea-dev/`, so it cannot
// read or write the released plugin's state. What it *can* still break is Obsidian
// itself: both builds register the view type `catea-agent`, so enabling the two at
// once makes leaf resolution ambiguous. That is why this script refuses to install
// into a vault that currently has the released plugin enabled, unless --swap is
// given, which disables the released one in the same edit.
//
// Usage:
//   node scripts/dev-install.mjs --vault /path/to/vault [--swap] [--watch]
//   CATEA_DEV_VAULT=/path/to/vault npm run dev:install
//
// --watch keeps running: any change under apps/, packages/ or scripts/ triggers a
// rebuild and a copy into the vault. A full build is under a second, so this
// re-runs the real build script instead of restructuring it into an incremental
// esbuild context — build.mjs is on the release path and not worth the risk.
//
// No vault path is ever hardcoded: this file ships in a public repository.

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, watch } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { DEV_ID, HOT_RELOAD_MARKER, devDataDir } from './dev-target.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, `dist/${DEV_ID}`)
const RELEASED_ID = 'catea-paper'

const log = (message) => process.stdout.write(`${message}\n`)
const fail = (message) => {
  process.stderr.write(`\ndev-install: ${message}\n`)
  process.exit(1)
}

const argv = process.argv.slice(2)
const swap = argv.includes('--swap')
const watchMode = argv.includes('--watch')
const flagAt = argv.indexOf('--vault')
const vaultInput = (flagAt >= 0 ? argv[flagAt + 1] : undefined) || process.env.CATEA_DEV_VAULT

if (!vaultInput) {
  fail(
    [
      'no target vault given.',
      '',
      '  node scripts/dev-install.mjs --vault /absolute/path/to/vault',
      '  CATEA_DEV_VAULT=/absolute/path/to/vault npm run dev:install',
      '',
      'Pick a vault whose notes you want to test against. The released plugin can',
      'stay installed there; it just cannot be enabled at the same time.',
    ].join('\n'),
  )
}

const vault = resolve(vaultInput)
if (!existsSync(resolve(vault, '.obsidian'))) {
  fail(`${vault} has no .obsidian directory, so it is not an Obsidian vault`)
}

const enabledPath = resolve(vault, '.obsidian/community-plugins.json')
async function readEnabled() {
  if (!existsSync(enabledPath)) return []
  try {
    const parsed = JSON.parse(await readFile(enabledPath, 'utf8'))
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    // An unparseable list is Obsidian's to repair; guessing would silently disable plugins.
    fail(`${enabledPath} is not valid JSON; fix it in Obsidian first`)
  }
}

// ---- 0. vault git hygiene ----------------------------------------------------
//
// This script introduces .catea-dev/ into someone's vault. Vaults under git nearly
// always ignore .catea/ but have never heard of the dev directory, which fills up
// with sessions and writing memory derived from private notes. Warn loudly; do not
// edit the vault's .gitignore uninvited.
const dataDir = devDataDir(DEV_ID)
if (existsSync(resolve(vault, '.git'))) {
  const ignored = spawnSync('git', ['-C', vault, 'check-ignore', '-q', `${dataDir}/probe`])
  if (ignored.status !== 0) {
    log(`WARNING: ${vault} is a git repository that does not ignore ${dataDir}/`)
    log(`         dev sessions and memory are derived from private notes. Add this line`)
    log(`         to that repository's .gitignore before you start using the dev build:`)
    log('')
    log(`             ${dataDir}/`)
    log('')
  }
}

// ---- 1. refuse the one unsupported configuration -----------------------------
//
// Checked before building: a vault that cannot accept the bundle should fail in
// milliseconds, not after a full 4.5 MB esbuild run.

const enabled = await readEnabled()
if (enabled.includes(RELEASED_ID)) {
  if (!swap) {
    fail(
      [
        `the released plugin is enabled in ${vault}.`,
        '',
        `Both builds register the view type "catea-agent", so enabling them together`,
        'leaves Obsidian resolving the same sidebar leaf from two plugins.',
        '',
        'Either turn Catea off in Obsidian (Settings -> Community plugins) and re-run,',
        `or re-run with --swap to disable ${RELEASED_ID} and enable ${DEV_ID} in one step.`,
      ].join('\n'),
    )
  }
  log(`--swap: will disable ${RELEASED_ID} in this vault`)
}

// ---- 2. build ---------------------------------------------------------------

log(`building ${DEV_ID} ...`)
try {
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/build.mjs'), '--dev'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
} catch {
  fail('the dev build failed; nothing was installed')
}
for (const asset of ['main.js', 'manifest.json', 'styles.css']) {
  if (!existsSync(resolve(OUT, asset))) fail(`the dev build produced no ${asset}`)
}

// ---- 3. install -------------------------------------------------------------

const target = resolve(vault, `.obsidian/plugins/${DEV_ID}`)
// Guard the recursive delete: it must only ever touch the directory this script owns.
if (dirname(target) !== resolve(vault, '.obsidian/plugins') || DEV_ID !== 'catea-paper-dev') {
  fail(`refusing to write outside .obsidian/plugins (resolved to ${target})`)
}
await mkdir(dirname(target), { recursive: true })
await rm(target, { recursive: true, force: true })
await cp(OUT, target, { recursive: true })
// Written into the vault copy only, never into dist/, so no release can carry it.
await writeFile(resolve(target, HOT_RELOAD_MARKER), '')
log(`installed ${target}`)

const nextEnabled = swap ? enabled.filter((id) => id !== RELEASED_ID) : enabled
if (!nextEnabled.includes(DEV_ID)) nextEnabled.push(DEV_ID)
await writeFile(enabledPath, `${JSON.stringify(nextEnabled, null, 2)}\n`)

log('')
log(`  plugin id    ${DEV_ID}`)
log(`  state dir    ${devDataDir(DEV_ID)}/  (the released plugin keeps .catea/ untouched)`)
log(`  vault        ${vault}`)
log('')
log('Now reload Obsidian for that vault: "Reload app without saving" from the command')
log('palette, or close and reopen the vault. The first run has empty sessions, memory')
log('and config, so pick a model and re-enable skills once; BYOK keys are machine-global')
log('and carry over by themselves.')

if (!watchMode) process.exit(0)

// ---- 4. watch ---------------------------------------------------------------
//
// Obsidian has no hot reload of its own. The .hot-reload marker written above is
// picked up by the community plugin `obsidian-hot-reload`, which polls plugin
// directories and reloads one whose files changed. Without that plugin installed
// the copy still lands, and Cmd+R in Obsidian picks it up.

const WATCH_ROOTS = ['apps/obsidian', 'packages', 'scripts']
const SKIP = /(?:^|\/)(?:node_modules|dist|\.git|__tests__|\.worktrees)(?:\/|$)/

let building = false
let pendingReason = null

function rebuild(reason) {
  // Coalesce: a save during a build must not be dropped, and a burst of editor
  // events must not queue up N rebuilds.
  if (building) {
    pendingReason = reason
    return
  }
  building = true
  const started = Date.now()
  log(`\n\u21bb rebuild \u2014 ${reason}`)
  const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts/build.mjs'), '--dev'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    building = false
    log(`  build failed, vault copy left untouched:\n${result.stdout || ''}${result.stderr || ''}`)
    if (pendingReason) {
      const next = pendingReason
      pendingReason = null
      rebuild(next)
    }
    return
  }
  cp(OUT, target, { recursive: true })
    .then(() => log(`  ok in ${Date.now() - started}ms \u2014 ${target}`))
    .catch((error) => log(`  copy failed: ${error.message}`))
    .finally(() => {
      building = false
      if (pendingReason) {
        const next = pendingReason
        pendingReason = null
        rebuild(next)
      }
    })
}

let debounce = null
for (const relative of WATCH_ROOTS) {
  const absolute = resolve(ROOT, relative)
  if (!existsSync(absolute)) continue
  watch(absolute, { recursive: true }, (_event, filename) => {
    if (!filename || SKIP.test(filename)) return
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(() => {
      debounce = null
      rebuild(filename)
    }, 150)
  })
}

log('')
log(`watching ${WATCH_ROOTS.join(', ')} \u2014 edit and save, the vault copy updates itself.`)
log(`Auto-reload in Obsidian needs the community plugin "Hot Reload"; without it,`)
log(`the files are still copied and Cmd+R picks them up. Ctrl-C to stop.`)
