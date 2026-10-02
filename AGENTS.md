> P1 | Root Project Charter & Navigation Map

---

## Identity

Grounded in auditable engineering discipline: conclusions must be actionable,
verifiable, and maintainable. Every claim in this document was checked against the
filesystem, `package.json`, or `git log` at the time of writing. No assertion here
is aspirational.

---

## Project Overview

Catea is a desktop-only Obsidian plugin that pairs a paper-style workspace
with a fully local, bring-your-own-key agent. Built with TypeScript, React 18, and
esbuild, it provides a right-sidebar agent that can read and edit the vault, search
the web, call MCP servers, and keep a long-term memory of the user's notes.

**Core Pillars:**

- **In-process agent loop** — the CatUI standard loop runs inside the Obsidian
  host process; no ACP subprocess, no relay server. Model traffic goes straight to
  the configured endpoint over Node HTTP(S).
- **Bring your own key or optional Pro** — BYOK talks directly to the configured
  provider; optional Pro uses subscription billing and a hosted model endpoint.
  There is no telemetry. On machines with OS-backed encryption, models and keys live in
  encrypted Obsidian userData shared across vaults. `.catea/config.json` never holds keys.
- **Unified writing memory** — one canonical store per scope holds writing
  preferences, projects, concepts, materials, methods and editorial decisions.
  Prior NanoMem formats are imported once with backups; extraction is durable
  and queued. Local hashing and PII helpers retain their upstream provenance.
- **Vault data stays in the vault** — sessions, memory, and user-installed skills
  are written under `.catea/` inside the user's own vault and are never distributed
  with the plugin. Two read-only skill presets ship in the bundle as prompt text;
  they are never written into the vault, and a vault directory of the same id
  takes precedence over a preset.

---

## Architecture Topology

```
|-----------------------------------------------------------------------|
|                        OBSIDIAN HOST (desktop only)                    |
|  apps/obsidian/src/main.tsx  ->  class Catea extends Paper             |
|  right-sidebar ItemView "catea-agent"  ->  panel.tsx (React root)      |
|-----------------------------------------------------------------------|
                                 |
                                 v
|-----------------------------------------------------------------------|
|                        AGENT CORE                                      |
|  |------------------|  |-------------------|  |--------------------|   |
|  | Agent            |  | WorkingContext    |  | providers          |   |
|  | session, loop    |  | journal, handoff  |  | OpenAI / Anthropic |   |
|  | wiring, tools    |  | checkpoints       |  | SSE + fallback     |   |
|  |------------------|  |-------------------|  |--------------------|   |
|-----------------------------------------------------------------------|
                                 |
                                 v
|-----------------------------------------------------------------------|
|                        CAPABILITY LAYER                                |
|  |------------------|  |-------------------|  |--------------------|   |
|  | VaultTools       |  | ObsidianTools     |  | MemoryService      |   |
|  | fs + bash tools  |  | native vault API  |  | writing memory     |   |
|  |------------------|  |-------------------|  |--------------------|   |
|  | McpPool          |  | web_search/fetch  |  | personas           |   |
|  | HTTP + stdio     |  | Exa/Jina/DDG      |  | 4 personas, see P2 |   |
|  |------------------|  |-------------------|  |--------------------|   |
|-----------------------------------------------------------------------|
                                 |
                                 v
|-----------------------------------------------------------------------|
|                      VENDORED UPSTREAM (excluded from DIP)             |
|  packages/agent-core/upstream/  -> CatUI standard agent loop + AI      |
|  packages/memory/upstream/      -> CatUI mem-core (GPL-3.0)            |
|  Verified source adaptations; loop patch applied during the build.  |
|-----------------------------------------------------------------------|
```

---

## Directory Structure

Each line is `path/` followed by a comment. The `tests/dip-verify.test.ts` gate
asserts every path listed here exists on disk.

