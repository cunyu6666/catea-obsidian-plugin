/**
 * [WHO]: Provides CompactionCoordinator, CompactionEvent, planCompaction
 * [FROM]: Depends on ../upstream/context/boundaries, ./contracts, ./upstream-stream
 * [TO]: Consumed by packages/agent-core/src/index.ts
 * [HERE]: packages/agent-core/src/compaction.ts - host-neutral budget decisions, safe user-turn and completed tool-cycle cuts, summary orchestration and bounded overflow recovery
 */
import { estimateTokens } from '../upstream/context/boundaries'
import type { JournalEntry } from './contracts'
import type { RuntimeMessage } from './upstream-stream'

const count = estimateTokens as (message: RuntimeMessage) => number
export type CompactionEvent = {
  type: 'start' | 'complete' | 'failure'
  reason: 'threshold' | 'overflow'
  error?: string
}
export interface CompactionPlan {
  firstKeptEntryId: string
  messages: RuntimeMessage[]
  previousSummary?: string
  tokensBefore: number
}
export interface CompactionPort {
  journal(): JournalEntry[]
  messages(): RuntimeMessage[]
  checkpoint(summary: string, firstKeptEntryId: string, tokensBefore: number): Promise<void>
}
export interface SummaryPort {
  summarize(
    messages: RuntimeMessage[],
    previousSummary: string | undefined,
    signal: AbortSignal,
  ): Promise<string>
}

export function planCompaction(
  rows: JournalEntry[],
  keepRecentTokens: number,
): CompactionPlan | undefined {
  const lastCheckpoint = rows.findLastIndex((row) => row.type === 'compaction')
  const prior = lastCheckpoint >= 0 ? rows[lastCheckpoint] : undefined
  const first =
    prior?.type === 'compaction' ? rows.findIndex((row) => row.id === prior.firstKeptEntryId) : 0
  const active = rows.slice(Math.max(0, first)).filter((row) => row.type === 'message')
  const cuts: number[] = []
  const pending = new Set<string>()
  for (let index = 0; index < active.length; index++) {
    const row = active[index]
    if (row.type !== 'message') continue
    const previous = index > 0 ? active[index - 1] : undefined
    // A checkpoint's synthetic user message can precede either a new user turn
    // or a later assistant/tool cycle from the same long-running turn.
    if (
      index > 0 &&
      pending.size === 0 &&
      (row.message.role === 'user' ||
        (row.message.role === 'assistant' &&
          previous?.type === 'message' &&
          previous.message.role === 'toolResult'))
    )
      cuts.push(index)
    if (row.message.role === 'assistant')
      for (const block of row.message.content) if (block.type === 'toolCall') pending.add(block.id)
    if (row.message.role === 'toolResult') pending.delete(row.message.toolCallId)
  }
  if (!cuts.length) return undefined
  let cut = cuts.at(-1)!
  let kept = 0
  for (let i = active.length - 1; i >= 0; i--) {
    const row = active[i]
    if (row.type === 'message') kept += count(row.message)
    if (cuts.includes(i) && kept >= keepRecentTokens) {
      cut = i
      break
    }
  }
  // Every candidate begins after all earlier tool calls have results, so a
  // checkpoint never separates a call from its result or discards a pending call.
  const discarded = active
    .slice(0, cut)
    .filter((row): row is Extract<JournalEntry, { type: 'message' }> => row.type === 'message')
  if (!discarded.length) return undefined
  return {
    firstKeptEntryId: active[cut].id,
    messages: discarded.map((row) => row.message),
    previousSummary: prior?.type === 'compaction' ? prior.summary : undefined,
    tokensBefore: active.reduce((n, row) => n + count(row.message), 0),
  }
}

export class CompactionCoordinator {
  private failedFingerprint = ''
  private overflowRecovered = false
  constructor(
    private context: CompactionPort,
    private summary: SummaryPort,
    private contextWindow: number,
    private system: string,
    private tools: unknown[],
    private event: (event: CompactionEvent) => void,
    private signal: AbortSignal,
  ) {}
  private reserve() {
    return Math.min(16384, Math.floor(this.contextWindow * 0.2))
  }
  private estimated(messages: RuntimeMessage[]) {
    const local =
      Math.ceil((this.system.length + JSON.stringify(this.tools).length) / 3) +
      messages.reduce((n, m) => n + count(m), 0)
    const last = [...messages]
      .reverse()
      .find(
        (m) =>
          m.role === 'assistant' &&
          m.stopReason !== 'error' &&
          m.stopReason !== 'aborted' &&
          m.usage &&
          m.usage.totalTokens > 0,
      )
    if (!last || last.role !== 'assistant' || !last.usage) return local
    const checkpoint = messages.find((message) => message.cateaCheckpoint)
    if (checkpoint && last.timestamp < checkpoint.timestamp) return local
    const index = messages.lastIndexOf(last)
    const trailing = messages.slice(index + 1).reduce((n, m) => n + count(m), 0)
    return Math.max(local, last.usage.totalTokens + trailing)
  }
  private fingerprint() {
    const rows = this.context.journal()
    return `${rows.length}:${rows.at(-1)?.id || ''}`
  }
  async check(
    reason: 'threshold' | 'overflow',
    messages: RuntimeMessage[],
  ): Promise<RuntimeMessage[] | undefined> {
    if (this.signal.aborted) return undefined
    if (reason === 'threshold' && this.estimated(messages) <= this.contextWindow - this.reserve())
      return undefined
    if (reason === 'overflow' && this.overflowRecovered) return undefined
    const fingerprint = this.fingerprint()
    if (fingerprint === this.failedFingerprint) return undefined
    const keep = Math.min(
      20000,
      Math.max(512, Math.floor((this.contextWindow - this.reserve()) * 0.4)),
    )
    const plan = planCompaction(this.context.journal(), keep)
    // A new or still-active conversation may fill the budget before it has an
    // earlier complete turn. There is nothing to summarize yet; the provider
    // will report a real context overflow if the request cannot fit.
    if (!plan) {
      this.failedFingerprint = fingerprint
      return undefined
    }
    this.event({ type: 'start', reason })
    try {
      const summary = await this.summary.summarize(plan.messages, plan.previousSummary, this.signal)
      this.signal.throwIfAborted()
      if (!summary.trim()) throw new Error('Summary model returned an empty checkpoint')
      await this.context.checkpoint(summary, plan.firstKeptEntryId, plan.tokensBefore)
      if (reason === 'overflow') this.overflowRecovered = true
      this.failedFingerprint = ''
      this.event({ type: 'complete', reason })
      return this.context.messages()
    } catch (error) {
      this.failedFingerprint = fingerprint
      this.event({
        type: 'failure',
        reason,
        error: error instanceof Error ? error.message : String(error),
      })
      return undefined
    }
  }
}
