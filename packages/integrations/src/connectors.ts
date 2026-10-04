/**
 * [WHO]: Provides ConnectorAdapter, ConnectorAuth, ConnectorCapabilityMap, ConnectorKey, ConnectorManifest, ConnectorTool, builtInConnectorManifests, connectorTools, connectorCapabilities, connectorList, runConnectorTool
 * [FROM]: Depends on ../../agent-core/src/providers
 * [TO]: Consumed by packages/agent-core/src/index.ts, packages/integrations/src/index.ts,
 *   packages/integrations/src/__tests__/connectors.test.ts
 * [HERE]: packages/integrations/src/connectors.ts - built-in connector manifest registry for the first MVP apps: email and Figma; exposes read-only discovery tools so the Agent sees stable app capabilities before executable adapters are wired in
 */
import type { ToolDefinition } from '../../agent-core/src/providers'

export interface ConnectorCapabilityMap {
  read: boolean
  write: boolean
  sync: boolean
  draft: boolean
  canvas_write: boolean
  delete: boolean
}

export interface ConnectorAuth {
  id: string
  type: 'oauth' | 'api_key' | 'cookie' | 'local_bridge' | 'smtp' | 'none'
  required: boolean
  scopes?: string[]
  notes?: string
}

export interface ConnectorKey {
  id: string
  storage: 'secret' | 'config'
  required: boolean
  description: string
}

export interface ConnectorTool {
  name: string
  description: string
  approval: 'never' | 'required'
  capability: keyof ConnectorCapabilityMap
  input_schema: Record<string, unknown>
  adapters: string[]
}

export interface ConnectorAdapter {
  id: string
  type: 'mcp' | 'local_bridge' | 'rest' | 'graph' | 'smtp'
  status: 'recommended' | 'experimental' | 'planned'
  transport?: 'http' | 'stdio' | 'websocket'
  endpoint?: string
  host?: string
  tools?: string[]
  notes: string
}

export interface ConnectorManifest {
  schema_version: 1
  id: string
  name: string
  description: string
  category: string
  homepage: string
  capabilities: ConnectorCapabilityMap
  auth: ConnectorAuth[]
  keys: ConnectorKey[]
  tools: ConnectorTool[]
  adapters: ConnectorAdapter[]
  safety: {
    external_write_approval: 'always' | 'adapter'
    default_mode: 'draft_or_preview' | 'direct'
    audit_log: boolean
    model_visible_secrets: boolean
  }
}

const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

const string = { type: 'string' }

const textValue = (value: unknown) => (typeof value === 'string' ? value : String(value ?? ''))

