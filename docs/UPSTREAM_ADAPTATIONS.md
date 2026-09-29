# Maintained upstream source adaptations

The marketplace follow-up preserves the original agent-core `SOURCE_HASHES.json`
and the existing orchestration `LOCAL_PATCHES.json`. Source edits are recorded in
`packages/UPSTREAM_ADAPTATIONS.json` against repository commit `98d1ddd`, with an
original SHA-256, adapted SHA-256, and reversible line edits for every changed file.
`restoreOriginal` verifies adapted bytes, reverses each edit, then verifies original
bytes. Agent-core originals must additionally match the previously recorded source
hashes. Tests reject changed source and original hashes. The build checks this
chain for the loop before applying the existing permission/concurrency patch.

## Type resolution and contracts

`tsconfig.json` now maps the same CatUI aliases as the build. They resolve to real
source, not permissive ambient `any` declarations. Missing retained session and
extension contracts are structural, type-only declarations in `packages/session.d.ts`,
`packages/core/extensions-host/types.d.ts`, and the upstream session bridge.
Context helper factories now construct the declared custom message types and keep
metadata such as timestamps instead of accepting mismatched argument lists.

Tool argument dictionaries and generic result payloads use `unknown` and explicit
schemas. Policy-rewritten arguments are validated again before execution. AJV is
still used: it preserves JSON Schema handling and coercion, and its dependency
still generates code at runtime. Desktop validation now fails if initialization
fails, rather than silently trusting model arguments based on browser detection.
No replacement interpreter was introduced merely to suppress the dynamic-code notice.

## Runtime and source cleanup

- Removed the inherited debug logger that wrote into `~/.catui` on `CATUI_DEBUG=1`.
  The host remains responsible for diagnostics.
- Normalize non-Error asynchronous rejection reasons and required trace failures
  into Error objects while retaining the original cause.
- Explicitly mark internally caught loop launch promises as intentionally detached.
- Type the parallel tool-result array and verify rewritten tool arguments.
- Remove unused imports and unnecessary assertions; narrow parsed text values rather
  than producing `[object Object]` in insight output.
- Improve the historical extension's event and settings declarations.

The historical CLI now uses formatted standard output/error streams, preserving
messages and exit codes without plugin console logging. Legacy `content` fields
remain accepted and written for old readers, but all access goes through a
validated compatibility boundary; deprecated declarations are retained. Reads
reject non-string legacy payloads and writes synchronize the alias from `detail`.

The diagnostic/context registry is window-local in a browser and module-local in
Node. Multi-bundle Node hosts must explicitly share a registry via
`configureMemoryHost` on each copy; automatic sharing through process globals is
no longer assumed. Catea does not run the historical extension, and standalone CLI
operation is tested. This host-contract change is deliberate rather than a renamed
global access or lint suppression. The new compatibility helper has its own
recorded digest in the adaptations manifest.

## Verification boundaries

The source audit uses the installed official recommended rules and includes
vendored source. It is not the official release scanner. The final audit has zero diagnostics; no rule has been disabled. CLI/deprecated compatibility notices do not justify ignoring
unsafe-operation warnings. New tests exercise tool validation/coercion, rejection
handling and reversible source provenance, alongside the existing integration suite.

No claims are made that filesystem, shell, network, base64, GPL, or dependency
runtime-code-generation disclosures disappear. A new release and marketplace
rescan are required to assess official counts and approval.
