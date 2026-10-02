# Dev Build Isolation — Design

Status: Implemented 2026-10-01; see §8 for what changed against this plan
Date: 2026-10-01
Target: `catea-obsidian-plugin` (Catea, v0.3.22)

---

## 1. Goal

One command produces a development build that can sit **installed beside the
released plugin in the same vault**, is visibly distinguishable in Obsidian's UI,
and can never read or write the released plugin's `.catea/` state.

## 2. Context (verified 2026-10-01)

Obsidian identifies a plugin by the `id` field in its `manifest.json`, and the
installed directory name must match that id. Three vaults on this machine
currently install the same id `catea-paper`:

| Vault | Installed version | `.catea/` data |
|---|---|---|
| `~/Documents/LLM-Wiki` (currently open) | 0.3.22 | yes |
| `~/Documents/cunyu666` | 0.3.21 | yes |
| `~/Documents/catea` (this repository) | 0.3.7, stale since Sep 28 | no |

Because both builds would claim id `catea-paper`, they cannot be installed in one
vault at all — the second copy overwrites the first directory.

Five hardcoded identity surfaces were located:

1. `manifest.json` `id` — `tests/governance.test.ts:23-27` asserts it must stay
   `catea-paper` because Obsidian keys release updates off it.
2. View types `catea-agent` and `catea-git-history` — `apps/obsidian/src/main.tsx:52-53`.
3. Global CSS — every `.catea-*` class plus the `body.gp-enabled` dock selectors
   emitted by `scripts/build.mjs`.
4. The vault data directory `.catea/` — `config.json`, `sessions/`, `memory/`,
   `skills/`, and the legacy `snapshots/`.
5. Encrypted BYOK store `<userData>/catea/byok.enc` (`apps/obsidian/src/global-byok.ts:73`)
   and vault-scoped secure keys `catea-<id>` (`apps/obsidian/src/main.tsx:592`).

The user confirmed the dev build must run against real `LLM-Wiki` notes, and that
the two plugins will **not be enabled at the same time**.

## 3. Architecture

Identity is derived from the plugin id and fixed at build time. A `--dev` build
mode rewrites the manifest, targets a separate output directory, and injects a
different data directory name as a compile-time constant.

### 3.1 Why not namespace the CSS

Obsidian injects `styles.css` only for **enabled** plugins. With one plugin
enabled at a time there is exactly one Catea stylesheet in the document, so a
build-time selector-prefix pipeline would add risk and buy nothing. Dropped.

### 3.2 Why the view types stay shared

`workspace.json` stores leaves by view type, not by plugin id. Keeping
`catea-agent` and `catea-git-history` identical means that when the user switches
which build is enabled, the existing sidebar leaf re-resolves to the newly
enabled plugin and its position survives. Renaming them would orphan the leaf on
every switch.

### 3.3 Why the data directory must move

`.catea/memory/<scope>/memories.json` is migrated in place, once, with a backup
(`packages/memory/src/store.ts`). A dev build that changes the memory schema
would migrate the user's real writing memory into a shape the released 0.3.22
cannot read. Sessions and the pending-extraction queue carry the same risk. This
is recoverable only from backups, so the dev build gets its own root.

Cost, stated plainly: the dev build starts with empty sessions, empty memory, and
no `config.json`, so model selection, MCP servers and skill toggles must be set
once in the dev instance. BYOK models and keys live in the machine-global
`<userData>/catea/byok.enc` and carry over automatically.

### 3.4 The compile-time constant

`packages/integrations/src/data-dir.ts` becomes the single source of truth:

```ts
declare const CATEA_DATA_DIR: string | undefined
export const DATA_DIR: string =
  typeof CATEA_DATA_DIR === 'string' && CATEA_DATA_DIR ? CATEA_DATA_DIR : '.catea'
export const dataPath = (...parts: string[]): string => [DATA_DIR, ...parts].join('/')
```

`scripts/build.mjs` adds `CATEA_DATA_DIR` to its existing `define` map. Verified
by three probes before this design was written:

| Environment | Result |
|---|---|
| `node --experimental-strip-types`, no define (the `npm test` path) | `.catea` |
| esbuild, `--define:CATEA_DATA_DIR='".catea-dev"'` | `.catea-dev` |
| esbuild, no define | `.catea`, no `ReferenceError` |

This was chosen over threading a `dataDir` parameter because threading would
change the signatures of `VaultConversationStore`, `MemoryService`, `MemoryStore`,
`cleanupLegacySnapshots` and six exported functions in `packages/integrations/src/skills.ts`,
and would push the argument through `Agent` in `packages/agent-core/src/index.ts`.
A mutable module-level setter was rejected: it leaks state across tests running in
one process. The constant is immutable, needs no signature changes, and leaves
every existing test assertion on `.catea/...` correct.

Dependency direction is already satisfied: `packages/memory/src/index.ts:7` and
`packages/memory/src/store.ts:7` import `../../integrations/src/storage`, and
`packages/agent-core/src/index.ts` imports `../../integrations/src/skills`.

## 4. Files

### New

