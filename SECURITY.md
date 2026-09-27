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

The plugin writes into the user's own vault, never into the plugin directory:

| Path | Contents |
|---|---|
| `.catea/config.json` | model metadata, toggles, MCP server configuration. **Never contains API keys or tokens** |
| `.catea/sessions/<id>.json` | the raw conversation and tool transcript for one session |
| `.catea/memory/` | extracted memory, including per-persona engine directories |
| `.catea/skills/<id>/SKILL.md` | skill packages the user installed and enabled |

Those files can contain private note content. `.catea/` is git-ignored because it
must never be committed or distributed. `memory/pending-turns.json` is the durable
queue of turns awaiting extraction.

### Credentials

API keys and MCP bearer tokens are held in Obsidian's secret storage, keyed
`catea-<id>` and `catea-mcp-<id>`. They are never written to `.catea/config.json`:
the save path explicitly strips them before writing. When secret storage is
unavailable the key is held only in memory for the current session and the UI says
so, rather than silently persisting it.

### Network

The plugin has no backend, no telemetry and no Catea account. It reaches the
network only in these ways:

| Destination | When |
|---|---|
| The model endpoint you configure (any OpenAI- or Anthropic-compatible URL) | every conversation |
| `mcp.exa.ai` | web search, as the primary provider |
| `r.jina.ai`, `s.jina.ai` | web search fallback and page reading |
| `html.duckduckgo.com`, `api.duckduckgo.com` | final search fallback |
| The `agent-reach` CLI, if the user has installed it | search and fetch, when available |
| Any MCP server the user explicitly enables | tool calls the agent makes |

Web tools can be disabled in settings and are off-limits to private addresses: the
URL guard rejects loopback, `.local`, and RFC1918 ranges, so the agent cannot be
pointed at the local network. Fetched page content is treated as untrusted data,
never as instructions.

Note that search queries and fetched URLs are sent to those third parties, which is
why the network-use disclosure exists in the README and in Obsidian's submission
requirements.

### The shell tool is not a sandbox

`bash` executes real commands, can leave the vault, and is **enabled by default**.
What limits it is the permission mode:

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