```
apps/                        # Obsidian plugin host
apps/obsidian/               # Plugin package (manifest.json input, paper.css)
apps/obsidian/src/           # Host code: entry point, views, native tools
apps/obsidian/src/skills/    # Built-in obsidian-workspace skill prompt
packages/                    # Shared libraries consumed by the host
packages/agent-core/         # Agent loop, providers, context handoff
packages/agent-core/src/     # Hand-written core (the only package app code imports)
packages/agent-core/upstream/ # Vendored CatUI loop and AI layer (excluded)
packages/integrations/       # Vault tools, skills loader, MCP pool, web tools
packages/integrations/src/   # Integration sources
packages/memory/             # Unified memory implementation and upstream provenance
packages/memory/src/         # Canonical memory store, extraction, tools and migration
packages/memory/upstream/    # Vendored CatUI mem-core, GPL-3.0 (excluded)
packages/personas/           # Persona definitions and registry
packages/personas/src/       # Persona prompt documents plus index.ts
packages/design-system/      # Vendored design system: tokens, components, Tailwind compiler
docs/                        # Design rationale and specs
docs/specs/                  # Approved design specifications
docs/skills/                 # Skill templates users copy into <vault>/.catea/skills/
.github/                     # CI, the release workflow, and issue and PR templates
scripts/                     # Build tooling, the scoped typecheck gate, and the release script
typings/                     # Minimal verified Node API contracts for source-only marketplace analysis
tests/                       # DIP harness: contract parser, verify gate, governance gate
```

---

## Build & Run Commands

```bash
# The design system (tokens + components + Tailwind compiler) is vendored under
# packages/design-system and linked through npm workspaces, so this clone is the
# entire build input. That is what lets CI build a release and what Obsidian's
# own build verification runs against a clean checkout.

npm ci             # reproducible workspace install, including the vendored design system
npm run build      # esbuild bundle -> dist/catea-paper/
npm run dev:build  # same bundle re-identified as catea-paper-dev -> dist/catea-paper-dev/
npm run dev:install # dev:build, then install it into a vault beside the released plugin
npm run dev:watch  # dev:install, then rebuild and re-copy on every source change
npm test           # node --test; run after npm ci because behavior tests bundle fixtures
npm run typecheck  # scoped tsc over owned code only
npm run lint       # official Obsidian rules for host and adapter source
npm run format:check # Prettier check over owned TypeScript and JavaScript
npm run test:behavior # runtime adapter regressions; requires npm install
npm run check:marketplace # type/lint regression without installed Node declarations
```

`npm run build` writes `dist/catea-paper/`, an installable Obsidian plugin
directory: `main.js`, `styles.css`, `manifest.json`, `LICENSE`,
`THIRD_PARTY_NOTICES.md`, `TABLER-LICENSE.txt`, and the design-system licence
files. It does not install the plugin; copying it into
`<vault>/.obsidian/plugins/catea-paper/` is a separate, manual step.

### Testing a local build beside the released plugin

`npm run dev:install -- --vault /path/to/vault` builds and installs a second
plugin identity into a vault that already has the released Catea. The dev bundle
carries id `catea-paper-dev`, shows as **Catea (Dev)** in the plugin list and in
the ribbon tooltip, and reads and writes `.catea-dev/` instead of `.catea/`, so it
cannot touch the released plugin's sessions, memory or config. `scripts/dev-target.mjs`
owns that identity and `packages/integrations/src/data-dir.ts` owns the directory,
which `scripts/build.mjs` injects as the compile-time constant `CATEA_DATA_DIR`.

Two constraints are deliberate:

- The script **refuses** to install into a vault where the released plugin is
  currently enabled, because both builds register the view type `catea-agent` and
  Obsidian would resolve the same sidebar leaf from two plugins. Pass `--swap` to
  disable the released plugin and enable the dev one in a single edit.
- View types stay identical on purpose. `workspace.json` keys leaves by view type,
  so switching which build is enabled leaves the sidebar where it was.

BYOK models and API keys live in the machine-global encrypted store, so they carry
over to the dev build automatically; model selection, MCP servers and skill toggles
are vault config and must be set once in the dev instance.

`npm run dev:watch -- --vault /path/to/vault` keeps running after that install and
rebuilds on any change under `apps/`, `packages/` or `scripts/`, copying the result
straight into the vault. A full build measures under half a second, so this re-runs
the real `build.mjs` rather than restructuring it into an incremental esbuild
context — `build.mjs` is on the release path and not worth the risk for 0.3 s.

The install also writes an empty `.hot-reload` marker into the vault copy, which is
what the community plugin **Hot Reload** (`obsidian-hot-reload`) looks for to reload
a changed plugin without a manual restart. The marker is written into the vault
directory only, never into `dist/`, so it cannot reach a release bundle. Without
that plugin installed the files are still copied and `Cmd+R` picks them up.

**Verification status — measured on 2026-10-01 with the dev-build isolation work applied.**
`npm ci` had completed before these checks; every command below ran from this
repository with the vendored design system.

