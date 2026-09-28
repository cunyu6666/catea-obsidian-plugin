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
- **Bring your own key, no backend** — there is no Catea account, no telemetry, and
  no vendor backend. Model metadata lives in `.catea/config.json`; API keys live in
  Obsidian's secure storage and are never written to that file.
- **Retained memory core** — the CatUI `mem-core` is vendored rather than
  reimplemented, with the host adapter replaced. Recall, extraction, consolidation,
  and forgetting are durable and queued.
- **Vault data stays in the vault** — sessions, memory, and skills are written under
  `.catea/` inside the user's own vault and are never distributed with the plugin.

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
|  | fs + bash tools  |  | native vault API  |  | mem-core adapter   |   |
|  |------------------|  |-------------------|  |--------------------|   |
|  | McpPool          |  | web_search/fetch  |  | personas           |   |
|  | HTTP + stdio     |  | Exa/Jina/DDG      |  | Vex / Aria / Pencil|   |
|  |------------------|  |-------------------|  |--------------------|   |
|-----------------------------------------------------------------------|
                                 |
                                 v
|-----------------------------------------------------------------------|
|                      VENDORED UPSTREAM (excluded from DIP)             |
|  packages/agent-core/upstream/  -> CatUI standard agent loop + AI      |
|  packages/memory/upstream/      -> CatUI mem-core (GPL-3.0)            |
|  Byte-verified original; reviewed loop patch applied during the build.  |
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
packages/memory/             # CatUI mem-core snapshot plus the host adapter
packages/memory/src/         # MemoryService adapter (excluded upstream alongside)
packages/memory/upstream/    # Vendored CatUI mem-core, GPL-3.0 (excluded)
packages/personas/           # Persona definitions and registry
packages/personas/src/       # Persona prompt documents plus index.ts
packages/design-system/      # Vendored design system: tokens, components, Tailwind compiler
docs/                        # Design rationale and specs
docs/specs/                  # Approved design specifications
.github/                     # CI, the release workflow, and issue and PR templates
scripts/                     # Build tooling, the scoped typecheck gate, and the release script
tests/                       # DIP harness: contract parser, verify gate, governance gate
```

---

## Build & Run Commands

```bash
# The design system (tokens + components + Tailwind compiler) is vendored under
# packages/design-system and linked through npm workspaces, so this clone is the
# entire build input. That is what lets CI build a release and what Obsidian's
# own build verification runs against a clean checkout.

