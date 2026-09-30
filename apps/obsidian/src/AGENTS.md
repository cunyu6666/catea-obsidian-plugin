# apps/obsidian/src/

> P2 | Parent: ../../../AGENTS.md

Obsidian host layer: the plugin entry point, the React sidebar UI, native vault
tools, and the paper-appearance extras that adapt the agent core to Obsidian.

## Member List

assets.d.ts: Declares `*.md`, `*.css` and embedded `*.png` module types, plus optional Electron host transport types; no runtime code.
MessageQuotes.tsx: Shows persisted quote sources, original text and optional comments above user messages, including reopened sessions.
ChatMarkdown.tsx: Renders assistant Markdown through react-markdown and remark-gfm, converting `[[wikilinks]]` into internal-link clicks; code fences delegate to MermaidDiagram.
GitHistoryPanel.tsx: Opt-in sidebar with a themed React Git Log graph, bounded history loading, visible-only automatic updates and local commit details.
folder-icons.ts: Folder context-menu picker with ten Remix line icons and ten colors, persisted per path, tracking folder rename and deletion.
git-history.ts: Shell-free Git inspection with timeout and output caps; history and commit stats are scoped to the vault.
global-byok.ts: Stores BYOK model profiles in an encrypted machine-local file under Obsidian userData, with migration from vault-local profiles and deletion tombstones.
composition.ts: Creates shared conversation storage and memory, routes background memory diagnostics to the console without toast notifications, then injects them into each tab's Agent at the Obsidian boundary.
DiagramDialog.tsx: Portals children into a native `<dialog>` opened with `showModal()`, giving Escape handling, focus trap and focus restore for diagram zoom.
MermaidDiagram.tsx: Renders Mermaid through Obsidian `loadMermaid` after a 180 ms debounce; zoom clamped to 0.25-4x.
StreamingChatResponse.tsx: requestAnimationFrame typewriter reveal for streamed text that never splits surrogate pairs; auto-follows scroll within 40 px in a card and 80 px in chat.
locale.ts: Chinese-keyed English string table exposing `translate()`, `contentLabel()` and human-readable error wording; returns the key unchanged when a string is unmapped; provides bilingual, message-stable waiting acknowledgements.
main.tsx: Plugin entry with a type-only import of checked-in Node declarations for source-only scanners: `class Catea extends Paper`, wiring config, secure secrets, global BYOK, ObsidianTools, parallel sessions, per-editor text zoom controls, theme and update services, the settings tab and Agent/Git sidebar views; seeds the bundled skill presets once behind `presetSkillsVersion`; manages plugin scrollbars across windows and a 60 s memory interval.
note-previews.ts: Registers `html` and `svg` code-block previews as sandboxed, script-blocking CSP iframes with Preview, Source and Copy tabs.
note-thumbnails.ts: Paints 108x144 canvas file-tree thumbnails from title, excerpt and first local raster under 5 MB; 2 MB Markdown cap, 256-entry cache, concurrency 2.
obsidian-tools.ts: Eight `obsidian_*` tools over the Obsidian API with hidden-path guards; search 50 hits, read 300 lines x 2000 chars, note cap 2 MB, write cap 100 KB; structured note writes emit original/modified records and properties use `FileManager.processFrontMatter`.
panel.tsx: React sidebar root composing a header session dropdown, empty conversation cat artwork, history, message list with persisted skill tags above user bubbles and user-message copy actions and composer with a slash skill picker; maps updates, model picker, approvals, optional annotations, attachments, file diffs and ordered provider thinking/tool activities and local image/video/audio previews; submits before asynchronous note preparation.
paper.cjs: Vendored, generated 1.6 MB bundle providing the Paper base class with embedded Tabler icon assets; excluded from DIP through `VENDOR_MANIFEST.json`, never hand-edited, pinned by digest in `tests/vendor-assets.test.ts`.
VENDOR_MANIFEST.json: Digest and provenance record for the vendored assets in this directory; read by the vendor gate, never by the plugin at runtime.
selection.ts: Adds an editor-menu entry and a floating add-to-Catea popup positioned through CodeMirror `coordsAtPos`, rebinding listeners on layout change.
sidebar-views.ts: Serializes sidebar creation, recovers saved unknown/deferred views and removes duplicate Catea-owned tabs.
session-drafts.ts: Keeps composer text, attachments, selected quotes and per-message skill tags isolated by session ID, including asynchronous restoration after send failure.
support-prompt.ts: Gates the optional GitHub support prompt, shown only when the Agent sidebar opens, to at most once per local calendar month; a settings toggle turns it off.
tool-presenters.ts: Registry for tool activity card names, summaries and detail payloads, including the skill list, create and read cards; unknown tools use a fallback presenter.
turn-review.ts: Coalesces repeated tool writes into one per-file diff and decides when an empty or failed turn needs a standalone review action.
updates.ts: Checks stable GitHub releases at most daily, validates release assets and host compatibility, caches results and per-version dismissals, and supports manual checks.
vendor-icons.ts: Inline vendor icon SVG strings keyed by BYOK preset id (adapted from cc-switch, MIT), plus pure data-URL and monogram generators for the settings vendor grid.
theme.ts: Reversible per-window light/dark/system selection, with live operating-system appearance listeners and unload cleanup.
settings.ts: Searchable setting definitions for Obsidian 1.13+, with an imperative fallback for older hosts; language, theme, release updates, support prompt, paper, Agent persona and capabilities, optional reply annotations and Git history (both off by default), global BYOK, separate image/video/speech generation credentials and MCP; OpenRouter quick setup, a searchable vendor-preset grid that needs only an API key, and advanced ModelModal validate through core BYOK helpers.

## Submodules

- `skills/` — built-in `obsidian-workspace` skill prompt, including Git detection, scoped change inspection and authorized version-control operations for vaults; loaded through the esbuild `.md` text loader.

## Tests

Contract tests live in `__tests__/`, one per in-scope file, and are excluded from
DIP scope themselves. They assert each file's P3 claims against the real code.

---

[COVENANT]: Update this file header on changes and verify against parent AGENTS.md
