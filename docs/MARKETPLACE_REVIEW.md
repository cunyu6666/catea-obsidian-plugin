# Marketplace review follow-up

## Release 0.3.20: official source findings cleared

The public listing now reports **0.3.20**, **Health: Excellent** and
**Review: Satisfactory**. The source findings and errors are zero. Three warnings
remain for environment access, direct filesystem access and shell execution;
three further capability notices describe vault enumeration, clipboard access
and dynamic validation code. These describe supported functionality, not the
resolved type/declaration errors. Seven additional informational notices remain.

The official build check reproduced `main.js` byte-for-byte. Both built assets
have verified GitHub attestations, and no vulnerable dependencies were found.
The exact returned findings are in
[the captured inventory](./reviews/2026-09-30-scorecard-0.3.20.json).

Before publishing, the official branch preview completed with no source findings.
Local and release gates passed: 378 tests, 40 behavior regressions, formatting,
typecheck, full official lint, dependency-poor analysis and build. The release
commit is `210d7e1baf5041719240475d0de39b0e52bd9597`; runtime behavior is unchanged.

The following sections preserve the failed attempts and their causes.

## Release 0.3.19 failed: bundled declarations were linted

The signed-in management page reports commit `001550741e6088e5f0c788af70bf107d1c79666c`
as **Failed**. All 434 original unsafe-type reports disappeared. However, the
scanner also linted the imported official Node/Undici declaration packages,
including six errors for undescribed lint directives and numerous declaration
style warnings. At the earlier check the public page still displayed the preceding scan;
it later displayed the failed 0.3.19 report as well. The public page alone was
not sufficient evidence of the latest review status while a new scan was pending.

The follow-up replaces the complete declaration packages with a small, authored
Node runtime contract. Every declared module value and global is structurally
checked against the lockfile-installed official types using isolated module
names. This prevents the fallback declarations from validating themselves.
The dependency-poor regression now runs the full official recommended rules,
including on the declaration files. No runtime functionality changes.

The signed-in branch preview for `013846d9e6de95a0c7d9b4d267c317044f0bb957`
completed on September 30, 2026 with status **Completed**. Its report contains
only "Pass: No vulnerable dependencies found" and no source findings. This
preview does not establish the release-bundle capability or build results;
those must be checked again after publishing.

The following sections preserve the earlier investigation and its limitations.

## Release 0.3.18 online result: type fix did not take effect

The online scan now points to `9e0301c04dc10a63ce62f90d888a94c6f4d42338`
(release 0.3.18). It reports **440**, not zero: all 434 unsafe-type findings
remain, plus the same six capability notices. Only the two CSS warnings cleared.
[Captured 0.3.18 inventory](./reviews/2026-09-30-scorecard-0.3.18.json).
The earlier local simulation was insufficient evidence of scanner compatibility.

The first fix relied on `tsconfig.json` automatic `typeRoots` discovery. A stricter
local model that disables automatic type inclusion and replaces the type roots
fails to load our declarations, reproducing a blind spot in the original gate.
The private scanner's actual configuration is unknown; overriding or omitting
local type-root discovery is a hypothesis, not an observed implementation fact.

The follow-up patch imports `typings/runtime.d.ts` from the plugin entry using
`import type`. That declaration module explicitly references the unmodified
Node declarations, making their inclusion part of the source graph rather than
only a compiler configuration side effect. This import emits no runtime code.
The regression gate now disables automatic type inclusion as well as hiding
npm-installed Node/Undici declarations. A new release and online scan are still
required to validate this follow-up; no online reduction is claimed for it.

## September 30 initial local regression (before online validation)

