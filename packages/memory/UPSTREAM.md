# CatUI NanoMem snapshot

Source revision: d6d110aa645cd5e2305dde42e04040bddafb5e6a (GPL-3.0).

The snapshot and license are retained. Catea's runtime uses the local hashing
embedding and PII-filter helpers; it no longer instantiates NanoMemEngine or
registers the NanoMem extension and its parallel tools.

The owned implementation in `src/` has one canonical writing-memory document per
persona/global scope. Previous flat and V2 files are read only during one-time
migration, backed up, and never used for runtime fallback or dual writes. See
`docs/MEMORY.md` for categories, migration and behavioral boundaries.

Historical changes retained in this source snapshot:
- config.ts: explicit vault memoryDir takes precedence over NANOMEM_MEMORY_DIR.
- extension.ts: optional engine/project/cwd host injection and managed jobs.
- engine.ts: repeated episode checkpoints do not inflate totalSessions.

These old engine and extension changes are historical; they are not active
runtime paths. The original source remains available for provenance and review.
