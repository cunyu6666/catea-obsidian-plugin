# Security

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository: **Security →
Report a vulnerability**. That opens a private thread visible only to maintainers,
which is the right place for anything that could put users' vaults or keys at risk.

Please do not open a public issue for a vulnerability, and do not include real
vault contents or API keys in a report.

Expect an acknowledgement within a few days. This is a spare-time project, so
there is no formal SLA, but security reports are treated ahead of everything else.
Only the latest release is supported with fixes.

## What this plugin can reach

Everything below is a description of the current implementation, not a promise.

### Local data

Vault-specific data is written into the user's own vault, never into the plugin directory:

| Path | Contents |
|---|---|
| `.catea/config.json` | vault toggles, selected model, MCP server configuration; model metadata only when global BYOK encryption is unavailable. **Never contains API keys or tokens** |
| `.catea/sessions/<id>.json` | the raw conversation and tool transcript for one session |
| `.catea/memory/` | extracted memory, including per-persona engine directories |
| `.catea/skills/<id>/SKILL.md` | skill packages the user installed and enabled |

Those files can contain private note content. `.catea/` is git-ignored because it
must never be committed or distributed. `memory/pending-turns.json` is the durable
queue of turns awaiting extraction.

Releases before 0.3.12 also created `.catea/snapshots`. Current code never reads
that tree and removes that exact plugin-owned directory on startup; no other vault
path is part of the migration.

### Credentials

When Electron's OS-backed safeStorage is available, Catea encrypts the BYOK model
profile, including API keys, at `<Obsidian userData>/catea/byok.enc`. This is a
machine-local file shared by vaults, not a synced vault file. On Linux, Catea
rejects the `basic_text` fallback. Existing vault-local models are imported on
first open; the vault copy of model metadata is then cleared. A vault's selected
model remains in its `.catea/config.json`.

MCP bearer tokens remain in Obsidian's vault-scoped secret storage, keyed
`catea-mcp-<id>`. For stdio preset servers, the stored value is injected into
the child-process environment under the configured variable name at connect
time; only the variable name (for example `FIGMA_API_KEY`) appears in
`.catea/config.json`, never a value. If global encryption is unavailable, API keys also remain in
that store under `catea-<id>`. Neither is written to `.catea/config.json`.
When secret storage is unavailable, keys remain in memory for the current session.

Pro license keys use the same credential storage as model API keys. Cached billing
status in vault config never includes the license key. Legacy plaintext copies are
scrubbed on startup; existing backups are not rewritten. Pro models are added to
the selector without changing the selected model.

### Network

BYOK connects directly to the configured provider. Optional Pro adds subscription
billing and hosted inference; there is no telemetry. Network destinations are:

| Destination | When |
|---|---|
| The model endpoint you configure (any OpenAI- or Anthropic-compatible URL) | every conversation |
| `api.pencil.chat/billing`, with `asgard-api-utj6.onrender.com/billing` as the billing fallback | email-based subscription status and checkout on user action; status refresh before hosted sends; hosted inference uses `api.pencil.chat` and sends the selected conversation context |
| `api.github.com`, `github.com` and release asset delivery hosts | public stable-release metadata, at most once daily automatically or on manual check; independently disabled in settings; no vault content or keys |
| `mcp.exa.ai` | web search, as the primary provider |
| `r.jina.ai`, `s.jina.ai` | web search fallback and page reading |
| `html.duckduckgo.com`, `api.duckduckgo.com` | final search fallback |
| The `agent-reach` CLI, if the user has installed it | diagnostics and explicit commands after approval; the CLI is not a generic search/fetch provider |
| Any MCP server the user explicitly enables | tool calls the agent makes |

Web tools can be disabled in settings. `web_fetch` rejects loopback, `.local`,
and RFC1918 URLs; `link_world_exec` calls an external CLI only after explicit
approval and is not constrained by that URL guard. Fetched page content is
treated as untrusted data, never as instructions.

Note that search queries and fetched URLs are sent to those third parties, which is
why the network-use disclosure exists in the README and in Obsidian's submission
requirements.

### The shell tool is not a sandbox

`bash` executes real commands, can leave the vault, and is **disabled by default**.
The user must enable it explicitly. Once enabled, what limits it is the permission
mode:

- **assist** (default): only an exact, non-composable `pwd` or `ls -…` is
  automatically approved; everything else asks for confirmation, showing the working
  directory and the literal command.
- **full**: approvals are skipped entirely. This is the user's explicit choice.

File writes and edits require approval, and the checked-before/after comparison
means a file changed during confirmation is refused rather than overwritten.

## Out of scope

- A malicious vault, plugin or Obsidian installation. The plugin trusts the host.
- MCP servers and skills the user chooses to enable; they run with the agent's
  privileges and are the user's responsibility.
- Prompt injection arriving through note content, web pages or tool output. The
  system prompt marks such content as data rather than authority, but models are not
  reliable at this and the plugin does not claim otherwise.
