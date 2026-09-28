# packages/agent-core/src/

> P2 | Parent: ../../../AGENTS.md

The in-process agent runtime: the session `Agent`, journal and context handoff,
model provider streaming, network transport, attachments, i18n and shared types.
This is the only package the Obsidian host imports directly.

## Member List

ask-user-question.ts: Declares, validates and formats the AskUserQuestion tool; 1-4 questions, 2-4 unique option labels, headers clipped to 12 chars.
attachments.ts: Converts dropped or picked files into base64 ChatAttachment data URLs with MIME inference; rejects dot and node_modules paths; 10 MB each, 32 MB total, 64 files, depth 16.
byok.ts: Validates ModelConfig and resolves configured and selected models; requires name, model and key; contextWindow integer 4096-2000000; credential-free HTTP(S) URL.
context.ts: WorkingContext keeps the full journal while presenting a checkpoint-windowed message view; estimates prompt tokens as `(system + tools) / 3`.
compaction.ts: Chooses complete-turn cuts, checks the current model budget and coordinates threshold or overflow compaction through narrow ports.
compaction-summary.ts: Calls the injected BYOK model client to generate iterative context checkpoint summaries.
contracts.ts: Host-neutral session data and conversation/memory ports used for dependency injection.
i18n.ts: Flat error-label map, `t()` interpolation and `textValue()` for safe formatting of unknown values.
index.ts: `class Agent` owns one session, saves through `ConversationStore`, repairs interrupted tool calls, assembles tools, drives `agentLoop` and enqueues memory.
model-client.ts: Adapts direct BYOK model requests into an abortable event stream behind `ModelClient`.
providers.ts: `streamModel` maps transcripts to OpenAI or Anthropic requests and parses SSE or buffered JSON; retries once without usage on 400/422; error bodies truncated to 2000 chars.
transport.ts: `serviceFetch` streams over Node http/https with a 120 s timeout and rejects redirects; falls back to Electron net only on X.509 chain errors, then to buffered requestUrl.
types.ts: Shared type declarations for models, transcripts, attachments, tools and search configuration; type-only, emits no runtime code, and holds several currently unreferenced interfaces.
upstream-stream.ts: Defines the RuntimeMessage adapter contract and converts between the internal transcript and CatUI messages; `providerStream` retries 3x at 500*2^n ms and records delivery diagnostics; `streamSimple` throws to force host injection.
version.ts: Exports `PLUGIN_VERSION`, the single runtime source for the plugin version; a governance test keeps it equal to manifest.json and versions.json.

## Notes

- `upstream/` (sibling of this directory) is vendored CatUI code and is excluded from DIP; see the root AGENTS.md.

## Tests

Contract tests live in `__tests__/`, one per in-scope file.

---

[COVENANT]: Update this file header on changes and verify against parent AGENTS.md