The [public scorecard](https://community.obsidian.md/plugins/catea-paper) for
release 0.3.17, commit `d713ab0d1f35ba8c23abd63e026cf6e721462309`, reports **442**
findings: 434 unsafe-type findings, two CSS compiler-directive warnings, and six
capability notices. The exact rule counts and source links are preserved in
[the captured inventory](./reviews/2026-09-30-scorecard.json).

| Rule | Published scan | Current source with installed Node types hidden, before fix | After fix |
| --- | ---: | ---: | ---: |
| `no-unsafe-call` | 187 | 187 | 0 |
| `no-unsafe-member-access` | 115 | 115 | 0 |
| `no-unsafe-assignment` | 95 | 95 | 0 |
| `no-unsafe-argument` | 23 | 22 | 0 |
| `no-unsafe-return` | 14 | 14 | 0 |

The working source already differed from the scanned commit when this review
started; the one-argument difference is not counted as a new fix. Local lint
with npm-installed declarations already passed. A read-only TypeScript compiler
host hiding `node_modules/@types/node` and `node_modules/undici-types` reproduces
the remaining failures. This strongly identifies missing Node declarations as
the source of the cascading diagnostics, rather than hundreds of unsafe runtime
operations. The marketplace scanner implementation itself was not inspected.

Complete, unmodified official Node and Undici declarations now live in `typings/`,
with original licenses and package metadata. TypeScript resolves them from the
source tree, including in source-only scan environments. `npm run check:marketplace`
checks snapshot provenance byte-for-byte against the lockfile installation,
typechecks with installed Node declarations hidden, and runs all five unsafe-value
rules on owned and vendored runtime TypeScript. It is required by CI, release
preflight and `npm run check`; no unsafe rules were disabled.

The Tailwind `@source` and `@theme` configuration now lives in the compiler entry
in `packages/design-system/scripts/build.mjs`. Browser CSS source contains only
standard CSS. The generated design-system stylesheet was compared byte-for-byte
against the output before this change and is identical.

### What cannot honestly be called zero

These changes address the 436 actionable type/CSS reports locally. The six
capability notices describe supported behavior: environment access, filesystem
access, Shell, vault enumeration, clipboard writes, and Ajv runtime validation
compilation. They are not removed or hidden to change a score. See the capability
analysis below and SECURITY.md. The seven informational notices are separate from
the headline 442 and include the GPL license, network usage and unavailable scans.

The subsequent 0.3.18 scan above supersedes the initial local result: the CSS
fix worked, but the type-root fix did not clear the online type diagnostics.

### Local validation

`npm run check` passed after these changes: 378 tests, 40 adapter behavior
regressions, formatting, lint, typecheck, the new marketplace regression and build.
The dependency-poor regression covers 147 runtime source files with zero unsafe
findings and zero TypeScript diagnostics. `main.js` is 4,396,893 bytes. The generated
design-system CSS remains byte-identical to the pre-change working-tree build.
Existing uncommitted application changes were preserved; these counts describe
the complete working tree, not an isolated release. This was the pre-release validation; 0.3.18 was subsequently published and scanned.

## Earlier review

Reviewed on 2026-09-28 against the signed-in Catea Paper review page for release
0.3.3. The fixes below are local source changes; the marketplace has not yet
scanned a release containing them.

## Changes

| Review finding | Resolution |
| --- | --- |
| Clean build requires an unavailable sibling design system | The design system is now included under `packages/design-system`; installation and build were checked in a temporary copy without the sibling or pre-existing dependencies. |
| `main.js` exceeds 5 MB | Native Obsidian Mermaid loading and the curated grammar bundle keep the 0.3.17 output at 4,396,717 bytes. Both the build script and CI enforce a limit of 5,000,000 bytes. |
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
- Vault enumeration requires review in context: file listing backs the `find`
  and `grep` agent tools and the file-tree thumbnails, both scoped to the vault.
  This update does not claim that capability notice has disappeared from the
  release scan.
- System identity notice: no owned or vendored code path reads `os.hostname`,
  `os.userInfo` or `os.networkInterfaces`. The Git history spawner copies an
  explicit allowlist (`PATH`, `HOME`, temp, locale and Windows system
  variables) instead of the full environment, so it structurally cannot inherit
  `GIT_DIR`-style overrides either; the only other owned environment read is
  `process.env.HOME` when locating the optional, capability-gated `agent-reach`
  CLI, disclosed in SECURITY.md. Vendored upstream reads configuration and
  debug variables (`NANOMEM_*`, `CATUI_DEBUG`, `NODE_ENV`) only.
- Clipboard use is write-only (`navigator.clipboard.writeText` behind explicit
  copy buttons) plus files taken from the user's own paste event; nothing polls
  or reads the system clipboard in the background.
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
