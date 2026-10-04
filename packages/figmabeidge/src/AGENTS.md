# packages/figmabeidge/src/

> P2 | Parent: ../../../AGENTS.md

Local Figma bridge runtime for the Catea connector experiment. The bridge keeps
the Obsidian-facing HTTP API separate from the Figma plugin files under
`packages/figmabeidge/plugin/`.

## Member List

server.ts: Localhost-only HTTP bridge that accepts Catea design IR write jobs, queues them for a connected Figma plugin, receives plugin results, and exposes health/status endpoints.
smoke.ts: Command-line smoke client that submits a minimal design IR action to a running bridge and prints the action status URL.

## Tests

This package is a manual bridge MVP. Contract coverage is through the repository
DIP tests; live Figma verification requires Figma Desktop with the development
plugin loaded.

---

[COVENANT]: Update this file header on changes and verify against parent AGENTS.md