| Command | Result |
|---------|--------|
| `npm run build` | **exit 0** — main.js 3,068,153 bytes, below the 5 MB limit enforced by the build script; `scripts/paper-icon-prune.mjs` drops the 1,613,729-byte Tabler table |
| `npm run dev:build` | **exit 0** — main.js 3,068,177 bytes; manifest id `catea-paper-dev`, no `.catea/` path left in the bundle |
| `npm test` | **exit 0** — 466 contract, governance and regression checks |
| `npm run test:behavior` | **exit 0** — 66 model, context, settings and host-adapter regressions |
| `npm run check:marketplace` | **exit 0** — 154 source files, 0 unsafe-type findings without installed Node types |
| `npm run lint` | **exit 0** — official Obsidian recommended rules over hand-written host and adapter source |
| `npm run format:check` | **exit 0** — all owned TypeScript and JavaScript matches the repository Prettier style |
| `npm run typecheck` | **exit 0** — 0 diagnostics in owned source, 0 in the vendored snapshot, 0 external |

The lint gate includes the vendored design system but excludes byte-verified
upstream. This exclusion does not alter the marketplace scanner's scope. See
`docs/MARKETPLACE_REVIEW.md` for the remaining capability notices and verification
limits.

Loading the built plugin inside Obsidian has **not** been verified here; that
needs a running Obsidian instance and a test vault.

Two decisions keep `main.js` under Obsidian's 5 MB sync threshold, and both are
load-bearing: `packages/design-system/components/src/CodeBlock.tsx` loads a curated
Shiki grammar set through `shiki/core` (the full registry plus an inlined Oniguruma
WASM added about 10 MB), and Mermaid renders through the Obsidian runtime that is
already loaded rather than a bundled second renderer. `.github/workflows/ci.yml`
asserts the size on every build.

The optional Catea Lite chat/title/diary model downloads only pinned model weights
after activation. Its CPU WebAssembly runtime ships compressed inside `main.js`
and runs inference in a worker. Three independent switches share the download;
local chat uses a verified 32K text-only context, with no tools or cloud fallback.
Weights live in machine-global Obsidian userData,
never in a vault or release bundle. Keep `main.js` below the existing 5 MB gate.
Full runtime and model license notices ship in `LOCAL-MODEL-LICENSE.txt` and the
bundle header. See `docs/LOCAL_MODEL.md` for architecture and acceptance limits.

**Runtime requirement.** The gates run on Node's built-in test runner, use native
TypeScript type stripping, and bundle selected fixtures with esbuild. Run `npm ci`
first; Node 24 or newer is expected (verified on v24.21.0).

---

## Key Abstractions

### `Agent` (`packages/agent-core/src/index.ts`)

Owns one chat session: saves it through `ConversationStore`, assembles the tool list for each turn, drives
the upstream loop, repairs interrupted tool calls, and enqueues memory extraction
after the reply finishes. The only class the Obsidian host talks to directly.

### `agentLoop` (`packages/agent-core/upstream/loop/agent-loop.ts`)

The vendored CatUI standard loop: tool-argument validation, read-only concurrency,
stop handling, tool-result completion, and no-progress detection. Reachable only
through `Agent`; the `@catui/ai` alias in `scripts/build.mjs` points here.

### `WorkingContext` (`packages/agent-core/src/context.ts`)

Keeps the complete journal while presenting a windowed view to the model.
Checkpoints are appended as `compaction` entries, so an original transcript record
is never destroyed when the context window is handed over.

### `streamModel` (`packages/agent-core/src/providers.ts`)

Translates the internal transcript into OpenAI-compatible or Anthropic request
shapes and parses both streaming forms, including tool-call assembly across deltas
and a buffered fallback when a provider does not return `text/event-stream`.

### `MemoryService` (`packages/memory/src/index.ts`)

Owns unified writing and knowledge memory: one `memories.json` per persona/global
scope, one-time backed-up migration from prior formats, bounded recall and a
durable job file (`.catea/memory/pending-turns.json`) with atomic turn receipts
and retry backoff. See [Memory model and migration](./docs/MEMORY.md).

### `VaultTools` (`packages/integrations/src/tools.ts`) and `ObsidianTools` (`apps/obsidian/src/obsidian-tools.ts`)

Two tool surfaces over the same vault. `VaultTools` works on the filesystem and
enforces confinement in `within()`; `ObsidianTools` goes through Obsidian's own
API so that links, tabs, and the metadata cache stay consistent. Both require
approval before writing.

### `McpPool` (`packages/integrations/src/mcp.ts`)

Owns MCP clients for HTTP and stdio transports, paginates tool discovery, and
namespaces discovered tools so they cannot collide with built-in ones.

### `contractTest` (`tests/dip-contract.ts`)

