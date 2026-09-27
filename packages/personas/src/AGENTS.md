# packages/personas/src/

> P2 | Parent: ../../../AGENTS.md

Runtime persona prompt documents plus the registry that selects one by id. A
persona defines voice and style only; it never grants tool permissions.

## Member List

aria.md: Aria persona prompt document, the default persona, loaded by index.ts as raw text through the esbuild `.md` loader.
index.ts: Persona registry loading the Vex, Aria and Pencil prompt documents and exporting `personas`, `persona(id)` and the `PersonaId` union; the lookup falls back to index 1 (Aria).
pencil.md: Pencil persona prompt document, loaded by index.ts as raw text.
vex.md: Vex persona prompt document, loaded by index.ts as raw text.

## Notes

- The persona documents are deliberately kept in their original language: they are agent-facing prompt content, not documentation, and translating them would change runtime behaviour.
- `index.ts` names exactly three personas; `packages/memory/src/index.ts` additionally accepts a `global` scope, so the two lists cannot be derived from one another.

## Tests

Contract tests live in `__tests__/`, one per in-scope source file.

---

[COVENANT]: Update this file header on changes and verify against parent AGENTS.md