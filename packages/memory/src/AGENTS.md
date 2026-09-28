# packages/memory/src/

> P2 | Parent: ../../../AGENTS.md

Adapter hosting the vendored CatUI mem-core per persona: it boots the engine
inside the vault, injects recall on the first-token path, exposes the memory
tools, and runs a durable extraction queue.

## Member List

host.ts: `MemoryHost` boots the vendored nanomem extension inside the vault and replays host tool events under normalized names; exposes `injection()` and `run()` lifecycle hooks.
index.ts: `MemoryService` hosts per-persona mem-core engines (global, vex, aria, pencil), reads sessions through `ConversationStore`, races recall against a 600 ms cache timeout, and drains a durable queue with capped backoff.
tools.ts: Declares the `memory_*` tool schemas, each with a persona or global scope, plus the `memoryReadOnly` allowlist that skips write approval.

## Notes

- `upstream/` (sibling of this directory) is the vendored GPL-3.0 mem-core and is excluded from DIP.
- The persona allowlist `['global','vex','aria','pencil']` in `index.ts` is hardcoded and must be kept in sync by hand with the three personas defined in `packages/personas/src/`.
- `host.ts` reports a `.jsonl` session path while the host writes `.json`; upstream exercises this hook, so the mismatch is live but tolerated.

## Tests

Contract tests live in `__tests__/`, one per in-scope file.

---

[COVENANT]: Update this file header on changes and verify against parent AGENTS.md
