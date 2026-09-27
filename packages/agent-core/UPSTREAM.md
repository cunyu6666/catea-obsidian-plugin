# CatUI runtime snapshot

Source: https://github.com/O-Pencil/Catui/tree/d6d110aa645cd5e2305dde42e04040bddafb5e6a
License: GPL-3.0, distributed with the plugin LICENSE.

- upstream/loop: the actual standard agentLoop and its transitive helpers, unchanged. Includes tool validation, safe read concurrency, budgets, cancellation, output recovery, steering, progress checks and run events. Catea supplies explicit provider and tool adapters; it does not start CatUI or load its user configuration.
- upstream/ai: only event stream, schema validation, overflow and type dependencies.
- upstream/context/index.ts, history.ts, notes.ts: original context-management tools and prompt hooks.
- upstream/context/controller.ts: original ContextWindowController with import redirected to local boundaries.ts.
- boundaries.ts: source-extracted token estimation, valid cut-point and preparation helpers; file-ops.ts retains pure supporting helpers. No old LLM summarization function, automatic compaction coordinator or summarizer prompt is invoked.
- src/context.ts: persistent session journal adapter. Writes checkpoint before the next model request; keeps complete original history and exact most recent user request. Uses native upstream 70% hint, recent-tail/reserve settings and minimum 1024-token saving guard. Small handoffs can be safely deferred.
- src/upstream-stream.ts: adapts ANNO BYOK SSE provider to CatUI stream events. The existing protocol-neutral transcript is preserved alongside the new journal. Adds bounded transient retries before visible output.

Context window defaults to 128000 and can be configured per BYOK model; this is a fallback, not an inference about a model's actual limit. Context delivery telemetry stores SSE/buffered mode, chunk count and timing only, never headers or keys.
