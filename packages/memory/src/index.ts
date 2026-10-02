/**
 * [WHO]: Provides MemoryService
 * [FROM]: Depends on ../../integrations/src/data-dir, ../../integrations/src/storage, ../../agent-core/src/contracts, ../../agent-core/src/types, ./engine, ./store, ./extraction, ./model
 * [TO]: Consumed by apps/obsidian/src/composition.ts
 * [HERE]: packages/memory/src/index.ts - shared memory service with bounded recall and a durable, idempotent extraction queue
 */
import { dataPath } from '../../integrations/src/data-dir'
import { Serial, readJson, writeJson, within } from '../../integrations/src/storage'
import type { MemoryJob, ModelClient } from '../../agent-core/src/contracts'
import type { ModelConfig } from '../../agent-core/src/types'
import { MemoryEngine } from './engine'
import { MemoryStore } from './store'
import { extractWritingMemories } from './extraction'
import { validateMemoryInput } from './model'

interface Job extends MemoryJob {
  attempts: number
  nextAttempt: number
  error?: string
}
export class MemoryService {
  private engines = new Map<string, MemoryEngine>()
  private jobsLock = new Serial()
  private cache = new Map<string, string>()
  private cacheEpoch = 0
  private invalidate() {
    this.cacheEpoch++
    this.cache.clear()
  }
  private processing?: Promise<void>
  private closed = false
  private paused = false
  private abort = new AbortController()
  constructor(
    private vault: string,
    private model: (id: string) => ModelConfig | undefined,
    private report: (error: string) => void,
    private modelClient: ModelClient,
  ) {}
  private engine(scope: string): MemoryEngine {
    let engine = this.engines.get(scope)
    if (!engine) {
      engine = new MemoryEngine(new MemoryStore(this.vault, scope))
      this.engines.set(scope, engine)
    }
    return engine
  }
  private jobsPath() {
    return within(this.vault, dataPath('memory', 'pending-turns.json'))
  }
  async injection(persona: string, query: string, _modelId: string): Promise<string> {
    if (this.closed || this.paused) return ''
    // Cache includes the query: a slow recall must not inject a previous project's result.
    const key = JSON.stringify([persona, query])
    const epoch = this.cacheEpoch
    const refresh = Promise.all(
      [...new Set(['global', persona])].map(async (scope) => {
        const text = await this.engine(scope).injection(query)
        return text ? `Memory scope: ${scope}\n${text}` : ''
      }),
    )
      .then((entries) => {
        if (epoch !== this.cacheEpoch || this.closed || this.paused) return ''
        const text = entries.filter(Boolean).join('\n\n')
        if (this.cache.size >= 20) this.cache.delete(this.cache.keys().next().value!)
        this.cache.set(key, text)
        return text
      })
      .catch((e: unknown) => {
        this.report(`记忆召回失败：${e instanceof Error ? e.message : String(e)}`)
        return this.cache.get(key) || ''
      })
    let timer: number | undefined
    try {
      return await Promise.race([
        refresh,
        new Promise<string>((resolve) => {
          timer = window.setTimeout(() => resolve(this.cache.get(key) || ''), 600)
        }),
      ])
    } finally {
      window.clearTimeout(timer)
    }
  }
  async enqueue(job: MemoryJob): Promise<void> {
    if (this.closed || this.paused) return
    await this.jobsLock.run(async () => {
      const path = await this.jobsPath()
      const jobs = await readJson<Job[]>(path, [])
      if (!jobs.some((j) => j.id === job.id))
        await writeJson(path, [...jobs, { ...job, attempts: 0, nextAttempt: 0 }])
    })
    void this.process()
  }
  process(): Promise<void> {
    if (this.processing) return this.processing
    if (this.closed || this.paused) return Promise.resolve()
    this.processing = this.drain().finally(() => {
      this.processing = undefined
    })
    return this.processing
  }
  private async drain(): Promise<void> {
    const signal = this.abort.signal
    try {
      const jobs = await this.jobsLock.run(async () => readJson<Job[]>(await this.jobsPath(), []))
      for (const job of jobs) {
        if (this.closed || this.paused || signal.aborted) break
        if (job.nextAttempt > Date.now()) continue
        try {
          const engine = this.engine(job.persona)
          if (!(await engine.hasProcessed(job.id))) {
            const model = this.model(job.modelId)
            if (!model) throw new Error('记忆任务的模型未配置')
            const inputs = await extractWritingMemories(job, model, this.modelClient, signal)
            await engine.recordTurn(job.id, inputs, signal)
          }
          await this.jobsLock.run(async () => {
            const path = await this.jobsPath()
            const latest = await readJson<Job[]>(path, [])
            await writeJson(
              path,
              latest.filter((j) => j.id !== job.id),
            )
          })
          this.invalidate()
        } catch (error: unknown) {
          if (signal.aborted) break
          job.attempts = (job.attempts || 0) + 1
          job.error = error instanceof Error ? error.message : String(error)
          job.nextAttempt = Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(job.attempts, 7))
          await this.jobsLock.run(async () => {
            const path = await this.jobsPath()
            const latest = await readJson<Job[]>(path, [])
            await writeJson(
              path,
              latest.map((j) => (j.id === job.id ? job : j)),
            )
          })
          this.report(`记忆任务待重试：${job.error}`)
        }
      }
    } catch (error: unknown) {
      this.report(`记忆队列失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  async run(
    name: string,
    args: Record<string, unknown>,
    persona: string,
    _modelId: string,
    signal: AbortSignal = this.abort.signal,
  ): Promise<string> {
    signal.throwIfAborted()
    if (this.closed || this.paused) throw new Error('记忆工具已关闭')
    const engine = this.engine(args.scope === 'global' ? 'global' : persona)
    const text = (key: string) => (typeof args[key] === 'string' ? args[key] : '')
    let result: unknown
    switch (name) {
      case 'memory_search':
        result = await engine.search(text('query'), {
          type: text('type'),
          project: text('project'),
          note: text('note'),
          includeArchived: args.includeArchived === true,
        })
        break
      // Not in memoryTools: this is the sidebar browser's listing primitive. The
      // agent already has memory_search, and adding a second read tool would only
      // grow the prompt. Reachable through run() the same way memory_insights is.
      case 'memory_list':
        result = await engine.list({
          type: text('type'),
          state: args.state === 'archived' ? 'archived' : 'active',
          limit: typeof args.limit === 'number' ? args.limit : undefined,
        })
        break
      case 'memory_recall':
        result = await engine.recall(text('id'), signal)
        break
      case 'memory_remember': {
        const { scope: _scope, ...input } = args
        result = await engine.remember(validateMemoryInput(input), signal)
        break
      }
      case 'memory_edit':
        result = await engine.edit(text('id'), args, signal)
        break
      case 'memory_forget':
        result = await engine.forget(text('id'), signal)
        break
      case 'memory_restore':
        result = await engine.restore(text('id'), signal)
        break
      case 'memory_resolve':
        result = await engine.resolve(text('aId'), text('bId'), text('action'), signal)
        break
      case 'memory_dream':
        result = await engine.consolidate(signal)
        break
      case 'memory_stats':
      case 'memory_review':
      case 'memory_insights':
        result = await engine.review()
        break
      default:
        throw new Error(`Unknown memory tool: ${name}`)
    }
    this.invalidate()
    return JSON.stringify(result)
  }
  setEnabled(enabled: boolean): void {
    this.paused = !enabled
    if (!enabled) {
      this.abort.abort()
      this.invalidate()
    } else if (this.abort.signal.aborted) this.abort = new AbortController()
  }
  close(): void {
    this.closed = true
    this.abort.abort()
    this.invalidate()
  }
}
