# Changelog

Notable changes per release. The version is the one in `manifest.json`; the GitHub
release tag is that same number with no `v` prefix.

## 0.3.13

### Added

- Generate a concise conversation title with the active BYOK model after the
  first completed reply, using a small tool-free request with validated JSON
  output and a safe fallback when title generation fails.
- Show an optional, bilingual GitHub Star invitation on first use and at most
  once per local calendar month, with a clearly voluntary dismissal path.

### Changed

- Remove the redundant visible “Generating” label from the conversation menu
  while retaining the animated activity indicator and accessible status text.

## 0.3.12

### Changed

- Replace per-message full-vault recovery snapshots with reviewable per-tool file
  changes, so normal chat no longer multiplies the vault's storage footprint.
- Remove the obsolete `.catea/snapshots` tree once on startup; it is no longer read
  by the plugin and can otherwise retain gigabytes from older releases.
- Reconcile the 0.3.8–0.3.11 conversation, Git history, editor zoom, global BYOK,
  theme and update work into one current code line.
- Refresh contributor and architecture documentation so the documented build,
  release and dependency requirements match CI.
- Default Bash access to off for new installations; users can enable it explicitly
  when a task requires shell commands.

### Fixed

- Keep only attachments referenced by the retained history when branching a
  conversation; attachments from future turns no longer leak into the branch.
- Keep file-change review available when a tool-bearing turn ends without final
  assistant text or ends in an error.
- Delete session files when their rows age out of the 500-conversation index,
  preventing unbounded orphaned conversation data.

### Quality

- Add behavioral regressions for branch attachment isolation, session retention,
  failed-turn file review and repeated file-write coalescing.

## 0.3.11

### Added

- An opt-in Git history tab in the right sidebar, disabled by default, with local branching history, earlier commits, scoped commit details and automatic updates while visible.
- Independent editor text zoom controls in the formatting toolbar.

### Changed

- Use compact, aligned Git timelines with solid nodes and no manual refresh button.
- Upgrade React and React DOM to 19.3 and use React Git Log for the themed history graph.
- Show input, output and cache-hit token counts directly in the reply footer.
- Remove automatic accessibility-label tooltips from custom controls while retaining accessible text.
- Leave persona identity to the persona prompt and add Git-aware vault operation guidance.


## 0.3.10

### Changed

- Switch conversations from a dropdown on the top-left icon instead of a horizontal tab strip, retaining separate drafts and background generation.
- Make reply annotations an opt-in Agent setting, disabled by default, and keep token usage at the far right of the response footer.
- Remove random pre-response acknowledgements while retaining thinking and tool activity indicators.
- Auto-expand streaming provider reasoning and follow new content until the user scrolls upward or collapses it.
- Center the jump-to-bottom button and add a light gray border.

### Fixed

- Restore the bilingual cat total-duration summary after a reply completes, including replies without tool calls.
- Restore the shared white activity badge: show the step count normally and the collapse arrow on hover or keyboard focus.

## 0.3.9

### Changed

- Replace the horizontal conversation tab strip with a dropdown on the top-left history icon.
- Show the active conversation, generation and question states in the menu, with new conversation, history and close-current actions.
- Preserve parallel conversations and drafts while supporting keyboard navigation, Escape dismissal and focus restoration.

## 0.3.8

### Fixed

- Show submitted messages immediately while note context and vault checkpoints are prepared; restore drafts if preparation fails.
- Place reply annotations at the far right of the response card footer.
- Enable text selection in the Agent panel, replies, attachments, and tool activity.

### Added

- Display one of 50 bilingual waiting acknowledgements per reply, keeping it stable across tab switches and hiding it when the answer starts.
- Instruct the Agent not to disclose, confirm, or guess its underlying model identity.

## 0.3.7

### Added

- Run multiple Agent conversations in parallel with switchable, horizontally scrolling session tabs and separate drafts.
- Add message branching, reply annotations, queued steering, optional token usage, and vault restore previews with recovery snapshots.
- Add a dither loading indicator and Remix Icon line/fill pairs for the left navigation dock.

### Changed

- Give the dock a dark surface, muted gray icons, circular controls, and a green Gemini glyph for Catea.
- Refine activity summaries, settings layout, and chat scrolling behavior.

### Fixed

- Repair interrupted tool-call results next to their calls when reopening a session.

## 0.3.6

### Added

- Stream model reasoning separately from final answers and keep completed thought
  details available in a compact, expandable activity row.
- Add richer attachment handling, session drafts, tool presentation, and focused
  behavior coverage for model streaming, permissions, context handoff, and storage.

### Changed

- Split conversation persistence, model streaming, memory access, and context compaction behind host-owned interfaces while keeping the vendored agent loop byte-verified.
- Move persona and current-note controls to Agent settings, and expand tool activity while a reply is pending.
- Refine the paper shell, sidebar, composer, icons, note previews, and CSS scope without changing Obsidian's native UI contracts.
- Apply Synara-inspired Markdown hierarchy and spacing to Obsidian note reading
  and Live Preview while preserving the 14px table typography, gray headers,
  rounded corners, and border treatment.

### Fixed

- Preserve completed tool results across concurrent batches and stop approval-dependent calls from racing through the upstream patch layer.
- Keep the explorer's action buttons square and the paper shadow within its existing gutter.
- Exclude aborted, failed, and empty assistant records when rebuilding resumable
  model context without deleting the durable conversation journal.

## 0.3.5

### Changed

- Rename the plugin display name to Catea. The plugin ID remains `catea-paper`, preserving existing installations and updates.
- Align the English and Chinese README titles and agent identity with the display name.

## 0.3.4

### Changed


