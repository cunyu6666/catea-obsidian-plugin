/**
 * [WHO]: Provides McpConfig, McpPool
 * [FROM]: Depends on @modelcontextprotocol/sdk/client/index.js, @modelcontextprotocol/sdk/client/stdio.js, @modelcontextprotocol/sdk/client/streamableHttp.js, ../../agent-core/src/providers, ../../agent-core/src/version
 * [TO]: Consumed by packages/agent-core/src/index.ts, packages/integrations/src/index.ts,
 *   packages/integrations/src/mcp-presets.ts
 * [HERE]: packages/integrations/src/mcp.ts - connects enabled stdio and HTTP MCP servers, paginates tool discovery and namespaces tool names to 64 chars; catalog cap 1000, call timeout 120 s, output 24000 chars; optional envSecret names the environment variable a stdio token is injected as, values stay memory-only
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { ToolDefinition } from '../../agent-core/src/providers'
import { PLUGIN_VERSION } from '../../agent-core/src/version'
export interface McpConfig {
  id: string
  enabled: boolean
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  token?: string
  tokenHeader?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  /** Environment variable NAME a stdio token is injected as; not a secret, safe to persist. */
  envSecret?: string
}
export class McpPool {
  private clients = new Map<string, Client>()
  private calls = new Map<string, { client: Client; name: string }>()
  async connect(
    configs: McpConfig[],
    vault: string,
    signal: AbortSignal,
    unavailable?: (id: string, reason: string) => void,
  ): Promise<ToolDefinition[]> {
    signal.throwIfAborted()
    await this.close()
    const definitions: ToolDefinition[] = []
    const abort = () => {
      void this.close()
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      for (const [index, c] of configs.filter((c) => c.enabled).entries()) {
        signal.throwIfAborted()
        const client = new Client(
          { name: 'catea-paper', version: PLUGIN_VERSION },
          { capabilities: {} },
        )
        // Publish a server's tools only when every discovery page succeeds.
        const staged: { key: string; name: string; definition: ToolDefinition }[] = []
        const attempt = new AbortController()
        let timer: number | undefined
        let abortAttempt: (() => void) | undefined
        try {
          const transport =
            c.transport === 'stdio'
              ? new StdioClientTransport({
                  command: c.command!,
                  args: c.args || [],
                  cwd: vault,
                  env: c.env,
                })
              : new StreamableHTTPClientTransport(new URL(c.url!), {
                  requestInit: {
                    headers: {
                      ...(c.headers || {}),
                      ...(c.token
                        ? {
                            [c.tokenHeader || 'Authorization']: c.tokenHeader
                              ? c.token
                              : `Bearer ${c.token}`,
                          }
                        : {}),
                    },
                  },
                })
          this.clients.set(c.id, client)
          const deadline = new Promise<never>((_resolve, reject) => {
            timer = window.setTimeout(() => {
              const error = new Error('MCP_START_TIMEOUT')
              reject(error)
              attempt.abort(error)
            }, 15000)
            abortAttempt = () => {
              reject(new Error('aborted', { cause: signal.reason }))
              attempt.abort(signal.reason)
            }
            signal.addEventListener('abort', abortAttempt, { once: true })
          })
          const discover = async () => {
            await client.connect(transport, { signal: attempt.signal })
            if (attempt.signal.aborted) {
              await client.close()
              attempt.signal.throwIfAborted()
            }
            const cursors = new Set<string>()
            let cursor: string | undefined
            do {
              signal.throwIfAborted()
              attempt.signal.throwIfAborted()
              const page = await client.listTools(cursor ? { cursor } : {}, {
                signal: attempt.signal,
              })
              attempt.signal.throwIfAborted()
              for (const tool of page.tools) {
                const key =
                  `mcp_${index}_${definitions.length + staged.length}_${tool.name.replace(/[^a-zA-Z0-9_]/g, '_')}`.slice(
                    0,
                    64,
                  )
                staged.push({
                  key,
                  name: tool.name,
                  definition: {
                    name: key,
                    description: `[${c.id}] ${tool.description || tool.name}`,
                    parameters: tool.inputSchema,
                  },
                })
                if (definitions.length + staged.length > 1000) throw new Error('MCP_CATALOG_LIMIT')
              }
              cursor = page.nextCursor
              if (cursor && cursors.has(cursor)) throw new Error('MCP_CATALOG_LOOP')
              if (cursor) cursors.add(cursor)
            } while (cursor)
          }
          await Promise.race([discover(), deadline])
          signal.throwIfAborted()
          for (const item of staged) {
            this.calls.set(item.key, { client, name: item.name })
            definitions.push(item.definition)
          }
        } catch (error) {
          attempt.abort(error)
          await client.close().catch(() => {})
          this.clients.delete(c.id)
          signal.throwIfAborted()
          const code =
            typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
          const reason =
            code === 'ENOENT'
              ? 'missing-command'
              : error instanceof Error && error.message === 'MCP_START_TIMEOUT'
                ? 'timeout'
                : 'connection'
          // Never expose server response bodies, arguments, environment or credentials.
          unavailable?.(c.id, reason)
        } finally {
          if (timer !== undefined) window.clearTimeout(timer)
          if (abortAttempt) signal.removeEventListener('abort', abortAttempt)
        }
      }
      return definitions
    } catch (e) {
      await this.close()
      throw e
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }
  async call(name: string, args: Record<string, unknown>, signal: AbortSignal) {
    const entry = this.calls.get(name)
    if (!entry) throw new Error('MCP 工具不存在')
    const result = await entry.client.callTool({ name: entry.name, arguments: args }, undefined, {
      signal,
      timeout: 120000,
    })
    if (result.isError) throw new Error(JSON.stringify(result.content).slice(0, 2000))
    return JSON.stringify(result).slice(0, 24000)
  }
  async close() {
    const clients = [...this.clients.values()]
    this.clients.clear()
    this.calls.clear()
    await Promise.allSettled(clients.map((c) => c.close()))
  }
}
