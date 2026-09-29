# packages/memory/src/

> P2 | Parent: ../../../AGENTS.md

One writing and knowledge memory system per vault scope. All runtime operations
use `memories.json`; old NanoMem files are migration inputs only. The background
queue persists extraction jobs and commits each turn's receipt with its records.

## Member List

model.ts: Defines the general categories plus six writing/knowledge extensions, source attribution, project/note applicability and the canonical document schema; validates extraction, tools and stored records.
store.ts: `MemoryStore` confines paths to the vault, serializes transactions and atomically publishes one document after optional one-time migration.
migration.ts: Imports both previous NanoMem formats and archives with exact-byte source backups, ID aliases, links and conservative archive preservation; malformed inputs stop migration without overwriting originals.
engine.ts: `MemoryEngine` implements canonical CRUD, attributed local recall with explicit project/note applicability, reinforcement, conflict resolution, exact-duplicate consolidation and stale/TTL archival; retains upstream hash embedding and PII helpers.
extraction.ts: Extracts general categories plus six writing/knowledge extensions through structured BYOK output; attaches turn provenance and distinguishes user statements, quotations, assistant proposals and uncertain inference.
index.ts: `MemoryService` shares per-scope stores (global, vex, aria, pencil), bounds recall at 600 ms with query-specific caching, and drains the durable queue with retry backoff and cancellation.
tools.ts: Declares one `memory_*` tool surface using the shared schema and read-only approval allowlist.

## Notes

- `upstream/` retains the GPL-3.0 source snapshot and licenses. Its engine,
  extension lifecycle and persistence layers are no longer runtime dependencies.
- Scopes remain isolated; recall combines global and current-persona records.
  Project and note fields describe applicability inside a scope, not new sharing permissions.
- Migration leaves source files untouched. Once `memories.json` exists, malformed
  canonical data fails closed instead of falling back to stale source files.
- Automatic extraction suppresses exact duplicates of user-forgotten records; explicit restore remains available.
- Extraction retries malformed structured output once with bounded schema diagnostics;
  transport failures go directly to the durable queue. Validation remains all-or-nothing.
- Background extraction failure remains in `pending-turns.json`; successful
  retries cannot replay an already committed turn.
- Source attribution checks reject fabricated user excerpts, but semantic
  classification is still model-generated and should be reviewed when uncertain.

## Tests

Contract tests live in `__tests__/`. `tests/memory-behavior.test.ts` verifies
migration, canonical-only runtime imports, CRUD, archival, attribution, scope,
concurrent writes, queue recovery and cancellation using temporary vaults.

---

[COVENANT]: Update this file header on changes and verify against parent AGENTS.md
