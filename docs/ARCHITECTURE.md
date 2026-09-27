# Catea Agent — Architecture and Implementation Status

Status as of 2026-09-28 (version 0.3.1).

**Verified on 2026-09-28 in a complete workspace**: `npm run build` completed with
exit 0 and produced `dist/catea-paper/` (main.js, styles.css, manifest.json at
0.3.1, and the licence files); `npm test` completed with exit 0 and 171 passing
assertions; the 2026-09-27 hands-on acceptance record below was observed in a
running Obsidian instance.

**Not verified**: `npx tsc --noEmit` exits 2 with 88 pre-existing errors — 84 in the
vendored `packages/*/upstream/**` snapshot, which omits sibling modules and so
cannot typecheck standalone; 3 in the external `catea-design-system` components;
and 1 in this repository's own source, `packages/integrations/src/web.ts:43`.
Loading the built plugin inside Obsidian is also unverified here, because that
needs a live Obsidian instance and a test vault.

---

## Requirements Mapping

| Requirement | Current implementation |
| --- | --- |
| CatUI standard loop + ANNO provider | Pinned-version standard loop source, tool argument validation and scheduling, stop recovery, steering mid-run; full journal plus model-authored handoff |
| CatUI tools | read/write/edit/ls/find/grep/bash/time plus a user question tool; shell off by default, writes and shell commands confirmed per call |
| Skills / MCP | Explicit enablement and resource reads from `.catea/skills`; MCP SDK over HTTP and stdio with tool discovery, session reuse and shutdown |
| Personas | Vex, Aria, Pencil, sourced from ANNO. The user's "arial" refers to the existing Aria |
| Full memory core | Complete CatUI mem-core source snapshot: layered recall, working/episodic/semantic/procedural memory, linking, reinforcement, forgetting, archive restore, conflict resolution, consolidation and insights |
| UI / design system | Standalone `catea-design-system` workspace with tokens, components and showcase; ANNO Composer / StreamingChatResponse / AgentActivities / ApprovalCard; Tabler icons |

---

## ADR 001: In-Process Loop

**Decision**: the Obsidian host executes the loop directly and streams to the
model over Node HTTP(S). There is no CatUI ACP subprocess and no relay server.

**Rationale**: shortens the path from UI to first token and reuses ANNO's provider
protocol mapping.

**Trade-offs**: network and tool lifecycles are owned by the plugin. First-token
and full-turn latency have not been benchmarked, so no claim is made that this is
faster than CatUI.

---

## ADR 002: Keep the CatUI Memory Core, Replace the Host Adapter

The mem-core source is retained rather than reduced to a single memory table.
`memoryDir` takes precedence over CatUI's global environment variables, so
nothing is written to `~/.nanomem`. `.catea/memory/global` and the per-persona
subdirectories are isolated. At the end of a session, extraction work is enqueued
durably and progress is recorded per stage; failures keep their error and a
backoff timestamp so processing resumes after a restart.

Recall waits at most 600 ms on the first-token path; on timeout it uses that
persona's existing cache and refreshes in the background. Consolidation and
archiving run serially in the queue. The engine and the NanoMem extension
lifecycle are reused as-is; a `MemoryHost` injects the knowledge base, persona,
structured BYOK configuration and events. The CatUI TUI is not embedded.

**Trade-offs**: automatic extraction can add model calls. The engine is GPL-3.0,
so its licence and provenance are retained. This is not a migration of an existing
`~/.catui` directory: existing CatUI memory is neither read nor modified.

---

## ADR 003: Standalone Design-System Monorepo

`catea-design-system` has its own `package.json` and workspaces: `packages/tokens`,
`packages/components`, `apps/showcase`. The main repository consumes the component
interface only, and no component imports Obsidian, the filesystem, a model or
memory. This follows qoder-loop's separation of component package and showcase.

Both directories currently sit under the user's vault repository; no remote Git
repository was created for the design system. It can be versioned and moved out
independently.

---

## Runtime Layout

```text
.catea/
  config.json              # model metadata, toggles, MCP config; no API key or token
  sessions/index.json
  sessions/<id>.json       # raw conversation and tool transcript
  skills/<id>/SKILL.md
  memory/pending-turns.json
  memory/global/
  memory/aria/
  memory/vex/
  memory/pencil/
```

Keys use Obsidian's secret storage. When it is unavailable they exist only in
memory and the UI says so explicitly. The shell is off by default; when enabled,
each command shows its working directory and the literal command, and states that
it is not a sandbox. MCP stdio starts the user-enabled configuration on first tool
discovery in a conversation, and every MCP tool call is confirmed individually.

---

## Pre-Release Acceptance Checklist

