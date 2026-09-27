# CatUI NanoMem snapshot

Source revision: d6d110aa645cd5e2305dde42e04040bddafb5e6a (GPL-3.0).

The actual NanoMem engine and extension lifecycle are used inside Obsidian. Local changes:
- config.ts: explicit vault memoryDir takes precedence over NANOMEM_MEMORY_DIR.
- extension.ts: optional host injection for engine/project/cwd and managed background jobs; extraction errors propagate to the durable retry queue. Original recall, JSON contracts, tool definitions, episode observations, dream locks and cadence remain in use.
- engine.ts: repeated episode checkpoints for one session do not inflate totalSessions.
- src/host.ts: maps native Obsidian tools to memory observations; provides direct structured BYOK completion, session counting and UI notices.
- src/index.ts: .catea persistence, persona/global partitioning, serialized durable background queue, retries and cancellation. Host-specific directory/approval boundaries remain Catea's responsibility.

The extension's session shutdown episode is checkpointed after each completed turn so closing Obsidian cannot lose it. UI slash commands from CatUI's terminal are not registered; native nanomem tools and existing memory_* tools expose the engine in Catea.
