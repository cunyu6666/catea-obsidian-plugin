# Contributing

Thanks for looking. This document is short on purpose: it says what the gates
enforce, so a change can be checked before it is proposed.

## Prerequisites

- **Node 24 or newer.** `npm test` runs on Node's built-in test runner and relies
  on native TypeScript type stripping. Verified on v24.21.0.
- **Nothing else.** The design system is vendored under `packages/design-system` and
  linked through npm workspaces, so `npm ci && npm run build` works from a clean
  checkout of this repository alone. That is the same thing Obsidian's release build
  verification runs, and it is why the build lives in CI.

## Commands

| Command | What it does | Requires installed dependencies |
|---|---|---|
| `npm ci` | reproducible workspace install | npm and network access |
| `npm test` | contracts, isomorphism, governance and storage regressions | yes |
| `npm run check:marketplace` | Node-type availability, unsafe-value rules (including vendored runtime source), declaration provenance and CSS compiler inputs | yes |
| `npm run typecheck` | `tsc`, scoped to owned code | yes |
| `npm run lint` | official Obsidian rules over host and adapters | yes |
| `npm run format:check` | Prettier check over owned TypeScript and JavaScript | yes |
| `npm run test:behavior` | runtime streaming, context and settings regressions | yes |
| `npm run build` | bundle to `dist/catea-paper/` | **yes** |
| `npm run check` | the complete local CI sequence, including the build | yes |

## Documentation is enforced, not suggested

This repository uses the DIP protocol: a root charter (`AGENTS.md`, P1), a member
list per module (`*/src/AGENTS.md`, P2), and a contract header at the top of every
source file (P3). `npm test` fails when documentation and code disagree, so:

- **Adding, renaming or deleting an export** requires updating that file's `[WHO]`
  in the same change.
- **Adding or removing an import** changes `[FROM]` when it is a key dependency.
- **Adding a consumer** of a file requires that file's `[TO]` to list it. `[TO]`
  entries are resolved by reading real imports, not by trusting the header.
- **Adding or deleting a file** in an in-scope directory requires updating that
  module's P2 member list; the gate compares it against the filesystem in both
  directions.
- **Adding a new directory containing source** requires a P2 map for it and a link
  from P1.

The P3 grammar is fixed because it is machine-checked:

| Field | Value |
|---|---|
| `[WHO]` | comma-separated exported symbol names, exactly as declared |
| `[FROM]` | comma-separated import specifiers exactly as written, or `(none)` |
| `[TO]` | comma-separated repo-relative consumer paths, or `(entry)` |
| `[HERE]` | `repo-relative/path.ext - role` |

Out of scope, deliberately: `packages/*/upstream/**` (agent-core original bytes
are checked against `SOURCE_HASHES.json`, and its build-time patch against
`LOCAL_PATCHES.json`; a header would invalidate the original digests), `scripts/`
(the scope rule covers `apps/*/src` and `packages/*/src`), and `__tests__/`
(a contract test for a contract test is circular).

Run `npm ci` once, then `npm run check` before proposing a change. CI runs the
same gates from a clean checkout. Use `npm run format` to apply the repository
style.

## Commits

```
<type>(<scope>): <summary>
```

`feat`, `fix`, `docs`, `test`, `chore`, `refactor`. English, imperative, focused on
why the change is needed rather than restating the diff.

## Language

- **Documentation and code comments: English.** Includes P1/P2/P3 and `docs/`.
- **The product UI is bilingual by design.** User-facing strings resolve through
  `apps/obsidian/src/locale.ts` and `packages/agent-core/src/i18n.ts`; Chinese is a
  supported UI language. `README.md` is intentionally bilingual, with English
  first and Chinese second in one document.
- **The persona documents are not translated.** `packages/personas/src/*.md` are
  agent-facing prompt content; translating them changes runtime behaviour.

## Versioning and releases

The version has one runtime source, `packages/agent-core/src/version.ts`
(`PLUGIN_VERSION`), and `tests/governance.test.ts` asserts that it, `manifest.json`,
both `package.json` files and `versions.json` all agree. Nothing else may hardcode
a version literal — that is what drifted to `0.3.0` in two files before.

To cut a release:

1. Bump the version in `manifest.json`, both `package.json` files and
   `version.ts`, and add an entry to `versions.json` mapping the new version to
   `minAppVersion`. `versions.json` is what lets older Obsidian builds resolve a
   compatible older release.
2. `npm run build`
3. `node scripts/release.mjs` — dry run. It runs the gates, checks the three
   release assets and the built version, and reports every policy problem at once.
4. `node scripts/release.mjs --publish` with `GH_TOKEN` set to create the release.

Obsidian's updater needs a **GitHub Release** whose tag is the version with **no
`v` prefix**, with `main.js`, `manifest.json` and `styles.css` attached. A tag
alone is not enough, and a version that was already published is ignored — cut a
new version instead of re-releasing.

`.github/workflows/release.yml` is the preferred publishing path. It is manually
dispatched with the exact version, builds from the vendored workspace, attests
`main.js` and `styles.css`, and creates the GitHub Release. The local script remains
available for maintainers who need the same checks from a trusted workstation.

## Known limitations

- **Vendored upstream cannot be typechecked.** `packages/*/upstream/**` is a
  snapshot that omits sibling modules such as `@catui/agent-core`, so `tsc` reports
  ~84 diagnostics there. `npm run typecheck` therefore reports vendored and external
  counts and fails only on owned code.
- **Narrowing tsconfig `exclude` does not work.** Specifying `exclude` replaces the
  built-in `node_modules` exclusion and pulls more external sources into the
  program (measured: 87 → 129 diagnostics). It was tried; do not retry it.
- **A live Obsidian smoke test is still manual.** CI verifies the source, adapters,
  release assets and bundle size, but a maintainer must load the build in a test
  vault before publishing to verify host integration and visual behavior.
