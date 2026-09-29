# Marketplace review follow-up

Reviewed on 2026-09-28 against the signed-in Catea Paper review page for release
0.3.3. The fixes below are local source changes; the marketplace has not yet
scanned a release containing them.

## Changes

| Review finding | Resolution |
| --- | --- |
| Clean build requires an unavailable sibling design system | The design system is now included under `packages/design-system`; installation and build were checked in a temporary copy without the sibling or pre-existing dependencies. |
| `main.js` exceeds 5 MB | Native Obsidian Mermaid loading and the curated grammar bundle keep the 0.3.14 output at 4,490,605 bytes. Both the build script and CI enforce a limit of 5,000,000 bytes. |
| Manifest description repeats the host name and lacks accepted terminal punctuation | Replaced it with a neutral bilingual description ending in an ASCII period. |
| Bundle creates a `script` element | Returned to React 18 and the React-18-compatible Git Log release. The production bundle no longer contains `createElement('script')`; the flagged factory came from React DOM 19's hoistable-script implementation rather than application code. |
| Missing build provenance | The GitHub release workflow attests `main.js` and `styles.css` before publishing. This takes effect only when that workflow runs successfully; local builds do not create attestations. |
| Undeclared dependencies | Runtime dependencies are declared in the workspaces that import them, with an updated lockfile. |
| Settings search compatibility | Shared setting definitions expose searchable names to the modern API while preserving the legacy display path. Secrets are not included in searchable metadata. |
| Owned-source lint findings | Added the official Obsidian recommended ESLint rules, typed protocol and host boundaries, removed unused values and unsafe `any`, replaced dynamic `require`, and aligned DOM/timer usage with the host. |
| CSS `!important` and `:has` | Replaced them in plugin and design-system CSS with scoped specificity, explicit selection/menu state, and registered ribbon hover handlers. |
| README title detection | The primary heading is Markdown and matches the plugin name. |
| Static support prompt inside the plugin interface | The developer policies allow static pop-up messages within the plugin's own interface when clearly indicated in the README. Both README languages disclose the GitHub Star invitation; it appears only when the Catea sidebar is opened, at most once per local calendar month, is voluntary and dismissible, and Settings → Support prompt turns it off entirely. |

CI and release preflight now run formatting, lint and adapter behavior checks in addition to
contracts, governance, typecheck and build. The behavior checks exercise OpenAI
and Anthropic streaming and buffered replies, context handoff, settings search
and refresh, secret exclusion, Electron transport fallback, and CSS constraints.

## Notices that remain relevant

- Filesystem and shell access are intentional agent capabilities. Their existing
  confinement and approval behavior is retained; removing the imports merely to
  silence a capability notice would remove supported features.
- Vault enumeration and clipboard usage require review in context. This update
  does not claim those capability notices have disappeared from the release scan.
- Ajv generates validation functions at runtime. Its dependency contains
  `new Function`; changing application-level imports does not eliminate all
  dynamic-code notices from bundled dependencies.
- Byte-verified CatUI snapshots are excluded from the local lint gate. Official
  scanning may still report findings there. Owned host, adapter and design-system
  source is included. Scoped typecheck separately reports upstream diagnostics;
  a passing scoped check does not mean raw `tsc` has no diagnostics.
- The reviewed loop patch is applied in memory during the build and verified
  against the source and patched digests in `LOCAL_PATCHES.json`. The upstream
  source files remain unchanged.

## Verification limits

The clean-copy checks use Node 24 and run `npm ci`, build, lint, scoped typecheck,
`npm test`, and `npm run test:behavior`. Network/model transports and the Obsidian
host are mocked in adapter regressions; no live vault or provider is used.
Selected approval and sidebar controls were also exercised in a browser fixture.

Loading the full plugin in Obsidian, testing pop-out windows and confirming the
paper layout against third-party themes still require an application smoke test.
No release was published and no marketplace reply was sent as part of this review.
