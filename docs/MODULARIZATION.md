# Catea module boundaries and UI migration

The Obsidian host is the composition root. It creates the vault conversation
store, direct BYOK model client and memory service, then injects their ports into
`Agent`. The ports in `packages/agent-core/src/contracts.ts` have no Obsidian or
UI types. Session files and the session index belong to `VaultConversationStore`;
memory receives completed turns with session/turn source references. `Agent` saves a completed
reply before enqueueing its memory job.

The vendored CatUI loop remains byte-for-byte identical to its recorded source.
`scripts/agent-loop-patch.mjs` applies the reviewed tool orchestration fix in
memory during the build and rejects an unknown source or output digest. The
behavior check bundles the same patched code.

## Migration status

| Boundary | Current owner | Remaining work |
| --- | --- | --- |
| Conversation persistence | `VaultConversationStore` behind `ConversationStore` | Move remaining conversation lifecycle decisions out of `Agent`. |
| Model traffic | `DirectModelClient` behind `ModelClient.stream(request, signal)` | Make the provider adapter's retry policy independently configurable. |
| Memory | `MemoryService` behind `MemoryPort`; one canonical store and tool surface, bounded recall, backed-up migration and durable extraction | Project-aware note refresh and richer memory browsing. |
| Tools and approval | CatUI loop plus tool-specific adapters | Add a host-neutral `ToolExecutor` that owns results, approval state and cancellation for every call. Move the concrete Vault, Web and MCP routing out of `Agent`. |
| Agent loop | Original upstream plus reviewed build-time patch; Catea compaction decisions live in `CompactionCoordinator` and use an injected summary port | Extract Catea-specific prompt assembly and event persistence after the tool contract settles. |

## Catea-owned UI

`packages/design-system/tokens/src/tokens.css` owns Catea design values under
`.catea-ui`. Shared React components in `packages/design-system/components/src`
depend on props and callbacks; they do not import Agent or Obsidian. The design
system compiles with Tailwind CSS 4. Its build script prefixes emitted selectors
with `.catea-ui`, including rules inherited from the earlier ANNO component CSS.
The Obsidian build appends this scoped CSS to `styles.css`.

Functional icons in the shared component library come from the curated Tabler
Outline 3.48.0 paths in `icons.json`. The MIT notice is in
`packages/design-system/TABLER-LICENSE.txt`. The `ResponseCard` sources chevron
now uses the shared `Icon` component; shared components no longer call that
component `RemixIcon`. No second icon package was added.

`apps/obsidian/paper.css` remains the host adaptation for Obsidian's ribbon,
file tree, tabs, toolbar, note previews and note thumbnails. Its `body.gp-enabled` selectors
intentionally target Obsidian-owned DOM and are not part of the shared component
stylesheet. The native settings tab, selection menu and ribbon commands also
remain host adapters, using Obsidian's controls and icon API. Their migration
would require a separate visual and accessibility review; the current change
preserves their behavior. The start-page `✳` is a decorative emblem rather than
a functional icon.

The persona selector now lives in the native Agent settings group. The composer
retains the model selector and removes its persona control and obsolete style
rule; the saved `personaId` continues to drive the next agent turn.
The current-note context toggle also lives in Agent settings, defaults to on,
and persists as `includeCurrentNote`. The composer no longer renders its location
button or its obsolete style rules. Tool activity rows expand while an assistant
turn is awaiting reply text and collapse when reply text begins; the user can
still toggle them manually.