npm install        # workspace install, including the vendored design system
npm run build      # esbuild bundle -> dist/catea-paper/
npm test           # node --test; requires no dependencies at all
npm run typecheck  # scoped tsc over owned code only
npm run lint       # official Obsidian rules for host and adapter source
npm run test:behavior # runtime adapter regressions; requires npm install
```

`npm run build` writes `dist/catea-paper/`, an installable Obsidian plugin
directory: `main.js`, `styles.css`, `manifest.json`, `LICENSE`,
`THIRD_PARTY_NOTICES.md`, `TABLER-LICENSE.txt`, and the design-system licence
files. It does not install the plugin; copying it into
`<vault>/.obsidian/plugins/catea-paper/` is a separate, manual step.

**Verification status — measured on 2026-09-28 with a clean temporary copy.**
Only repository files were copied; no sibling checkout or existing node_modules
was available. `npm ci` completed before these checks.

| Command | Result |
|---------|--------|
| `npm run build` | **exit 0** — main.js approximately 4.14 MB, below the 5 MB limit enforced by the build script |
| `npm test` | **exit 0** — contract and governance checks, including literal dynamic-import detection |
| `npm run test:behavior` | **exit 0** — model streaming, context handoff and settings regression checks |
| `npm run lint` | **exit 0** — official Obsidian recommended rules over hand-written host and adapter source |
| `npm run typecheck` | **exit 0** — 0 diagnostics in owned source, 84 in the vendored snapshot, 0 external |

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

**Runtime requirement.** `npm test` runs on Node's built-in test runner and relies
on native TypeScript type stripping, so Node 24 or newer is expected (verified on
v24.21.0).

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

Adapts the vendored mem-core to this host: per-persona engine directories, recall
injection bounded on the first-token path, and a durable job file
(`.catea/memory/pending-turns.json`) that survives restarts with backoff.

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

All runtime data is written inside the user's vault, never into the plugin.

| Path | Purpose |
|------|---------|
| `.catea/config.json` | Model metadata, toggles, MCP servers. **Never contains API keys** |
| `.catea/sessions/index.json` | Session list, capped at 500 entries |
| `.catea/sessions/<id>.json` | Raw conversation and tool transcript for one session |
| `.catea/skills/<id>/SKILL.md` | User-installed skill packages, enabled explicitly |
| `.catea/memory/pending-turns.json` | Durable queue of turns awaiting memory extraction |
| `.catea/memory/global/` | Shared memory engine directory |
| `.catea/memory/aria/`, `.catea/memory/vex/`, `.catea/memory/pencil/` | Per-persona memory isolation |

API keys and MCP bearer tokens are held in Obsidian's secure storage, keyed
`catea-<id>`. When secure storage is unavailable they exist only for the current
session, and the UI says so. `.catea/` is git-ignored because it may contain
private note content.

---

## Code Standards

### Language Policy

**Documentation**: English. This includes P1/P2/P3, `docs/`, and commit messages.

**Source comments**: English.

**Product UI**: bilingual by design, not by omission. User-facing strings are
resolved through `apps/obsidian/src/locale.ts` and `packages/agent-core/src/i18n.ts`,
and Chinese remains a supported UI language. `README_CN.md` is the intentional
Chinese README. The Chinese persona documents under `packages/personas/src/` are
runtime prompt content and are deliberately not translated here.

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
- [P2: packages/memory/src/](./packages/memory/src/AGENTS.md) — mem-core adapter, recall injection, durable job queue
- [P2: packages/personas/src/](./packages/personas/src/AGENTS.md) — Persona prompts and registry

### P3 — File Contracts

**Status**: complete for every in-scope file — all in-scope source files carry a P3 header
and a matching contract test, and `npm test` passes.

Four deliberate exclusions:

1. **Vendored upstream** — 74 files under `packages/*/upstream/` are excluded
   from DIP. Agent-core source digests are recorded in
   `packages/agent-core/upstream/SOURCE_HASHES.json`; the one local loop patch
   is applied in memory by `scripts/agent-loop-patch.mjs` and recorded in
   `packages/agent-core/LOCAL_PATCHES.json`. Inserting a P3 header would
   invalidate the original digests.
2. **`scripts/`** — the scope rule above covers `apps/*/src` and `packages/*/src`
   only, so `scripts/build.mjs` is unheadered. Adding a header now would also race
   the concurrent marketplace work that edits that file.
3. **Tests** — files under `__tests__/` are out of scope, since a contract test
   for a contract test is circular.
4. **The vendored design system** — `packages/design-system/**` sits outside the
   `apps/*/src` and `packages/*/src` scope rule, so it carries no P3 headers. It is
   our own code, edited here directly, and `npm run typecheck` does cover it.

### Related Documents

- [Contributing, the gates and the release procedure](./CONTRIBUTING.md)
- [Security model and how to report a vulnerability](./SECURITY.md)
- [Changelog](./CHANGELOG.md)
- [Architecture decisions and acceptance record](./docs/ARCHITECTURE.md)
- [Module boundaries and UI migration status](./docs/MODULARIZATION.md)
- [DIP bootstrap design spec](./docs/specs/2026-09-28-dip-bootstrap-design.md)
- [Third-party notices](./THIRD_PARTY_NOTICES.md)

---

**Covenant**: Maintain map-terrain isomorphism. Keep this file aligned with the
actual structure, or the structure will drift. `npm test` enforces the parts of
this document that can be checked mechanically.
