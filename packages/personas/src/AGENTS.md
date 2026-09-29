# packages/personas/src/

> P2 | Parent: ../../../AGENTS.md

Runtime persona prompt documents plus the registry that selects one by id. A
persona defines voice and style only; it never grants tool permissions.

## Member List

aria.md: Aria persona prompt document, the default persona, loaded by index.ts as raw text through the esbuild `.md` loader.
dazai.md: Dazai persona prompt document, an Osamu-Dazai-derived voice split into a conversational tone layer and a prose style layer; the style layer asks for the optional `dazai-corpus` skill and degrades to rule-only output when it is absent. Loaded by index.ts as raw text.
index.ts: Persona registry loading the Vex, Aria, Pencil and Dazai prompt documents and exporting `personas`, `persona(id)` and the `PersonaId` union; the lookup falls back to index 1 (Aria).
pencil.md: Pencil persona prompt document, loaded by index.ts as raw text.
vex.md: Vex persona prompt document, loaded by index.ts as raw text.

## Notes

- The persona documents are deliberately kept in their original language: they are agent-facing prompt content, not documentation, and translating them would change runtime behaviour.
- `index.ts` names exactly four personas; `packages/memory/src/index.ts` additionally accepts a `global` scope, so the two lists cannot be derived from one another.
- Adding a persona means also adding its id to the scope whitelist in `packages/memory/src/store.ts`. The two lists are not derived from each other, so an omission fails at runtime as `Unknown memory scope`, not at build time.
- Style belongs to the persona, not to a skill. The assembled system prompt states that skill content never authorizes permissions and that the persona defines style, and a skill can be left disabled by the user — a rule that lives in a skill silently stops applying. What a skill *is* good for here is lazily loaded material through `skill_read`, so a persona may ask for a corpus by name while keeping its own rules. No persona-to-skill mapping exists in the settings model; `personaId` and `skills` are independent fields, and a persona that wants a corpus asks for it at use time rather than assuming it is enabled.

## Tests

Contract tests live in `__tests__/`, one per in-scope source file.

---

[COVENANT]: Update this file header on changes and verify against parent AGENTS.md