The DIP harness entry point. It compares a file's P3 header claims against the
file's real exports and imports, which is what makes documentation drift a test
failure instead of a silent inconsistency.

---

## Configuration Paths

Vault-specific runtime data is written inside the user's vault, never into the plugin.

| Path | Purpose |
|------|---------|
| `.catea/config.json` | Vault toggles, selected model, MCP servers; model metadata only when global encryption is unavailable. **Never contains API keys** |
| `.catea/diary/index.json` | Companion diaries, per-persona display profiles, automatic-generation toggle and durable catch-up cursor; dev builds use `.catea-dev/diary/index.json` |
| `.catea/sessions/index.json` | Session list, capped at 500 entries |
| `.catea/sessions/<id>.json` | Raw conversation and tool transcript for one session |
| `.catea/skills/<id>/SKILL.md` | User-installed skill packages, enabled explicitly; shadows the bundled preset of the same id |
| `.catea/memory/pending-turns.json` | Durable queue of turns awaiting memory extraction |
| `.catea/memory/global/memories.json` | Canonical shared writing and knowledge memory |
| `.catea/memory/aria/`, `.catea/memory/vex/`, `.catea/memory/pencil/`, `.catea/memory/dazai/` | Per-persona isolation; each contains one canonical `memories.json` |

A `--dev` build writes the identical tree under `.catea-dev/` in the same vault,
which is what lets it be installed beside the released plugin without either one
reading the other's state. Every path above is built through `dataPath()` in
`packages/integrations/src/data-dir.ts`; nothing hardcodes the directory name.

BYOK models and API keys are held in encrypted `<Obsidian userData>/catea/byok.enc`
when OS-backed Electron safeStorage is available (Linux `basic_text` is rejected).
Otherwise models remain vault-local and keys use Obsidian's vault-scoped secure
storage, keyed `catea-<id>`; when that is unavailable they exist only for the
current session. MCP tokens and the separate image/video/speech generation API keys remain vault-scoped. Media generation uses Obsidian secure storage with an in-memory fallback; generated media are saved under `Attachments/Catea/`. `.catea/` is git-ignored because
it may contain private note content.

---

## Code Standards

### Language Policy

**Documentation**: English. This includes P1/P2/P3, `docs/`, and commit messages.

**Source comments**: English.

**Product UI**: bilingual by design, not by omission. User-facing strings are
resolved through `apps/obsidian/src/locale.ts` and `packages/agent-core/src/i18n.ts`,
and Chinese remains a supported UI language. `README.md` is an English product introduction with landscape promotional artwork. The Chinese persona documents under `packages/personas/src/` are
runtime prompt content and are deliberately not translated here. Templates under
`docs/skills/` are the same category: a `SKILL.md` is injected into the prompt
when enabled, so it is runtime content that merely lives beside the docs, and
the persona it serves decides its language.

### Commit Convention

```
<type>(<scope>): <summary>
```

Types observed in history and expected going forward: `feat`, `fix`, `docs`,
`test`, `chore`, `refactor`.

### P3 contract convention

P3 headers are machine-checked, so the fields have a fixed grammar:

| Field | Grammar | Verified by |
|-------|---------|-------------|
| `[WHO]` | Comma-separated exported symbol names, exactly as declared in the file | each name must appear in the file's actual exports |
| `[FROM]` | Comma-separated import specifiers, exactly as written in the imports, or `(none)` | each must appear in the file's actual import list; `(none)` requires zero imports |
| `[TO]` | Comma-separated repo-relative paths of files that import this one, or `(entry)` | each path must exist and must actually import this file; `(entry)` requires zero importers |
| `[HERE]` | `repo-relative/path.ext - role` | the text must begin with the file's own path |

Narrative wording is tolerated (`Provides`, `Depends on`, `Consumed by`) but the
list content is not. Renaming an export without updating `[WHO]` fails `npm test`.

### Release and version governance

The version has one runtime source: `packages/agent-core/src/version.ts`
(`PLUGIN_VERSION`). `tests/governance.test.ts` asserts that it, `manifest.json`,
both `package.json` files and `versions.json` all agree, that `versions.json` maps
the released version to `minAppVersion`, and that no other in-scope file hardcodes a
version literal — the drift that had left `0.3.0` in two files is now a test failure.

Publishing an update requires a GitHub **Release** whose tag is the version with no
`v` prefix, with `main.js`, `manifest.json` and `styles.css` attached. A tag alone
never reaches users, and a version that was already published is ignored. Releases
are cut with `node scripts/release.mjs` (dry run by default) or through the manual
`.github/workflows/release.yml`, which builds on a runner and attests the built
assets so users can verify their provenance.

