# apps/obsidian/src/

> P2 | Parent: ../../../AGENTS.md

Obsidian host layer: the plugin entry point, the React sidebar UI, native vault
tools, and the paper-appearance extras that adapt the agent core to Obsidian.

## Member List

assets.d.ts: Declares `*.md`, `*.css` and embedded `*.png` module types, plus optional Electron host transport types; no runtime code.
ChatMarkdown.tsx: Renders assistant Markdown through react-markdown and remark-gfm, converting `[[wikilinks]]` into internal-link clicks; code fences delegate to MermaidDiagram.
composition.ts: Creates shared conversation storage and memory, then injects them into each tab's Agent at the Obsidian boundary.
DiagramDialog.tsx: Portals children into a native `<dialog>` opened with `showModal()`, giving Escape handling, focus trap and focus restore for diagram zoom.
MermaidDiagram.tsx: Renders Mermaid through Obsidian `loadMermaid` after a 180 ms debounce; zoom clamped to 0.25-4x.
StreamingChatResponse.tsx: requestAnimationFrame typewriter reveal for streamed text that never splits surrogate pairs; auto-follows scroll within 40 px in a card and 80 px in chat.
locale.ts: Chinese-keyed English string table exposing `translate()` and `contentLabel()`; returns the key unchanged when a string is unmapped; provides 50 bilingual, message-stable waiting acknowledgements.
main.tsx: Plugin entry: `class Catea extends Paper`, wiring config, secure secrets, ObsidianTools, parallel session tabs, the settings tab and the sidebar view; 60 s memory interval.
note-previews.ts: Registers `html` and `svg` code-block previews as sandboxed, script-blocking CSP iframes with Preview, Source and Copy tabs.
note-thumbnails.ts: Paints 108x144 canvas file-tree thumbnails from title, excerpt and first local raster under 5 MB; 2 MB Markdown cap, 256-entry cache, concurrency 2.
obsidian-tools.ts: Eight `obsidian_*` tools over the Obsidian API with hidden-path guards; search 50 hits, read 300 lines x 2000 chars, note cap 2 MB, write cap 100 KB; properties use `FileManager.processFrontMatter`.
panel.tsx: React sidebar root composing header session tabs, empty conversation cat artwork, history, message list and composer; maps model picker, approvals, footer annotations, attachments and provider reasoning progress; submits before asynchronous note preparation.
paper.cjs: Vendored, generated 1.6 MB bundle providing the Paper base class with embedded Tabler icon assets; skipped by DIP, never hand-edited.
selection.ts: Adds an editor-menu entry and a floating add-to-Catea popup positioned through CodeMirror `coordsAtPos`, rebinding listeners on layout change.
session-drafts.ts: Keeps composer text, attachments and selected quotes isolated by session ID, including asynchronous restoration after send failure.
tool-presenters.ts: Registry for tool activity card names, summaries and detail payloads; unknown tools use a fallback presenter.
settings.ts: Searchable setting definitions for Obsidian 1.13+, with an imperative fallback for older hosts; language, paper, Agent persona and capabilities, BYOK and MCP; OpenRouter quick setup and advanced ModelModal validate through core BYOK helpers.

## Submodules

- `skills/` — built-in `obsidian-workspace` skill prompt, loaded through the esbuild `.md` text loader.

## Tests

Contract tests live in `__tests__/`, one per in-scope file, and are excluded from
DIP scope themselves. They assert each file's P3 claims against the real code.

---

[COVENANT]: Update this file header on changes and verify against parent AGENTS.md