- The design system is vendored into this repository under
  `packages/design-system` and linked through npm workspaces, replacing the
  `../catea-design-system` sibling checkout that `npm run build` required. A clean
  clone can now install, test, typecheck and build, which is exactly what
  Obsidian's release build verification does; its scan of `0.3.3` reported
  `Build verification failed while running the build script`.
- `.github/workflows/ci.yml` builds on every push and pull request and asserts the
  three release assets and the 5 MB size limit. `.github/workflows/release.yml` no
  longer needs the `DESIGN_SYSTEM_REPO` variable and now attests the provenance of
  the built `main.js` and `styles.css`, clearing the review's remaining
  recommendation.
- Mermaid diagrams render through Obsidian's own `loadMermaid` runtime instead of
  bundling a second renderer, and the vendored `CodeBlock` keeps 13 Shiki grammars
  rather than 23. `main.js` went from 6.5 MB to 3.9 MB, under the Obsidian Sync
  Standard threshold.

### Fixed

- `README.md` and `README_CN.md` now open with a `# Catea` heading. The
  checker reads a Markdown ATX heading, so the previous `<h1>` edit did not clear
  the `README title does not match the manifest name` warning.
- The vendored `Composer` measures its textarea through `removeProperty` plus one
  dynamic height write, and its IME check reads `event.nativeEvent.isComposing`, so
  the file typechecks as owned code.
## 0.3.3

### Fixed

- The settings tab no longer opens with a plugin-name heading. Obsidian's review of
`0.3.2` flagged `Avoid including the plugin name in settings headings`: the tab is already
titled by `manifest.json`, and the replacement heading added in `0.3.2` to satisfy the
`setHeading()` rule repeated the name.
- `README.md` and `README_CN.md` title the document `Catea Paper`, matching the manifest
name, instead of carrying a decorative glyph.

## 0.3.2

### Added

- DIP documentation layer: a root charter (`AGENTS.md`, P1), a member list per module
  (P2), and a `[WHO]/[FROM]/[TO]/[HERE]` contract header on every in-scope source
  file, all in English.
- `npm test`: assertions covering the per-file contracts, repo-wide
  documentation-to-code isomorphism, and version consistency.
- `npm run typecheck`: a `tsc` gate scoped to owned code. Vendored upstream and the
  external design system contribute diagnostics that cannot be fixed here, so the
  gate reports those as counts instead of burying the ones that are actionable.
- `versions.json`, so older Obsidian builds can resolve a compatible older release.
- CI on push, pull requests and demand: install, contracts and governance, typecheck.
- `scripts/release.mjs` plus a manual release workflow, producing the three assets
  Obsidian requires (`main.js`, `manifest.json`, `styles.css`).
- `packages/agent-core/src/version.ts` as the single runtime source of the version.
- `CONTRIBUTING.md`, `SECURITY.md`, and issue and pull request templates.

### Changed

- `docs/ARCHITECTURE.md` rewritten in English, with the verification boundary stated
  explicitly rather than left implied.

- `npm run build` minifies the bundle and drops license comments, and the design
  system's `CodeBlock` now loads a curated set of 23 Shiki grammars through
  `shiki/core` with the JavaScript regex engine instead of the full registry plus
  an inlined Oniguruma WASM. `main.js` went from 17.8 MB to 6.5 MB.
- `framer-motion`, `motion-dom` and `motion-utils` are aliased to this repository's
  copy during the build, so the design system and the host share one instance.

### Fixed

- `packages/integrations/src/mcp.ts` and `packages/integrations/src/web.ts` reported
  version `0.3.0` while everything else said `0.3.1`.
- `packages/integrations/src/web.ts` no longer reaches `input.url` after narrowing
  `input` to `never`.

### Marketplace review follow-up

- The four blocking findings from Obsidian's automated release review of `0.3.1`
  (commit `bf69fa2`):
  - `apps/obsidian/src/main.tsx` no longer calls `detachLeavesOfType` in
    `onunload`, which reset the agent sidebar to its default dock even after the
    user moved it.
  - The agent view's padding now comes from a `styles.css` rule scoped to
    `.workspace-leaf-content[data-type="catea-agent"]` instead of an assignment to
    `contentEl.style`.
  - `apps/obsidian/src/note-previews.ts` no longer creates a `<style>` element; the
    sandboxed preview's base stylesheet is part of its `srcdoc` string, so nothing
    is injected into the Obsidian document.
  - `apps/obsidian/src/settings.ts` uses `new Setting(...).setHeading()` for its
    section titles instead of raw `h2`/`h3` elements.
- `apps/obsidian/package.json` now lists the packages its sources import (`react`,
  `react-dom`, `react-markdown`, `remark-gfm`, `beautiful-mermaid`).

### Known

- `main.js` is still above the 5 MB Obsidian Sync Standard threshold, so those users
  cannot sync the plugin file. The remaining weight is `elkjs` and
  `beautiful-mermaid` (Mermaid rendering) and the vendored `paper.cjs` icon bundle;
  going under 5 MB would mean removing a feature rather than trimming dead weight.
- The release review also reported `fs` and `child_process` use. That is the
  documented design of a bring-your-own-key agent that reads and edits the vault and
  runs Bash, gated by the approval modes in `SECURITY.md`; it is not incidental.
- `apps/obsidian/src/paper.cjs` still contains a raw `h2` heading. It is a vendored
  generated bundle and is not hand-edited here.

## 0.3.1

First public release.

### Added

- Root `manifest.json`, a GPL-3.0 `LICENSE`, and the network-use disclosure required
  for the Obsidian community-plugin submission.
- Bilingual README: English by default, with `README_CN.md`.

### Changed

- Version unified across `manifest.json`, both `package.json` files and the built
  manifest.
