# Catea

<div align="center">

<pre>
     _______________________________
    |                               |
    |        C A T E A              |
    |         P A P E R             |
    |_______________________________|
</pre>


<p><strong>The world-class Obsidian plugin that gives your vault a mind.</strong></p>

<p>
  <img src="https://img.shields.io/badge/version-0.3.4-blue?style=flat-square" alt="version">
  <img src="https://img.shields.io/badge/Obsidian-1.8.0%2B-7C3AED?style=flat-square&logo=obsidian&logoColor=white" alt="Obsidian">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/License-GPL--3.0--blue?style=flat-square" alt="License">
</p>

<p>
  <a href="#-why-catea">Why Catea?</a> •
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-configuration-byok">Configuration</a> •
  <a href="#-network-use">Network Use</a> •
  <a href="#-credits">Credits</a>
</p>

<p>
  <a href="./README.md"><img src="https://img.shields.io/badge/English-Active-blue?style=flat-square" alt="English"></a>
  <a href="./README_CN.md"><img src="https://img.shields.io/badge/中文-切换-orange?style=flat-square" alt="中文"></a>
</p>

</div>

---

## 🌟 Why Catea?

> **Your vault, reborn.** A native Catea agent lives inside Obsidian — it reads, writes, searches, and remembers, turning a folder of notes into a living workspace.

Catea is not another chat sidebar bolted onto Obsidian. It is a **Paper workspace with a native Catea agent** — an agent that operates your vault with first-class tools, asks before it writes, carries memory across sessions, and runs long-horizon tasks to completion.

### What Makes It Different?

| | Typical AI plugins | Catea |
| --- | --- | --- |
| **Workspace** | A chat box beside your notes | A first-class Paper panel that streams work straight into your vault |
| **Vault access** | Copy and paste in and out | Native `obsidian-workspace` tools with confirmation-gated writes |
| **Memory** | Forgotten between sessions | NanoMem — recall, episodes, consolidation, and reinforcement |
| **Long tasks** | One-shot answers | CatUI agent loop: 256 turns / 512 tool calls, checkpoints, and context handoff |
| **Models** | Locked to one provider | BYOK — any OpenAI- or Anthropic-compatible endpoint |
| **Web** | None | Search: Exa MCP → Jina → DuckDuckGo; optional Agent Reach diagnostics and approved CLI calls |
| **Safety** | Blind edits | `raw/` write-protected, `wiki/log.md` append-only, every write confirmed |

## ✨ Features

- 🤖 **Native agent, not a prompt wrapper** — a full CatUI-style agent loop runs inside the plugin
- 🔁 **Long-horizon execution** — up to 256 turns and 512 tool calls per run, with checkpoints, continuation, and stall detection
- 🧵 **Context handoff** — `session_history`, `working_notes`, and `new_context` are stitched across window switches, so the thread is never lost
- 🌊 **Streaming responses** — smooth incremental output via ANNO `StreamingChatResponse`, with markdown and Mermaid rendering
- ❓ **AskUserQuestion** — the agent pauses and asks (single/multi select, custom input, previews) instead of guessing
- 🧠 **NanoMem memory** — episodic recall, structured extraction, reinforcement, dedup, and an automatic dream lifecycle
- 🧩 **Skills & MCP** — the bundled `obsidian-workspace` skill, drop-in skills in `.catea/skills`, and MCP servers enabled explicitly in settings
- 🔑 **BYOK** — OpenAI- and Anthropic-compatible providers with draft-based model editing; keys live in Obsidian's secure storage
- 🎭 **Personas** — Vex, Aria, and Pencil, each with a distinct voice
- 🌐 **Web search & page reading** — layered fallback chain; sources expandable right in the reply card; page content treated as untrusted
- 🔍 **Observable runs** — run traces, tool summaries, and loop progress you can inspect

## 🚀 Quick Start

### Requirements

- **Obsidian desktop** ≥ 1.8.0 — Catea is desktop-only (`isDesktopOnly: true`)
- **Node.js 18+** with npm workspaces
- Nothing else. The design system is vendored under `packages/design-system`, so a clone of this repository is the whole build input.

### Build the Plugin

```bash
git clone https://github.com/cunyu6666/catea-obsidian-plugin.git catea
cd catea

# the design system is vendored under packages/design-system,
# so this clone is the entire build input.

npm install
npm run build
```

The build bundles everything into `dist/catea-paper/`:

```
dist/catea-paper/
├── main.js         # bundled plugin (esbuild)
├── manifest.json   # id: catea-paper · minAppVersion: 1.8.0 · desktop only
└── styles.css      # generated stylesheet
```

> `npm run build` only produces output — it never overwrites an installed plugin.

### Install Into Your Vault

```bash
cp -R dist/catea-paper "<YourVault>/.obsidian/plugins/catea-paper"
```

Then open **Settings → Community plugins** in Obsidian and enable **Catea**. Keep the folder name `catea-paper` to match the manifest id.

### First Run

Add a model in **Catea settings** — protocol, base URL, model ID, and API key — then click the **Catea Agent** icon in the sidebar. No CatUI account or service is required.

## 📐 Architecture

Catea is a monorepo (`catea-source`) that cleanly separates the plugin host, the agent, and everything the agent can touch.

