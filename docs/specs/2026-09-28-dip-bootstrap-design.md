# DIP Bootstrap — Design

Status: Awaiting user approval
Date: 2026-09-28
Method: `oh-my-dev` (DIP protocol — documentation drives tests)
Target: `catea-obsidian-plugin` (Catea Paper Agent, v0.3.1)

---

## 1. Goal

Bring the repository under the DIP protocol so that documentation and code are
structurally consistent and mechanically verifiable, and make the documentation
layer English-only for a global open-source audience.

Three outcomes:

1. **P1/P2/P3 documentation** — a root charter, per-module maps, and per-file
   contract headers, all in English.
2. **A runnable harness** — zero-dependency contract tests that fail when the
   documentation drifts from the code, so `/verify` is automated rather than manual.
3. **Release hygiene** — the minimum a public repository needs to be credible.

## 2. Non-Goals

Explicitly out of scope, to keep the change reviewable:

| Not doing | Why |
|---|---|
| Translating Chinese strings inside source code | User scoped English to the documentation layer only |
| Translating `packages/personas/*.md` persona prompts | Changes runtime product behavior (persona voice) |
| Translating `apps/obsidian/src/skills/obsidian.md` | Same — it is agent-facing prompt content |
| Refactoring `Agent.send()`, `panel.tsx`, or the `as any` seams | User selected the documentation-only scope, not the refactor scope |
| Behavior/integration tests (providers, MCP, memory engine) | No runtime dependencies are installable in this environment; see §7 |
| Touching `packages/*/upstream/**` | Byte-verified vendored snapshots; see §4.3 |
| Adding a `LICENSE` header comment to every source file | Not required by DIP; keeps the diff focused |

## 3. Current State (verified)

| Item | State |
|---|---|
| Commits | 2 (`Import catea-source v0.3.1`, bilingual README) |
| Remote | `github.com/cunyu6666/catea-obsidian-plugin`, `main` in sync |
| Own source files | 40 (excluding `upstream/`) |
| Vendored upstream files | 74 across `packages/agent-core/upstream`, `packages/memory/upstream` |
| DIP documents | none — no `AGENTS.md` anywhere |
| Tests | none — no runner, no config |
| Source comments | already English |
| Chinese in own files | 643 occurrences across 27 files; concentrated in `locale.ts` (114), personas (89+89+11), `docs/ARCHITECTURE.md` (44), `settings.ts` (31), `obsidian-tools.ts` (24), and scattered error strings |
| `LICENSE` | absent |
| `.gitignore` | absent — `node_modules`, `dist/`, `.catea/` are not ignored |
| `node_modules` | not installed |
| `../catea-design-system` | **missing** — build input is unresolvable |

### Concurrent work in the tree (observed 2026-09-28 01:00)

A separate process is preparing the Obsidian community-marketplace submission in
this same working tree, concurrently with this work. Confirmed with the user.
Its changes, present but uncommitted when this spec was updated:

| File | Change |
|---|---|
| `README.md`, `README_CN.md` | License badge switched to GPL-3.0; new "Network Use" disclosure section |
| `apps/obsidian/package.json` | version 0.3.0 → 0.3.1 |
| `scripts/build.mjs` | now reads a root `manifest.json` and copies the root `LICENSE` |
| `manifest.json` (new, root) | plugin manifest, version 0.3.1 |
| `package-lock.json` (new) | lockfile |

Consequences for this work:

1. **None of those files are modified, staged, or committed by this work.** The
   `LICENSE` created here has the canonical GPL-3.0 text (`md5 1ebbd3e34237af26da5dc08a4e440464`,
   35149 bytes, identical to `packages/memory/LICENSE`), which is what the updated
   `scripts/build.mjs` now copies — the two efforts agree rather than conflict.
2. **`scripts/build.mjs` is deferred out of DIP scope** (see §4.2). It was edited
   one minute before this work started and is likely to be edited again for the
   marketplace submission; adding a header now would race the other writer.
3. **`.gitignore` is edited additively**, preserving the other writer's three
   lines and appending `.catea/`, `*.tmp`, `.worktrees/`, `*.log`.
4. The repo-wide verify gate is written to **tolerate** new non-source directories
   (for example a future `.github/`) so that concurrent additions do not break it
   spuriously: it asserts no phantom entries and full coverage of source
   directories, not strict equality with the filesystem.

## 4. Scope of DIP Coverage

### 4.1 Files receiving a P3 header (32)