Two constraints are structural, not incidental:

- The design system is vendored rather than referenced from a sibling checkout,
  because a clean checkout is what both CI and Obsidian's build verification use.
- The build must be re-run before every release: the governance gate compares the
  built `dist/catea-paper/manifest.json` against the repository version.

`.github/workflows/ci.yml` runs `npm ci`, `npm test`, `npm run typecheck` and
`npm run build`, and asserts the three release assets and the 5 MB size limit, on
every push to `main` and every pull request. See [CONTRIBUTING.md](./CONTRIBUTING.md) for
the contributor-facing procedure and [SECURITY.md](./SECURITY.md) for the threat model.

---

## DIP Navigation

### P1 — Root

- [P1: This file](./AGENTS.md)

### P2 — Module Maps

- [P2: apps/obsidian/src/](./apps/obsidian/src/AGENTS.md) — Obsidian host: entry point, sidebar UI, native vault tools
- [P2: packages/agent-core/src/](./packages/agent-core/src/AGENTS.md) — Agent loop wiring, providers, context handoff
- [P2: packages/integrations/src/](./packages/integrations/src/AGENTS.md) — Vault tools, skill loader, MCP pool, web tools
- [P2: packages/memory/src/](./packages/memory/src/AGENTS.md) — unified memory, migration, recall and durable job queue
- [P2: packages/personas/src/](./packages/personas/src/AGENTS.md) — Persona prompts and registry

### P3 — File Contracts

**Status**: complete for every in-scope file — all in-scope source files carry a P3 header
and a matching contract test, and `npm test` passes.

Five deliberate exclusions:

1. **Vendored upstream** — 74 files under `packages/*/upstream/` are excluded
   from DIP. Agent-core source digests are recorded in
   `packages/agent-core/upstream/SOURCE_HASHES.json`; the one local loop patch
   is applied in memory by `scripts/agent-loop-patch.mjs` and recorded in
   `packages/agent-core/LOCAL_PATCHES.json`. Source adaptations are recorded separately in `packages/UPSTREAM_ADAPTATIONS.json`;
   verification reverses each edit to check the unchanged original digests.
   Do not modify snapshots without updating these auditable adaptation records.
2. **Vendored, generated assets inside `apps/`** — a few files are neither
   hand-written source nor build output of this repository. `apps/obsidian/src/paper.cjs`
   is one: a generated 1.6 MB bundle of the Paper base class with an embedded Tabler
   icon set (5,166 icons, 98.7% of its bytes on a single line), imported by
   `apps/obsidian/src/main.tsx` and unbuildable from this checkout. These are named in
   `apps/obsidian/src/VENDOR_MANIFEST.json`, which `tests/dip-contract.ts` reads to
   exclude them from DIP scope, so the exclusion is declared rather than an accident of
   the file-extension rule. `tests/vendor-assets.test.ts` then pins each digest: a
   hand-edit to `paper.cjs` fails `npm test` instead of passing silently.
   Never hand-edit these assets — regenerate upstream and re-record the digest.
3. **`scripts/`** — the scope rule above covers `apps/*/src` and `packages/*/src`
   only, so `scripts/build.mjs` is unheadered. Adding a header now would also race
   the concurrent marketplace work that edits that file.
4. **Tests** — files under `__tests__/` are out of scope, since a contract test
   for a contract test is circular.
5. **The vendored design system** — `packages/design-system/**` sits outside the
   `apps/*/src` and `packages/*/src` scope rule, so it carries no P3 headers. It is
   our own code, edited here directly, and `npm run typecheck` does cover it.

### Related Documents

- [Contributing, the gates and the release procedure](./CONTRIBUTING.md)
- [Security model and how to report a vulnerability](./SECURITY.md)
- [Changelog](./CHANGELOG.md)
- [Writing memory and migration](./docs/MEMORY.md)
- [Architecture decisions and acceptance record](./docs/ARCHITECTURE.md)
- [Module boundaries and UI migration status](./docs/MODULARIZATION.md)
- [DIP bootstrap design spec](./docs/specs/2026-09-28-dip-bootstrap-design.md)
- [Connector manifest bridge design](./docs/specs/2026-10-02-connector-manifest-bridge-design.md)
- [Third-party notices](./THIRD_PARTY_NOTICES.md)

---

**Covenant**: Maintain map-terrain isomorphism. Keep this file aligned with the
actual structure, or the structure will drift. `npm test` enforces the parts of
this document that can be checked mechanically.
