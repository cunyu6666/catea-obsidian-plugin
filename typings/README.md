# Offline Node declarations

The Obsidian scorecard for the plugin's September 30, 2026 release reported
434 `@typescript-eslint/no-unsafe-*` findings. Removing installed Node declarations
from a local TypeScript program reproduces the same failure pattern, including
187 unsafe calls, 115 member accesses, 95 assignments and 14 returns. The current
working source has 22 unsafe arguments; the scanned release has 23.

These are complete, unmodified declaration packages from the lockfile installation:

| Directory | npm package | Version | License |
| --- | --- | --- | --- |
| `node/` | `@types/node` | 22.20.4 | MIT (`node/LICENSE`) |
| `undici-types/` | `undici-types` | 6.21.0 | MIT (`undici-types/LICENSE`) |

`tsconfig.json` resolves this type root before `node_modules/@types`, and maps
`undici-types` to its local declaration package. The 0.3.18 online scan still
reported all 434 type findings, so automatic type-root discovery alone proved
insufficient. `runtime.d.ts`, imported type-only by the plugin entry, explicitly
loads the Node declarations through the source dependency graph. This follow-up
still requires online validation. No ambient `any`
shims or rule suppressions are used. These files are compile-time inputs and
add no JavaScript to the plugin bundle.

`npm run check:marketplace` checks every snapshot file against the lockfile-installed
package, then typechecks and runs all five unsafe-value rules with installed Node
and Undici types hidden by a read-only compiler host, automatic type inclusion
disabled, and custom type roots replaced. It includes vendored runtime
source. The existing tsconfig exclusions for the unused upstream CLI and extension
remain in effect. This is a targeted regression check, not a claim to reproduce
all private marketplace scanner checks.

After upgrading either declaration dependency, run `npm ci`, replace the matching
snapshot with the complete installed package, update this table, and rerun
`npm run check`. Keep upstream package metadata, README and license files intact.
