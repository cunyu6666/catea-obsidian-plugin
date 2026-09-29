/**
 * [WHO]: Provides repairToolProtocol
 * [FROM]: Depends on ./contracts
 * [TO]: Consumed by packages/agent-core/src/index.ts
 * [HERE]: packages/agent-core/src/protocol-repair.ts - restores tool result ordering after interrupted sessions
 */
import type { Session } from './contracts'

export function repairToolProtocol(session: Session) {
  const transcript = session.transcript
  for (let index = 0; index < transcript.length; index++) {
    const message = transcript[index]
    if (message.role !== 'assistant' || !message.calls?.length) continue
    let next = index + 1
    for (const call of message.calls) {
      const existing = transcript.findIndex(
        (item, position) => position > index && item.role === 'tool' && item.callId === call.id,
      )
      const result =
        existing < 0
          ? {
              role: 'tool' as const,
              callId: call.id,
              name: call.name,
              content: 'Tool execution interrupted.',
            }
          : transcript.splice(existing, 1)[0]
      transcript.splice(next++, 0, result)
    }
    index = next - 1
  }
  const journal = session.journal
  if (!journal) return
  for (let index = 0; index < journal.length; index++) {
    const entry = journal[index]
    if (entry.type !== 'message' || entry.message.role !== 'assistant') continue
    const calls = entry.message.content.filter((block) => block.type === 'toolCall')
    let next = index + 1
    for (const call of calls) {
      const existing = journal.findIndex(
        (item, position) =>
          position > index &&
          item.type === 'message' &&
          item.message.role === 'toolResult' &&
          item.message.toolCallId === call.id,
      )
      const result =
        existing < 0
          ? {
              id: crypto.randomUUID(),
              type: 'message' as const,
              timestamp: new Date().toISOString(),
              message: {
                role: 'toolResult' as const,
                toolCallId: call.id,
                toolName: call.name,
                content: [{ type: 'text' as const, text: 'Tool execution interrupted.' }],
                isError: false,
                timestamp: Date.now(),
              },
            }
          : journal.splice(existing, 1)[0]
      journal.splice(next++, 0, result)
    }
    index = next - 1
  }
}
