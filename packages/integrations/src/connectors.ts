/**
 * [WHO]: Provides ConnectorAdapter, ConnectorAuth, ConnectorCapabilityMap, ConnectorConfig, ConnectorKey, ConnectorManifest, ConnectorRuntimeOptions, ConnectorTool, builtInConnectorManifests, connectorTools, connectorCapabilities, connectorConfig, connectorList, normalizeConnectorConfigs, runConnectorTool
 * [FROM]: Depends on ../../agent-core/src/providers, ./figma-connector.ts
 * [TO]: Consumed by apps/obsidian/src/main.tsx, apps/obsidian/src/settings.ts,
 *   packages/agent-core/src/index.ts, packages/integrations/src/figma-connector.ts,
 *   packages/integrations/src/index.ts,
 *   packages/integrations/src/__tests__/connectors.test.ts
 * [HERE]: packages/integrations/src/connectors.ts - built-in connector manifest registry for the first MVP apps: email and Figma; exposes read-only discovery tools so the Agent sees stable app capabilities before executable adapters are wired in
 */
import type { ToolDefinition } from '../../agent-core/src/providers'
import {
  callFigmaConnector,
  type FigmaConnectorCall,
  type FigmaMcpCall,
} from './figma-connector.ts'

export interface ConnectorCapabilityMap {
  read: boolean
  write: boolean
  sync: boolean
  draft: boolean
  canvas_write: boolean
  delete: boolean
}

export interface ConnectorConfig {
  id: string
  enabled: boolean
  adapter?: string
  keys?: Record<string, boolean>
}

