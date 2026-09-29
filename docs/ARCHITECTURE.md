# Catea Architecture

Status: 2026-09-29, version 0.3.16.

Catea is a desktop-only Obsidian plugin. The agent loop, model transport, tools,
memory adapter, and UI all run inside the Obsidian host process. There is no Catea
account, relay service, telemetry endpoint, or vendor backend.

The root [AGENTS.md](../AGENTS.md) is the machine-checked navigation and ownership
map. This document records the architectural decisions and trust boundaries behind
that map.

## Runtime shape

```text
Obsidian host
  apps/obsidian/src/main.tsx
    ├─ React sidebar and settings
    ├─ native Obsidian tools
    ├─ global encrypted BYOK profiles
    └─ theme, updates, Git history, editor zoom
             │
             ▼
Agent core
  packages/agent-core/src/
    ├─ session orchestration and context handoff
    ├─ OpenAI-compatible and Anthropic transports
    └─ vendored CatUI loop behind one adapter
             │
             ▼
Capabilities
  packages/integrations/src/  vault, web, MCP, skills
  packages/memory/src/        unified writing memory
  packages/personas/src/      persona prompts
```

The design system is vendored under `packages/design-system` and linked through
npm workspaces. A clean clone is therefore the complete build input used by CI and
Obsidian's release verifier.

## Decisions

### In-process agent loop

The host calls the CatUI standard loop directly and sends model traffic over Node
HTTP(S). This avoids an ACP subprocess and keeps cancellation, approvals, session
persistence, and streaming under one lifecycle. The trade-off is that the plugin
owns those lifecycles and must test them explicitly.

### Vendored upstream with a narrow patch boundary

CatUI's agent loop and memory core are vendored under `packages/*/upstream/`.
Agent-core bytes are checked against `SOURCE_HASHES.json`; the reviewed loop patch
is applied during the build and described by `LOCAL_PATCHES.json`. Hand-written
host code imports only the adapters under `packages/*/src/`.

The upstream snapshot intentionally omits sibling CatUI packages, so raw `tsc`
cannot resolve it in isolation. `npm run typecheck` reports those diagnostics but
fails only for owned source. Provenance and buildability are enforced separately.

### Durable context without transcript destruction

`WorkingContext` keeps the complete journal and presents a bounded window to the
model. Compaction appends a checkpoint instead of rewriting prior records. Session
history remains searchable, interrupted tool calls are repaired on resume, and
overflow recovery is bounded.

### Reviewable writes instead of vault snapshots

Every structured write records its original and modified content on the tool
event. The conversation UI coalesces repeated writes to the same file and exposes
the resulting diff even when the turn fails or produces no final text. Catea does
not copy the whole vault when a message is sent.

This follows the same useful boundary as Craft Agents: reversibility is attached
to concrete tool mutations, not implemented as an unbounded series of full
workspace copies. Catea currently provides review, not an automatic multi-file
transaction rollback; Git remains the durable recovery mechanism for vaults that
use it.

On first startup after upgrading, the plugin removes the obsolete
`.catea/snapshots` tree. No current code reads it, and the migration is confined to
that exact plugin-owned path.

### Unified writing memory

Catea uses one owned writing/knowledge schema and one authoritative JSON document
per persona/global scope. Previous NanoMem flat and V2 stores are imported once
with exact-source backups; they are not live fallback stores. The old engine and
extension lifecycle no longer run. Local hash embedding and PII helpers retain
their upstream provenance.

Recall is bounded on the first-token path. Background extraction is queued and
commits records together with an idempotency receipt. One tool surface handles
search, edits, archival, restoration and conservative consolidation. See
[Memory model and migration](./MEMORY.md) for categories and behavior changes.

### Explicit capability boundaries

Vault reads, writes, shell commands, web access, MCP servers, and memory are
separate capabilities. Assist mode asks before mutations; full mode allows them;
disabled capabilities are denied. Filesystem paths are confined to the vault and
symbolic links are rejected. The shell is off by default and is not represented as
a sandbox.

## Persistence and retention

```text
.catea/
  config.json                 vault toggles and non-secret model metadata
  sessions/index.json        newest 500 conversations
  sessions/<id>.json         one raw conversation and tool transcript
  skills/<id>/SKILL.md       explicitly enabled local skills
  memory/pending-turns.json  durable extraction queue
  memory/{global,aria,vex,pencil}/memories.json
```

When a conversation ages out of the 500-row index, its session file is deleted by
the same serialized store. Branching copies only history before the selected user
message and only attachments referenced by that retained history.

Model profiles and API keys live in encrypted Obsidian user data when Electron
safeStorage is genuinely OS-backed. On unsupported hosts, model metadata stays
vault-local and keys use Obsidian secure storage when available, otherwise memory
only. MCP tokens remain vault-scoped. See [SECURITY.md](../SECURITY.md) for the
threat model.

## Release verification

CI runs from a clean checkout on Node 24:

1. `npm ci`
2. `npm test`
3. `npm run format:check`
4. `npm run typecheck`
5. `npm run lint`
6. `npm run test:behavior`
7. `npm run build`
8. release-asset, version, and 5 MB bundle assertions

The manual release workflow repeats the gates, attests the built JavaScript and
CSS, and publishes the three assets required by Obsidian. Loading the plugin in a
real Obsidian test vault remains a manual pre-release check; CI does not claim to
verify native host rendering.

## Manual smoke checklist

- Load the clean build in a disposable vault and restart Obsidian.
- Run one streaming reply and one multi-tool reply against each supported protocol.
- Stop during model streaming, tool execution, and an approval prompt.
- Exercise read, write, edit, path escape, symlink, `raw/` protection, and file
  change review after a failed turn.
- Branch a conversation containing attachments and verify future attachments are
  absent.
- Open parallel sessions, Git history, theme switching, editor zoom, and update
  checks.
- Restart with pending memory work and verify the durable queue resumes.
