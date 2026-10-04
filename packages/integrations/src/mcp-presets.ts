/**
 * [WHO]: Provides McpPreset, createPresetServer, injectSecretEnv, matchPreset, mcpPresets
 * [FROM]: Depends on ./mcp
 * [TO]: Consumed by apps/obsidian/src/main.tsx, apps/obsidian/src/settings.ts,
 *   packages/integrations/src/__tests__/mcp-presets.test.ts
 * [HERE]: packages/integrations/src/mcp-presets.ts - curated MCP preset registry (official Figma MCP, Figma Framelink, GitHub, Context7, DeepWiki); builds disabled credential-free server configs, matches servers back to presets and injects the stored token into the stdio environment under envSecret
 */
import type { McpConfig } from './mcp'

export interface McpPreset {
  /** Stable slug, never shown to the user; servers themselves get fresh UUIDs. */
  id: string
  /** Chinese-source display label, translated through the host `t()`. */
  label: string
  /** Chinese-source description, translated through the host `t()`. */
  desc: string
  transport: 'stdio' | 'http'
  url?: string
  headers?: Record<string, string>
  tokenHeader?: string
  command?: string
  args?: string[]
  /** Environment variable NAME the stored token is injected as; the name is not a secret. */
  envSecret?: string
  /** UI hints that the stdio command needs a local Node.js / npx installation. */
  needsNode?: boolean
}

export const mcpPresets: McpPreset[] = [
  {
    id: 'figma-official',
    label: 'Figma · Official MCP',
    desc: 'Figma 官方远程 MCP：读取设计上下文，并通过 use_figma 写入真实 Figma 画布。',
    transport: 'http',
    url: 'https://mcp.figma.com/mcp',
    headers: { 'X-Figma-Plugin-Bundle': 'figma_prod@2_2_126' },
    tokenHeader: 'X-Figma-Token',
  },
  {
    id: 'figma-framelink',
    label: 'Figma · Framelink',
    desc: '读取 Figma 设计稿的结构与样式，供 Agent 参考实现。添加后填入 Figma 个人访问令牌。',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'figma-developer-mcp', '--stdio'],
    envSecret: 'FIGMA_API_KEY',
    needsNode: true,
  },
  {
    id: 'github',
    label: 'GitHub',
    desc: 'GitHub 官方远程 MCP：仓库、Issue 与 PR 工具。填入个人访问令牌，可用范围由令牌权限决定。',
    transport: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
  },
  {
    // Context7's optional key uses a custom Context7-Api-Key header, which the
    // current StreamableHTTP wiring (Authorization only) does not carry, so the
    // preset is keyless and anonymous upstream rate limits apply.
    id: 'context7',
    label: 'Context7',
    desc: '查询库与框架的最新文档。无需密钥；匿名调用受上游速率限制。',
    transport: 'http',
    url: 'https://mcp.context7.com/mcp',
  },
  {
    id: 'deepwiki',
    label: 'DeepWiki',
    desc: '就公开 GitHub 仓库的结构与实现提问。无需密钥。',
    transport: 'http',
    url: 'https://mcp.deepwiki.com/mcp',
  },
]

export function createPresetServer(preset: McpPreset): McpConfig {
  return {
    id: crypto.randomUUID(),
    enabled: false,
    transport: preset.transport,
    ...(preset.transport === 'http'
      ? {
          url: preset.url,
          ...(preset.headers ? { headers: { ...preset.headers } } : {}),
          ...(preset.tokenHeader ? { tokenHeader: preset.tokenHeader } : {}),
        }
      : // Copy args so later in-place edits can never alias the module registry.
        { command: preset.command, args: [...(preset.args || [])] }),
    ...(preset.envSecret ? { envSecret: preset.envSecret } : {}),
    // Never token, never env values: key material lives only in secret storage.
  }
}

export function matchPreset(server: McpConfig): McpPreset | undefined {
  return mcpPresets.find((preset) =>
    server.transport === 'http'
      ? preset.transport === 'http' &&
        server.url === preset.url &&
        JSON.stringify(server.headers || {}) === JSON.stringify(preset.headers || {}) &&
        server.tokenHeader === preset.tokenHeader
      : preset.transport === 'stdio' &&
        server.command === preset.command &&
        JSON.stringify(server.args || []) === JSON.stringify(preset.args || []),
  )
}

/**
 * The single mutation point that mirrors the stored token into the stdio child
 * environment: called at load hydration, on key edits and on transport flips.
 * Clearing the token clears the variable; http servers are left untouched.
 */
export function injectSecretEnv(server: McpConfig): void {
  if (server.transport !== 'stdio' || !server.envSecret) return
  const env = { ...server.env }
  if (server.token) env[server.envSecret] = server.token
  else delete env[server.envSecret]
  server.env = env
}