export interface ConnectorRuntimeOptions {
  configs?: ConnectorConfig[]
  getSecret?: (id: string) => string | undefined
  figmaCall?: FigmaMcpCall
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
        description:
          'Search email metadata and bounded snippets by query, sender, recipient, or time.',
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
        description:
          'Read one message body and headers after the user or Agent selects a message id.',
        approval: 'never',
        capability: 'read',
        input_schema: schema({ message_id: string }, ['message_id']),
        adapters: ['gmail_api', 'microsoft_graph_mail', 'imap_mailbox'],
      },
      {
        name: 'create_draft',
        description:
          'Create an email draft. Sending is a separate action and always requires approval.',
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
        notes:
          'Draft-first fallback that opens the user mail client or prepares SMTP draft content.',
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
        description:
          'Read file, page, node, component, or selection metadata for design-aware work.',
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
        description:
          'Write a Figma comment that points reviewers at generated work or an Obsidian source note.',
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
        notes:
          'Routes validated Catea design IR to a companion Figma plugin running in the open file.',
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
  {
    schema_version: 1,
    id: 'wechat',
    name: 'WeChat',
    description:
      'Send Obsidian notes or generated documents to the user WeChat account and import selected WeChat conversation documents back into the vault through a local desktop bridge.',
    category: 'communication',
    homepage: 'https://weixin.qq.com/',
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
        id: 'desktop_session',
        type: 'local_bridge',
        required: true,
        notes:
          'Requires the user to be logged in to WeChat Desktop; no account password is stored by Catea.',
      },
    ],
    keys: [
      {
        id: 'WECHAT_BRIDGE_TOKEN',
        storage: 'secret',
        required: false,
        description: 'Optional shared secret for a local WeChat desktop bridge process.',
      },
    ],
    tools: [
      {
        name: 'share_note_to_self',
        description:
          'Send an Obsidian note, generated Markdown document, or exported attachment to File Transfer or the user account in WeChat.',
        approval: 'required',
        capability: 'write',
        input_schema: schema(
          {
            title: string,
            body_markdown: string,
            file_path: string,
            recipient: string,
          },
          ['body_markdown'],
        ),
        adapters: ['wechat_desktop_bridge'],
      },
      {
        name: 'import_conversation_document',
        description:
          'Import a user-selected WeChat message, file, or conversation excerpt into an Obsidian document.',
        approval: 'never',
        capability: 'read',
        input_schema: schema({
          conversation: string,
          message_id: string,
          since: string,
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        }),
        adapters: ['wechat_desktop_bridge'],
      },
      {
        name: 'draft_reply',
        description:
          'Prepare a WeChat reply or document share payload; final send requires explicit user approval.',
        approval: 'required',
        capability: 'draft',
        input_schema: schema(
          {
            conversation: string,
            body_markdown: string,
            attachment_path: string,
          },
          ['body_markdown'],
        ),
        adapters: ['wechat_desktop_bridge'],
      },
    ],
    adapters: [
      {
        id: 'wechat_desktop_bridge',
        type: 'local_bridge',
        status: 'experimental',
        transport: 'websocket',
        host: '127.0.0.1',
        notes:
          'Routes approved send/import jobs to a local WeChat Desktop bridge; this is the product path for personal-account workflows.',
      },
      {
        id: 'wechat_official_account_api',
        type: 'rest',
        status: 'planned',
        endpoint: 'https://api.weixin.qq.com/',
        notes:
          'Official Account and enterprise-style APIs are not equivalent to personal WeChat account messaging; use only for owned official-account workflows.',
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
    id: 'weread',
    name: 'WeRead',
    description:
      'Read the user WeRead shelf, purchased-book metadata, highlights and notes in Obsidian, and prepare article or note payloads for WeRead through supported API or bridge adapters.',
    category: 'reading',
    homepage: 'https://weread.qq.com/',
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
        id: 'weread_api_key',
        type: 'api_key',
        required: false,
        scopes: ['shelf', 'books', 'notes', 'highlights'],
        notes: 'Preferred when the user has a WeRead API key or Agent API credential.',
      },
      {
        id: 'weread_cookie',
        type: 'cookie',
        required: false,
        notes: 'Fallback used by existing community sync tools; should stay vault-local.',
      },
    ],
    keys: [
      {
        id: 'WEREAD_API_KEY',
        storage: 'secret',
        required: false,
        description: 'WeRead API key, commonly beginning with wrk-.',
      },
      {
        id: 'WEREAD_COOKIE',
        storage: 'secret',
        required: false,
        description: 'Optional WeRead web cookie fallback for community-compatible sync.',
      },
    ],
    tools: [
      {
        name: 'list_shelf',
        description:
          'List the user WeRead shelf, including purchased books, reading status and metadata.',
        approval: 'never',
        capability: 'read',
        input_schema: schema({
          include_archived: { type: 'boolean' },
          limit: { type: 'integer', minimum: 1, maximum: 200 },
        }),
        adapters: ['weread_agent_api', 'weread_cookie_api'],
      },
      {
        name: 'read_book_context',
        description:
          'Read bounded book context that the user is entitled to access, including metadata, table of contents, progress, highlights and personal notes.',
        approval: 'never',
        capability: 'read',
        input_schema: schema(
          {
            book_id: string,
            include_chapters: { type: 'boolean' },
            include_notes: { type: 'boolean' },
          },
          ['book_id'],
        ),
        adapters: ['weread_agent_api', 'weread_cookie_api'],
      },
      {
        name: 'sync_notes_to_vault',
        description:
          'Synchronize WeRead highlights, comments and book metadata into Obsidian Markdown documents.',
        approval: 'required',
        capability: 'sync',
        input_schema: schema({
          book_id: string,
          output_folder: string,
          mode: { type: 'string', enum: ['book', 'shelf'] },
        }),
        adapters: ['weread_agent_api', 'weread_cookie_api'],
      },
      {
        name: 'send_document_to_weread',
        description:
          'Prepare an Obsidian document for WeRead import, article reading, review, or future supported write surface.',
        approval: 'required',
        capability: 'write',
        input_schema: schema(
          {
            title: string,
            body_markdown: string,
            source_path: string,
            target: { type: 'string', enum: ['article', 'note', 'review'] },
          },
          ['title', 'body_markdown'],
        ),
        adapters: ['weread_local_bridge', 'weread_agent_api'],
      },
    ],
    adapters: [
      {
        id: 'weread_agent_api',
        type: 'rest',
        status: 'recommended',
        endpoint: 'https://i.weread.qq.com/api/agent/gateway',
        notes:
          'Uses the WeRead Agent/API-key route where available; best suited for shelf, book metadata, progress, highlights and notes.',
      },
      {
        id: 'weread_cookie_api',
        type: 'rest',
        status: 'experimental',
        endpoint: 'https://weread.qq.com/',
        notes:
          'Community-compatible cookie route for shelf and notebook sync; availability may change upstream.',
      },
      {
        id: 'weread_local_bridge',
        type: 'local_bridge',
        status: 'planned',
        transport: 'websocket',
        host: '127.0.0.1',
        notes:
          'Future local bridge for opening generated Markdown or article payloads in WeRead-supported clients.',
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
  const config = connectorConfig(undefined, manifest.id)
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
    status: {
      enabled: config.enabled,
      adapter: config.adapter,
      keys: config.keys || {},
    },
  }
}