| File | Responsibility |
|---|---|
| `packages/integrations/src/data-dir.ts` | `DATA_DIR` / `dataPath()`, the compile-time data root |
| `scripts/dev-target.mjs` | Pure dev-build helpers: `DEV_ID`, `DEV_NAME`, `devManifest()`, `devDataDir()`. Imported by `build.mjs`, `dev-install.mjs` and the tests |
| `scripts/dev-install.mjs` | Build the dev bundle and install it into a target vault |
| `tests/data-dir.test.ts` | Fallback value, `dataPath()` joining, and that the esbuild `define` really substitutes |
| `tests/dev-target.test.ts` | Manifest rewrite is correct and does not mutate its input |
| `docs/specs/2026-10-01-dev-build-isolation-design.md` | This document |

### Modified

| File | Change |
|---|---|
| `scripts/build.mjs` | Accept `--dev`: read `manifest.json`, apply `devManifest()`, output to `dist/catea-paper-dev/`, add `CATEA_DATA_DIR` to `define` |
| `apps/obsidian/src/main.tsx` | Lines 147, 156, 159, 606 use `DATA_DIR` / `dataPath()`; ribbon title at line 279 becomes `` `${this.manifest.name} agent` `` |
| `packages/integrations/src/conversation-store.ts` | Lines 19, 22, 42 use `dataPath()` |
| `packages/integrations/src/legacy-snapshots.ts` | Line 11 uses `dataPath()` |
| `packages/integrations/src/skills.ts` | Lines 68, 81, 94, 181, 182, 184, 194, 195, 228, 258 use `dataPath()` |
| `packages/memory/src/index.ts` | Line 48 uses `dataPath()` |
| `packages/memory/src/store.ts` | Line 21 uses `dataPath()` |
| `packages/agent-core/src/index.ts` | Line 574 tool description and line 806 `resource` string use `DATA_DIR`. Line 806 is functional: it is the path shown in the approval prompt |
| `apps/obsidian/src/settings.ts` | Lines 238 and 545 interpolate the real directory into the descriptions |
| `apps/obsidian/src/locale.ts` | The two matching entries gain a `{dir}` placeholder |
| `.gitignore` | Add `.catea-dev/` |
| `tests/dip-contract.ts` | `SKIP_DIRS` gains `.catea-dev` |
| `tests/dip-verify.test.ts` | Forbidden tracked-prefix list gains `.catea-dev/` |
| `AGENTS.md` | Configuration-paths table gains the dev rows; build commands gain `npm run dev:install` |
| `CONTRIBUTING.md` | The dev-build loop |
| P3 headers | New header on `data-dir.ts`; `[FROM]` updated on every file that gains the import; `[TO]` on `data-dir.ts` lists its real importers |

### Deliberately untouched

`manifest.json` stays id `catea-paper`, version 0.3.22. `tests/governance.test.ts`
needs no change: its two build-output assertions hardcode `dist/catea-paper`, and
the dev build writes to `dist/catea-paper-dev`.

## 5. Tasks

Each task ends in a runnable check.

1. **`scripts/dev-target.mjs`** — export `DEV_ID = 'catea-paper-dev'`,
   `DEV_NAME = 'Catea (Dev)'`, `devDataDir(id)` returning `.catea-dev` for `DEV_ID`
   and `.catea` otherwise, and `devManifest(manifest)` returning a copy with the id
   and name replaced and `version` / `minAppVersion` / `isDesktopOnly` preserved.
   It must not mutate the argument.
2. **`tests/dev-target.test.ts`** — write it first, watch it fail, then implement
   task 1. Assert the rewritten id and name, assert the input object is unchanged,
   assert `devDataDir('catea-paper') === '.catea'`.
3. **`packages/integrations/src/data-dir.ts`** with a full P3 header.
4. **`tests/data-dir.test.ts`** — assert `DATA_DIR === '.catea'` under the test
   runner, assert `dataPath('memory', 'global') === '.catea/memory/global'`, and
   bundle a three-line fixture through esbuild with
   `define: { CATEA_DATA_DIR: '".catea-dev"' }` and assert the emitted code yields
   `.catea-dev`. This is probe 2 made permanent.
5. **Convert the path sites** — the eleven files in §4, one package at a time,
   running `npm test` after each. Existing behavior tests assert literal
   `.catea/...` paths and must keep passing unchanged, which is the proof the
   fallback is wired correctly.
6. **`scripts/build.mjs` `--dev`** — `devMode = process.argv.includes('--dev')`;
   `out` becomes `dist/catea-paper-dev` when dev; the manifest written is
   `devManifest(manifest)` when dev; `define` gains
   `CATEA_DATA_DIR: JSON.stringify(devDataDir(id))`.
7. **`scripts/dev-install.mjs`** — resolve the target vault from `--vault <path>`
   or `CATEA_DEV_VAULT`, failing with usage text when neither is set and never
   defaulting to a hardcoded user path. Then: run the dev build; assert
   `<vault>/.obsidian` exists; read `<vault>/.obsidian/community-plugins.json` and
   **abort with an explicit error if it already lists `catea-paper`**, since
   enabling both is the one configuration this design does not support; copy the
   bundle to `<vault>/.obsidian/plugins/catea-paper-dev/`; append `catea-paper-dev`
   to `community-plugins.json` if absent; print that the user must reload Obsidian.