`apps/obsidian/src/` (12)
`ChatMarkdown.tsx`, `DiagramDialog.tsx`, `MermaidDiagram.tsx`, `StreamingChatResponse.tsx`,
`locale.ts`, `main.tsx`, `note-previews.ts`, `note-thumbnails.ts`, `obsidian-tools.ts`,
`panel.tsx`, `selection.ts`, `settings.ts`

`packages/agent-core/src/` (10)
`ask-user-question.ts`, `attachments.ts`, `byok.ts`, `context.ts`, `i18n.ts`, `index.ts`,
`providers.ts`, `transport.ts`, `types.ts`, `upstream-stream.ts`

`packages/integrations/src/` (6)
`index.ts`, `mcp.ts`, `skills.ts`, `storage.ts`, `tools.ts`, `web.ts`

`packages/memory/src/` (3)
`host.ts`, `index.ts`, `tools.ts`

`packages/personas/src/` (1)
`index.ts`

### 4.2 Files deliberately skipped

| File | Reason |
|---|---|
| `scripts/build.mjs` | **Out of scope, not deferred** — the DIP scope rule in §5.4 covers `apps/*/src` and `packages/*/src` only, so `scripts/` was never in scope, regardless of the concurrent editing. The reason originally recorded in this row was wrong and is corrected here on 2026-09-28. |
| `apps/obsidian/src/paper.cjs` | Generated bundle, 1.6 MB, embedded Tabler icon data |
| `apps/obsidian/src/assets.d.ts` | `.d.ts` declaration file |
| `apps/obsidian/src/skills/obsidian.md` | Markdown asset consumed as agent prompt |
| `packages/personas/src/{aria,vex,pencil}.md` | Markdown prompt content |
| `packages/agent-core/UPSTREAM.md`, `packages/memory/UPSTREAM.md` | Provenance documents, not source |
| `package.json`, `tsconfig.json`, `apps/obsidian/package.json`, `packages/*/package.json` | Pure configuration, no logic (DIP rule: skip config) |
| `apps/obsidian/paper.css` | Stylesheet, no logic |

### 4.3 Vendored upstream — excluded (user decision)

`packages/*/upstream/**` (74 files) are byte-verified snapshots recorded in
`packages/agent-core/upstream/SOURCE_HASHES.json`. Inserting a P3 header would
change the bytes and invalidate that verification.

Handling: each P2 document marks the directory as `vendored — excluded from DIP,
verified by SOURCE_HASHES.json`, so the exclusion is documented and reversible.

## 5. Deliverables

### 5.1 P1 — `AGENTS.md` (root, English)

Sections: Identity, Project Overview, Architecture Topology (ASCII), Directory
Structure, Build & Run Commands, Key Abstractions, Configuration Paths, Code
Standards (language policy = English docs / English code comments; Conventional
Commits), DIP Navigation (links to the 5 P2 files), Covenant footer.

The Build & Run section must state the `../catea-design-system` prerequisite
explicitly and mark the build command as **not verifiable in this environment**.

### 5.2 P2 — five module maps (English)

| File | Covers |
|---|---|
| `apps/obsidian/src/AGENTS.md` | 12 source files + 2 skipped assets |
| `packages/agent-core/src/AGENTS.md` | 10 source files |
| `packages/integrations/src/AGENTS.md` | 6 source files |
| `packages/memory/src/AGENTS.md` | 3 source files |
| `packages/personas/src/AGENTS.md` | 1 source file + 3 persona documents |

Each member line follows `{file}: {responsibility}, {technical points}, {key parameters}`.
Each carries a parent link back to the root `AGENTS.md` and the covenant footer.
Directories with 1–2 files (`scripts/`) get no P2; their contents are listed in P1.

### 5.3 P3 headers (32, English)

Four fields per the `oh-my-dev` P3 template, placed after any existing file-level
comment, followed by one blank line:

```typescript
/**
 * [WHO]: Provides {actual top-level exports}
 * [FROM]: Depends on {key module dependencies}
 * [TO]: Consumed by {actual consumers}
 * [HERE]: {path} - {role and relationship to neighbors}
 */
```

### 5.4 Harness — 33 zero-dependency tests

Runner: Node's built-in `node:test` + `node:assert/strict`. No new dependencies,
no `node_modules`, no network. Why this over Vitest: the module graph imports
`obsidian`, `electron`, and `catea-components`, and the design-system workspace is
absent — runtime imports cannot resolve. See §7.

Runner behavior verified on the local runtime (node v24.21.0) before writing this
spec:

