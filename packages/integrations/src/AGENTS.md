# packages/integrations/src/

> P2 | Parent: ../../../AGENTS.md

The capability layer: vault and filesystem tools, skill loading, MCP client
pooling, web search and fetch, and the vault-safe storage helpers every other
package builds on.

## Member List

conversation-store.ts: Vault-backed conversation persistence with serialized writes, session indexing and delete rollback.
index.ts: Barrel re-exporting the integration surface (VaultTools, McpPool, skill loaders, storage helpers); nothing imports it, consumers import the submodules directly.
mcp.ts: `McpPool` connects enabled stdio and HTTP MCP servers, paginates tool discovery and namespaces tool names to 64 chars; catalog cap 1000, call timeout 120 s, output 24000 chars.
skills.ts: Loads enabled `.catea/skills/<id>/SKILL.md` packages, lists skill directories, and reads path-guarded resources; content capped at 48000 chars, traversal rejected.
storage.ts: Vault confinement through `within()` with realpath checks and explicit symlink rejection, atomic temp+rename JSON writes, and the `Serial` promise queue.
tools.ts: Filesystem tool surface (time/read/ls/find/grep/write/edit/bash) with approval gates; 1 MB text cap, 10000-file walk, 300-line read, 80 grep hits, 100 KB write, 60 s bash.
web.ts: `web_search` and `web_fetch` via Exa MCP, Jina, DuckDuckGo or direct fetch; `link_world_admin` diagnoses Agent Reach and `link_world_exec` runs approved CLI arguments; blocks local and private hosts for page requests.

## Notes

- `web.ts` is adapted from CatUI link-world (GPL-3.0) and carries an attribution line above its P3 header; unlike the `upstream/` trees it is hand-maintained.
- The `tool()` schema helper and several write-guard rules are duplicated between `tools.ts` and `apps/obsidian/src/obsidian-tools.ts`; the read caps differ (1 MB vs 2 MB). Consolidating them is a known, deliberate open item.

## Tests

Contract tests live in `__tests__/`, one per in-scope file.

---

[COVENANT]: Update this file header on changes and verify against parent AGENTS.md