8. **`package.json`** — add `"dev:build": "node scripts/build.mjs --dev"` and
   `"dev:install": "node scripts/dev-install.mjs"`.
9. **Governance guards** — add `.catea-dev/` to `.gitignore`, `.catea-dev` to
   `SKIP_DIRS`, `.catea-dev/` to the forbidden-prefix list.
10. **Ribbon title** — `main.tsx:279` uses `this.manifest.name`, so the dev build
    reads `Catea (Dev) agent` with no new constant.
11. **Docs** — AGENTS.md path table and build commands, CONTRIBUTING.md loop.
12. **Full verification** — §6.

## 6. Test plan

```bash
npm test              # contract + governance + regression; the 304 existing checks
                      # must stay green with no assertion edited
npm run typecheck     # 0 diagnostics in owned source
npm run lint          # exit 0
npm run format:check  # exit 0
npm run test:behavior # 33 adapter regressions, still asserting .catea/...
npm run build         # production bundle unchanged: dist/catea-paper,
                      # manifest id catea-paper, main.js under 5 MB
npm run dev:build     # dist/catea-paper-dev/manifest.json has id catea-paper-dev
                      # and name "Catea (Dev)"; version still 0.3.22
```

Then the two invariants that matter most, checked against the dev bundle:

```bash
grep -c '\.catea-dev/' dist/catea-paper-dev/main.js   # > 0
grep -o '\.catea/sessions' dist/catea-paper-dev/main.js | head -1   # no output
node -e "console.log(require('./manifest.json').id)"   # still catea-paper
```

Finally an end-to-end pass that needs a running Obsidian and cannot be automated
here: install into a scratch vault, confirm the plugin list shows `Catea (Dev)`,
confirm the ribbon tooltip reads `Catea (Dev) agent`, confirm a chat session
creates `.catea-dev/sessions/` and **not** `.catea/sessions/`, and confirm the
released 0.3.22 in `LLM-Wiki` still shows its own sessions untouched.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Both plugins enabled at once | Duplicate `registerView` for `catea-agent`. `dev-install.mjs` refuses to proceed when `community-plugins.json` already lists `catea-paper` |
| esbuild `define` semantics change | `tests/data-dir.test.ts` bundles a real fixture through the installed esbuild, so a regression fails the suite rather than silently shipping `.catea` |
| A new `.catea/` path site is added later without `dataPath()` | The dev bundle grep in §6 catches it. A permanent guard would need a lint rule; recorded as a follow-up, not built now |
| The stale 0.3.7 install in this repository's own vault | Out of scope. It is a separate cleanup, and `dev:install --vault .` will replace it if wanted |

## 8. Deviations found during implementation

**Bundled prompt markdown also carried the data directory.** §4 inventoried only
TypeScript. Three `.md` files are bundled through esbuild's text loader and
injected into the system prompt verbatim, and five occurrences between them named
`.catea/`:

| File | Occurrences |
|---|---|
| `packages/integrations/src/skill-creator.md` | 3 |
| `packages/integrations/src/find-skill.md` | 1 |
| `apps/obsidian/src/skills/obsidian.md` | 1 |

Left alone, a dev build would have instructed the model to write skills into the
released plugin's real `.catea/skills/` — the same defect §4 already identified at
`packages/agent-core/src/index.ts:574`, in a place the plan did not look.

Fixed by adding `relocatePromptPaths(text, dataDir)` to `scripts/dev-target.mjs`
and mounting an esbuild `onLoad` plugin for `.md` in `scripts/build.mjs`, gated on
`--dev` so the released bundle is untouched. Only the directory form `.catea/`
matches; the slash is what keeps `.catea-ui` and other CSS class names intact.
`tests/dev-target.test.ts` now reads all seven bundled prompt files and asserts
none still names the released directory after relocation, so a future prompt file
is covered automatically.

Verified on the built bundles: the dev `main.js` contains `.catea/` **0** times
and `.catea-dev` 6 times, while the released `main.js` contains `.catea/` 5 times
and `.catea-dev` 0 times.

**Validation moved ahead of the build.** §5 task 7 built first and checked the
vault afterwards. A vault that cannot accept the bundle now fails in about 40 ms
instead of after a full 4.5 MB esbuild run.

**`--swap` added.** §5 task 7 specified only an abort. The script also accepts
`--swap`, which removes `catea-paper` from `community-plugins.json` and adds
`catea-paper-dev` in the same write, so switching between builds does not require
a manual detour through the Obsidian UI. The default remains abort.

**`withDataDir()` added to `data-dir.ts`.** `locale.ts` is a flat dictionary with
no interpolation, so the five user-facing strings that named `.catea` keep static
translation keys with a `{dir}` placeholder and are resolved after lookup.

**Byte counts moved.** The released `main.js` is 4,509,157 bytes rather than the
4,579,290 recorded in AGENTS.md, because several string literals became
`dataPath()` calls. The AGENTS.md verification table was re-measured on
2026-10-01 rather than left stale.

