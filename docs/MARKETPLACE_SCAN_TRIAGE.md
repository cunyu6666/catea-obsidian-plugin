# Release scan triage

The pasted review reports 1,664 findings, but contains no release tag, file paths
or line numbers. Counts below are a local source audit of the current workspace,
not a reproduction of that exact release or a claim of official approval.

## Reproducible source audit

Run `node scripts/audit-marketplace.mjs /tmp/catea-marketplace-audit.json`.
The JSON report includes every file, line and rule. The command exits with status
1 when findings remain. It uses the installed official recommended ESLint rules,
includes vendored upstream, and uses `tsconfig.marketplace.json` so the historical
CLI and extension are checked rather than reported as parser failures. Test files
and declaration-only files are excluded. Dependencies, CSS and release capability
scans are separate and are not covered by this command.

Baseline measured on 2026-09-29, before the source adaptations below:

| Source group | Diagnostics |
| --- | ---: |
| Owned host, adapters and design-system TypeScript | 0 |
| Agent-core upstream | 1,109 |
| Memory upstream | 229 |
| Total | 1,338 |

These include unsafe operations, explicit any, unused values, deprecated fields,
window/timer rules and console diagnostics. Counts are not vulnerability counts.
The original audit had two parser failures and 1,214 findings; including the
historical CLI/extension in the audit fixes those coverage gaps.

The largest concentration is `packages/agent-core/upstream/loop/agent-loop.ts`
(558 diagnostics). Missing or erroneous upstream types can produce cascading
unsafe-operation findings; fix dependency/type resolution before changing every
call site. Next are orchestration and context files. Agent-core source digests
are enforced: update the documented upstream snapshot or reviewed patch process,
rather than silently editing files and replacing expected hashes to make tests pass.
The memory snapshot's old engine and extension are no longer runtime dependencies,
but remain in source and therefore remain visible to a source scanner.

## Changes made in this follow-up

- Replaced three owned screen-reader-only `clip-path` rules with transparent,
  clipped one-pixel text. The text remains in the accessibility tree.
- Replaced the approval custom-field label's `display: contents` with a block
  wrapper; its input retains full width and its associated label.
- Added the full-source audit command and its TypeScript configuration.

The build and 35 adapter behavior checks passed. A real Obsidian accessibility /
layout smoke test has not been performed. Other work is occurring in the shared
checkout; this note does not attribute those changes to this follow-up.

## Findings that need a different treatment

- `@source` and `@theme` are Tailwind build directives. The current generated
  `dist/catea-paper/styles.css` contains neither. A source scan may still report
  them; do not remove required compiler input merely to hide the finding.
- `display: contents` remains in the Git graph dependency and a generated utility.
  The table/grid layout needs a separate compatibility review; a blanket CSS
  replacement would change its layout.
- Direct filesystem, shell, network and clipboard capabilities need accurate
  disclosure and verified boundaries. They are not automatically vulnerabilities,
  nor should they be concealed. System/environment reads need call-site review.
- Ajv and other dependencies must be traced before claiming dynamic evaluation
  is removed. Changing a local import does not establish absence from the bundle.
- GPL licensing, bundled transpilation helpers and base64 usage are disclosures.
  Unavailable malware/obfuscation/network scans are scanner coverage limitations;
  they cannot be repaired by a plugin code change.
- The report already passes asset provenance, reproducible build and dependency
  vulnerability checks. Those passes do not establish that all source warnings
  are benign.

No release was created and no response was posted to the marketplace. The remaining compatibility diagnostics are detailed below. A new versioned release
and official rescan are necessary to measure changes in the review page; pushing
source or rebuilding locally does not update the latest-release scan.


## Extended remediation results

The follow-up adds real TypeScript alias resolution, missing structural host
contracts, typed tool arguments and result arrays, mandatory desktop validation,
validation after policy argument rewrites, Error rejection normalization, and
unused-import/assertion cleanup. The inherited home-directory debug logger is
removed. Source edits are reversible and verified against original hashes; see
[upstream adaptations](UPSTREAM_ADAPTATIONS.md).

With the same full audit configuration, the count falls from 1,338 to **106**:

| Remaining rule | Count | Treatment |
| --- | ---: | --- |
| Console output | 69 | Intentional historical CLI/development diagnostics; not silently removed |
| Deprecated `content` | 35 | Historical backward-compatible readers; retained to preserve old data |
| `globalThis` | 2 | Portable Node/browser shared diagnostic and context buses |

Owned source and agent-core upstream have zero audit diagnostics. All remaining
findings are in the historical memory snapshot; its engine, extension and CLI are
not included in Catea's memory runtime. The audit continues to return nonzero;
no rule is disabled and those files remain in its scope.

`tsc --noEmit -p tsconfig.marketplace.json` now reports zero errors, including
upstream files. Build, 370 tests, owned-source lint and formatting passed. Additional
regressions cover validation/coercion, rejected inputs and stream failures. These
are local checks, not marketplace approval or an Obsidian smoke test. Runtime
capability disclosures, Ajv dynamic generation and dependency CSS compatibility
notices still need to be assessed in a new official release scan.


## Final compatibility cleanup

The same source audit now exits **0 with zero diagnostics**. The 106 residual
findings above are an intermediate checkpoint, not the current result.

- Historical CLI/development messages use standard output/error streams with
  Node formatting; help text, error text and exit codes are tested.
- Deprecated `content` declarations remain intact. Validated legacy reads and
  alias synchronization are centralized in `upstream/compat.ts`, preserving old
  record load/save behavior and rejecting malformed non-text values.
- Browser registry state is window-local; Node state is module-local by default.
  Hosts needing cross-bundle sharing explicitly inject the same registry. No
  process-global alias is used to evade the rule.
- Source adaptations are regenerated from the original audited baseline; original
  hashes are retained. New helper files also have verified digests.

This is zero for the reproducible TypeScript/ESLint source audit, not a claim that
all 1,664 official release findings have vanished. Dependency CSS, GPL, filesystem,
shell/network/clipboard capabilities, runtime code generation and unavailable
scanner services remain separate review categories. No new release is published
by these changes.