export const builtInConnectorManifests: readonly ConnectorManifest[] = [
  {
    schema_version: 1,
    id: 'email',
    name: 'Email',
    description:
      'Read mailbox context and create draft-first outbound messages through Gmail, Outlook, or SMTP/IMAP adapters.',
    category: 'communication',
    homepage: 'mailto:',
    capabilities: {
      read: true,
      write: true,
      sync: true,
      draft: true,
      canvas_write: false,
      delete: false,
    },
    auth: [
      {
        id: 'gmail_oauth',
        type: 'oauth',
        required: false,
        scopes: ['gmail.readonly', 'gmail.compose', 'gmail.modify'],
        notes: 'Preferred for Gmail accounts when OAuth verification is available.',
      },
      {
        id: 'microsoft_graph_oauth',
        type: 'oauth',
        required: false,
        scopes: ['Mail.Read', 'Mail.ReadWrite', 'Mail.Send'],
        notes: 'Preferred for Outlook and Microsoft 365 accounts.',
      },
      {
        id: 'smtp_imap',
        type: 'smtp',
        required: false,
        notes: 'Fallback for providers that expose app-password SMTP/IMAP access.',
      },
    ],
    keys: [
      {
        id: 'EMAIL_ACCESS_TOKEN',
        storage: 'secret',
        required: false,
        description: 'OAuth access token or provider-specific app password.',
      },
      {
        id: 'EMAIL_REFRESH_TOKEN',
        storage: 'secret',
        required: false,
        description: 'OAuth refresh token where the provider uses refreshable sessions.',
      },
    ],
    tools: [
      {
        name: 'search_mail',
        description: 'Search email metadata and bounded snippets by query, sender, recipient, or time.',
        approval: 'never',
        capability: 'read',
        input_schema: schema({
          query: string,
          limit: { type: 'integer', minimum: 1, maximum: 20 },
        }),
        adapters: ['gmail_api', 'microsoft_graph_mail', 'imap_mailbox'],
      },
      {
        name: 'read_message',
        description: 'Read one message body and headers after the user or Agent selects a message id.',
        approval: 'never',
        capability: 'read',
        input_schema: schema({ message_id: string }, ['message_id']),
        adapters: ['gmail_api', 'microsoft_graph_mail', 'imap_mailbox'],
      },
      {
        name: 'create_draft',
        description: 'Create an email draft. Sending is a separate action and always requires approval.',
        approval: 'required',
        capability: 'draft',
        input_schema: schema(
          {
            to: { type: 'array', items: string },
            cc: { type: 'array', items: string },
            subject: string,
            body_markdown: string,
          },
          ['to', 'subject', 'body_markdown'],
        ),
        adapters: ['gmail_api', 'microsoft_graph_mail', 'smtp_mailto'],
      },
      {
        name: 'send_draft',
        description: 'Send a provider draft after explicit user approval.',
        approval: 'required',
        capability: 'write',
        input_schema: schema({ draft_id: string }, ['draft_id']),
        adapters: ['gmail_api', 'microsoft_graph_mail'],
      },
    ],
    adapters: [
      {
        id: 'gmail_api',
        type: 'rest',
        status: 'planned',
        endpoint: 'https://gmail.googleapis.com/gmail/v1',
        notes: 'Gmail read and draft APIs; production OAuth scopes require provider review.',
      },
      {
        id: 'microsoft_graph_mail',
        type: 'graph',
        status: 'planned',
        endpoint: 'https://graph.microsoft.com/v1.0',
        notes: 'Microsoft Graph Mail read, draft, and send APIs.',
      },
      {
        id: 'imap_mailbox',
        type: 'smtp',
        status: 'experimental',
        notes: 'Generic IMAP read adapter for providers with app passwords.',
      },
      {
        id: 'smtp_mailto',
        type: 'smtp',
        status: 'recommended',
        notes: 'Draft-first fallback that opens the user mail client or prepares SMTP draft content.',
      },
    ],
    safety: {
      external_write_approval: 'always',
      default_mode: 'draft_or_preview',
      audit_log: true,
      model_visible_secrets: false,
    },
  },
  {
    schema_version: 1,
    id: 'figma',
    name: 'Figma',
    description:
      'Read Figma file context and write Catea-generated design structures into the native Figma canvas.',
    category: 'design',
    homepage: 'https://www.figma.com/',
    capabilities: {
      read: true,
      write: true,
      sync: false,
      draft: false,
      canvas_write: true,
      delete: false,
    },
    auth: [
      {
        id: 'figma_oauth',
        type: 'oauth',
        required: false,
        scopes: ['file_content:read', 'file_comments:write'],
        notes: 'Optional REST metadata, comments, and file context where supported.',
      },
      {
        id: 'local_plugin_session',
        type: 'local_bridge',
        required: true,
        notes: 'Required for native canvas writes through a Figma plugin context.',
      },
    ],
    keys: [
      {
        id: 'FIGMA_ACCESS_TOKEN',
        storage: 'secret',
        required: false,
        description: 'Optional token for REST metadata and comments.',
      },
    ],
    tools: [
      {
        name: 'read_file_context',
        description: 'Read file, page, node, component, or selection metadata for design-aware work.',
        approval: 'never',
        capability: 'read',
        input_schema: schema({ file_key: string, node_id: string }, ['file_key']),
        adapters: ['figma_official_mcp', 'figma_rest'],
      },
      {
        name: 'write_canvas',
        description: 'Create or update native Figma canvas nodes from Catea design IR.',
        approval: 'required',
        capability: 'canvas_write',
        input_schema: schema(
          {
            target: string,
            document: { type: 'object' },
            mode: { type: 'string', enum: ['create', 'update'] },
          },
          ['target', 'document', 'mode'],
        ),
        adapters: ['figma_official_mcp', 'figma_local_plugin_bridge'],
      },
      {
        name: 'comment',
        description: 'Write a Figma comment that points reviewers at generated work or an Obsidian source note.',
        approval: 'required',
        capability: 'write',
        input_schema: schema(
          {
            file_key: string,
            message: string,
            node_id: string,
          },
          ['file_key', 'message'],
        ),
        adapters: ['figma_rest'],
      },
    ],
    adapters: [
      {
        id: 'figma_official_mcp',
        type: 'mcp',
        status: 'recommended',
        transport: 'http',
        endpoint: 'https://mcp.figma.com/mcp',
        tools: ['use_figma'],
        notes: 'Uses Figma write-to-canvas through the Figma Plugin API.',
      },
      {
        id: 'figma_local_plugin_bridge',
        type: 'local_bridge',
        status: 'experimental',
        transport: 'websocket',
        host: '127.0.0.1',
        notes: 'Routes validated Catea design IR to a companion Figma plugin running in the open file.',
      },
      {
        id: 'figma_rest',
        type: 'rest',
        status: 'planned',
        endpoint: 'https://api.figma.com/v1',
        notes: 'REST metadata and comment adapter. It is not sufficient for native canvas writes.',
      },
    ],
    safety: {
      external_write_approval: 'always',
      default_mode: 'draft_or_preview',
      audit_log: true,
      model_visible_secrets: false,
    },
  },
]

function summary(manifest: ConnectorManifest) {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    category: manifest.category,
    capabilities: manifest.capabilities,
    tools: manifest.tools.map((tool) => ({
      name: tool.name,
      capability: tool.capability,
      approval: tool.approval,
      adapters: tool.adapters,
    })),
    adapters: manifest.adapters.map((adapter) => ({
      id: adapter.id,
      type: adapter.type,
      status: adapter.status,
    })),
  }
}

export function connectorList() {
  return builtInConnectorManifests.map(summary)
}

export function connectorCapabilities(id: string): ConnectorManifest {
  const manifest = builtInConnectorManifests.find((connector) => connector.id === id)
  if (!manifest) throw new Error(`Unknown connector: ${id}`)
  return manifest
}

export const connectorTools: ToolDefinition[] = [
  {
    name: 'connector_list',
    description: 'List built-in Catea connector manifests and their read/write capabilities.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'connector_capabilities',
    description:
      'Show one connector manifest, including semantic tools, required keys, auth modes and adapters.',
    parameters: schema({ connector: string }, ['connector']),
  },
]

export function runConnectorTool(name: string, args: Record<string, unknown>): string {
  if (name === 'connector_list') return JSON.stringify(connectorList(), null, 2)
  if (name === 'connector_capabilities')
    return JSON.stringify(connectorCapabilities(textValue(args.connector)), null, 2)
  throw new Error('Unknown connector tool')
}