export function connectorConfig(
  configs: ConnectorConfig[] | undefined,
  id: string,
): ConnectorConfig {
  const manifest = connectorCapabilities(id)
  const saved = configs?.find((config) => config.id === id)
  const adapters = new Set(manifest.adapters.map((adapter) => adapter.id))
  const fallback =
    manifest.adapters.find((adapter) => adapter.status === 'recommended')?.id ||
    manifest.adapters[0]?.id
  const adapter = saved?.adapter && adapters.has(saved.adapter) ? saved.adapter : fallback
  const keys = Object.fromEntries(
    manifest.keys.map((key) => [key.id, saved?.keys?.[key.id] === true]),
  )
  return {
    id,
    enabled: saved?.enabled === true,
    ...(adapter ? { adapter } : {}),
    ...(manifest.keys.length ? { keys } : {}),
  }
}

export function normalizeConnectorConfigs(
  configs: ConnectorConfig[] | undefined,
): ConnectorConfig[] {
  return builtInConnectorManifests.map((manifest) => connectorConfig(configs, manifest.id))
}

function summaryWithConfig(configs: ConnectorConfig[] | undefined, manifest: ConnectorManifest) {
  const config = connectorConfig(configs, manifest.id)
  return { ...summary(manifest), status: config }
}

export function connectorList(configs?: ConnectorConfig[]) {
  return builtInConnectorManifests.map((manifest) => summaryWithConfig(configs, manifest))
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
  {
    name: 'connector_read',
    description: 'Read one external object through an enabled connector.',
    parameters: schema(
      {
        connector: string,
        mode: string,
        file_url: string,
        file_key: string,
        node_id: string,
      },
      ['connector'],
    ),
  },
  {
    name: 'connector_create',
    description: 'Create an external object through an enabled connector.',
    parameters: schema(
      {
        connector: string,
        target: { type: 'object' },
        document: { type: 'object' },
        title: string,
        content_markdown: string,
      },
      ['connector'],
    ),
  },
  {
    name: 'connector_update',
    description: 'Update an external object through an enabled connector.',
    parameters: schema(
      {
        connector: string,
        target: { type: 'object' },
        document: { type: 'object' },
      },
      ['connector', 'target'],
    ),
  },
  {
    name: 'connector_share',
    description: 'Share vault content or agent output to an external application.',
    parameters: schema(
      {
        connector: string,
        target: { type: 'object' },
        title: string,
        content_markdown: string,
        document: { type: 'object' },
      },
      ['connector'],
    ),
  },
]

function runtimeOptions(
  options: ConnectorConfig[] | ConnectorRuntimeOptions | undefined,
): ConnectorRuntimeOptions {
  return Array.isArray(options) ? { configs: options } : options || {}
}

export async function runConnectorTool(
  name: string,
  args: Record<string, unknown>,
  options?: ConnectorConfig[] | ConnectorRuntimeOptions,
  signal?: AbortSignal,
): Promise<string> {
  const runtime = runtimeOptions(options)
  if (name === 'connector_list') return JSON.stringify(connectorList(runtime.configs), null, 2)
  if (name === 'connector_capabilities')
    return JSON.stringify(
      {
        ...connectorCapabilities(textValue(args.connector)),
        status: connectorConfig(runtime.configs, textValue(args.connector)),
      },
      null,
      2,
    )
  if (
    name === 'connector_read' ||
    name === 'connector_create' ||
    name === 'connector_update' ||
    name === 'connector_share'
  ) {
    const connector = textValue(args.connector)
    const config = connectorConfig(runtime.configs, connector)
    if (!config.enabled) throw new Error(`Connector is disabled: ${connector}`)
    if (connector === 'figma')
      return JSON.stringify(
        await callFigmaConnector(
          name.replace('connector_', '') as FigmaConnectorCall,
          args,
          config,
          runtime.getSecret?.('connector-figma-FIGMA_ACCESS_TOKEN'),
          runtime.figmaCall,
          signal || new AbortController().signal,
        ),
        null,
        2,
      )
    throw new Error(`Connector runtime is not implemented yet: ${connector}`)
  }
  throw new Error('Unknown connector tool')
}
