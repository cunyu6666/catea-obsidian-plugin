# Changelog

Notable changes per release. The version is the one in `manifest.json`; the GitHub
release tag is that same number with no `v` prefix.

## Unreleased

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

### Fixed

- `packages/integrations/src/mcp.ts` and `packages/integrations/src/web.ts` reported
  version `0.3.0` while everything else said `0.3.1`.
- `packages/integrations/src/web.ts` no longer reaches `input.url` after narrowing
  `input` to `never`.

## 0.3.1

First public release.

### Added

- Root `manifest.json`, a GPL-3.0 `LICENSE`, and the network-use disclosure required
  for the Obsidian community-plugin submission.
- Bilingual README: English by default, with `README_CN.md`.

### Changed

- Version unified across `manifest.json`, both `package.json` files and the built
  manifest.