Not yet executed as a whole. Each item is a manual procedure in a test vault:

1. Build the plugin and load it in a test vault; confirm the paper master switch is
   restored, the Agent has its own switch, and panel unload and dialog cancel behave.
2. Run one streaming text turn and one multi-step tool turn against each of an
   OpenAI-compatible and an Anthropic endpoint; cancel during model response,
   during a tool call, and during a confirmation dialog.
3. For read/write/edit: path escape, symlinks, file changed during confirmation,
   `raw/` protection, and append-only `wiki/log.md`.
4. For MCP over HTTP and stdio: initialization, paginated tool discovery, error
   responses, process exit, reconfiguration, and refusing a call.
5. Skills: enablement, relative resource reads, disabling, and escape attempts;
   three-persona switching, current-note opt-in, and long-file truncation.
6. Memory: extraction, recall, working/episodic/consolidation/forgetting/conflict/
   restore against the same samples as CatUI; restart recovery, queue retry, and
   cancellation when the switch is turned off.
7. Holding model, input and tools fixed, measure first-token, tool turnaround and
   full-turn latency for ANNO, CatUI and Catea.

---

## 2026-09-27 Hands-On Acceptance Record

- The CatUI standard loop source and 24 supporting AI modules were compared
  byte-for-byte against the original commit; fingerprints are recorded in
  `packages/agent-core/upstream/SOURCE_HASHES.json`.
- MiniMax, driven from Obsidian, actually called `time` → `working_notes` write →
  `session_history` list → AskUserQuestion; after the choice was submitted the
  reply continued successfully.
- Recorded SSE delivery for that run: 7 text increments, first text at about
  2.4 s, response complete at about 4.6 s. This is a single observation, not a
  throughput guarantee.
- A segmented historical session exercised `new_context` and produced a
  context-window checkpoint after the complete tool result. The following request
  dropped from 27078 to 16754 input tokens; `session_history` search still returned
  the early raw user records; `windows` returned one window; all 31 raw transcript
  records were retained.
- A single oversized history record was deferred for handoff under upstream's safe
  retention policy rather than being cut. "accepted" means the request was queued,
  not that the switch happened; the window record is authoritative.
- A multi-turn background memory queue completed, persisted episodes and drained.
  Complex conflict, forgetting and archive-restore algorithms reuse upstream code
  but were not exercised item by item against destructive fixtures in this vault.
- Typecheck, unit tests and the full suite were not run for that acceptance pass;
  the build was used for the actual plugin delivery.

---

## 2026-09-28 DIP Bootstrap

The repository now carries a verifiable documentation layer: a root `AGENTS.md`
(P1), five module maps (P2), and P3 contract headers on all 33 in-scope source
files, each enforced by a contract test. `npm test` covers both the per-file
contracts and repo-wide isomorphism between documentation and code.

Deliberately excluded from DIP: the 74 byte-verified vendored files under
`packages/*/upstream/`; `scripts/`, which the scope rule does not cover at all
(`apps/*/src` and `packages/*/src` only), so `scripts/build.mjs` carries no header;
and `__tests__/` itself. See `docs/specs/2026-09-28-dip-bootstrap-design.md` for the
approved design and its verification limits.

## 2026-09-28 Repository Governance

Added once the repository became public, to make releases and versions enforceable
rather than conventional:

- **One version source.** `packages/agent-core/src/version.ts` holds
  `PLUGIN_VERSION`; a governance test keeps it, `manifest.json`, both
  `package.json` files and `versions.json` in agreement, and rejects any other
  hardcoded version literal. Two files had drifted to `0.3.0` before this.
- **`versions.json`**, which did not exist, so older Obsidian builds can resolve a
  compatible older release.
- **A usable `tsc` gate.** Raw `tsc` reports ~87 diagnostics that cannot be fixed
  from this repository (84 from the vendored snapshot, which omits sibling modules;
  3 from the external design system, which ships `.ts` rather than `.d.ts`).
  `scripts/typecheck.mjs` runs the same program and fails only on owned code.
  Narrowing tsconfig `exclude` was tried and made it worse (87 → 129).
- **CI** on push, pull requests and demand: install, contracts and governance,
  typecheck. The build job is gated on a `DESIGN_SYSTEM_REPO` variable because the
  design system is not a git repository and cannot be checked out by a runner.
- **Releases.** `scripts/release.mjs` (dry run by default) validates the gates, the
  three required assets and the built version, then creates the GitHub Release;
  `.github/workflows/release.yml` does the same on a runner once the design system
  has a repository.
- **`CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`** and issue and pull request
  templates, including the DIP obligations a contributor has to satisfy.