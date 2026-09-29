// CatUI NanoMem extension lifecycle, hosted inside the vault with explicit engines.
/**
 * [WHO]: Provides MemoryHost
 * [FROM]: Depends on ../upstream/extension, ../upstream/engine, node:path, node:fs/promises, ../../agent-core/src/types
 * [TO]: Consumed by packages/memory/src/index.ts
 * [HERE]: packages/memory/src/host.ts - boots the vendored nanomem extension inside the vault and replays host tool events under normalized names; exposes injection() and run()
 */
import nanomem from '../upstream/extension'
import { NanoMemEngine } from '../upstream/engine'
import { join, basename } from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import type { ToolEvent } from '../../agent-core/src/types'
interface MemoryTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(
    id: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    update: () => void,
    context: MemoryContext,
  ): Promise<unknown>
}
interface MemoryContext {
  cwd: string
  hasUI: boolean
  ui: { notify: (text: string) => void; setStatus: () => void }
  completeSimple: (system: string, user: string) => Promise<string>
  completeJson: (
    system: string,
    user: string,
    schema: Record<string, unknown>,
    options?: { toolName?: string; resultKey?: string },
  ) => Promise<string>
  sessionManager: {
    getSessionFile(): string
    getBranch(): unknown[]
    countTouchedSince(
      cwd: string,
      since: number,
      options: { excludeBasename?: string },
    ): Promise<number>
  }
}
type MemoryHandler = (event: Record<string, unknown>, context: MemoryContext) => unknown
interface MemoryAPI {
  registerTool(tool: MemoryTool): void
  registerCommand(name: string, command: unknown): void
  on(name: string, handler: MemoryHandler): void
}
const registerMemory = nanomem as unknown as (
  api: MemoryAPI,
  options: { engine: NanoMemEngine; project: string; cwd: string; managed: boolean },
) => void
export class MemoryHost {
  tools: MemoryTool[] = []
  commands = new Map<string, unknown>()
  private events = new Map<string, MemoryHandler[]>()
  constructor(
    engine: NanoMemEngine,
    private vault: string,
    private sessionId: string,
    private complete: (system: string, user: string) => Promise<string>,
    private notice: (text: string) => void,
    private completeJson: (
      system: string,
      user: string,
      schema: Record<string, unknown>,
      options?: { toolName?: string; resultKey?: string },
    ) => Promise<string>,
  ) {
    registerMemory(
      {
        registerTool: (t) => {
          this.tools.push(t)
        },
        registerCommand: (n, c) => {
          this.commands.set(n, c)
        },
        on: (n, fn) => {
          this.events.set(n, [...(this.events.get(n) || []), fn])
        },
      },
      { engine, project: basename(vault), cwd: vault, managed: true },
    )
  }
  private context(): MemoryContext {
    return {
      cwd: this.vault,
      hasUI: false,
      ui: { notify: this.notice, setStatus: () => {} },
      completeSimple: this.complete,
      completeJson: this.completeJson,
      sessionManager: {
        getSessionFile: () => join(this.vault, '.catea/sessions', this.sessionId + '.jsonl'),
        getBranch: () => [],
        countTouchedSince: async (
          _cwd: string,
          since: number,
          options: { excludeBasename?: string },
        ) => {
          let count = 0
          const dir = join(this.vault, '.catea/sessions')
          for (const file of await readdir(dir)) {
            if (
              !file.endsWith('.json') ||
              file === 'index.json' ||
              file === options.excludeBasename + '.json'
            )
              continue
            if ((await stat(join(dir, file))).mtimeMs > since) count++
          }
          return count
        },
      },
    }
  }
  async emit(name: string, event: Record<string, unknown> = {}) {
    const results = []
    for (const fn of this.events.get(name) || []) results.push(await fn(event, this.context()))
    return results
  }
  async injection(prompt: string) {
    return (await this.emit('before_agent_start', { prompt }))
      .map((r: unknown) =>
        r &&
        typeof r === 'object' &&
        'appendSystemPrompt' in r &&
        typeof r.appendSystemPrompt === 'string'
          ? r.appendSystemPrompt
          : '',
      )
      .filter(Boolean)
      .join('\n\n')
  }
  async replay(tools: ToolEvent[]) {
    for (const t of tools) {
      // Normalize host-native tools at the lifecycle boundary, preserving the original UI tool name elsewhere.
      const name =
        (
          {
            obsidian_read: 'read',
            obsidian_edit: 'edit',
            obsidian_search: 'grep',
            obsidian_manage: 'write',
          } as Record<string, string>
        )[t.name] || t.name
      const args = {
        ...t.args,
        old_string: t.args.oldText,
        new_string: t.args.newText,
        pattern: t.args.query,
      }
      await this.emit('tool_execution_start', { toolCallId: t.id, toolName: name, args })
      await this.emit('tool_execution_end', {
        toolCallId: t.id,
        toolName: name,
        result: t.result,
        isError: !!t.error,
      })
    }
  }
  async run(name: string, args: Record<string, unknown>, signal: AbortSignal) {
    signal.throwIfAborted()
    const tool = this.tools.find((t) => t.name === name)
    if (!tool) throw new Error('未知 NanoMem 工具')
    const result = await tool.execute(crypto.randomUUID(), args, signal, () => {}, this.context())
    return JSON.stringify(result)
  }
}