- `node --test` discovers and runs `*.test.ts` files natively (type stripping), no flag needed;
- a `.test.ts` file can import a sibling `.ts` helper **if the import uses an explicit
  `.ts` extension** (`import {parseP3} from './p3-contract.ts'`), which is required because
  these are ESM modules;
- non-`*.test.*` helper files in `__tests__/` are not collected as tests.

Sharing the P3/export/import parser across all 34 tests is therefore done with one
helper per scope rather than duplicating parsing logic 34 times:

```
tests/dip-contract.ts        shared parser: P3 block extraction, export/import extraction,
                             repo file index, consumer resolution
apps/obsidian/src/__tests__/...        import {contractTest} from '../../../../tests/dip-contract.ts'
packages/*/src/__tests__/...           same helper, relative depth per module
```

Each generated test is then a few lines: the target path plus the helper call.

Layout (colocated per DIP convention):

```
apps/obsidian/src/__tests__/*.test.ts          12
packages/agent-core/src/__tests__/*.test.ts    10
packages/integrations/src/__tests__/*.test.ts   6
packages/memory/src/__tests__/*.test.ts         3
packages/personas/src/__tests__/index.test.ts   1
tests/dip-verify.test.ts                        1  repo-wide isomorphism gate
tests/dip-contract.ts                             shared helper (not a test)
```

**Contract-check algorithm (per file).** The test must derive facts from the code,
never from the header it is checking, otherwise it is tautological:

1. Read the source file; extract the P3 block and parse the `WHO`, `FROM`, `TO` claims.
2. Extract **actual** exports from the source text: `export (async )?(function|const|class|let|var|interface|type|enum) NAME`, `export {…}`, `export default`, `export * from`.
3. Extract **actual** import specifiers from `from '<spec>'` occurrences.
4. Assert:
   - every `WHO` name appears in the actual export set;
   - every `FROM` dependency matches at least one actual import specifier;
   - every `TO` consumer resolves to an existing repository file whose source
     contains an import specifier resolving to this file.
5. Failures report the claimed vs. actual values.

**Repo-wide gate (`tests/dip-verify.test.mjs`)** — the automated `/verify`:

- every in-scope source file contains a `[WHO]:` block;
- every P2 member line names an existing file, and every existing file in that
  directory appears in the member list (both directions);
- every P2 parent link resolves;
- the P1 directory tree lists exactly the real top-level directories.

### 5.5 Release hygiene

**Outcome note (2026-09-28):** these three files were already committed before
this work could commit them — the concurrent marketplace process ran a
working-tree-wide commit (`74b907c Prepare 0.3.1 release...`) that swept up this
work's in-progress `.gitignore`, `LICENSE`, and `package.json`. Their content in
HEAD is exactly what this spec specifies and is verified below, so no separate
hygiene commit was needed. Recording it here because the history attributes the
work to the other commit.

| File | Content |
|---|---|
| `.gitignore` | **Additive edit** — keeps the other writer's `node_modules/`, `dist/`, `.DS_Store` and appends `.catea/`, `*.tmp`, `.worktrees/`, `*.log`. `.catea/` is the important one: it holds raw sessions and memory and may contain private note content |
| `LICENSE` | Canonical GPL-3.0 text, copied verbatim from `packages/memory/LICENSE` (user decision; GPL-3.0 `mem-core` is linked into the plugin artifact). The concurrently-updated `scripts/build.mjs` copies this root file, so it is required regardless |
| `package.json` | `"test": "node --test"` added to `scripts`; the Node PATH caveat is documented in P1 |

### 5.6 `docs/ARCHITECTURE.md` — English rewrite

Same substance: the three ADRs (in-process loop, retained mem-core with replaced
host adapter, standalone design-system monorepo), the `.catea/` runtime layout, the
pre-release acceptance checklist, and the 2026-09-27 hands-on acceptance record.
Rewrite in English; keep it as the design rationale that P1 links to.

## 6. Execution Order

Decisions taken at approval time (2026-09-28):

- **Commit target: `main` directly.** No `dip-bootstrap` branch, no PR. The user
  accepted the stated trade-off (a large multi-file change without an isolated
  review branch).
- **Commit granularity: staged commits**, one per phase below, Conventional
  Commits messages in English.

Order:

