# Connector Manifest Bridge — Design

Status: Proposed
Date: 2026-10-02
Target: Catea Connector Bridge

---

## 1. Goal

Define a connector manifest layer for Catea: a small, auditable registry of
external application recipes that tells Catea how an app can be connected, what
capabilities it exposes, which credentials it needs, which adapter should run,
and which operations require user approval.

The manifest is the product surface. It is not a full integration
implementation. A connector may route to MCP, a local plugin bridge, an SDK, a
REST API, a CLI, or a user-installed service. Catea owns the description,
selection, approval, audit, and agent-facing semantics.

## 2. Current Context

Catea already has several tool boundaries:

| Boundary | Current role |
|---|---|
| `hooks.host.tools` | Obsidian-native tools registered by the host |
| `VaultTools` | Filesystem tools over the vault |
| `webTools` | Web search and fetch |
| `McpPool` | Enabled stdio or HTTP MCP servers discovered at runtime |
| `memoryTools` | Catea writing memory |

MCP is useful but too low-level as the primary product concept. A user should
not need to understand whether Figma is connected by official MCP, a local
WebSocket bridge, or a community plugin. The user intent is higher level:
"write this screen to Figma", "create an email draft", "sync WeRead notes", or
"share this Obsidian note outside the vault".

## 3. Non-Goals

| Not doing | Why |
|---|---|
| Embedding external app canvases or inboxes inside Obsidian | Catea should hand work to the external app's native surface |
| Treating every connector as a raw MCP server | MCP is one adapter type, not the product model |
| Giving the model every low-level app API | Manifests expose a small semantic tool surface |
| Auto-sending or auto-publishing without approval | External writes cross a privacy and identity boundary |
| Storing provider secrets in `.catea/config.json` | Existing secret-storage discipline must carry forward |

## 4. Architecture

```
|------------------------|
| Catea Agent / UI       |
| connector_* tools      |
|------------------------|
            |
            v
|------------------------|
| Connector Runtime      |
| manifest registry      |
| account binding        |
| approval + audit       |
| adapter routing        |
|------------------------|
            |
            v
|---------------------------------------------------------------|
| Adapters                                                       |
| MCP | local plugin bridge | SDK | REST/Graph API | CLI | SMTP |
|---------------------------------------------------------------|
            |
            v
|------------------------|
| External application    |
| Figma / Mail / WeRead   |
| Calendar / others       |
|------------------------|
```

The runtime exposes stable Catea tools:

| Tool | Purpose |
|---|---|
| `connector_list` | List installed connector manifests and account status |
| `connector_capabilities` | Describe what one connector can read or write |
| `connector_search` | Search external content through a connector |
| `connector_read` | Read one external object |
| `connector_share` | Send vault content or agent output to an external app |
| `connector_create` | Create an external object, usually as a draft |
| `connector_update` | Update an external object after approval |
| `connector_sync` | Pull or push a bounded sync job |

The model sees this semantic layer. Adapter-specific tools remain behind the
runtime unless a connector deliberately exposes an advanced mode.

## 5. Manifest Shape

The manifest is JSON so it can be validated, diffed, installed, and eventually
shared like a Skill package.

```json
{
  "schema_version": 1,
  "id": "figma",
  "name": "Figma",
  "description": "Write Catea-generated product and design work into Figma.",
  "category": "design",
  "homepage": "https://www.figma.com/",
  "capabilities": {
    "read": true,
    "write": true,
    "sync": false,
    "draft": false,
    "canvas_write": true,
    "delete": false
  },
  "auth": [
    {
      "id": "figma_oauth",
      "type": "oauth",
      "required": false,
      "scopes": ["file_content:read", "file_comments:write"]
    },
    {
      "id": "local_plugin_session",
      "type": "local_bridge",
      "required": true
    }
  ],
  "keys": [
    {
      "id": "FIGMA_ACCESS_TOKEN",
      "storage": "secret",
      "required": false,
      "description": "Optional token for read-only REST metadata or comments."
    }
  ],
  "tools": [
    {
      "name": "write_canvas",
      "description": "Create or update native Figma canvas nodes.",
      "approval": "required",
      "capability": "canvas_write",
      "input_schema": {
        "type": "object",
        "properties": {
          "target": { "type": "string" },
          "document": { "type": "object" },
          "mode": { "type": "string", "enum": ["create", "update"] }
        },
        "required": ["target", "document", "mode"],
        "additionalProperties": false
      },
      "adapters": ["figma_official_mcp", "figma_local_plugin_bridge"]
    }
  ],
  "adapters": [
    {
      "id": "figma_official_mcp",
      "type": "mcp",
      "status": "recommended",
      "transport": "http",
      "endpoint": "https://mcp.figma.com/mcp",
      "tools": ["use_figma"],
      "notes": "Uses Figma's official write-to-canvas path through the Plugin API."
    },
    {
      "id": "figma_local_plugin_bridge",
      "type": "local_bridge",
      "status": "experimental",
      "protocol": "websocket",
      "host": "127.0.0.1",
      "notes": "Routes Catea's design IR to a Figma plugin running in the open file."
    }
  ],
  "safety": {
    "external_write_approval": "always",
    "default_mode": "draft_or_preview",
    "audit_log": true,
    "model_visible_secrets": false
  }
}
```

### 5.1 Required top-level fields

| Field | Meaning |
|---|---|
| `schema_version` | Manifest format version |
| `id` | Stable connector id, lowercase kebab or snake case |
| `name` | Display name |
| `description` | User-facing purpose |
| `category` | Search and settings grouping |
| `capabilities` | Normalized booleans used by Catea and the model |
| `auth` | Supported auth/session modes |
| `keys` | Secret or non-secret configuration names |
| `tools` | Semantic Catea actions, not raw provider APIs |
| `adapters` | Concrete ways to execute actions |
| `safety` | Approval, audit, and secret-visibility policy |

