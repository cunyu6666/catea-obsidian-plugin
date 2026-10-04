# packages/integrations/src/

> P2 | Parent: ../../../AGENTS.md

The capability layer: vault and filesystem tools, skill loading, MCP client
pooling, web search and fetch, and the vault-safe storage helpers every other
package builds on.

## Member List

conversation-store.ts: Vault-backed conversation persistence with serialized writes, a 500-session index, eviction cleanup and delete rollback.
connectors.ts: Built-in connector manifest registry for the first MVP apps, email and Figma; declares read/write capabilities, auth/key requirements, semantic tools and adapter routes, and exposes read-only discovery tools for the Agent.
data-dir.ts: Single compile-time root for all vault-local plugin state; `scripts/build.mjs` injects `CATEA_DATA_DIR` so a development bundle reads and writes `.catea-dev` instead of the released plugin's `.catea`, and falls back to `.catea` when unbundled.
find-skill.md: Preset skill prompt that ships inside the bundle; discovers skills through the skills.sh HTTP search API and gates any third-party text behind user confirmation before `skill_create`.
image-generation.ts: Configurable OpenAI Images or DashScope generation, bounded responses, key-free image downloads and exclusive vault-local writes under Attachments/Catea.
index.ts: Barrel re-exporting the integration surface (VaultTools, connector manifests, McpPool, skill loaders, storage helpers); nothing imports it, consumers import the submodules directly.
legacy-snapshots.ts: One-way migration that deletes only the obsolete `.catea/snapshots` tree created by pre-0.3.12 full-vault recovery.
media-generation.ts: DashScope video task submission/resumption and bounded abortable polling, plus synchronous MP3 speech synthesis; key-free downloads and exclusive vault-local media writes.
mcp.ts: `McpPool` isolates failed servers with sanitized diagnostics and a 15-second discovery deadline, connects enabled stdio and HTTP MCP servers, paginates tool discovery and namespaces tool names to 64 chars; catalog cap 1000, call timeout 120 s, output 24000 chars; carries the optional `envSecret` variable name for stdio token injection.
mcp-presets.ts: Curated MCP preset registry (Figma Framelink, GitHub, Context7, DeepWiki); creates disabled credential-free server configs, matches servers back to presets and injects the stored token into the stdio environment.
skill-creator.md: Preset skill prompt that ships inside the bundle; authoring method adapted from `anthropics/skills` (Apache-2.0) with the evaluation harness replaced by Catea's real tool surface.
skills.ts: Resolves enabled skills from `.catea/skills/<id>/SKILL.md` or the read-only bundled presets, lists and describes them with source and enabled state, validates and writes new packages through `createSkill`, and reads path-guarded resources; content capped at 48000 chars, traversal rejected, presets never writable.
storage.ts: Vault confinement through `within()` with realpath checks and explicit symlink rejection, atomic temp+rename JSON writes, the `Serial` promise queue, and the shared `errnoCode` structural narrowing helper.
tools.ts: Filesystem tool surface (time/read/ls/find/grep/write/edit/bash) with approval gates and original/modified records for successful structured writes; 1 MB text cap, 10000-file walk, 300-line read, 80 grep hits, 100 KB write, 60 s bash.
web.ts: `web_search` and `web_fetch` via Exa MCP, Jina, DuckDuckGo or direct fetch; `link_world_admin` diagnoses Agent Reach and `link_world_exec` runs approved CLI arguments; blocks local and private hosts for page requests.

## Notes

- Member descriptions above name `.catea/...` because that is the released default. Every path is built through `dataPath()` from `data-dir.ts`, so a development bundle relocates the whole tree to `.catea-dev/` and cannot read or write the released plugin's state. New state paths must go through `dataPath()` rather than hardcoding the directory.
- `web.ts` is adapted from CatUI link-world (GPL-3.0) and carries an attribution line above its P3 header; unlike the `upstream/` trees it is hand-maintained.
- The `tool()` schema helper and several write-guard rules are duplicated between `tools.ts` and `apps/obsidian/src/obsidian-tools.ts`; the read caps differ (1 MB vs 2 MB). Consolidating them is a known, deliberate open item.
- `skill-creator.md` and `find-skill.md` are bundled prompt text, not vault data: presets are never written to `.catea/skills/`, so an upgrade cannot rewrite a skill, and `createSkill` refuses their ids. A vault directory of the same id shadows the preset content instead. They are imported as text by the esbuild `.md` loader.

## Tests

Contract tests live in `__tests__/`, one per in-scope file.

---

[COVENANT]: Update this file header on changes and verify against parent AGENTS.md
