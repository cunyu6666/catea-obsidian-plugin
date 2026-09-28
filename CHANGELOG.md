# Changelog

Notable changes per release. The version is the one in `manifest.json`; the GitHub
release tag is that same number with no `v` prefix.

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

- `README.md` and `README_CN.md` now open with a `# Catea Paper` heading. The
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
- `npm test`: dependency-free assertions covering the per-file contracts, repo-wide
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

## 0.3.2

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