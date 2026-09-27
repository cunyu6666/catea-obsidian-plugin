> P1 | Root Project Charter & Navigation Map

---

## Identity

Grounded in auditable engineering discipline: conclusions must be actionable,
verifiable, and maintainable. Every claim in this document was checked against the
filesystem, `package.json`, or `git log` at the time of writing. No assertion here
is aspirational.

---

## Project Overview

Catea Paper is a desktop-only Obsidian plugin that pairs a paper-style workspace
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
|  Byte-verified against SOURCE_HASHES.json; never edited in place.      |
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
docs/                        # Design rationale and specs
docs/specs/                  # Approved design specifications
scripts/                     # Build tooling
tests/                       # DIP harness: contract parser and verify gate
```

---

## Build & Run Commands

```bash
# Prerequisite — NOT optional and NOT part of this repository.
# The design system (tokens + components + Tailwind compiler) lives in a sibling
# directory and must be installed first:
#     ../catea-design-system   -> run its own dependency install
#
# Then, from this repository root:

npm install     # workspace install; also needs the sibling design system present
npm run build   # esbuild bundle -> dist/catea-paper/
npm test        # node --test; requires no dependencies at all
```

`npm run build` writes `dist/catea-paper/`, an installable Obsidian plugin
directory: `main.js`, `styles.css`, `manifest.json`, `LICENSE`,
`THIRD_PARTY_NOTICES.md`, `TABLER-LICENSE.txt`, and the design-system licence
files. It does not install the plugin; copying it into
`<vault>/.obsidian/plugins/catea-paper/` is a separate, manual step.

**Verification status — read this before trusting the build command.** In the
current checkout `../catea-design-system` is absent and `node_modules` is not
installed, so `npm run build` has **not** been executed and is not verified. Only
`npm test` is verified, because the harness deliberately has zero dependencies.
Nothing in this repository should claim that build, typecheck, or in-Obsidian
loading succeed until those commands are actually run in a complete workspace.

**Runtime requirement.** `npm test` runs on Node's built-in test runner and relies
on native TypeScript type stripping, so Node 24 or newer is expected.

---

## Key Abstractions

### `Agent` (`packages/agent-core/src/index.ts`)

Owns one chat session: persists it, assembles the tool list for each turn, drives
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
| `[FROM]` | Comma-separated import specifiers, exactly as written in the imports | each must appear in the file's actual import list |
| `[TO]` | Comma-separated repo-relative paths of files that import this one, or `(entry)` | each path must exist and must actually import this file; `(entry)` requires zero importers |
| `[HERE]` | `repo-relative/path.ext - role` | the text must begin with the file's own path |

Narrative wording is tolerated (`Provides`, `Depends on`, `Consumed by`) but the
list content is not. Renaming an export without updating `[WHO]` fails `npm test`.

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

**Status**: partial — 32 in-scope source files carry a P3 header and a matching
contract test. Vendored upstream (74 files under `packages/*/upstream/`) is
excluded on purpose: it is byte-verified against
`packages/agent-core/upstream/SOURCE_HASHES.json`, and inserting a header would
invalidate that verification.

### Related Documents

- [Architecture decisions and acceptance record](./docs/ARCHITECTURE.md)
- [DIP bootstrap design spec](./docs/specs/2026-09-28-dip-bootstrap-design.md)
- [Third-party notices](./THIRD_PARTY_NOTICES.md)

---

**Covenant**: Maintain map-terrain isomorphism. Keep this file aligned with the
actual structure, or the structure will drift. `npm test` enforces the parts of
this document that can be checked mechanically.