1. `docs: add DIP bootstrap design spec`
2. `chore: add .gitignore, GPL-3.0 LICENSE, and test script`
3. `test(dip): add shared contract helper and repo-wide verify gate`
4. `docs(dip): add root P1 AGENTS.md`
5. `docs(dip): add P2 module maps`
6. `docs(dip): add P3 headers and contract tests for agent-core`
7. `docs(dip): add P3 headers and contract tests for integrations`
8. `docs(dip): add P3 headers and contract tests for memory`
9. `docs(dip): add P3 headers and contract tests for personas`
10. `docs(dip): add P3 headers and contract tests for the Obsidian host`
11. `docs: rewrite ARCHITECTURE.md in English`
12. Run the full suite as the completion gate; report the raw output.

Every commit stages **only the files this work creates or edits**. The
concurrently-modified marketplace files (`README.md`, `README_CN.md`,
`apps/obsidian/package.json`, `scripts/build.mjs`, `manifest.json`,
`package-lock.json`) are never staged.

Note on ordering: the shared helper `tests/dip-contract.ts` is committed at step 3
because it is inert on its own. The repo-wide gate `tests/dip-verify.test.ts` is
written at step 3 but committed at step 11, together with the P1/P2 maps it checks.
Reason: the gate asserts that every in-scope file carries a P3 header, so it cannot
pass until step 10 is complete. Committing a knowingly-red suite to `main` while a
separate process may push `main` to a public remote is an avoidable risk; the gate's
first appearance in history is therefore green.

Verified behaviour of the harness before relying on it (not assumed):

- the gate correctly identifies exactly 32 in-scope files and reports all of them as
  missing P3 headers, i.e. it fails for the intended reason rather than a parser bug;
- `extractExports` correctly reads a type-only file (`types.ts`, 20 names) and a
  default-exported class (`main.tsx` → `Catea` + `default`);
- `extractImports` and `resolveSpecifier` resolve relative cross-package specifiers
  to real files and ignore bare specifiers such as `obsidian`;
- `extractP3` accepts both the template's prose form (`Provides X`, `Depends on Y`,
  `Consumed by Z`) and bare comma-separated lists.

Rationale for not using a git worktree: `scripts/build.mjs` resolves its
design-system input as `../catea-design-system` relative to the repo root, so an
isolated worktree path would silently point at the wrong directory. This is
independent of the branch decision above.

## 7. Verification Limits (disclosed, not hidden)

The following cannot be verified in this environment, and no claim will be made
that they are:

| Claim | Blocked by |
|---|---|
| `npm run build` succeeds | `../catea-design-system` missing; `node_modules` absent |
| `tsc` type-checks | same |
| Plugin loads in Obsidian | requires an Obsidian instance and a test vault |
| Harness catches real drift | asserted only via deliberate red-green check, see below |

What **will** be demonstrated with fresh evidence:

- the full test command, its exit code, and the pass/fail counts;
- a red-green proof for at least one harness test: temporarily remove a claimed
  export, show the test fail, restore, show it pass;
- `git status` showing the tracked file set contains no `node_modules`, `dist/`,
  or `.catea` content.

## 8. Risks

| Risk | Mitigation |
|---|---|
| P3 headers become wrong as the code changes | The harness fails on drift; `/verify` is now one command |
| 33 new test files add noise | They are contract checks only; a module-level grouping was considered but rejected for conformance with the DIP per-file rule |
| Static contract tests prove little about runtime behavior | Stated plainly in §7; behavior tests are blocked by the missing dependency graph and are a separate, later effort |
| Adding `LICENSE` GPL-3.0 changes distribution terms | User explicitly selected GPL-3.0; `THIRD_PARTY_NOTICES.md` and the vendored `LICENSE` are retained |
| Committing 1.6 MB `paper.cjs` in a public repo | Out of scope; flagged as an observation only |
| **Concurrent marketplace work overwrites this work's files** | Minimised by additive edits, by never staging the other writer's files, and by re-checking `.gitignore` before each commit. `scripts/build.mjs` is deferred entirely. If the other writer replaces `.gitignore` again, the appended rules are re-applied before the final commit |
| Marketplace work adds directories, breaking the P1 tree check | Verify gate tolerates new non-source directories; P1 tree is re-read from the filesystem at write time |

## 9. Approval

Approved by the user on 2026-09-28. Decisions recorded:

1. **Spec: approved** — full scope as written in §4 and §5.
2. **Commit granularity: staged commits** — one per phase in §6.
3. **Finishing: commit directly to `main`** — no branch, no pull request.
4. **Commits authorized** for this work; nothing is pushed to `origin` without a
   separate request.