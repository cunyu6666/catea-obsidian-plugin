/**
 * [WHO]: Provides ModelCompactionSummary
 * [FROM]: Depends on ./contracts, ./types, ./upstream-stream, ./compaction
 * [TO]: Consumed by packages/agent-core/src/index.ts
 * [HERE]: packages/agent-core/src/compaction-summary.ts - generates bounded iterative summaries through the injected BYOK model client
 */
import type { ModelClient } from './contracts'
import type { ModelConfig, TranscriptItem } from './types'
import { toTranscript, type RuntimeMessage } from './upstream-stream'
import type { SummaryPort } from './compaction'

const prompt = `Summarize the preceding conversation as a checkpoint for an assistant continuing the same task. Record the user's goal and constraints, completed work, decisions and reasons, important files and paths, failed attempts, pending tool or task state, and exact next steps. Preserve facts, uncertainty and user requests. Do not invent outcomes. Return only the summary.`

export class ModelCompactionSummary implements SummaryPort {
  constructor(
    private client: ModelClient,
    private model: ModelConfig,
    private attachments: () => ReadonlyMap<string, import('./types').ChatAttachment>,
  ) {}
  async summarize(
    messages: RuntimeMessage[],
    previousSummary: string | undefined,
    signal: AbortSignal,
  ): Promise<string> {
    const batchLimit = Math.max(1024, Math.floor((this.model.contextWindow || 128000) * 0.35))
    let summary = previousSummary || ''
    let batch: TranscriptItem[] = []
    let size = 0
    const flush = async () => {
      if (!batch.length) return
      const content = [
        summary ? `Previous checkpoint:\n${summary}` : '',
        ...batch.map((m) => JSON.stringify(m)),
      ]
        .filter(Boolean)
        .join('\n')
      let answer = ''
      for await (const event of this.client.stream(
        {
          model: this.model,
          transcript: [{ role: 'user', content }],
          system: prompt,
          tools: [],
          attachments: this.attachments(),
          maxTokens: 2048,
        },
        signal,
      ))
        if (event.type === 'done') answer = event.reply.text
      if (!answer.trim()) throw new Error('Summary model returned no text')
      summary = answer.trim()
      batch = []
      size = 0
    }
    for (const message of messages) {
      const item = toTranscript(message)
      const length = JSON.stringify(item).length
      if (batch.length && size + length > batchLimit * 3) await flush()
      batch.push(item)
      size += length
    }
    await flush()
    return summary
  }
}