## 6. Figma Connector Example

Figma is the first reference connector because canvas write is the clearest
proof that the bridge is more than raw REST integration.

### 6.1 Product behavior

1. The user opens a Figma file in the native Figma app or browser.
2. The user starts the Catea Figma bridge path:
   - official Figma MCP `use_figma`, or
   - Catea's local Figma plugin bridge.
3. Catea transforms an Obsidian note, selection, or agent output into a bounded
   design IR.
4. The runtime shows the user a preview of the external write: target file,
   page/node, operation mode, node count, text snippets, and adapter.
5. After approval, the adapter writes into Figma through the Plugin API.
6. Catea records an audit entry in the vault-local connector log.

### 6.2 Why the adapter cannot be REST-only

Figma REST can read files and perform limited write operations such as comments
or dev resources. Native canvas writes require the Figma Plugin API, either
through Figma's official MCP write-to-canvas path or through a local plugin
bridge. The manifest therefore marks `canvas_write: true` only for adapters that
execute in a Figma file context.

### 6.3 Catea design IR

The agent should not emit arbitrary plugin JavaScript. It should emit a small
intermediate representation that the adapter validates and translates.

```json
{
  "kind": "figma_document",
  "version": 1,
  "nodes": [
    {
      "id": "settings_screen",
      "type": "frame",
      "name": "Settings",
      "layout": { "mode": "vertical", "gap": 16, "padding": 24 },
      "children": [
        {
          "type": "text",
          "name": "Title",
          "text": "Catea Connector Settings",
          "style": "heading"
        }
      ]
    }
  ]
}
```

The bridge may later add component resolution, variables, styles, and design
system bindings, but those should be explicit IR fields rather than hidden model
conventions.

## 7. Storage

Proposed vault-local layout:

```text
.catea/connectors/
  manifests/
    figma.connector.json
    gmail.connector.json
    weread.connector.json
  accounts/
    figma.default.json
  audit/
    external-writes.jsonl
  queue/
    pending-actions.json
```

Secrets stay in the existing secure-storage path. Account files store references
and non-secret metadata only: connector id, adapter id, user label, scopes,
connection status, sync cursors, and last checked time.

## 8. Safety Rules

1. External writes always require approval in `assist` mode.
2. Approval detail must name the external app, account label, adapter, target,
   operation, and content preview.
3. Secrets are never included in model-visible tool outputs, approval text,
   audit logs, or session transcripts.
4. Non-idempotent writes do not auto-retry unless the adapter can prove the
   upstream operation did not happen.
5. Draft-first adapters are preferred for email and publishing surfaces.
6. A connector manifest cannot grant new permissions by itself; it only
   describes capabilities that the runtime and user enable.

## 9. Built-In Connectors

The first connector set covers four applications. Each application declares read
and write capabilities in the manifest layer before executable adapters are wired
in; executable support may arrive adapter by adapter.

| Connector | First read mode | First write mode |
|---|---|---|
| Email | Gmail API, Microsoft Graph or IMAP search/read | Draft creation before send through Gmail API, Microsoft Graph, SMTP or a mailto fallback |
| Figma | Figma file/node context through official MCP or REST metadata | Canvas write through official MCP `use_figma` or a local plugin bridge |
| WeChat | User-selected desktop conversation/file import through a local bridge | Send Obsidian notes or generated documents to File Transfer/user account through a local desktop bridge |
| WeRead | WeRead Agent/API-key or cookie route for shelf, purchased-book metadata, highlights and notes | Prepare Obsidian documents for WeRead article/note/review import through supported API or local bridge routes |

## 10. Implementation Plan

1. Define a JSON schema for connector manifests.
2. Add a manifest loader under `packages/integrations/src/connectors/`.
3. Add built-in manifests for Email, Figma, WeChat and WeRead.
4. Add account metadata storage and secret references.
5. Expose `connector_list` and `connector_capabilities`.
6. Add Figma as the first executable connector through an adapter interface.
   - Implemented first through the official Figma MCP endpoint
     `https://mcp.figma.com/mcp`.
   - `connector_read` maps to `get_metadata`, `get_design_context`, or
     `get_screenshot`.
   - `connector_create`, `connector_update`, and `connector_share` compile a
     bounded Catea design IR into `use_figma` Plugin API code and require an
     explicit Figma file target.
7. Add approval and audit plumbing for `connector_share` / `connector_create`.

### 10.1 WeChat and WeRead Notes

WeChat personal-account workflows should be treated as local-desktop bridge
workflows, not as an official cloud API. Sending a note to the user's own WeChat
account or importing a selected conversation document requires an explicit local
session and user approval for writes.

WeRead has a stronger read story: community and API-key based tools can read
book shelf, book metadata, reading progress, highlights and notes. Purchased
book text must remain bounded to the user's entitled access; full-book export is
not a connector promise. Writing back to WeRead is modelled as a draft/preview
surface until a supported API or local bridge path is proven.

## 11. Open Questions

| Question | Current leaning |
|---|---|
| Are user-installed connector manifests allowed in v1? | Not until schema validation and safety review exist |
| Should manifests live in the vault or bundle? | Bundle first; vault shadowing later, similar to Skills |
| Should MCP presets be migrated into manifests? | Yes eventually, but only after the manifest runtime exists |
| Does Figma use official MCP first or local bridge first? | Official MCP for compatibility research; local bridge for product control |
| How much adapter code belongs in Catea? | Keep protocol glue in Catea; keep app-specific heavy logic in adapter packages |