```
catea/
├── apps/
│   └── obsidian/          # Plugin host + Paper UI
│                          #   React panel, streaming chat renderer, Mermaid diagrams,
│                          #   note previews & thumbnails, Obsidian tool bindings
├── packages/
│   ├── agent-core/        # CatUI agent loop + BYOK providers + context control
│   │   └── upstream/      # Vendored upstream loop machinery (pinned revision)
│   ├── integrations/      # Vault tools, Skills, MCP, web search, storage
│   ├── memory/            # NanoMem core + host adapter (upstream, GPL-3.0)
│   └── personas/          # Vex · Aria · Pencil
├── docs/ARCHITECTURE.md   # deeper design notes
└── scripts/build.mjs      # esbuild pipeline → dist/catea-paper
```

Design components and tokens live in this repository under `packages/design-system`, linked through npm workspaces — no absolute local paths, and no dependency on a local ANNO or CatUI checkout.

Deeper design notes: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## 🔁 Inside the CatUI Agent Loop

The heart of the plugin is a CatUI agent loop pinned to a fixed upstream revision, built for long, real tasks:

- **Execution budget** — 256 turns and 512 tool calls per run, with tool-argument validation, read-only concurrency, stop handling, result backfill, and duplicate-stall detection
- **Mid-run steering** — add requirements while the agent is still working
- **Context handoff** — when a window fills up, `session_history`, `working_notes`, and a rebuilt `new_context` take over; the raw journal is kept in full, the latest tool chain and newest request are preserved, and working notes survive restarts
- **Streaming throughout** — real SSE at the network layer, ANNO `StreamingChatResponse` at the UI layer, with stop shown immediately and reduced-motion support

## 🧠 NanoMem — Memory That Persists

Your agent gets a memory system, not a transcript:

- **Episodic memory** — sessions sync into episodes with embeddings
- **Recall & scoring** — structured extraction, relevance scoring, reinforcement, dedup, and eviction keep memory sharp
- **Dream lifecycle** — consolidation runs automatically in the background; tasks are queued durably and asynchronously
- **Privacy-aware** — local sessions and memory can contain private notes and are never shipped as plugin files

## 🔐 Obsidian Integration & Safety

The agent acts on your vault through the bundled `obsidian-workspace` skill — no installation needed, with guardrails built in:

- **Confirmation before writes** — every mutation is proposed first, and content is re-checked for changes made during confirmation
- **`raw/` is write-protected** — source material stays untouched
- **`wiki/log.md` is append-only** — the ledger cannot be rewritten
- **First-class native tools** — current note and selection, search by heading / body / tag / property, open in tab or split, sectioned reading, unique-match edits, create, move, and trash
- **Scoped settings** — only safe UI toggles (toolbar, Tabler icons, hide properties / ribbon / status, web, memory) are exposed; arbitrary Obsidian config, secrets, and plugin management are off-limits; changes need confirmation

## 🔑 Configuration (BYOK)

Catea is bring-your-own-key:

- **OpenRouter quick setup** — choose **Add OpenRouter**, enter an API key, then use **Free automatic routing** or paste a model ID such as `provider/model`; Catea selects the saved model immediately. Free uses `openrouter/free`, so the selected model and availability may change between requests.
- **Draft-based editing** — adding or editing a model uses an independent draft; cancelling never mutates your config
- **Validated on save** — display name, model ID, API key, and HTTP(S) base URL
- **Two protocols** — OpenAI-compatible and Anthropic-compatible; switching protocol fills the matching default endpoint, which you can replace with your own compatible service
- **Key storage** — model metadata goes to `.catea/config.json`; API keys are kept in Obsidian's secure storage (when unavailable, they live only in memory for the session)
- **No lock-in** — the sidebar lists only fully configured models and remembers your last choice; no preset model list, no Catea account

## 🌐 Network Use

Catea reaches the network only in visible, user-initiated ways — there is no telemetry, no analytics, and no Catea-operated backend.

| Destination | When | Purpose |
| --- | --- | --- |
| Your model endpoint — `api.openai.com`, `api.anthropic.com`, `openrouter.ai`, or any OpenAI/Anthropic-compatible URL you configure | Every conversation | Prompts, context, and tool results out; model output back. OpenRouter may forward them to its selected model provider. |
| Exa MCP (`mcp.exa.ai`) | When the agent searches the web | Primary web search provider |
| Jina (`r.jina.ai`, `s.jina.ai`) | Web search fallback and page reading | Search fallback and page extraction |
| DuckDuckGo (`html.duckduckgo.com`, `api.duckduckgo.com`) | Web search fallback | Final search fallback |

- Web search can be turned off in settings; the agent searches only when a task needs it.
- Fetched web content is treated as untrusted.
- Vault data, memory, and `.catea/config.json` stay local; API keys live in Obsidian's secure storage. Nothing is sent to O-Pencil or Catea.
- The only credentials involved are the API keys you configure for your own providers.

## 📦 Credits

Catea stands on excellent open-source work — full details in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md):

- **ANNO** — streaming provider, input, response cards, activity components, and persona foundations
- **CatUI** — memory core (GPL-3.0, vendored in `packages/memory/upstream`), link-world web layer, and the agent loop (pinned revision `d6d110aa`)
- **Craft Agents UI** — design-system foundations behind `catea-design-system`
- **Tabler Icons** — Outline 3.48.0 (MIT), see [TABLER-LICENSE.txt](./TABLER-LICENSE.txt)

## 📄 License

Catea is released under the **GNU General Public License v3.0** — see [LICENSE](./LICENSE). Vendored and third-party components keep their original licenses — most notably the GPL-3.0 memory core under `packages/memory/upstream`. Full inventory in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

---

<div align="center">
  <sub>Built with ✎ by <a href="https://github.com/cunyu6666">Cunyu</a> — your vault deserves a mind.</sub><br>
  <sub>Catea is an independent project, not affiliated with or endorsed by Obsidian.</sub>
</div>
